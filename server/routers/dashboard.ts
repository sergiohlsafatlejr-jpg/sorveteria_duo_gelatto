import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const dashboardRouter = router({
  metrics: protectedProcedure.query(() => db.getDashboardMetrics()),
  chartData: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(({ input }) => db.getSalesChartData(input.days)),
  topProducts: protectedProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(({ input }) => db.getTopProducts(input.limit)),
  birthdays: protectedProcedure.query(() => db.getBirthdayCustomers()),
  lowStock: protectedProcedure.query(() => db.getLowStockProducts()),
  topCustomersByPoints: protectedProcedure
    .input(z.object({ limit: z.number().default(10) }).optional())
    .query(({ input }) => db.getTopCustomersByPoints(input?.limit ?? 10)),
  customersWithPointsCount: protectedProcedure.query(() => db.getCustomersWithPointsCount()),
});
