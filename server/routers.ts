import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { syncDailyRevenue, syncSalesCache } from "./cron";
import { cronJobLog, finTransactions, finReceivables, products } from "../drizzle/schema";
import { desc, and, eq, lt, lte, sql } from "drizzle-orm";
import { getDb } from "./db";

// Import modular sub-routers
import { customersRouter } from "./routers/customers";
import { pointsRouter } from "./routers/points";
import { productsRouter } from "./routers/products";
import { salesRouter } from "./routers/sales";
import { financeRouter } from "./routers/finance";
import { usersRouter } from "./routers/users";
import { dashboardRouter } from "./routers/dashboard";
import { connectorRouter } from "./routers/connector";
import { notificationsRouter } from "./routers/notifications";

import { finRouter } from "./routers/fin";
import { whatsappRouter } from "./routers/whatsapp";
import { instagramRouter } from "./routers/instagram";
import { nfeRouter } from "./routers/nfe";
import { salesImportRouter } from "./routers/sales-import";
import { reportsRouter } from "./routers/reports";
import { metaAdsRouter } from "./routers/meta-ads";
import { adLibraryRouter } from "./routers/ad-library";
import { inoveRouter } from "./routers/inove";
import { redeRouter } from "./routers/rede";
import { purchasesRouter } from "./routers/purchases";
import { productGoalsRouter } from "./routers/productGoals";

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  customers: customersRouter,
  points: pointsRouter,
  products: productsRouter,
  sales: salesRouter,
  finance: financeRouter,
  users: usersRouter,
  dashboard: dashboardRouter,
  connector: connectorRouter,
  notifications: notificationsRouter,
  fin: finRouter,
  whatsapp: whatsappRouter,
  instagram: instagramRouter,
  nfe: nfeRouter,
  salesImport: salesImportRouter,
  reports: reportsRouter,
  metaAds: metaAdsRouter,
  adLibrary: adLibraryRouter,
  inove: inoveRouter,
  rede: redeRouter,
  purchases: purchasesRouter,
  productGoals: productGoalsRouter,
  cron: router({
    // Listar últimas execuções dos cron jobs
    getLogs: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) return [];
        return dbInstance
          .select()
          .from(cronJobLog)
          .orderBy(desc(cronJobLog.executedAt))
          .limit(input?.limit ?? 50);
      }),
    // Disparar sincronização de faturamento manualmente
    triggerSyncRevenue: protectedProcedure
      .mutation(async () => {
        await syncDailyRevenue();
        return { ok: true };
      }),
    // Disparar sincronização do cache de vendas por produto manualmente
    triggerSyncSalesCache: protectedProcedure
      .mutation(async () => {
        await syncSalesCache();
        return { ok: true };
      }),
  }),
  alerts: router({
    counts: protectedProcedure.query(async ({ ctx }) => {
      const dbInstance = await getDb();
      if (!dbInstance) return { overduePayables: 0, overdueReceivables: 0, lowStock: 0, total: 0 };
      const now = new Date();
      // Contas a pagar vencidas (não pagas e com dueDate < hoje)
      const [overduePayablesResult] = await dbInstance
        .select({ count: sql<number>`COUNT(*)` })
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, ctx.user.id),
            eq(finTransactions.isPaid, false),
            lt(finTransactions.dueDate, now)
          )
        );
      // Contas a receber vencidas (não recebidas e com dueDate < hoje)
      const [overdueReceivablesResult] = await dbInstance
        .select({ count: sql<number>`COUNT(*)` })
        .from(finReceivables)
        .where(
          and(
            eq(finReceivables.userId, ctx.user.id),
            eq(finReceivables.isReceived, false),
            lt(finReceivables.dueDate, now)
          )
        );
      // Produtos com estoque baixo (currentStock <= minStock e ativo)
      const [lowStockResult] = await dbInstance
        .select({ count: sql<number>`COUNT(*)` })
        .from(products)
        .where(
          and(
            eq(products.active, true),
            lte(products.currentStock, products.minStock)
          )
        );
      const overduePayables = Number(overduePayablesResult?.count ?? 0);
      const overdueReceivables = Number(overdueReceivablesResult?.count ?? 0);
      const lowStock = Number(lowStockResult?.count ?? 0);
      return {
        overduePayables,
        overdueReceivables,
        lowStock,
        totalFinancial: overduePayables + overdueReceivables,
        total: overduePayables + overdueReceivables + lowStock,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
