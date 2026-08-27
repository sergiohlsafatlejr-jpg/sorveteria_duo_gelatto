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
  getCashflowMonthly,
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
  saveDailyRevenue,
  getDailyRevenues,
  deleteRealRevenue,
  clearMonthRealRevenues,
  getAccuracyHistory,
  getRainAlert,
  getForecastSettings,
  saveForecastSettings,
  getFinGoals,
  createFinGoal,
  updateFinGoal,
  deleteFinGoal,
  getFinGoalExtraCosts,
  createFinGoalExtraCost,
  deleteFinGoalExtraCost,
  getFinGoalsMonthSummary,
  populateForecastFromGoal,
  getMonthlyComparison,
  getPayablesByWeekday,
  getPayablesByWeek,
} from "../db.fin";
import { protectedProcedure, router } from "../_core/trpc";
import { finDailyRevenue } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { toOptionalPositiveId } from "../../shared/optional-id";
import {
  findDefaultFinancialBankId,
  findFinancialCategoryId,
  findFinancialCostId,
  normalizeFinancialLabel,
  parsePayableSpreadsheetRow,
} from "../finance-import";
import {
  buildForecastMonth,
  buildNextSevenDayForecast,
  DEFAULT_FORECAST_SETTINGS,
} from "../forecast-calculation";

const optionalPositiveIdSchema = z.preprocess(
  toOptionalPositiveId,
  z.number().int().positive().optional(),
).optional();

const nullablePositiveIdSchema = z.preprocess(
  (value) => value === null ? null : toOptionalPositiveId(value),
  z.number().int().positive().nullable().optional(),
).optional();

