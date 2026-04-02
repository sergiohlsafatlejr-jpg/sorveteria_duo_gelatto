import { Router } from "express";
import multer from "multer";
import fs from "fs";
import XLSXModule from "xlsx";
const XLSX = XLSXModule;

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

import {
  createSalesImport,
  getSalesImports,
  getSalesImportDetail,
  linkImportItem,
  confirmSalesImport,
  deleteSalesImport,
  getProductsForLinking,
} from "../db.sales-import";

// ─── Multer: upload para /tmp ─────────────────────────────────────────────────
const upload = multer({ dest: "/tmp/sales-uploads/" });

// ─── Parser de Caixa (vendas por forma de pagamento) ─────────────────────────
function parseCaixaXls(filePath: string) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Encontrar linha de cabeçalho (contém "FORMA PGTO" ou "PAGAMENTO")
    let headerRow = -1;
    let colPagamento = -1;
    let colVPagamento = -1;
    let colVReceber = -1;

    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const row = rows[i].map((c: any) => String(c).toLowerCase());
      const hasPgto = row.some((c) => c.includes("forma pgto") || c.includes("pagamento"));
      if (hasPgto) {
        headerRow = i;
        // Mapear colunas pelos índices exatos
        for (let j = 0; j < row.length; j++) {
          const h = row[j];
          if ((h.includes("forma") && h.includes("pgto")) || h === "forma de pagamento") colPagamento = j;
          else if (h.includes("v. pagamento") || h === "v.pagamento" || (h.includes("pagamento") && !h.includes("forma"))) colVPagamento = j;
          else if (h.includes("receber")) colVReceber = j;
        }
        break;
      }
    }

    // Fallback: usar índices fixos conhecidos da estrutura do PDV
    // Header row 12: col 14 = FORMA PGTO, col 20 = V. PAGAMENTO, col 27 = V.RECEBER
    if (headerRow >= 0 && colPagamento === -1) {
      const row = rows[headerRow];
      for (let j = 0; j < row.length; j++) {
        const h = String(row[j]).toLowerCase();
        if (h.includes("pgto") || h.includes("forma")) { colPagamento = j; }
        if (h.includes("v. pag") || (h.includes("pagamento") && j > 15)) { colVPagamento = j; }
        if (h.includes("receber")) { colVReceber = j; }
      }
    }

    // Agregar pagamentos
    const paymentsMap: Record<string, { total: number; count: number }> = {};
    let totalRevenue = 0;
    let totalTransactions = 0;
    const dataStart = headerRow >= 0 ? headerRow + 1 : 0;

    for (let i = dataStart; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c: any) => c === "" || c === null || c === undefined)) continue;

      const method = colPagamento >= 0 ? String(row[colPagamento] || "").trim() : "";
      if (!method || method.toLowerCase() === "total" || method.toLowerCase() === "forma pgto" || method.toLowerCase() === "forma de pagamento") continue;

      // Usar V. Receber se disponível e > 0, senão usar V. Pagamento
      let valor = 0;
      if (colVReceber >= 0) {
        const vr = row[colVReceber];
        valor = typeof vr === "number" ? vr : parseFloat(String(vr).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
      }
      if (valor === 0 && colVPagamento >= 0) {
        const vp = row[colVPagamento];
        valor = typeof vp === "number" ? vp : parseFloat(String(vp).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
      }

      if (!paymentsMap[method]) paymentsMap[method] = { total: 0, count: 0 };
      paymentsMap[method].total += valor;
      paymentsMap[method].count += 1;
      totalRevenue += valor;
      totalTransactions += 1;
    }

    const payments_summary = Object.entries(paymentsMap).map(([method, data]) => ({
      method,
      total: Math.round(data.total * 100) / 100,
      count: data.count,
    }));

    return {
      payments_summary,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_transactions: totalTransactions,
    };
  } catch (err) {
    return { error: String(err), payments_summary: [], total_revenue: 0, total_transactions: 0 };
  }
}

