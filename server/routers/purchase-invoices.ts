import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  operationalSuppliers,
  purchaseInvoiceItems,
  purchaseInvoices,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  buildBoxPurchaseHistory,
  buildPurchaseDashboard,
  buildPurchaseItemsSummary,
} from "../purchase-invoice-analytics";
import { confirmPurchaseInvoiceStock } from "../purchase-invoice-confirmation";
import { findOperationalSupplierId } from "../purchase-invoice-domain";
import { extractPurchaseInvoicePdf, matchesPurchaseItemFilters } from "../purchase-invoice-extraction";
import { storageGet, storagePut } from "../storage";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const itemReviewSchema = z.object({
  id: z.number().int().positive(),
  supplierCode: z.string().max(100).nullable(),
  description: z.string().min(1).max(500),
  category: z.enum(["limpeza", "guloseimas", "caldas", "descartaveis", "embalagens", "manutencao", "insumos", "outros"]),
  quantity: z.number().nonnegative(),
  unit: z.string().min(1).max(20),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
});

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function decodePdf(base64: string): Buffer {
  const payload = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O PDF deve ter entre 1 byte e 15 MB.",
    });
  }
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo enviado não é um PDF válido." });
  }
  return buffer;
}

async function resolveSupplierId(
  db: Database,
  name: string,
  cnpj: string,
): Promise<number | null> {
  const suppliers = await db
    .select({ id: operationalSuppliers.id, name: operationalSuppliers.name, cnpj: operationalSuppliers.cnpj })
    .from(operationalSuppliers)
    .where(eq(operationalSuppliers.active, true));

  return findOperationalSupplierId(suppliers, name, cnpj);
}