export const finRouter = router({
  // ─── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: protectedProcedure.query(({ ctx }) =>
    getFinDashboardKPIs(ctx.user.id)
  ),

  // ─── Categories ────────────────────────────────────────────────────────────
  categories: router({
    list: protectedProcedure.query(() => getFinCategories()),
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
    list: protectedProcedure.query(() => getFinBanks()),
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
    list: protectedProcedure.query(() => getFinPaymentTypes()),
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
    list: protectedProcedure.query(() => getFinReceivableTypes()),
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
    list: protectedProcedure.query(() => getFinCosts()),
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
        dueDate: z.coerce.date(),
        categoryId: optionalPositiveIdSchema,
        typeId: optionalPositiveIdSchema,
        costId: optionalPositiveIdSchema,
        bankId: optionalPositiveIdSchema,
        isPaid: z.boolean().default(false),
        paymentDate: z.coerce.date().optional(),
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
        dueDate: z.coerce.date().optional(),
        categoryId: nullablePositiveIdSchema,
        typeId: nullablePositiveIdSchema,
        costId: nullablePositiveIdSchema,
        bankId: nullablePositiveIdSchema,
        isPaid: z.boolean().optional(),
        paymentDate: z.coerce.date().nullable().optional(),
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
    duplicateToNextMonth: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        const all = await getFinTransactions(ctx.user.id, {});
        const selected = all.filter(t => input.ids.includes(t.id));
        let created = 0;
        for (const t of selected) {
          const d = new Date(t.dueDate);
          const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), 12, 0, 0);
          await createFinTransaction({
            userId: ctx.user.id,
            description: t.description,
            amount: String(t.amount),
            dueDate: nextMonth,
            categoryId: t.categoryId ?? undefined,
            bankId: t.bankId ?? undefined,
            costId: (t as any).costId ?? undefined,
            isPaid: false,
            notes: t.notes ?? undefined,
          });
          created++;
        }
        return { created };
      }),
    // Importação de Excel: recebe base64 do arquivo e insere as transações em lote
    importExcel: protectedProcedure
      .input(z.object({
        fileBase64: z.string(), // arquivo Excel em base64
        categoryId: optionalPositiveIdSchema,
        bankId: optionalPositiveIdSchema,
        dryRun: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("Planilha vazia");
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

        const parsedRows = rows
          .map(parsePayableSpreadsheetRow)
          .filter((row): row is NonNullable<typeof row> => row !== null);
        const existingTransactions = parsedRows.length > 0
          ? await getFinTransactions(ctx.user.id, {
              dateFrom: new Date(Math.min(...parsedRows.map(row => row.dueDate.getTime()))),
              dateTo: new Date(Math.max(...parsedRows.map(row => row.dueDate.getTime())) + 86_399_999),
            })
          : [];
        const transactionKey = (description: string, amount: number | string, dueDate: Date) => {
          const dateKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`;
          return `${normalizeFinancialLabel(description)}|${Number(amount).toFixed(2)}|${dateKey}`;
        };
        const existingKeys = new Set(existingTransactions.map(row =>
          transactionKey(row.description, row.amount, new Date(row.dueDate))
        ));
        const costs = await getFinCosts();
        const categories = await getFinCategories();
        const banks = await getFinBanks();
        const defaultBankId = input.bankId ?? findDefaultFinancialBankId(banks);
        const unmatchedCosts = new Set<string>();
        const unmatchedCategories = new Set<string>();
        let imported = 0;
        let skipped = 0;
        let duplicates = 0;
        for (const parsed of parsedRows) {
          const key = transactionKey(parsed.description, parsed.amount, parsed.dueDate);
          if (existingKeys.has(key)) {
            duplicates++;
            continue;
          }
          const matchedCostId = parsed.costIdCandidate
            ?? findFinancialCostId(parsed.costReference, costs);
          const matchedCategoryId = input.categoryId
            ?? findFinancialCategoryId(parsed.costReference, categories);
          if (parsed.costReference && !matchedCostId) unmatchedCosts.add(parsed.costReference);
          if (parsed.costReference && !matchedCategoryId) unmatchedCategories.add(parsed.costReference);
          const notes = parsed.costReference && !matchedCostId
            ? `Custo informado na planilha: ${parsed.costReference}`
            : undefined;
          if (!input.dryRun) {
            await createFinTransaction({
              userId: ctx.user.id,
              description: parsed.description,
              amount: String(parsed.amount),
              dueDate: parsed.dueDate,
              categoryId: matchedCategoryId,
              bankId: defaultBankId,
              isPaid: parsed.isPaid,
              paymentDate: parsed.isPaid ? parsed.dueDate : undefined,
              costId: matchedCostId,
              financialCostName: parsed.costReference,
              notes,
            });
          }
          existingKeys.add(key);
          imported++;
        }
        skipped += rows.length - parsedRows.length;
        return {
          imported,
          skipped,
          duplicates,
          total: rows.length,
          dryRun: input.dryRun,
          unmatchedCosts: Array.from(unmatchedCosts).sort(),
          unmatchedCategories: Array.from(unmatchedCategories).sort(),
          defaultBankId,
        };
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
    duplicateToNextMonth: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        const db = await import("../db.fin");
        // Buscar todos os forecasts do usuário
        const allForecasts = await db.getFinRevenueForecasts(ctx.user.id, "2000-01-01", "2099-12-31");
        const selected = allForecasts.filter((f: { id: number }) => input.ids.includes(f.id));
        let created = 0;
        for (const f of selected) {
          const [y, m, d] = (f.forecastDate as string).split("-").map(Number);
          const nextDate = new Date(y!, m!, d!, 12, 0, 0); // m! already is next month (0-indexed + 1)
          const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
          await upsertFinRevenueForecast({
            userId: ctx.user.id,
            forecastDate: nextDateStr,
            amount: String(f.amount),
            description: f.description ?? undefined,
          });
          created++;
        }
        return { created };
      }),
  }),

  // ─── Forecast Calendar ────────────────────────────────────────────────────────────────────────────
  forecastCalendar: router({
    getCalendar: protectedProcedure
      .input(z.object({
        year: z.number().int().min(2020).max(2030),
        month: z.number().int().min(1).max(12),
        /** Configurações de média por tipo de dia */
        avgWeekday: z.number().default(2000),
        avgSaturday: z.number().default(5300),
        avgSundayHoliday: z.number().default(8300),
        /** Fator de redução por chuva (0-1, default 0.7 = reduz 30%) */
        rainFactor: z.number().min(0).max(1).default(0.7),
      }))
      .query(({ input }) => buildForecastMonth(input.year, input.month, {
        avgWeekday: input.avgWeekday,
        avgSaturday: input.avgSaturday,
        avgSundayHoliday: input.avgSundayHoliday,
        rainFactor: input.rainFactor,
      })),
    getNext7DaysForecast: protectedProcedure.query(async ({ ctx }) => {
      const saved = await getForecastSettings(ctx.user.id);
      const settings = saved
        ? {
            avgWeekday: saved.avgWeekday,
            avgSaturday: saved.avgSaturday,
            avgSundayHoliday: saved.avgSundayHoliday,
            rainFactor: Number(saved.rainFactor),
          }
        : DEFAULT_FORECAST_SETTINGS;
      return buildNextSevenDayForecast(settings);
    }),
    saveRealRevenue: protectedProcedure
      .input(z.object({
        revenueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        realAmount: z.number().min(0),
        note: z.string().max(255).optional(),
      }))
      .mutation(({ ctx, input }) => saveDailyRevenue(ctx.user.id, input.revenueDate, input.realAmount, input.note ?? null)),
    getRealRevenues: protectedProcedure
      .input(z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      }))
      .query(({ ctx, input }) => getDailyRevenues(ctx.user.id, input.year, input.month)),
    deleteRealRevenue: protectedProcedure
      .input(z.object({
        revenueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .mutation(({ ctx, input }) => deleteRealRevenue(ctx.user.id, input.revenueDate)),
    clearMonthRealRevenues: protectedProcedure
      .input(z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      }))
      .mutation(({ ctx, input }) => clearMonthRealRevenues(ctx.user.id, input.year, input.month)),
    getAccuracyHistory: protectedProcedure
      .input(z.object({
        avgWeekday: z.number().default(2000),
        avgSaturday: z.number().default(5300),
        avgSundayHoliday: z.number().default(8300),
        rainFactor: z.number().min(0).max(1).default(0.7),
        months: z.number().int().min(1).max(12).default(6),
      }).optional())
      .query(({ ctx, input }) => getAccuracyHistory(
        ctx.user.id,
        input?.avgWeekday ?? 2000,
        input?.avgSaturday ?? 5300,
        input?.avgSundayHoliday ?? 8300,
        input?.rainFactor ?? 0.7,
        input?.months ?? 6,
      )),
    getRainAlert: protectedProcedure
      .input(z.object({
        avgWeekday: z.number().default(2000),
        avgSaturday: z.number().default(5300),
        avgSundayHoliday: z.number().default(8300),
        rainFactor: z.number().min(0).max(1).default(0.7),
      }).optional())
      .query(({ input }) => getRainAlert(
        input?.avgWeekday ?? 2000,
        input?.avgSaturday ?? 5300,
        input?.avgSundayHoliday ?? 8300,
        input?.rainFactor ?? 0.7,
      )),
    getSettings: protectedProcedure
      .query(({ ctx }) => getForecastSettings(ctx.user.id)),
    saveSettings: protectedProcedure
      .input(z.object({
        avgWeekday: z.number().int().min(0),
        avgSaturday: z.number().int().min(0),
        avgSundayHoliday: z.number().int().min(0),
        rainFactor: z.number().min(0).max(1),
      }))
      .mutation(({ ctx, input }) => saveForecastSettings(ctx.user.id, input)),
    // Buscar previsões de meta (gravadas por populateForecastFromGoal) para um mês
    getGoalForecasts: protectedProcedure
      .input(z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      }))
      .query(({ ctx, input }) => {
        const { year, month } = input.year !== undefined ? input : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
        const daysInMonth = new Date(year, month, 0).getDate();
        const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
        return getFinRevenueForecasts(ctx.user.id, dateFrom, dateTo);
      }),
    duplicateDaysToNextMonth: protectedProcedure
      .input(z.object({
        dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { created: 0 };
        let created = 0;
        for (const date of input.dates) {
          const [y, m, d] = date.split("-").map(Number);
          const nextM = m === 12 ? 1 : m + 1;
          const nextY = m === 12 ? y + 1 : y;
          // Verificar se o dia existe no próximo mês (ex: dia 31 em fevereiro)
          const maxDay = new Date(nextY, nextM, 0).getDate();
          if (d > maxDay) continue;
          const nextDate = `${nextY}-${String(nextM).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          // Buscar o valor real do dia original
          const [existing] = await db.select().from(finDailyRevenue)
            .where(and(eq(finDailyRevenue.userId, ctx.user.id), eq(finDailyRevenue.revenueDate, date)));
          if (!existing) continue;
          // Upsert no próximo mês
          const [alreadyExists] = await db.select().from(finDailyRevenue)
            .where(and(eq(finDailyRevenue.userId, ctx.user.id), eq(finDailyRevenue.revenueDate, nextDate)));
          if (alreadyExists) {
            await db.update(finDailyRevenue)
              .set({ realAmount: existing.realAmount, note: existing.note })
              .where(and(eq(finDailyRevenue.userId, ctx.user.id), eq(finDailyRevenue.revenueDate, nextDate)));
          } else {
            await db.insert(finDailyRevenue).values({
              userId: ctx.user.id,
              revenueDate: nextDate,
              realAmount: existing.realAmount,
              note: existing.note,
            });
          }
          created++;
        }
        return { created };
      }),
  }),
  // ─── Goals (Meta de Gerência) ────────────────────────────────────────────────
  goals: router({
    summary: protectedProcedure
      .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ input }) => getFinGoalsMonthSummary(input.month)),
    list: protectedProcedure
      .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ input }) => getFinGoals(input.month)),
    create: protectedProcedure
      .input(z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        label: z.string().min(1),
        targetRevenue: z.number().min(0),
        salary: z.number().min(0),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input }) =>
        createFinGoal({
          month: input.month,
          label: input.label,
          targetRevenue: String(input.targetRevenue),
          salary: String(input.salary),
          notes: input.notes,
          sortOrder: input.sortOrder ?? 0,
        })
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().optional(),
        targetRevenue: z.number().optional(),
        salary: z.number().optional(),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input }) => {
        const { id, targetRevenue, salary, ...rest } = input;
        return updateFinGoal(id, {
          ...rest,
          ...(targetRevenue !== undefined && { targetRevenue: String(targetRevenue) }),
          ...(salary !== undefined && { salary: String(salary) }),
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteFinGoal(input.id)),
    // Extra costs
    listExtraCosts: protectedProcedure
      .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ input }) => getFinGoalExtraCosts(input.month)),
    createExtraCost: protectedProcedure
      .input(z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        description: z.string().min(1),
        amount: z.number().min(0),
      }))
      .mutation(({ input }) =>
        createFinGoalExtraCost({
          month: input.month,
          description: input.description,
          amount: String(input.amount),
        })
      ),
    deleteExtraCost: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteFinGoalExtraCost(input.id)),
    // Populate forecast calendar from goal target
    populateForecast: protectedProcedure
      .input(z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        targetRevenue: z.number().min(0),
        overwrite: z.boolean().default(false),
      }))
      .mutation(({ ctx, input }) =>
        populateForecastFromGoal(ctx.user.id, input.month, input.targetRevenue, input.overwrite)
      ),
  }),

  // ─── Monthly Comparison ─────────────────────────────────────────────────────
  monthlyComparison: router({
    compare: protectedProcedure
      .input(z.object({
        month1: z.string().regex(/^\d{4}-\d{2}$/),
        month2: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .query(({ input }) => {
        const [y1, m1] = input.month1.split("-").map(Number);
        const [y2, m2] = input.month2.split("-").map(Number);
        const month1From = new Date(y1, m1 - 1, 1, 12, 0, 0);
        const month1To = new Date(y1, m1, 0, 23, 59, 59);
        const month2From = new Date(y2, m2 - 1, 1, 12, 0, 0);
        const month2To = new Date(y2, m2, 0, 23, 59, 59);
        return getMonthlyComparison(month1From, month1To, month2From, month2To);
      }),
  }),

  // ─── Relatório: Contas a Pagar por Dia da Semana ─────────────────────────────────────────────────
  weekdayReport: router({
    payablesByWeekday: protectedProcedure
      .input(z.object({
        year: z.number().int().min(2020).max(2030),
        month: z.number().int().min(1).max(12),
      }))
      .query(({ ctx, input }) => {
        const { year, month } = input;
        const dateFrom = new Date(year, month - 1, 1, 0, 0, 0);
        const dateTo = new Date(year, month, 0, 23, 59, 59);
        return getPayablesByWeekday(ctx.user.id, { dateFrom, dateTo });
      }),
    payablesByWeek: protectedProcedure
      .input(z.object({
        year: z.number().int().min(2020).max(2030),
        month: z.number().int().min(1).max(12),
      }))
      .query(({ ctx, input }) => {
        const { year, month } = input;
        const dateFrom = new Date(year, month - 1, 1, 0, 0, 0);
        const dateTo = new Date(year, month, 0, 23, 59, 59);
        return getPayablesByWeek(ctx.user.id, { dateFrom, dateTo });
      }),
  }),

  // ─── Cashflow Monthlyy ────────────────────────────────────────────────────────────────────────────
  cashflow: router({
    monthly: protectedProcedure
      .input(z.object({
        monthsBack: z.number().min(0).max(24).default(3),
        monthsAhead: z.number().min(0).max(24).default(6),
      }).optional())
      .query(({ ctx, input }) =>
        getCashflowMonthly(ctx.user.id, input?.monthsBack ?? 3, input?.monthsAhead ?? 6)
      ),
  }),
});