// ─── Parser de Produtos (vendas por item) ─────────────────────────────────────
function parseProdutosXls(filePath: string) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Encontrar linha de cabeçalho (contém "Código" ou "Descrição")
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i].map((c: any) => String(c).toLowerCase());
      if (row.some((c) => c.includes("descri") || c.includes("codigo") || c.includes("código"))) {
        headerRow = i;
        break;
      }
    }

    if (headerRow === -1) return { error: "Cabeçalho não encontrado no arquivo de produtos", items: [] };

    const headers = rows[headerRow].map((c: any) => String(c).toLowerCase().trim());

    // Mapear colunas
    const colCodigo = headers.findIndex((h) => h.includes("cod") || h === "código" || h === "codigo");
    const colDescricao = headers.findIndex((h) => h.includes("descri") || h.includes("nome") || h.includes("produto"));
    const colUnidade = headers.findIndex((h) => h.includes("unid") || h === "un" || h === "und");
    const colQtd = headers.findIndex((h) => h.includes("qtd") || h.includes("quant"));
    const colPreco = headers.findIndex((h) => (h.includes("pre") || h.includes("unit")) && !h.includes("total"));
    const colTotal = headers.findIndex((h) => h.includes("total") || h.includes("valor"));

    const items: any[] = [];

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c: any) => c === "" || c === null || c === undefined)) continue;

      const descricao = colDescricao >= 0 ? String(row[colDescricao] || "").trim() : "";
      if (!descricao || descricao.toLowerCase() === "total" || descricao.toLowerCase() === "descrição") continue;

      const codigo = colCodigo >= 0 ? String(row[colCodigo] || "").trim() : "";
      const unidade = colUnidade >= 0 ? String(row[colUnidade] || "UN").trim() : "UN";

      const qtdRaw = colQtd >= 0 ? row[colQtd] : 0;
      const qtd = typeof qtdRaw === "number" ? qtdRaw : parseFloat(String(qtdRaw).replace(",", ".")) || 0;

      const precoRaw = colPreco >= 0 ? row[colPreco] : 0;
      const preco = typeof precoRaw === "number" ? precoRaw : parseFloat(String(precoRaw).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;

      const totalRaw = colTotal >= 0 ? row[colTotal] : 0;
      const total = typeof totalRaw === "number" ? totalRaw : parseFloat(String(totalRaw).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;

      if (qtd === 0 && total === 0) continue;

      items.push({
        external_code: codigo,
        external_name: descricao,
        unit: unidade,
        quantity: Math.round(qtd * 1000) / 1000,
        unit_price: Math.round(preco * 100) / 100,
        total_price: Math.round(total * 100) / 100,
      });
    }

    const total_units = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const total_revenue = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
    return {
      items,
      total_units: Math.round(total_units * 1000) / 1000,
      total_revenue: Math.round(total_revenue * 100) / 100,
    };
  } catch (err) {
    return { error: String(err), items: [], total_units: 0, total_revenue: 0 };
  }
}

// ─── Express Router para upload de arquivo ───────────────────────────────────
export const salesImportExpressRouter = Router();

salesImportExpressRouter.post(
  "/api/sales-import/upload",
  upload.fields([
    { name: "caixa", maxCount: 1 },
    { name: "produtos", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.caixa?.[0] || !files?.produtos?.[0]) {
        return res.status(400).json({ error: "Envie os dois arquivos: caixa e produtos" });
      }

      const caixaPath = files.caixa[0].path;
      const produtosPath = files.produtos[0].path;

      // Parsear com SheetJS (Node.js puro — sem Python)
      const caixaData = parseCaixaXls(caixaPath);
      const produtosData = parseProdutosXls(produtosPath);

      // Limpar arquivos temporários
      try { fs.unlinkSync(caixaPath); } catch {}
      try { fs.unlinkSync(produtosPath); } catch {}

      if (caixaData.error) {
        return res.status(400).json({ error: "Erro no arquivo de caixa: " + caixaData.error });
      }
      if ((produtosData as any).error) {
        return res.status(400).json({ error: "Erro no arquivo de produtos: " + (produtosData as any).error });
      }

      return res.json({
        success: true,
        data: {
          caixa: caixaData,
          produtos: produtosData,
        },
      });
    } catch (err: unknown) {
      console.error("Sales import upload error:", err);
      return res.status(500).json({ error: String(err) });
    }
  }
);

// ─── tRPC Router para operações CRUD ─────────────────────────────────────────
export const salesImportRouter = router({
  // Criar importação após upload e revisão
  create: protectedProcedure
    .input(
      z.object({
        referenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
        items: z.array(
          z.object({
            external_code: z.string(),
            external_name: z.string(),
            unit: z.string(),
            quantity: z.number(),
            unit_price: z.number(),
            total_price: z.number(),
          })
        ),
        payments: z.array(
          z.object({
            method: z.string(),
            total: z.number(),
            count: z.number(),
          })
        ),
        totalRevenue: z.number(),
        totalTransactions: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createSalesImport(
        ctx.user.id,
        input.referenceMonth,
        input.items,
        input.payments,
        input.totalRevenue,
        input.totalTransactions
      );
      return result;
    }),

  // Listar todas as importações
  list: protectedProcedure.query(async () => {
    return getSalesImports();
  }),

  // Detalhe de uma importação
  detail: protectedProcedure
    .input(z.object({ importId: z.number() }))
    .query(async ({ input }) => {
      return getSalesImportDetail(input.importId);
    }),

  // Vincular item a produto do estoque
  linkItem: protectedProcedure
    .input(
      z.object({
        itemId: z.number(),
        productId: z.number().nullable(),
        linkStatus: z.enum(["linked", "pending", "ignored"]),
        saveExternalCode: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      return linkImportItem(input.itemId, input.productId, input.linkStatus, input.saveExternalCode);
    }),

  // Confirmar importação (desconta estoque)
  confirm: protectedProcedure
    .input(z.object({ importId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      return confirmSalesImport(input.importId, ctx.user.id);
    }),

  // Excluir importação pendente
  delete: protectedProcedure
    .input(z.object({ importId: z.number() }))
    .mutation(async ({ input }) => {
      return deleteSalesImport(input.importId);
    }),

  // Listar produtos do estoque para vinculação manual
  getProductsForLinking: protectedProcedure.query(async () => {
    return getProductsForLinking();
  }),
});
