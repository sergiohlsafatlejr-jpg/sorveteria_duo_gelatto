import * as XLSX from "xlsx";
import { z } from "zod";
import {
  createFinBank,
  createFinBankStatement,
  createFinBankStatements,
  createFinCategory,
  createFinCost,
  createFinPaymentType,
  createFinReceivable,
  createFinReceivableType,
  createFinTransaction,
  deleteFinBank,
  deleteFinBankStatement,
  deleteFinCategory,
  deleteFinCost,
  deleteFinPaymentType,
  deleteFinReceivable,
  deleteFinReceivableType,
  deleteFinRevenueForecast,
  deleteFinTransaction,
  getFinBankStatements,
  getFinBanks,
  getFinCategories,
  getFinCosts,
  getFinDashboardKPIs,
  getFinPaymentTypes,
  getFinReceivableTypes,
  getFinReceivables,
  getFinRevenueForecasts,
  getFinTransactions,
  getTransactionsByCost,
  getUnlinkedTransactions,
  linkTransactionToCost,
  unlinkTransactionFromCost,
  updateFinBank,
  updateFinBankStatement,
  updateFinCategory,
  updateFinCost,
  updateFinPaymentType,
  updateFinReceivable,
  updateFinTransaction,
  upsertFinRevenueForecast,
} from "../db.fin";
import { protectedProcedure, router } from "../_core/trpc";

