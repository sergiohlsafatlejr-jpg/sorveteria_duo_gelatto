import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getCostVsSalesReport,
  getTopProductsReport,
  getPaymentMethodsReport,
  getDREReport,
  getMonthlySalesEvolution,
  getAvailableMonths,
  getMostPurchasedReport,
  getStockTurnoverReport,
  getStockSummaryReport,
  getWeeklyStockTurnoverReport,
} from "../db.reports";

export const reportsRouter = router({
  // Meses disponíveis (com vendas confirmadas)
  availableMonths: protectedProcedure.query(async () => {
    return getAvailableMonths();
  }),

  // Evolução mensal de vendas
  monthlySalesEvolution: protectedProcedure.query(async () => {
    return getMonthlySalesEvolution();
  }),

  // Custo x Venda por produto
  costVsSales: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      return getCostVsSalesReport(input.referenceMonth);
    }),

  // Top produtos mais vendidos
  topProducts: protectedProcedure
    .input(
      z.object({
        referenceMonth: z.string().optional(),
        limit: z.number().min(5).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      return getTopProductsReport(input.referenceMonth, input.limit);
    }),

  // Formas de pagamento do caixa
  paymentMethods: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      return getPaymentMethodsReport(input.referenceMonth);
    }),

  // DRE — Demonstrativo de Resultado do Exercício
  dre: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      return getDREReport(input.referenceMonth);
    }),

  // Produtos mais comprados (via NF-e / movimentações de entrada)
  mostPurchased: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(100).default(30) }))
    .query(async ({ input }) => {
      return getMostPurchasedReport(input.limit);
    }),

  // Giro de estoque + cobertura + compras x vendas
  stockTurnover: protectedProcedure.query(async () => {
    return getStockTurnoverReport();
  }),

  // Resumo executivo de estoque
  stockSummary: protectedProcedure.query(async () => {
    return getStockSummaryReport();
  }),

  // Giro de estoque por semana (para planejamento de compras)
  weeklyStockTurnover: protectedProcedure
    .input(z.object({ weeksBack: z.number().min(2).max(12).default(6) }).optional())
    .query(async ({ input }) => {
      return getWeeklyStockTurnoverReport(input?.weeksBack ?? 6);
    }),
});
