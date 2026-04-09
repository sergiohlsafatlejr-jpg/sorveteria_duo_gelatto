import { Router } from "express";
import multer from "multer";
import fs from "fs";
import XLSXModule from "xlsx";
const XLSX = XLSXModule;
import { exportMappingToBuffer, importMappingFromBuffer } from "../mapping-excel";

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
  getAllMappings,
  updateProductMapping,
  getSalesReport,
  getConfirmedMonths,
  matchProductsToStock,
  importDiarioExpress,
} from "../db.sales-import";
import { invokeLLM } from "../_core/llm";

// ─── Multer: upload para /tmp ─────────────────────────────────────────────────
const upload = multer({ dest: "/tmp/sales-uploads/" });

// ─── Parser de Caixa (vendas por forma de pagamento) ─────────────────────────
function parseCaixaXls(filePath: string) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Normalizar string: remover acentos e converter para minúsculas
    const normalize = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Encontrar linha de cabeçalho (contém "FORMA PGTO" ou "PAGAMENTO")
    let headerRow = -1;
    let colPagamento = -1;
    let colVPagamento = -1;
    let colVReceber = -1;

    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const row = rows[i].map((c: any) => normalize(String(c)));
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
    if (headerRow >= 0 && colPagamento === -1) {
      const row = rows[headerRow];
      for (let j = 0; j < row.length; j++) {
        const h = normalize(String(row[j]));
        if (h.includes("pgto") || h.includes("forma")) { colPagamento = j; }
        if (h.includes("v. pag") || (h.includes("pagamento") && j > 15)) { colVPagamento = j; }
        if (h.includes("receber")) { colVReceber = j; }
      }
    }

    // Detectar coluna de DATA TRANSAÇÃO (normalizado: "data transacao")
    let colDataTransacao = -1;
    if (headerRow >= 0) {
      const hrow = rows[headerRow];
      for (let j = 0; j < hrow.length; j++) {
        const h = normalize(String(hrow[j]));
        if (h.includes("data") && h.includes("transa")) {
          colDataTransacao = j;
          break;
        }
      }
    }

    // Agregar pagamentos e totais por dia
    const paymentsMap: Record<string, { total: number; count: number }> = {};
    const dailyMap: Record<string, { total: number; payments: Record<string, number>; transactions: number }> = {};
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

      // Extrair data da transação para agrupar por dia
      if (valor > 0 && colDataTransacao >= 0) {
        const rawDate = row[colDataTransacao];
        let dateKey = "";
        if (rawDate) {
          const dateStr = String(rawDate).trim();
          // Formato: "01/04/2026 11:04:10" ou "01/04/2026"
          const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (match) {
            dateKey = `${match[3]}-${match[2]}-${match[1]}`; // YYYY-MM-DD
          }
        }
        if (dateKey) {
          if (!dailyMap[dateKey]) dailyMap[dateKey] = { total: 0, payments: {}, transactions: 0 };
          dailyMap[dateKey].total += valor;
          dailyMap[dateKey].transactions += 1;
          if (!dailyMap[dateKey].payments[method]) dailyMap[dateKey].payments[method] = 0;
          dailyMap[dateKey].payments[method] += valor;
        }
      }
    }

    const payments_summary = Object.entries(paymentsMap).map(([method, data]) => ({
      method,
      total: Math.round(data.total * 100) / 100,
      count: data.count,
    }));

    const daily_summary = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        total: Math.round(d.total * 100) / 100,
        transactions: d.transactions,
        payments: Object.fromEntries(
          Object.entries(d.payments).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
      }));

    return {
      payments_summary,
      daily_summary,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_transactions: totalTransactions,
    };
  } catch (err) {
    return { error: String(err), payments_summary: [], daily_summary: [], total_revenue: 0, total_transactions: 0 };
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

    // Mapear colunas — busca flexível por nome
    const colCodigo = headers.findIndex((h) => h.includes("cód") || h.includes("cod") || h === "código" || h === "codigo");
    const colDescricao = headers.findIndex((h) => h.includes("descri") || h.includes("nome") || h.includes("produto"));
    const colUnidade = headers.findIndex((h) => h.includes("unid") || h === "un" || h === "und");
    const colQtd = headers.findIndex((h) => h.includes("qtd") || h.includes("quant"));
    // Pr. Venda (sem "total") — busca específica para o formato do PDV
    const colPreco = (() => {
      // Primeiro tenta achar coluna de preço unitário que não seja total
      const idx = headers.findIndex((h) => (h.includes("pr.") || h.includes("preço") || h.includes("preco") || h.includes("unit")) && !h.includes("total"));
      if (idx >= 0) return idx;
      // Fallback: coluna imediatamente antes da coluna de total
      const totalIdx = headers.findIndex((h) => h.includes("total") || h.includes("valor"));
      if (totalIdx > 0) {
        // Procura a coluna não-vazia antes do total
        for (let k = totalIdx - 1; k >= 0; k--) {
          if (headers[k] && headers[k].trim()) return k;
        }
      }
      return -1;
    })();
    const colTotal = headers.findIndex((h) => h.includes("total") || h.includes("valor"));

    // Fallback: se código não foi encontrado pelo cabeçalho, verificar se a coluna antes da descrição tem dados numéricos
    // (formato PDV: código pode estar em coluna sem rótulo exato)
    const effectiveColCodigo = (() => {
      if (colCodigo >= 0) {
        // Verificar se a coluna tem dados (não é toda vazia)
        const hasData = rows.slice(headerRow + 1, headerRow + 10).some((r) => {
          const v = r[colCodigo];
          return v !== undefined && v !== null && String(v).trim() !== "";
        });
        if (hasData) return colCodigo;
      }
      // Tentar colunas vizinhas à descrição
      if (colDescricao > 0) {
        for (let k = colDescricao - 1; k >= 0; k--) {
          const hasData = rows.slice(headerRow + 1, headerRow + 10).some((r) => {
            const v = r[k];
            return v !== undefined && v !== null && String(v).trim() !== "" && !isNaN(Number(v));
          });
          if (hasData) return k;
        }
      }
      return colCodigo;
    })();

    const items: any[] = [];

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c: any) => c === "" || c === null || c === undefined)) continue;

      const descricao = colDescricao >= 0 ? String(row[colDescricao] || "").trim() : "";
      if (!descricao || descricao.toLowerCase() === "total" || descricao.toLowerCase() === "descrição") continue;

      // Limpar código: remover .0 de valores float (ex: "146.0" → "146")
      const codigoRaw = effectiveColCodigo >= 0 ? row[effectiveColCodigo] : "";
      const codigo = (() => {
        if (typeof codigoRaw === "number") return String(Math.round(codigoRaw));
        const s = String(codigoRaw || "").trim();
        return s.endsWith(".0") ? s.slice(0, -2) : s;
      })();
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

