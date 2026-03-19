import { TRPCError } from "@trpc/server";
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
      .input(z.object({ name: z.string().min(1) }))
      .mutation(({ ctx, input }) =>
        createFinCategory({ userId: ctx.user.id, name: input.name })
      ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1) }))
      .mutation(({ ctx, input }) =>
        updateFinCategory(input.id, ctx.user.id, input.name)
      ),
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
        description: z.string().min(1),
        value: z.number().min(0),
        type: z.enum(["fixed", "variable"]).default("fixed"),
        categoryId: z.number().optional(),
      }))
      .mutation(({ ctx, input }) =>
        createFinCost({ userId: ctx.user.id, ...input, value: String(input.value) })
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        value: z.number().optional(),
        type: z.enum(["fixed", "variable"]).optional(),
        categoryId: z.number().nullable().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, value, ...rest } = input;
        return updateFinCost(id, ctx.user.id, {
          ...rest,
          ...(value !== undefined && { value: String(value) }),
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => deleteFinCost(input.id, ctx.user.id)),
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
  }),

  // ─── Receivables (Contas a Receber) ────────────────────────────────────────
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
        forecastDate: z.string(), // YYYY-MM-DD
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
