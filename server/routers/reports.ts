import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getCostVsSalesReport,
  getTopProductsReport,
  getPaymentMethodsReport,
  getDREReport,
  getMonthlySalesEvolution,
  getAvailableMonths,
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
});