// ─── Exportar mapeamento PDV→Estoque como XLSX (TypeScript puro via exceljs) ─────────────
salesImportExpressRouter.get("/api/mapping/export", async (req, res) => {
  try {
    const mappings = await getAllMappings();
    const buffer = await exportMappingToBuffer(mappings);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Mapeamento_PDV_Estoque.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error("Export mapping error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ─── Importar mapeamento PDV→Estoque de XLSX (TypeScript puro via exceljs) ─────────────
salesImportExpressRouter.post(
  "/api/mapping/import",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }
      const fileBuffer = fs.readFileSync(req.file.path);
      try { fs.unlinkSync(req.file.path); } catch {}
      const result = await importMappingFromBuffer(fileBuffer);
      let updated = 0;
      for (const m of result.mappings) {
        await updateProductMapping(m.productId, m.externalCode);
        updated++;
      }
      return res.json({
        success: true,
        total: result.total,
        toLink: result.toLink,
        toUnlink: result.toUnlink,
        updated,
        message: `${updated} produtos atualizados: ${result.toLink} vinculados, ${result.toUnlink} desvinculados.`,
      });
    } catch (err) {
      console.error("Import mapping error:", err);
      return res.status(500).json({ error: String(err) });
    }
  }
);// ─── Endpoint para Importação Diária Express (produtos + baixa automática de estoque) ────
salesImportExpressRouter.post(
  "/api/sales-import/upload-produtos-dia",
  upload.single("produtos"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Envie o arquivo de produtos" });
      }
      const produtosPath = req.file.path;
      const produtosData = parseProdutosXls(produtosPath);
      try { fs.unlinkSync(produtosPath); } catch {}
      if ((produtosData as any).error) {
        return res.status(400).json({ error: "Erro no arquivo de produtos: " + (produtosData as any).error });
      }
      return res.json({ success: true, data: produtosData });
    } catch (err: unknown) {
      console.error("Produtos dia upload error:", err);
      return res.status(500).json({ error: String(err) });
    }
  }
);