async function runExtraction(db: Database, invoiceId: number, fileKey: string) {
  const sourceRows = await db
    .select()
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.id, invoiceId))
    .limit(1);
  const source = sourceRows[0];
  if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Documento fiscal não encontrado." });
  const documentHash = source.documentHash ?? source.fileHash;

  await db
    .update(purchaseInvoices)
    .set({ status: "processing", errorMessage: null, documentHash })
    .where(or(eq(purchaseInvoices.documentHash, documentHash), eq(purchaseInvoices.id, invoiceId)));

  const startedAt = Date.now();
  try {
    const signedFile = await storageGet(fileKey);
    const extraction = await extractPurchaseInvoicePdf(signedFile.url);
    const supplierIds = await Promise.all(
      extraction.invoices.map((invoice) => resolveSupplierId(db, invoice.supplier_name, invoice.supplier_cnpj)),
    );
    const existing = await db
      .select({ id: purchaseInvoices.id, documentIndex: purchaseInvoices.documentIndex, status: purchaseInvoices.status })
      .from(purchaseInvoices)
      .where(or(eq(purchaseInvoices.documentHash, documentHash), eq(purchaseInvoices.id, invoiceId)));

    const invoiceIds: number[] = [];
    await db.transaction(async (tx) => {
      for (let position = 0; position < extraction.invoices.length; position += 1) {
        const invoice = extraction.invoices[position];
        const documentIndex = position + 1;
        let targetId = existing.find((row) => row.documentIndex === documentIndex)?.id;

        if (!targetId && documentIndex === 1) targetId = invoiceId;
        if (!targetId) {
          const childHash = createHash("sha256").update(`${documentHash}:${documentIndex}`).digest("hex");
          const inserted = await tx
            .insert(purchaseInvoices)
            .values({
              source: source.source,
              fileName: source.fileName,
              fileKey: source.fileKey,
              fileUrl: source.fileUrl,
              fileHash: childHash,
              documentHash,
              documentIndex,
              fileSize: source.fileSize,
              uploadedBy: source.uploadedBy,
              status: "processing",
            })
            .$returningId();
          targetId = inserted[0]?.id;
        }
        if (!targetId) throw new Error(`Falha ao registrar a nota ${documentIndex} do documento.`);
        invoiceIds.push(targetId);

        await tx.delete(purchaseInvoiceItems).where(eq(purchaseInvoiceItems.invoiceId, targetId));
        await tx.insert(purchaseInvoiceItems).values(
          invoice.items.map((item) => ({
            invoiceId: targetId,
            lineNumber: item.line_number,
            supplierCode: item.supplier_code || null,
            description: item.description,
            category: item.category,
            quantity: item.quantity.toFixed(3),
            unit: item.unit,
            unitPrice: item.unit_price.toFixed(4),
            totalPrice: item.total_price.toFixed(2),
            confidence: item.confidence.toFixed(4),
            rawData: item,
          })),
        );

        await tx
          .update(purchaseInvoices)
          .set({
            documentHash,
            documentIndex,
            status: invoice.suggestedStatus,
            supplierName: invoice.supplier_name || null,
            supplierCnpj: invoice.supplier_cnpj || null,
            operationalSupplierId: supplierIds[position],
            invoiceNumber: invoice.invoice_number || null,
            accessKey: invoice.access_key || null,
            issueDate: invoice.issue_date || null,
            totalAmount: invoice.total_amount.toFixed(2),
            itemSubtotal: invoice.itemSubtotal.toFixed(2),
            totalItems: invoice.items.length,
            confidence: invoice.confidence.toFixed(4),
            model: extraction.model,
            promptTokens: position === 0 ? extraction.promptTokens : 0,
            completionTokens: position === 0 ? extraction.completionTokens : 0,
            durationMs: position === 0 ? Date.now() - startedAt : 0,
            validationErrors: invoice.validationErrors,
            processedAt: new Date(),
            errorMessage: null,
          })
          .where(eq(purchaseInvoices.id, targetId));
      }

      for (const stale of existing.filter((row) => row.documentIndex > extraction.invoices.length && row.status !== "confirmed")) {
        await tx
          .update(purchaseInvoices)
          .set({ status: "error", errorMessage: "Esta nota não foi localizada no último reprocessamento do PDF." })
          .where(eq(purchaseInvoices.id, stale.id));
      }
    });

    const validationErrors = extraction.invoices.flatMap((invoice, index) =>
      invoice.validationErrors.map((error) => `Nota ${index + 1}: ${error}`),
    );
    const status = extraction.invoices.some((invoice) => invoice.suggestedStatus === "review_required")
      ? "review_required"
      : "extracted";
    return { invoiceId: invoiceIds[0] ?? invoiceId, invoiceIds, documentInvoiceCount: invoiceIds.length, status, validationErrors };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na extração.";
    await db
      .update(purchaseInvoices)
      .set({ status: "error", errorMessage: message, durationMs: Date.now() - startedAt, processedAt: new Date() })
      .where(eq(purchaseInvoices.id, invoiceId));
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Não foi possível extrair a nota: ${message}` });
  }
}

export const purchaseInvoicesRouter = router({
  uploadAndExtract: protectedProcedure
    .input(z.object({
      fileName: z.string().min(1).max(255),
      mimeType: z.literal("application/pdf"),
      base64: z.string().min(8).max(22_000_000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.fileName.toLowerCase().endsWith(".pdf")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Envie um arquivo com extensão .pdf." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

      const buffer = decodePdf(input.base64);
      const hash = createHash("sha256").update(buffer).digest("hex");
      const duplicate = await db
        .select({ id: purchaseInvoices.id, fileName: purchaseInvoices.fileName })
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.fileHash, hash))
        .limit(1);
      if (duplicate[0]) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Este PDF já foi enviado como ${duplicate[0].fileName}.`,
        });
      }

      const now = new Date();
      const key = `purchase-invoices/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${hash}.pdf`;
      const stored = await storagePut(key, buffer, "application/pdf");
      const inserted = await db
        .insert(purchaseInvoices)
        .values({
          fileName: input.fileName.replace(/[\\/]/g, "_").trim(),
          fileKey: stored.key,
          fileUrl: stored.url,
          fileHash: hash,
          documentHash: hash,
          documentIndex: 1,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
          status: "pending",
        })
        .$returningId();
      const invoiceId = inserted[0]?.id;
      if (!invoiceId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao registrar o PDF." });

      return runExtraction(db, invoiceId, stored.key);
    }),

  reprocess: protectedProcedure
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const rows = await db
        .select({
          id: purchaseInvoices.id,
          fileKey: purchaseInvoices.fileKey,
          fileHash: purchaseInvoices.fileHash,
          documentHash: purchaseInvoices.documentHash,
          documentIndex: purchaseInvoices.documentIndex,
          status: purchaseInvoices.status,
        })
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, input.invoiceId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
      const documentHash = rows[0].documentHash ?? rows[0].fileHash;
      const documentRows = await db
        .select({ id: purchaseInvoices.id, fileKey: purchaseInvoices.fileKey, documentIndex: purchaseInvoices.documentIndex, status: purchaseInvoices.status })
        .from(purchaseInvoices)
        .where(or(eq(purchaseInvoices.documentHash, documentHash), eq(purchaseInvoices.id, rows[0].id)))
        .orderBy(asc(purchaseInvoices.documentIndex));
      if (documentRows.some((row) => row.status === "confirmed")) {
        throw new TRPCError({ code: "CONFLICT", message: "Uma nota confirmada não pode ser reprocessada, pois já gerou movimentos de estoque." });
      }
      const root = documentRows.find((row) => row.documentIndex === 1) ?? documentRows[0];
      return runExtraction(db, root.id, root.fileKey);
    }),

  list: protectedProcedure
    .input(z.object({
      status: z.enum(["all", "pending", "processing", "extracted", "review_required", "confirmed", "error"]).default("all"),
      search: z.string().max(100).default(""),
      limit: z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const filters = [];
      if (input?.status && input.status !== "all") filters.push(eq(purchaseInvoices.status, input.status));
      if (input?.search?.trim()) {
        const search = `%${input.search.trim()}%`;
        filters.push(or(
          like(purchaseInvoices.supplierName, search),
          like(purchaseInvoices.invoiceNumber, search),
          like(purchaseInvoices.fileName, search),
        ));
      }
      return db
        .select()
        .from(purchaseInvoices)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(purchaseInvoices.createdAt))
        .limit(input?.limit ?? 50);
    }),

  getById: protectedProcedure
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const invoices = await db
        .select()
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, input.invoiceId))
        .limit(1);
      if (!invoices[0]) return null;
      const items = await db
        .select()
        .from(purchaseInvoiceItems)
        .where(eq(purchaseInvoiceItems.invoiceId, input.invoiceId));
      return { invoice: invoices[0], items };
    }),

  getFileUrl: protectedProcedure
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const rows = await db
        .select({ fileKey: purchaseInvoices.fileKey })
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, input.invoiceId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
      return storageGet(rows[0].fileKey);
    }),

  saveReview: protectedProcedure
    .input(z.object({
      invoiceId: z.number().int().positive(),
      supplierName: z.string().min(1).max(255),
      supplierCnpj: z.string().max(20).nullable(),
      invoiceNumber: z.string().min(1).max(100),
      issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      totalAmount: z.number().positive(),
      items: z.array(itemReviewSchema).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

      const invoiceRows = await db
        .select({ status: purchaseInvoices.status })
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, input.invoiceId))
        .limit(1);
      if (!invoiceRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
      if (invoiceRows[0].status === "confirmed") {
        throw new TRPCError({ code: "CONFLICT", message: "Esta nota já foi confirmada e não pode mais ser editada." });
      }

      const existingItems = await db
        .select({ id: purchaseInvoiceItems.id })
        .from(purchaseInvoiceItems)
        .where(eq(purchaseInvoiceItems.invoiceId, input.invoiceId));
      const allowedIds = new Set(existingItems.map((item) => item.id));
      if (input.items.some((item) => !allowedIds.has(item.id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Há um item que não pertence a esta nota." });
      }

      const itemSubtotal = Math.round(input.items.reduce((sum, item) => sum + item.totalPrice, 0) * 100) / 100;
      const tolerance = Math.max(2, input.totalAmount * 0.02);
      const validationErrors: string[] = [];
      for (const item of input.items) {
        const calculated = Math.round(item.quantity * item.unitPrice * 100) / 100;
        if (Math.abs(calculated - item.totalPrice) > Math.max(0.05, item.totalPrice * 0.01)) {
          validationErrors.push(`Item ${item.description}: quantidade × preço não fecha com o total.`);
        }
      }
      if (Math.abs(itemSubtotal - input.totalAmount) > tolerance) {
        validationErrors.push("A soma dos itens diverge mais de 2% (ou R$ 2,00) do total da nota.");
      }

      for (const item of input.items) {
        await db
          .update(purchaseInvoiceItems)
          .set({
            supplierCode: item.supplierCode?.trim() || null,
            description: item.description.trim(),
            category: item.category,
            quantity: item.quantity.toFixed(3),
            unit: item.unit.trim().toUpperCase(),
            unitPrice: item.unitPrice.toFixed(4),
            totalPrice: item.totalPrice.toFixed(2),
          })
          .where(and(eq(purchaseInvoiceItems.id, item.id), eq(purchaseInvoiceItems.invoiceId, input.invoiceId)));
      }

      const supplierId = await resolveSupplierId(db, input.supplierName, input.supplierCnpj ?? "");
      await db
        .update(purchaseInvoices)
        .set({
          supplierName: input.supplierName.trim(),
          supplierCnpj: input.supplierCnpj?.replace(/\D/g, "") || null,
          operationalSupplierId: supplierId,
          invoiceNumber: input.invoiceNumber.trim(),
          issueDate: input.issueDate,
          totalAmount: input.totalAmount.toFixed(2),
          itemSubtotal: itemSubtotal.toFixed(2),
          totalItems: input.items.length,
          status: validationErrors.length === 0 ? "extracted" : "review_required",
          validationErrors,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(purchaseInvoices.id, input.invoiceId));

      return {
        status: validationErrors.length === 0 ? "extracted" as const : "review_required" as const,
        itemSubtotal,
        validationErrors,
      };
    }),

  confirm: protectedProcedure
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return confirmPurchaseInvoiceStock(db, input.invoiceId, ctx.user.id);
    }),

  itemsBySupplier: protectedProcedure
    .input(z.object({
      supplier: z.enum(["all", "sorvefort", "duo_gelatto", "outros"]).default("all"),
      search: z.string().max(100).default(""),
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
      dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
      category: z.enum(["all", "limpeza", "guloseimas", "caldas", "descartaveis", "embalagens", "manutencao", "insumos", "outros"]).default("all"),
      limit: z.number().int().min(1).max(500).default(250),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const filters = [or(
        eq(purchaseInvoices.status, "extracted"),
        eq(purchaseInvoices.status, "review_required"),
        eq(purchaseInvoices.status, "confirmed"),
      )];
      if (input.supplier === "sorvefort") filters.push(like(purchaseInvoices.supplierName, "%SORVEFORT%"));
      if (input.supplier === "duo_gelatto") filters.push(like(purchaseInvoices.supplierName, "%DUO GELATTO%"));
      if (input.supplier === "outros") {
        filters.push(sql`${purchaseInvoices.supplierName} NOT LIKE '%DUO GELATTO%' AND ${purchaseInvoices.supplierName} NOT LIKE '%SORVEFORT%'`);
      }
      if (input.search.trim()) {
        const search = `%${input.search.trim()}%`;
        filters.push(or(
          like(purchaseInvoiceItems.description, search),
          like(purchaseInvoiceItems.supplierCode, search),
        ));
      }
      if (input.dateFrom) filters.push(gte(purchaseInvoices.issueDate, input.dateFrom));
      if (input.dateTo) filters.push(lte(purchaseInvoices.issueDate, input.dateTo));
      if (input.category !== "all") filters.push(eq(purchaseInvoiceItems.category, input.category));

      const rows = await db
        .select({
          id: purchaseInvoiceItems.id,
          invoiceId: purchaseInvoiceItems.invoiceId,
          supplierName: purchaseInvoices.supplierName,
          invoiceNumber: purchaseInvoices.invoiceNumber,
          issueDate: purchaseInvoices.issueDate,
          status: purchaseInvoices.status,
          description: purchaseInvoiceItems.description,
          supplierCode: purchaseInvoiceItems.supplierCode,
          category: purchaseInvoiceItems.category,
          quantity: purchaseInvoiceItems.quantity,
          unit: purchaseInvoiceItems.unit,
          unitPrice: purchaseInvoiceItems.unitPrice,
          totalPrice: purchaseInvoiceItems.totalPrice,
          confidence: purchaseInvoiceItems.confidence,
        })
        .from(purchaseInvoiceItems)
        .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
        .where(and(...filters))
        .orderBy(desc(purchaseInvoices.issueDate), asc(purchaseInvoiceItems.lineNumber))
        .limit(input.limit);
      return rows.filter((row) => matchesPurchaseItemFilters(row, input));
    }),

  boxPurchaseHistory: protectedProcedure
    .input(z.object({
      search: z.string().max(100).default(""),
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
      dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
      limit: z.number().int().min(1).max(500).default(250),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {
        rows: [],
        summary: { totalQuantity: 0, totalSpent: 0, weightedAveragePrice: 0, supplierCount: 0, invoiceCount: 0 },
        bySupplier: [],
      };

      const filters = [
        eq(purchaseInvoices.status, "confirmed"),
        eq(purchaseInvoiceItems.linkStatus, "linked"),
      ];
      if (input.dateFrom) filters.push(gte(purchaseInvoices.issueDate, input.dateFrom));
      if (input.dateTo) filters.push(lte(purchaseInvoices.issueDate, input.dateTo));

      const rows = await db
        .select({
          id: purchaseInvoiceItems.id,
          invoiceId: purchaseInvoiceItems.invoiceId,
          linkedBoxId: purchaseInvoiceItems.boxStockId,
          supplierName: purchaseInvoices.supplierName,
          invoiceNumber: purchaseInvoices.invoiceNumber,
          issueDate: purchaseInvoices.issueDate,
          description: purchaseInvoiceItems.description,
          quantity: purchaseInvoiceItems.quantity,
          unit: purchaseInvoiceItems.unit,
          unitPrice: purchaseInvoiceItems.unitPrice,
          totalPrice: purchaseInvoiceItems.totalPrice,
        })
        .from(purchaseInvoiceItems)
        .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
        .where(and(...filters))
        .orderBy(desc(purchaseInvoices.issueDate), asc(purchaseInvoiceItems.description))
        .limit(input.limit);

      return buildBoxPurchaseHistory(rows, input.search);
    }),

  monthlyItemsSummary: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (!db) return {
        availableMonths: [],
        ...buildPurchaseItemsSummary([], [], input?.month ?? currentMonth),
      };

      const validStatusFilter = or(
        eq(purchaseInvoices.status, "extracted"),
        eq(purchaseInvoices.status, "review_required"),
        eq(purchaseInvoices.status, "confirmed"),
      );
      const dateRows = await db
        .select({ issueDate: purchaseInvoices.issueDate })
        .from(purchaseInvoices)
        .where(validStatusFilter);
      const availableMonths = Array.from(new Set(
        dateRows
          .map((row) => row.issueDate?.slice(0, 7))
          .filter((month): month is string => Boolean(month)),
      )).sort((a, b) => b.localeCompare(a));
      const selectedMonth = input?.month ?? availableMonths[0] ?? currentMonth;
      const [year, monthNumber] = selectedMonth.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
      const monthFilter = and(
        validStatusFilter,
        gte(purchaseInvoices.issueDate, `${selectedMonth}-01`),
        lte(purchaseInvoices.issueDate, lastDay),
      );

      const invoices = await db
        .select({
          id: purchaseInvoices.id,
          supplierName: purchaseInvoices.supplierName,
          invoiceNumber: purchaseInvoices.invoiceNumber,
          issueDate: purchaseInvoices.issueDate,
          status: purchaseInvoices.status,
        })
        .from(purchaseInvoices)
        .where(monthFilter);
      const items = await db
        .select({
          id: purchaseInvoiceItems.id,
          invoiceId: purchaseInvoiceItems.invoiceId,
          description: purchaseInvoiceItems.description,
          category: purchaseInvoiceItems.category,
          quantity: purchaseInvoiceItems.quantity,
          unit: purchaseInvoiceItems.unit,
          unitPrice: purchaseInvoiceItems.unitPrice,
          totalPrice: purchaseInvoiceItems.totalPrice,
        })
        .from(purchaseInvoiceItems)
        .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
        .where(monthFilter);

      return {
        availableMonths,
        ...buildPurchaseItemsSummary(invoices, items, selectedMonth),
      };
    }),

  // Comparação de preços mês atual vs anterior para alertas de variação
  priceVariation: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const currentMonth = input?.month ?? new Date().toISOString().slice(0, 7);
      if (!db) return { variations: [], currentMonth, previousMonth: "" };

      // Calcular mês anterior
      const [year, monthNum] = currentMonth.split("-").map(Number);
      const prevDate = new Date(Date.UTC(year, monthNum - 2, 1));
      const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

      const validStatusFilter = or(
        eq(purchaseInvoices.status, "extracted"),
        eq(purchaseInvoices.status, "review_required"),
        eq(purchaseInvoices.status, "confirmed"),
      );

      // Buscar itens do mês atual
      const [yearCur, monthCur] = currentMonth.split("-").map(Number);
      const lastDayCur = new Date(Date.UTC(yearCur, monthCur, 0)).toISOString().slice(0, 10);
      const curFilter = and(validStatusFilter, gte(purchaseInvoices.issueDate, `${currentMonth}-01`), lte(purchaseInvoices.issueDate, lastDayCur));

      // Buscar itens do mês anterior
      const [yearPrev, monthPrev] = previousMonth.split("-").map(Number);
      const lastDayPrev = new Date(Date.UTC(yearPrev, monthPrev, 0)).toISOString().slice(0, 10);
      const prevFilter = and(validStatusFilter, gte(purchaseInvoices.issueDate, `${previousMonth}-01`), lte(purchaseInvoices.issueDate, lastDayPrev));

      const [curItems, prevItems] = await Promise.all([
        db.select({
          description: purchaseInvoiceItems.description,
          quantity: purchaseInvoiceItems.quantity,
          totalPrice: purchaseInvoiceItems.totalPrice,
          supplierName: purchaseInvoices.supplierName,
        }).from(purchaseInvoiceItems)
          .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
          .where(curFilter),
        db.select({
          description: purchaseInvoiceItems.description,
          quantity: purchaseInvoiceItems.quantity,
          totalPrice: purchaseInvoiceItems.totalPrice,
          supplierName: purchaseInvoices.supplierName,
        }).from(purchaseInvoiceItems)
          .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
          .where(prevFilter),
      ]);

      // Filtrar apenas Duo Gelatto
      const isDuo = (name: string | null) => (name ?? "").toUpperCase().includes("DUO GELATTO");
      const curDuo = curItems.filter((i) => isDuo(i.supplierName));
      const prevDuo = prevItems.filter((i) => isDuo(i.supplierName));

      // Calcular preço médio por produto
      const avgPrice = (items: typeof curDuo) => {
        const map = new Map<string, { total: number; qty: number }>();
        for (const item of items) {
          const key = (item.description ?? "").toUpperCase().trim();
          if (!key) continue;
          const cur = map.get(key) ?? { total: 0, qty: 0 };
          cur.total += Number(item.totalPrice ?? 0);
          cur.qty += Number(item.quantity ?? 0);
          map.set(key, cur);
        }
        return map;
      };

      const curPrices = avgPrice(curDuo);
      const prevPrices = avgPrice(prevDuo);

      const variations: { product: string; currentPrice: number; previousPrice: number; variation: number }[] = [];
      for (const [product, cur] of Array.from(curPrices.entries())) {
        const prev = prevPrices.get(product);
        if (!prev || prev.qty === 0 || cur.qty === 0) continue;
        const curAvg = cur.total / cur.qty;
        const prevAvg = prev.total / prev.qty;
        if (prevAvg === 0) continue;
        const variation = ((curAvg - prevAvg) / prevAvg) * 100;
        if (Math.abs(variation) >= 10) {
          variations.push({ product, currentPrice: curAvg, previousPrice: prevAvg, variation });
        }
      }

      return {
        variations: variations.sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation)),
        currentMonth,
        previousMonth,
      };
    }),

  // Gastos por categoria nos últimos 6 meses (para gráfico comparativo)
  monthlyCategoryTrend: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { months: [], series: [] };

      const validStatusFilter = or(
        eq(purchaseInvoices.status, "extracted"),
        eq(purchaseInvoices.status, "review_required"),
        eq(purchaseInvoices.status, "confirmed"),
      );

      // Últimos 6 meses
      const now = new Date();
      const months: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }

      const startDate = `${months[0]}-01`;
      const [lastYear, lastMonth] = months[months.length - 1].split("-").map(Number);
      const endDate = new Date(Date.UTC(lastYear, lastMonth, 0)).toISOString().slice(0, 10);

      const filter = and(
        validStatusFilter,
        gte(purchaseInvoices.issueDate, startDate),
        lte(purchaseInvoices.issueDate, endDate),
        sql`UPPER(${purchaseInvoices.supplierName}) LIKE '%DUO GELATTO%'`,
      );

      const items = await db
        .select({
          description: purchaseInvoiceItems.description,
          totalPrice: purchaseInvoiceItems.totalPrice,
          issueDate: purchaseInvoices.issueDate,
        })
        .from(purchaseInvoiceItems)
        .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
        .where(filter);

      // Agrupar por mês e categoria
      const categoryMap = new Map<string, Map<string, number>>();
      for (const item of items) {
        const month = item.issueDate?.slice(0, 7) ?? "";
        if (!months.includes(month)) continue;
        // Categorizar usando mesma lógica do frontend
        const desc = (item.description ?? "").toUpperCase();
        let cat = "outros";
        if (/PICOLE\s*ZERO/i.test(desc)) cat = "picoles_zero";
        else if (/LINHA\s*ZERO/i.test(desc)) cat = "linha_zero";
        else if (/LINHA\s*KIDS/i.test(desc)) cat = "linha_kids";
        else if (/LINHA\s*ESPECIAL/i.test(desc)) cat = "linha_especial";
        else if (/\bMEGA\b/i.test(desc) || /OURO\s*PRETO/i.test(desc)) cat = "mega";
        else if (/\bDUOBLITO/i.test(desc)) cat = "duoblito";
        else if (/\bCAIXA\s*10\s*(L|LT|LITRO|LITROS)\b/i.test(desc) || /\b10\s*LITROS?\b/i.test(desc)) cat = "caixas_10l";
        else if (/PACK\s*4\s*UND.*1[,.]5\s*LITRO/i.test(desc)) cat = "potes_1_5l";
        else if (/PACK\s*(6|9)\s*UND.*1\s*(LITRO|LT)/i.test(desc) || /PACK\s*(6|9)\s*UND.*500\s*ML/i.test(desc)) cat = "potes_1l_500ml";
        else if (/CAIXA\s*5\s*LITRO/i.test(desc) || /5\s*LITROS/i.test(desc)) cat = "caixas_5l";
        else if (/\b(FRUTA|CAJA)\b/i.test(desc) && /\d+\s*UND/i.test(desc)) cat = "picoles_fruta";
        else if (/\b(CREME|COALHADA|MILHO|MORANGO|CUPUACU|COCO|TAMARINDO)\b/i.test(desc) && /\d+\s*UND/i.test(desc)) cat = "picoles_creme";
        else if (/\d+\s*UND.*-\s*(SP|CLASSICOS)/i.test(desc) || /CLASSICOS/i.test(desc)) cat = "picoles_sp";
        else if (/ACAI/i.test(desc)) cat = "acai";
        else if (/\d+\s*UND/i.test(desc)) cat = "picoles_outros";

        if (!categoryMap.has(cat)) categoryMap.set(cat, new Map());
        const monthMap = categoryMap.get(cat)!;
        monthMap.set(month, (monthMap.get(month) ?? 0) + Number(item.totalPrice ?? 0));
      }

      const series = Array.from(categoryMap.entries()).map(([category, monthMap]) => ({
        category,
        data: months.map(m => monthMap.get(m) ?? 0),
      })).sort((a, b) => {
        const totalA = a.data.reduce((s, v) => s + v, 0);
        const totalB = b.data.reduce((s, v) => s + v, 0);
        return totalB - totalA;
      });

      return { months, series };
    }),

  // Comparativo preço de compra x preço de venda (margem)
  priceComparison: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const currentMonth = input?.month ?? new Date().toISOString().slice(0, 7);
      if (!db) return { items: [], month: currentMonth };

      const validStatusFilter = or(
        eq(purchaseInvoices.status, "extracted"),
        eq(purchaseInvoices.status, "review_required"),
        eq(purchaseInvoices.status, "confirmed"),
      );

      const [year, monthNum] = currentMonth.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, monthNum, 0)).toISOString().slice(0, 10);
      const monthFilter = and(
        validStatusFilter,
        gte(purchaseInvoices.issueDate, `${currentMonth}-01`),
        lte(purchaseInvoices.issueDate, lastDay),
        sql`UPPER(${purchaseInvoices.supplierName}) LIKE '%DUO GELATTO%'`,
      );

      const items = await db
        .select({
          description: purchaseInvoiceItems.description,
          quantity: purchaseInvoiceItems.quantity,
          totalPrice: purchaseInvoiceItems.totalPrice,
          unitPrice: purchaseInvoiceItems.unitPrice,
        })
        .from(purchaseInvoiceItems)
        .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
        .where(monthFilter);

      // Agrupar por produto
      const productMap = new Map<string, { qty: number; totalCost: number }>();
      for (const item of items) {
        const key = (item.description ?? "").toUpperCase().trim();
        if (!key) continue;
        const cur = productMap.get(key) ?? { qty: 0, totalCost: 0 };
        cur.qty += Number(item.quantity ?? 0);
        cur.totalCost += Number(item.totalPrice ?? 0);
        productMap.set(key, cur);
      }

      // Buscar preço de venda do INOVE
      let inoveProducts: Array<{ nome: string; preco_venda: number }> = [];
      try {
        const { inoveConnectorConfig: inoveConfig } = await import("../../drizzle/schema");
        const rows = await db.select().from(inoveConfig).limit(1);
        if (rows.length > 0 && rows[0].active) {
          const mssql = await import("mssql");
          const config = rows[0];
          const pool = new mssql.default.ConnectionPool({
            server: config.host ?? "duo-urias.safatle.net.br",
            port: config.port ?? 55444,
            user: config.username ?? "sa",
            password: config.password ?? "",
            database: config.database ?? "DUOGELATTO",
            options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000, requestTimeout: 15000 },
          });
          await pool.connect();
          const result = await pool.request().query(`
            SELECT PRO_NOME as nome, CAST(PRO_VENDA as float) as preco_venda
            FROM PRODUTOS WHERE PRO_ATIVO = 'S'
          `);
          await pool.close();
          inoveProducts = result.recordset as Array<{ nome: string; preco_venda: number }>;
        }
      } catch {
        // INOVE offline — continua sem preço de venda
      }

      // Criar mapa de preço de venda (normalizado)
      const sellPriceMap = new Map<string, number>();
      for (const p of inoveProducts) {
        sellPriceMap.set((p.nome ?? "").toUpperCase().trim(), p.preco_venda ?? 0);
      }

      // Montar resultado
      const result = Array.from(productMap.entries()).map(([name, data]) => {
        const avgCost = data.qty > 0 ? data.totalCost / data.qty : 0;
        // Tentar encontrar preço de venda por match exato ou parcial
        let sellPrice = sellPriceMap.get(name) ?? 0;
        if (sellPrice === 0) {
          for (const [inoveName, price] of Array.from(sellPriceMap.entries())) {
            if (inoveName.includes(name) || name.includes(inoveName)) {
              sellPrice = price;
              break;
            }
          }
        }
        const margin = sellPrice > 0 ? ((sellPrice - avgCost) / sellPrice) * 100 : 0;
        return {
          product: name,
          avgCostPrice: avgCost,
          sellPrice,
          margin,
          totalQty: data.qty,
          totalCost: data.totalCost,
        };
      }).sort((a, b) => b.totalCost - a.totalCost);

      return { items: result, month: currentMonth };
    }),

  dashboard: protectedProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null),
      supplier: z.enum(["all", "duo_gelatto", "almoxarifado"]).default("all"),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (!db) return {
        availableMonths: [],
        ...buildPurchaseDashboard([], [], input?.month ?? currentMonth),
      };

      const validStatusFilter = or(
        eq(purchaseInvoices.status, "extracted"),
        eq(purchaseInvoices.status, "review_required"),
        eq(purchaseInvoices.status, "confirmed"),
      );
      const dateRows = await db
        .select({ issueDate: purchaseInvoices.issueDate })
        .from(purchaseInvoices)
        .where(validStatusFilter);
      const availableMonths = Array.from(new Set(
        dateRows
          .map((row) => row.issueDate?.slice(0, 7))
          .filter((month): month is string => Boolean(month)),
      )).sort((a, b) => b.localeCompare(a));
      const selectedMonth = input?.month ?? availableMonths[0] ?? currentMonth;
      const [year, monthNumber] = selectedMonth.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
      const monthFilter = and(
        validStatusFilter,
        gte(purchaseInvoices.issueDate, `${selectedMonth}-01`),
        lte(purchaseInvoices.issueDate, lastDay),
      );

      const invoices = await db
        .select({
          id: purchaseInvoices.id,
          supplierName: purchaseInvoices.supplierName,
          issueDate: purchaseInvoices.issueDate,
          totalAmount: purchaseInvoices.totalAmount,
          status: purchaseInvoices.status,
        })
        .from(purchaseInvoices)
        .where(monthFilter);
      // Filtrar por tipo de fornecedor
      const supplierFilter = input?.supplier ?? "all";
      const filteredInvoices = supplierFilter === "all" ? invoices
        : supplierFilter === "duo_gelatto"
          ? invoices.filter((inv) => (inv.supplierName ?? "").toUpperCase().includes("DUO GELATTO"))
          : invoices.filter((inv) => !(inv.supplierName ?? "").toUpperCase().includes("DUO GELATTO"));
      const filteredInvoiceIds = new Set(filteredInvoices.map((inv) => inv.id));
      const items = await db
        .select({
          invoiceId: purchaseInvoiceItems.invoiceId,
          description: purchaseInvoiceItems.description,
          category: purchaseInvoiceItems.category,
          quantity: purchaseInvoiceItems.quantity,
          totalPrice: purchaseInvoiceItems.totalPrice,
        })
        .from(purchaseInvoiceItems)
        .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
        .where(monthFilter);

      return {
        availableMonths,
        ...buildPurchaseDashboard(filteredInvoices, items.filter((item) => filteredInvoiceIds.has(item.invoiceId)), selectedMonth),
      };
    }),
});