export const finRouter = router({
  // ─── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: protectedProcedure.query(({ ctx }) =>
    getFinDashboardKPIs(ctx.user.id)
  ),

  // ─── Categories ────────────────────────────────────────────────────────────
  categories: router({
    list: protectedProcedure.query(({ ctx }) => getFinCategories(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        type: z.enum(["income", "expense"]).default("expense"),
        color: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        createFinCategory({
          userId: ctx.user.id,
          name: input.name,
          type: input.type,
          color: input.color ?? "#6b7280",
        })
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        type: z.enum(["income", "expense"]).optional(),
        color: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return updateFinCategory(id, ctx.user.id, data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) =>
        deleteFinCategory(input.id, ctx.user.id)
      ),
  }),

  // ─── Banks ─────────────────────────────────────────────────────────────────
  banks: router({
    list: protectedProcedure.query(({ ctx }) => getFinBanks(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        color: z.string().optional(),
        initialBalance: z.number().optional(),
      }))
      .mutation(({ ctx, input }) =>
        createFinBank({
          userId: ctx.user.id,
          name: input.name,
          color: input.color ?? "#6366f1",
          initialBalance: String(input.initialBalance ?? 0),
        })
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        color: z.string().optional(),
        initialBalance: z.number().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return updateFinBank(id, ctx.user.id, {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.color !== undefined && { color: data.color }),
          ...(data.initialBalance !== undefined && { initialBalance: String(data.initialBalance) }),
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => deleteFinBank(input.id, ctx.user.id)),
  }),

  // ─── Payment Types ─────────────────────────────────────────────────────────
  paymentTypes: router({
    list: protectedProcedure.query(({ ctx }) => getFinPaymentTypes(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        description: z.string().min(1),
        categoryId: z.number().optional(),
        costId: z.number().optional(),
      }))
      .mutation(({ ctx, input }) =>
        createFinPaymentType({ userId: ctx.user.id, ...input })
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        categoryId: z.number().nullable().optional(),
        costId: z.number().nullable().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return updateFinPaymentType(id, ctx.user.id, data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => deleteFinPaymentType(input.id, ctx.user.id)),
  }),

  // ─── Receivable Types ──────────────────────────────────────────────────────
  receivableTypes: router({
    list: protectedProcedure.query(({ ctx }) => getFinReceivableTypes(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({ description: z.string().min(1) }))
      .mutation(({ ctx, input }) =>
        createFinReceivableType({ userId: ctx.user.id, description: input.description })
      ),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => deleteFinReceivableType(input.id, ctx.user.id)),
  }),

  // ─── Costs ─────────────────────────────────────────────────────────────────
  costs: router({
    list: protectedProcedure.query(({ ctx }) => getFinCosts(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        amount: z.number().min(0),
        type: z.enum(["fixed", "variable"]).default("fixed"),
        costCategory: z.enum(["administrative", "operational", "commercial", "financial", "other"]).default("operational"),
        categoryId: z.number().optional(),
        recurrence: z.enum(["monthly", "weekly", "yearly", "once"]).default("monthly"),
        dueDay: z.number().int().min(1).max(31).default(1),
      }))
      .mutation(({ ctx, input }) =>
        createFinCost({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          amount: String(input.amount),
          value: String(input.amount),
          type: input.type,
          costCategory: input.costCategory,
          categoryId: input.categoryId,
          recurrence: input.recurrence,
          dueDay: input.dueDay,
        })
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        amount: z.number().optional(),
        type: z.enum(["fixed", "variable"]).optional(),
        costCategory: z.enum(["administrative", "operational", "commercial", "financial", "other"]).optional(),
        categoryId: z.number().nullable().optional(),
        recurrence: z.enum(["monthly", "weekly", "yearly", "once"]).optional(),
        dueDay: z.number().int().min(1).max(31).optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, amount, ...rest } = input;
        return updateFinCost(id, ctx.user.id, {
          ...rest,
          ...(amount !== undefined && { amount: String(amount), value: String(amount) }),
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => deleteFinCost(input.id, ctx.user.id)),
    // Busca despesas vinculadas a um custo específico
    getLinkedTransactions: protectedProcedure
      .input(z.object({ costId: z.number() }))
      .query(({ ctx, input }) => getTransactionsByCost(input.costId, ctx.user.id)),
    // Busca despesas disponíveis para vincular (sem custo vinculado)
    getUnlinkedTransactions: protectedProcedure
      .query(({ ctx }) => getUnlinkedTransactions(ctx.user.id)),
    // Vincula uma despesa existente a este custo
    linkTransaction: protectedProcedure
      .input(z.object({ transactionId: z.number(), costId: z.number() }))
      .mutation(({ ctx, input }) =>
        linkTransactionToCost(input.transactionId, input.costId, ctx.user.id)
      ),
    // Remove a vinculação de uma despesa com este custo
    unlinkTransaction: protectedProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(({ ctx, input }) =>
        unlinkTransactionFromCost(input.transactionId, ctx.user.id)
      ),
  }),

  // ─── Transactions (Contas a Pagar) ─────────────────────────────────────────
  transactions: router({
    list: protectedProcedure
      .input(z.object({
        categoryId: z.number().optional(),
        bankId: z.number().optional(),
        isPaid: z.boolean().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ ctx, input }) => getFinTransactions(ctx.user.id, input)),
    create: protectedProcedure
      .input(z.object({
        description: z.string().min(1),
        amount: z.number().min(0),
        dueDate: z.date(),
        categoryId: z.number().optional(),
        typeId: z.number().optional(),
        costId: z.number().optional(),
        bankId: z.number().optional(),
        isPaid: z.boolean().default(false),
        paymentDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        createFinTransaction({
          userId: ctx.user.id,
          description: input.description,
          amount: String(input.amount),
          dueDate: input.dueDate,
          categoryId: input.categoryId,
          typeId: input.typeId,
          costId: input.costId,
          bankId: input.bankId,
          isPaid: input.isPaid,
          paymentDate: input.paymentDate,
          notes: input.notes,
        })
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        amount: z.number().optional(),
        dueDate: z.date().optional(),
        categoryId: z.number().nullable().optional(),
        typeId: z.number().nullable().optional(),
        costId: z.number().nullable().optional(),
        bankId: z.number().nullable().optional(),
        isPaid: z.boolean().optional(),
        paymentDate: z.date().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, amount, ...rest } = input;
        return updateFinTransaction(id, ctx.user.id, {
          ...rest,
          ...(amount !== undefined && { amount: String(amount) }),
        });
      }),
    markPaid: protectedProcedure
      .input(z.object({ id: z.number(), paymentDate: z.date().optional() }))
      .mutation(({ ctx, input }) =>
        updateFinTransaction(input.id, ctx.user.id, {
          isPaid: true,
          paymentDate: input.paymentDate ?? new Date(),
        })
      ),
    markUnpaid: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) =>
        updateFinTransaction(input.id, ctx.user.id, { isPaid: false, paymentDate: undefined })
      ),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => deleteFinTransaction(input.id, ctx.user.id)),
    // Importação de Excel: recebe base64 do arquivo e insere as transações em lote
    importExcel: protectedProcedure
      .input(z.object({
        fileBase64: z.string(), // arquivo Excel em base64
        categoryId: z.number().optional(),
        bankId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("Planilha vazia");
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

        // Mapeamento flexível de colunas (aceita português e inglês)
        const parseRow = (row: Record<string, unknown>) => {
          const get = (...keys: string[]) => {
            for (const k of keys) {
              const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, ""));
              if (found && row[found] !== undefined && row[found] !== "") return row[found];
            }
            return undefined;
          };
          const desc = String(get("descricao", "description", "nome", "name", "historico") ?? "").trim();
          if (!desc) return null;
          const rawAmount = get("valor", "amount", "value", "vlr", "vl");
          const amount = rawAmount ? parseFloat(String(rawAmount).replace(/[^0-9.,]/g, "").replace(",", ".")) : 0;
          const rawDate = get("vencimento", "duedate", "data", "date", "datadevencimento");
          let dueDate: Date;
          if (rawDate instanceof Date) {
            dueDate = rawDate;
          } else if (typeof rawDate === "number") {
            dueDate = XLSX.SSF.parse_date_code(rawDate) ? new Date(rawDate) : new Date();
          } else {
            const parsed = rawDate ? new Date(String(rawDate)) : null;
            dueDate = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
          }
          const rawPaid = get("pago", "paid", "status", "situacao");
          const isPaid = rawPaid ? ["sim", "yes", "pago", "paid", "1", "true"].includes(String(rawPaid).toLowerCase().trim()) : false;
          const rawCostId = get("custo", "costid", "cost");
          const costId = rawCostId ? parseInt(String(rawCostId)) : undefined;
          return { desc, amount, dueDate, isPaid, costId };
        };

        let imported = 0;
        let skipped = 0;
        for (const row of rows) {
          const parsed = parseRow(row);
          if (!parsed) { skipped++; continue; }
          await createFinTransaction({
            userId: ctx.user.id,
            description: parsed.desc,
            amount: String(parsed.amount),
            dueDate: parsed.dueDate,
            categoryId: input.categoryId,
            bankId: input.bankId,
            isPaid: parsed.isPaid,
            costId: parsed.costId ?? undefined,
          });
          imported++;
        }
        return { imported, skipped, total: rows.length };
      }),
  }),
  // ─── Receivables (Contas a Receber)) ────────────────────────────────────────
  receivables: router({
    list: protectedProcedure
      .input(z.object({
        typeId: z.number().optional(),
        isReceived: z.boolean().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ ctx, input }) => getFinReceivables(ctx.user.id, input)),
    create: protectedProcedure
      .input(z.object({
        description: z.string().min(1),
        amount: z.number().min(0),
        dueDate: z.date(),
        typeId: z.number().optional(),
        clientId: z.number().optional(),
        isReceived: z.boolean().default(false),
        receivedDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        createFinReceivable({
          userId: ctx.user.id,
          description: input.description,
          amount: String(input.amount),
          dueDate: input.dueDate,
          typeId: input.typeId,
          clientId: input.clientId,
          isReceived: input.isReceived,
          receivedDate: input.receivedDate,
          notes: input.notes,
        })
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        amount: z.number().optional(),
        dueDate: z.date().optional(),
        typeId: z.number().nullable().optional(),
        clientId: z.number().nullable().optional(),
        isReceived: z.boolean().optional(),
        receivedDate: z.date().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, amount, ...rest } = input;
        return updateFinReceivable(id, ctx.user.id, {
          ...rest,
          ...(amount !== undefined && { amount: String(amount) }),
        });
      }),
    markReceived: protectedProcedure
      .input(z.object({ id: z.number(), receivedDate: z.date().optional() }))
      .mutation(({ ctx, input }) =>
        updateFinReceivable(input.id, ctx.user.id, {
          isReceived: true,
          receivedDate: input.receivedDate ?? new Date(),
        })
      ),
    markPending: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) =>
        updateFinReceivable(input.id, ctx.user.id, { isReceived: false, receivedDate: undefined })
      ),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => deleteFinReceivable(input.id, ctx.user.id)),
  }),

  // ─── Bank Statements (Extratos) ────────────────────────────────────────────
  bankStatements: router({
    list: protectedProcedure
      .input(z.object({
        bankId: z.number().optional(),
        categoryId: z.number().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ ctx, input }) => getFinBankStatements(ctx.user.id, input)),
    create: protectedProcedure
      .input(z.object({
        bankId: z.number().optional(),
        categoryId: z.number().optional(),
        date: z.date(),
        description: z.string().min(1),
        amount: z.number(),
        type: z.enum(["credit", "debit"]),
        reconciled: z.boolean().default(false),
        paymentMethod: z.enum(["pix", "cartao", "ted", "doc", "boleto", "dinheiro", "cheque", "outros"]).optional(),
      }))
      .mutation(({ ctx, input }) =>
        createFinBankStatement({
          userId: ctx.user.id,
          bankId: input.bankId,
          categoryId: input.categoryId,
          date: input.date,
          description: input.description,
          amount: String(input.amount),
          type: input.type,
          reconciled: input.reconciled,
          paymentMethod: input.paymentMethod,
        })
      ),
    createBatch: protectedProcedure
      .input(z.array(z.object({
        bankId: z.number().optional(),
        categoryId: z.number().optional(),
        date: z.date(),
        description: z.string().min(1),
        amount: z.number(),
        type: z.enum(["credit", "debit"]),
        reconciled: z.boolean().default(false),
        paymentMethod: z.enum(["pix", "cartao", "ted", "doc", "boleto", "dinheiro", "cheque", "outros"]).optional(),
      })))
      .mutation(({ ctx, input }) =>
        createFinBankStatements(input.map(s => ({
          userId: ctx.user.id,
          bankId: s.bankId,
          categoryId: s.categoryId,
          date: s.date,
          description: s.description,
          amount: String(s.amount),
          type: s.type,
          reconciled: s.reconciled,
          paymentMethod: s.paymentMethod,
        })))
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        amount: z.number().optional(),
        type: z.enum(["credit", "debit"]).optional(),
        reconciled: z.boolean().optional(),
        categoryId: z.number().nullable().optional(),
        bankId: z.number().nullable().optional(),
        paymentMethod: z.enum(["pix", "cartao", "ted", "doc", "boleto", "dinheiro", "cheque", "outros"]).nullable().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, amount, ...rest } = input;
        return updateFinBankStatement(id, ctx.user.id, {
          ...rest,
          ...(amount !== undefined && { amount: String(amount) }),
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => deleteFinBankStatement(input.id, ctx.user.id)),
  }),

  // ─── Revenue Forecast ──────────────────────────────────────────────────────
  revenueForecast: router({
    list: protectedProcedure
      .input(z.object({ monthStart: z.string(), monthEnd: z.string() }))
      .query(({ ctx, input }) =>
        getFinRevenueForecasts(ctx.user.id, input.monthStart, input.monthEnd)
      ),
    upsert: protectedProcedure
      .input(z.object({
        forecastDate: z.string(),
        amount: z.number().min(0),
        actualAmount: z.number().nullable().optional(),
        description: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        upsertFinRevenueForecast({
          userId: ctx.user.id,
          forecastDate: input.forecastDate,
          amount: String(input.amount),
          actualAmount: input.actualAmount != null ? String(input.actualAmount) : undefined,
          description: input.description,
        })
      ),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => deleteFinRevenueForecast(input.id, ctx.user.id)),
  }),
});