// ─── Endpoint para importar APENAS arquivo de caixa (sem produtos) ─────────────────
salesImportExpressRouter.post(
  "/api/sales-import/upload-caixa", upload.single("caixa"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Envie o arquivo de caixa" });
      }
      const caixaPath = req.file.path;
      const caixaData = parseCaixaXls(caixaPath);
      try { fs.unlinkSync(caixaPath); } catch {}
      if ((caixaData as any).error) {
        return res.status(400).json({ error: "Erro no arquivo de caixa: " + (caixaData as any).error });
      }
      return res.json({ success: true, data: caixaData });
    } catch (err: unknown) {
      console.error("Caixa upload error:", err);
      return res.status(500).json({ error: String(err) });
    }
  }
);

salesImportExpressRouter.post(
  "/api/sales-import/upload",
  upload.fields([
    { name: "caixa", maxCount: 1 },
    { name: "produtos", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      // Arquivo de produtos é obrigatório; caixa é opcional
      if (!files?.produtos?.[0]) {
        return res.status(400).json({ error: "Envie ao menos o arquivo de produtos" });
      }

      const produtosPath = files.produtos[0].path;
      const produtosData = parseProdutosXls(produtosPath);
      try { fs.unlinkSync(produtosPath); } catch {}

      if ((produtosData as any).error) {
        return res.status(400).json({ error: "Erro no arquivo de produtos: " + (produtosData as any).error });
      }

      // Caixa é opcional
      let caixaData: ReturnType<typeof parseCaixaXls> = { payments_summary: [], daily_summary: [], total_revenue: 0, total_transactions: 0 };
      if (files?.caixa?.[0]) {
        const caixaPath = files.caixa[0].path;
        caixaData = parseCaixaXls(caixaPath);
        try { fs.unlinkSync(caixaPath); } catch {}
        if (caixaData.error) {
          return res.status(400).json({ error: "Erro no arquivo de caixa: " + caixaData.error });
        }
      }

      // Executar matching automático dos produtos com o estoque
      const rawItems = (produtosData as any).items || [];
      const matchedItems = await matchProductsToStock(rawItems);

      // Substituir items pelo resultado do matching
      const produtosDataWithMatch = {
        ...(produtosData as any),
        items: matchedItems,
      };

      return res.json({
        success: true,
        data: {
          caixa: caixaData,
          produtos: produtosDataWithMatch,
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
        importMode: z.enum(["monthly", "daily"]).default("monthly"),
        saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        items: z.array(
          z.object({
            external_code: z.string(),
            external_name: z.string(),
            unit: z.string(),
            quantity: z.number(),
            unit_price: z.number(),
            total_price: z.number(),
            productId: z.number().nullable().optional(),
            linkStatus: z.enum(["linked", "pending", "ignored"]).optional(),
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
        dailySummary: z.array(z.object({
          date: z.string(),
          total: z.number(),
          transactions: z.number(),
          payments: z.record(z.string(), z.number()),
        })).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createSalesImport(
        ctx.user.id,
        input.referenceMonth,
        input.items,
        input.payments,
        input.totalRevenue,
        input.totalTransactions,
        input.importMode,
        input.saleDate,
        input.dailySummary
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

  // Sugerir vínculos com IA (LLM analisa PDV vs estoque em lotes)
  suggestLinksWithAI: protectedProcedure
    .input(z.object({ importId: z.number() }))
    .mutation(async ({ input }) => {
      const detail = await getSalesImportDetail(input.importId);
      if (!detail) throw new Error("Importação não encontrada");
      const stockProducts = await getProductsForLinking();

      // Pegar apenas itens pendentes
      const pendingItems = detail.items.filter(
        (item: any) => item.linkStatus === "pending"
      );

      if (pendingItems.length === 0) {
        return { suggestions: [], applied: 0, total: 0, message: "Nenhum item pendente para vincular." };
      }

      // Montar lista de produtos do estoque para o LLM
      const stockList = stockProducts
        .map((p: any) => `ID:${p.id} | ${p.name}`)
        .join("\n");

      // Processar em lotes de 30 para não exceder limite de contexto
      const BATCH_SIZE = 30;
      const allSuggestions: Array<{ itemId: number; productId: number | null; confidence: number; reason: string }> = [];

      for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
        const batch = pendingItems.slice(i, i + BATCH_SIZE);
        const pdvList = batch
          .map((item: any) => `ITEM_ID:${item.id} | ${item.externalName}`)
          .join("\n");

        const prompt = `Você é um especialista em vincular produtos de PDV de sorveteria ao catálogo de estoque.

IMPORTANTE: Os nomes do PDV são nomes comerciais simplificados (ex: "ACAI COM BANANA 1,5L", "BALA", "AGUA MINERAL 500ML").
Os nomes do estoque são nomes de fornecedor/marca (ex: "Docile Bala de Amoras", "Biomass Granola Super 1 Kg").
Use o contexto e a categoria para fazer a correspondência correta.
Se um produto do PDV não tiver correspondência no estoque (ex: serviços, combos, produtos sem estoque), retorne productId como null.

Produtos do ESTOQUE disponíveis (${stockProducts.length} produtos):
${stockList}

Produtos do PDV para vincular (lote ${Math.floor(i/BATCH_SIZE)+1}):
${pdvList}

Para cada ITEM_ID do PDV, encontre o produto do ESTOQUE mais adequado.
Use confiança > 0.7 apenas quando tiver certeza da correspondência.`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um especialista em correspondência de produtos de sorveteria. Analise cuidadosamente os nomes e retorne JSON válido." },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "product_suggestions",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          itemId: { type: "integer" },
                          productId: { type: ["integer", "null"] },
                          confidence: { type: "number" },
                          reason: { type: "string" },
                        },
                        required: ["itemId", "productId", "confidence", "reason"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["suggestions"],
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = response?.choices?.[0]?.message?.content;
          const content = typeof rawContent === "string" ? rawContent : null;
          if (content) {
            const parsed = JSON.parse(content) as { suggestions: Array<{ itemId: number; productId: number | null; confidence: number; reason: string }> };
            allSuggestions.push(...parsed.suggestions);
          }
        } catch (err) {
          console.error(`Erro no lote ${i}-${i+BATCH_SIZE}:`, err);
        }
      }

      // Aplicar sugestões com confiança >= 0.7 automaticamente
      const applied: number[] = [];
      for (const sug of allSuggestions) {
        if (sug.productId && sug.confidence >= 0.7) {
          await linkImportItem(sug.itemId, sug.productId, "linked", true); // salvar externalCode para próximas importações
          applied.push(sug.itemId);
        }
      }

      return {
        suggestions: allSuggestions,
        applied: applied.length,
        total: pendingItems.length,
        message: `IA analisou ${pendingItems.length} produtos em ${Math.ceil(pendingItems.length/BATCH_SIZE)} lotes. ${applied.length} vínculos aplicados automaticamente (confiança ≥ 70%). Os demais ficam pendentes para revisão manual.`,
      };
    }),

  // ─── Mapeamento Permanente PDV → Estoque ──────────────────────────────────────

  // Listar todos os mapeamentos
  getMappings: protectedProcedure.query(async () => {
    return getAllMappings();
  }),

  // Atualizar mapeamento de um produto
  updateMapping: protectedProcedure
    .input(z.object({
      productId: z.number(),
      externalCode: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      return updateProductMapping(input.productId, input.externalCode);
    }),

  // Sugerir mapeamentos com IA para produtos sem externalCode
  bulkSuggestMappings: protectedProcedure.mutation(async () => {
    const allProducts = await getAllMappings();
    const unmapped = allProducts.filter(p => !p.externalCode);
    if (unmapped.length === 0) {
      return { suggestions: [], message: "Todos os produtos já possuem mapeamento." };
    }

    // Buscar todos os códigos PDV conhecidos (de importações passadas)
    const { getDb } = await import("../db");
    const { salesImportItems: sii } = await import("../../drizzle/schema");
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const allPdvItems = await db
      .select({ externalCode: sii.externalCode, externalName: sii.externalName })
      .from(sii)
      .groupBy(sii.externalCode, sii.externalName);

    const pdvMap: Record<string, string> = {};
    for (const item of allPdvItems) {
      if (!pdvMap[item.externalCode]) pdvMap[item.externalCode] = item.externalName;
    }
    const pdvList = Object.entries(pdvMap).map(([code, name]) => `CODE:${code} | ${name}`).join("\n");
    const stockList = unmapped.map(p => `ID:${p.productId} | ${p.productName}`).join("\n");

    const BATCH_SIZE = 30;
    const allSuggestions: Array<{ productId: number; externalCode: string | null; confidence: number; reason: string }> = [];

    for (let i = 0; i < unmapped.length; i += BATCH_SIZE) {
      const batch = unmapped.slice(i, i + BATCH_SIZE);
      const batchList = batch.map(p => `ID:${p.productId} | ${p.productName}`).join("\n");
      const prompt = `Você é um especialista em vincular produtos de estoque de sorveteria a códigos de PDV.

Códigos PDV disponíveis:
${pdvList}

Produtos do ESTOQUE para mapear (lote ${Math.floor(i/BATCH_SIZE)+1}):
${batchList}

Para cada produto do estoque (ID), encontre o código PDV (CODE) mais adequado.
Se não houver correspondência razoável, retorne externalCode como null.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é especialista em correspondência de produtos de sorveteria. Retorne JSON válido." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "bulk_mapping_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        productId: { type: "integer" },
                        externalCode: { type: ["string", "null"] },
                        confidence: { type: "number" },
                        reason: { type: "string" },
                      },
                      required: ["productId", "externalCode", "confidence", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = response?.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (content) {
          const parsed = JSON.parse(content) as { suggestions: Array<{ productId: number; externalCode: string | null; confidence: number; reason: string }> };
          allSuggestions.push(...parsed.suggestions);
        }
      } catch (err) {
        console.error(`Erro no lote ${i}-${i+BATCH_SIZE}:`, err);
      }
    }

    // Aplicar sugestões com confiança >= 0.7
    let applied = 0;
    for (const sug of allSuggestions) {
      if (sug.externalCode && sug.confidence >= 0.7) {
        await updateProductMapping(sug.productId, sug.externalCode);
        applied++;
      }
    }

    return {
      suggestions: allSuggestions,
      applied,
      total: unmapped.length,
      message: `IA analisou ${unmapped.length} produtos sem mapeamento. ${applied} mapeamentos aplicados (confiança ≥ 70%).`,
    };
  }),

  // ─── Relatório de Vendas por Produto ──────────────────────────────────────────

  getSalesReport: protectedProcedure
    .input(z.object({
      referenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
      compareMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }))
    .query(async ({ input }) => {
      return getSalesReport(input.referenceMonth, input.compareMonth);
    }),

  getConfirmedMonths: protectedProcedure.query(async () => {
    return getConfirmedMonths();
  }),

  // Confirmar importação de caixa (apenas popular fin_daily_revenue, sem criar salesImport)
  importDiario: protectedProcedure
    .input(
      z.object({
        saleDate: z.string(), // YYYY-MM-DD
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
        totalRevenue: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return importDiarioExpress(input.items, input.saleDate, ctx.user.id, input.totalRevenue);
    }),

  confirmCaixa: protectedProcedure
    .input(z.object({
      dailySummary: z.array(z.object({
        date: z.string(),
        total: z.number(),
        transactions: z.number(),
        payments: z.record(z.string(), z.number()),
      })),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("../db");
      const { finDailyRevenue } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      let updated = 0;
      let inserted = 0;
      for (const entry of input.dailySummary) {
        if (!entry.date || !entry.total) continue;
        const revenueDate = entry.date;
        const realAmount = String(Math.round(entry.total * 100) / 100);
        const note = input.note || `Caixa importado`;
        const existing = await db.select().from(finDailyRevenue)
          .where(eq(finDailyRevenue.revenueDate, revenueDate))
          .limit(1);
        if (existing.length > 0) {
          await db.update(finDailyRevenue)
            .set({ realAmount, note, updatedAt: new Date() })
            .where(eq(finDailyRevenue.revenueDate, revenueDate));
          updated++;
        } else {
          await db.insert(finDailyRevenue).values({
            userId: ctx.user.id,
            revenueDate,
            realAmount,
            note,
          });
          inserted++;
        }
      }
      return {
        success: true,
        daysInserted: inserted,
        daysUpdated: updated,
        total: input.dailySummary.length,
        message: `${inserted} dias inseridos, ${updated} dias atualizados na Previsão de Faturamento.`,
      };
    }),

  // Sugerir vínculos com IA a partir de produtos parseados (sem importId)
  // Usado no ReviewStep antes de salvar no banco
  suggestLinksFromParsed: protectedProcedure
    .input(z.object({
      products: z.array(z.object({
        external_code: z.string(),
        external_name: z.string(),
      }))
    }))
    .mutation(async ({ input }) => {
      const stockProducts = await getProductsForLinking();
      const stockList = stockProducts
        .map((p: any) => `ID:${p.id} | ${p.name}`)
        .join("\n");

      const BATCH_SIZE = 30;
      const allSuggestions: Array<{ externalCode: string; productId: number | null; confidence: number; reason: string }> = [];

      for (let i = 0; i < input.products.length; i += BATCH_SIZE) {
        const batch = input.products.slice(i, i + BATCH_SIZE);
        const pdvList = batch
          .map((item) => `CODE:${item.external_code} | ${item.external_name}`)
          .join("\n");

        const prompt = `Você é um especialista em vincular produtos de PDV de sorveteria ao catálogo de estoque.

IMPORTANTE: Os nomes do PDV são nomes comerciais simplificados (ex: "ACAI COM BANANA 1,5L", "BALA", "AGUA MINERAL 500ML").
Os nomes do estoque são nomes de fornecedor/marca (ex: "Docile Bala de Amoras", "Biomass Granola Super 1 Kg").
Use o contexto e a categoria para fazer a correspondência correta.
Se um produto do PDV não tiver correspondência no estoque (ex: serviços, combos, produtos sem estoque), retorne productId como null.

Produtos do ESTOQUE disponíveis (${stockProducts.length} produtos):
${stockList}

Produtos do PDV para vincular (lote ${Math.floor(i/BATCH_SIZE)+1}):
${pdvList}

Para cada CODE do PDV, encontre o produto do ESTOQUE mais adequado.
Use confiança > 0.7 apenas quando tiver certeza da correspondência.`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um especialista em correspondência de produtos de sorveteria. Analise cuidadosamente os nomes e retorne JSON válido." },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "product_suggestions_parsed",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          externalCode: { type: "string" },
                          productId: { type: ["integer", "null"] },
                          confidence: { type: "number" },
                          reason: { type: "string" },
                        },
                        required: ["externalCode", "productId", "confidence", "reason"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["suggestions"],
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = response?.choices?.[0]?.message?.content;
          const content = typeof rawContent === "string" ? rawContent : null;
          if (content) {
            const parsed = JSON.parse(content) as { suggestions: Array<{ externalCode: string; productId: number | null; confidence: number; reason: string }> };
            allSuggestions.push(...parsed.suggestions);
          }
        } catch (err) {
          console.error(`Erro no lote ${i}-${i+BATCH_SIZE}:`, err);
        }
      }

      // Retornar sugestões com confiança >= 0.7
      const highConfidence = allSuggestions.filter(s => s.productId && s.confidence >= 0.7);
      return {
        suggestions: allSuggestions,
        highConfidenceCount: highConfidence.length,
        total: input.products.length,
        message: `IA analisou ${input.products.length} produtos em ${Math.ceil(input.products.length/BATCH_SIZE)} lotes. ${highConfidence.length} vínculos com confiança ≥ 70% encontrados.`,
      };
    }),
});
