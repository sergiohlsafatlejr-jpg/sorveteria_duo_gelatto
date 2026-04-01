import { Router } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { z } from "zod";
import { TRPCError } from "@trpc/server";
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

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

// ─── Multer: upload para /tmp ─────────────────────────────────────────────────
const upload = multer({ dest: "/tmp/sales-uploads/" });

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
      // Verificar autenticação via cookie/session
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.caixa?.[0] || !files?.produtos?.[0]) {
        return res.status(400).json({ error: "Envie os dois arquivos: caixa e produtos" });
      }

      const caixaPath = files.caixa[0].path;
      const produtosPath = files.produtos[0].path;
      // Em dev: tsx roda a partir de server/routers/ → cwd é a raiz do projeto
      // Em prod: dist/index.js → cwd também é a raiz do projeto
      const pythonScript = path.join(process.cwd(), "server/parse_sales_xls.py");

      // Executar o parser Python
      // Usar caminho absoluto e limpar PYTHONPATH para evitar conflito com Python 3.13 do uv
      const cleanEnv = { ...process.env, PYTHONPATH: "", PYTHONHOME: "" };
      const { stdout, stderr } = await execFileAsync("/usr/bin/python3.11", [pythonScript, caixaPath, produtosPath], {
        timeout: 30000,
        env: cleanEnv,
      });

      // Limpar arquivos temporários
      fs.unlinkSync(caixaPath);
      fs.unlinkSync(produtosPath);

      if (stderr && !stdout) {
        return res.status(500).json({ error: "Erro ao processar arquivo: " + stderr });
      }

      const parsed = JSON.parse(stdout);

      if (parsed.caixa?.error) {
        return res.status(400).json({ error: "Erro no arquivo de caixa: " + parsed.caixa.error });
      }
      if (parsed.produtos?.error) {
        return res.status(400).json({ error: "Erro no arquivo de produtos: " + parsed.produtos.error });
      }

      return res.json({ success: true, data: parsed });
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
