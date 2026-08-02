import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const financeRouter = router({
  summary: protectedProcedure
    .input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const salesData = await db.getSales(
        input?.from ? new Date(input.from) : undefined,
        input?.to ? new Date(input.to) : undefined
      );
      const completed = salesData.filter((s) => s.status === "completed");
      const totalRevenue = completed.reduce((sum, s) => sum + parseFloat(String(s.finalTotal)), 0);
      const totalDiscount = completed.reduce((sum, s) => sum + parseFloat(String(s.discount)), 0);
      const byPayment = completed.reduce(
        (acc, s) => {
          acc[s.paymentMethod] = (acc[s.paymentMethod] ?? 0) + parseFloat(String(s.finalTotal));
          return acc;
        },
        {} as Record<string, number>
      );
      return { totalRevenue, totalDiscount, count: completed.length, byPayment };
    }),

  chartData: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(({ input }) => db.getSalesChartData(input.days)),

  topProducts: protectedProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(({ input }) => db.getTopProducts(input.limit)),
});
