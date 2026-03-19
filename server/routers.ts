import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { finRouter } from "./routers/fin";
import { whatsappRouter } from "./routers/whatsapp";
import { instagramRouter } from "./routers/instagram";
import { nfeRouter } from "./routers/nfe";
import { getDb } from "./db";
import { finTransactions, finReceivables, products } from "../drizzle/schema";
import { and, eq, lt, lte, sql } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function requireRole(role: "admin" | "manager", ctx: { user: { role: string } }) {
  const hierarchy = { admin: 3, manager: 2, attendant: 1, user: 0 };
  const userLevel = hierarchy[ctx.user.role as keyof typeof hierarchy] ?? 0;
  const required = hierarchy[role];
  if (userLevel < required) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
}

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireRole("admin", ctx);
  return next({ ctx });
});

const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireRole("manager", ctx);
  return next({ ctx });
});

// ─── Customers Router ─────────────────────────────────────────────────────────
const customersRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ input }) => db.getCustomers(input?.search)),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getCustomerById(input.id)),

  create: protectedProcedure
    .input(
      z.object({
        fullName: z.string().min(2),
        birthDate: z.string().optional(),
        cep: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await db.createCustomer({
        ...input,
        birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
        email: input.email || undefined,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "create",
        module: "customers",
        targetId: id,
        details: `Cliente criado: ${input.fullName}`,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        fullName: z.string().min(2).optional(),
        birthDate: z.string().optional(),
        cep: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        notes: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, birthDate, ...rest } = input;
      await db.updateCustomer(id, {
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        email: rest.email || undefined,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "update",
        module: "customers",
        targetId: id,
        details: `Cliente atualizado: ID ${id}`,
      });
    }),

  delete: managerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteCustomer(input.id);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "delete",
        module: "customers",
        targetId: input.id,
        details: `Cliente desativado: ID ${input.id}`,
      });
    }),

  birthdays: protectedProcedure.query(() => db.getBirthdayCustomers()),
  getStats: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getCustomerPurchaseStats(input.id)),
});

// ─── Points Router ────────────────────────────────────────────────────────────
const pointsRouter = router({
  getRules: protectedProcedure.query(() => db.getPointsRules()),
  getAllRules: managerProcedure.query(() => db.getAllPointsRules()),
  deleteRule: managerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deletePointsRule(input.id)),
  toggleRuleActive: managerProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(({ input }) => db.togglePointsRuleActive(input.id, input.active)),

  createRule: managerProcedure
    .input(
      z.object({
        name: z.string().min(2),
        description: z.string().optional(),
        purchaseAmount: z.number().positive(),
        pointsEarned: z.number().int().positive(),
        rewardThreshold: z.number().int().positive(),
        rewardValue: z.number().positive(),
      })
    )
    .mutation(({ input }) =>
      db.createPointsRule({
        ...input,
        purchaseAmount: String(input.purchaseAmount),
        rewardValue: String(input.rewardValue),
      })
    ),

  updateRule: managerProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        purchaseAmount: z.number().optional(),
        pointsEarned: z.number().optional(),
        rewardThreshold: z.number().optional(),
        rewardValue: z.number().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, purchaseAmount, rewardValue, ...rest } = input;
      return db.updatePointsRule(id, {
        ...rest,
        purchaseAmount: purchaseAmount !== undefined ? String(purchaseAmount) : undefined,
        rewardValue: rewardValue !== undefined ? String(rewardValue) : undefined,
      });
    }),

  getHistory: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(({ input }) => db.getCustomerPointsHistory(input.customerId)),

  addPoints: protectedProcedure
    .input(
      z.object({
        customerId: z.number(),
        type: z.enum(["earned", "redeemed", "expired", "manual"]),
        points: z.number().int().positive(),
        purchaseAmount: z.number().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.addPointsTransaction({
        ...input,
        purchaseAmount: input.purchaseAmount !== undefined ? String(input.purchaseAmount) : undefined,
        userId: ctx.user.id,
      });

      // ── WhatsApp notification (fire-and-forget) ──────────────────────────
      if (input.type === "earned") {
        void (async () => {
          try {
            const { getWhatsappConfig, createWhatsappLog } = await import("./db.whatsapp");
            const { sendWhatsAppMessage, buildMessage } = await import("./zapi");
            const waConfig = await getWhatsappConfig();
            if (!waConfig || !waConfig.active || !waConfig.notifyOnPoints) return;

            const customer = await db.getCustomerById(input.customerId);
            if (!customer || !customer.phone) return;

            const rules = await db.getPointsRules();
            const activeRule = rules[0];
            const meta = activeRule ? activeRule.rewardThreshold : 100;
            const saldo = customer.totalPoints;
            const faltam = Math.max(0, meta - saldo);
            const pct = saldo / meta;

            // Determine which message to send
            let template: string | null = null;
            let type = "points_earned";

            if (saldo >= meta && waConfig.notifyOnGoalReached) {
              template = waConfig.msgGoalReached;
              type = "goal_reached";
            } else if (pct >= 0.8 && waConfig.notifyOnGoalNear) {
              template = waConfig.msgGoalNear;
              type = "goal_near";
            } else if (waConfig.notifyOnPoints) {
              template = waConfig.msgPointsEarned;
              type = "points_earned";
            }

            if (!template) return;

            const message = buildMessage(template, {
              nome: customer.fullName,
              pontos: input.points,
              saldo,
              meta,
              faltam,
              recompensa: activeRule ? activeRule.rewardValue : "0",
            });

            const result = await sendWhatsAppMessage(
              { instanceId: waConfig.instanceId, token: waConfig.token },
              customer.phone,
              message
            );

            await createWhatsappLog({
              customerId: customer.id,
              phone: customer.phone,
              type,
              message,
              status: result.success ? "sent" : "failed",
              errorMessage: result.error ?? null,
              sentAt: result.success ? new Date() : undefined,
            });
          } catch (err) {
            console.error("[WhatsApp] Notification error:", err);
          }
        })();
      }
    }),
});

// ─── Products Router ──────────────────────────────────────────────────────────
const productsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), categoryId: z.number().optional() }).optional())
    .query(({ input }) => db.getProducts(input?.search, input?.categoryId)),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getProductById(input.id)),

  lowStock: protectedProcedure.query(() => db.getLowStockProducts()),

  categories: protectedProcedure.query(() => db.getProductCategories()),

  createCategory: managerProcedure
    .input(z.object({ name: z.string().min(2), description: z.string().optional() }))
    .mutation(({ input }) => db.createProductCategory(input)),
  updateCategory: managerProcedure
    .input(z.object({ id: z.number(), name: z.string().min(2).optional(), description: z.string().optional(), active: z.boolean().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return db.updateProductCategory(id, data); }),
  deleteCategory: managerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteProductCategory(input.id)),

  create: managerProcedure
    .input(
      z.object({
        name: z.string().min(2),
        description: z.string().optional(),
        categoryId: z.number().optional(),
        sku: z.string().optional(),
        barcode: z.string().optional(),
        costPrice: z.number().min(0),
        salePrice: z.number().min(0),
        currentStock: z.number().int().min(0),
        minStock: z.number().int().min(0),
        unit: z.string().default("un"),
        purchaseUnit: z.string().default("un"),
        conversionFactor: z.number().int().min(1).default(1),
        supplierCode: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await db.createProduct({
        ...input,
        costPrice: String(input.costPrice),
        salePrice: String(input.salePrice),
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "create",
        module: "products",
        targetId: id,
        details: `Produto criado: ${input.name}`,
      });
      return { id };
    }),

  update: managerProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        categoryId: z.number().optional(),
        sku: z.string().optional(),
        barcode: z.string().optional(),
        costPrice: z.number().optional(),
        salePrice: z.number().optional(),
        minStock: z.number().optional(),
        unit: z.string().optional(),
        purchaseUnit: z.string().optional(),
        conversionFactor: z.number().int().min(1).optional(),
        supplierCode: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, costPrice, salePrice, ...rest } = input;
      return db.updateProduct(id, {
        ...rest,
        costPrice: costPrice !== undefined ? String(costPrice) : undefined,
        salePrice: salePrice !== undefined ? String(salePrice) : undefined,
      });
    }),

  delete: managerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteProduct(input.id)),

  addStockMovement: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        type: z.enum(["in", "out", "adjustment"]),
        quantity: z.number().int().positive(),
        previousStock: z.number().int(),
        newStock: z.number().int(),
        reason: z.string().optional(),
        purchaseDate: z.string().optional(),
        supplier: z.string().optional(),
        unitCost: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { purchaseDate, unitCost, ...rest } = input;
      await db.createStockMovement({
        ...rest,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        unitCost: unitCost !== undefined ? String(unitCost) : undefined,
        userId: ctx.user.id,
      });
    }),
  stockMovements: protectedProcedure
    .input(z.object({ productId: z.number().optional() }).optional())
    .query(({ input }) => db.getStockMovements(input?.productId)),
  purchaseReport: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(({ input }) => db.getMonthlyPurchaseReport(input.year, input.month)),
});

// ─── Sales Router ─────────────────────────────────────────────────────────────
const salesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        customerId: z.number().optional(),
      }).optional()
    )
    .query(({ input }) =>
      db.getSales(
        input?.from ? new Date(input.from) : undefined,
        input?.to ? new Date(input.to) : undefined,
        input?.customerId
      )
    ),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => db.getSaleById(input.id)),

  create: protectedProcedure
    .input(
      z.object({
        customerId: z.number().optional(),
        total: z.number().positive(),
        discount: z.number().min(0).default(0),
        finalTotal: z.number().positive(),
        paymentMethod: z.enum(["cash", "credit_card", "debit_card", "pix", "other"]),
        pointsEarned: z.number().int().min(0).default(0),
        pointsRedeemed: z.number().int().min(0).default(0),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.number(),
            productName: z.string(),
            quantity: z.number().int().positive(),
            unitPrice: z.number().positive(),
            subtotal: z.number().positive(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { items, ...saleData } = input;
      const saleId = await db.createSale(
        {
          ...saleData,
          userId: ctx.user.id,
          total: String(saleData.total),
          discount: String(saleData.discount),
          finalTotal: String(saleData.finalTotal),
        },
        items.map((i) => ({
          ...i,
          unitPrice: String(i.unitPrice),
          subtotal: String(i.subtotal),
        }))
      );

      // Update stock for each item
      for (const item of items) {
        const product = await db.getProductById(item.productId);
        if (product) {
          await db.createStockMovement({
            productId: item.productId,
            type: "sale",
            quantity: item.quantity,
            previousStock: product.currentStock,
            newStock: product.currentStock - item.quantity,
            reason: `Venda #${saleId}`,
            userId: ctx.user.id,
            saleId,
          });
        }
      }

      // Add points to customer
      if (input.customerId && input.pointsEarned > 0) {
        await db.addPointsTransaction({
          customerId: input.customerId,
          type: "earned",
          points: input.pointsEarned,
          purchaseAmount: String(input.finalTotal),
          description: `Pontos ganhos na venda #${saleId}`,
          userId: ctx.user.id,
        });
      }

      return { saleId };
    }),
});

// ─── Finance Router ───────────────────────────────────────────────────────────
const financeRouter = router({
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

// ─── Users Router ─────────────────────────────────────────────────────────────
const usersRouter = router({
  list: adminProcedure.query(() => db.getAllUsers()),

  updateRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["admin", "manager", "attendant", "user"]) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateUserRole(input.userId, input.role);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "update_role",
        module: "users",
        targetId: input.userId,
        details: `Role alterado para: ${input.role}`,
      });
    }),

  toggleActive: adminProcedure
    .input(z.object({ userId: z.number(), active: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await db.toggleUserActive(input.userId, input.active);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: input.active ? "activate" : "deactivate",
        module: "users",
        targetId: input.userId,
        details: `Usuário ${input.active ? "ativado" : "desativado"}`,
      });
    }),

  getPermissions: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => db.getUserPermissions(input.userId)),

  setPermission: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        module: z.string(),
        canView: z.boolean(),
        canCreate: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { userId, module, ...perms } = input;
      await db.upsertUserPermission(userId, module, perms);
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "update_permission",
        module: "users",
        targetId: userId,
        details: `Permissão do módulo '${module}' atualizada`,
      });
    }),

  auditLogs: adminProcedure
    .input(z.object({ limit: z.number().default(100) }))
    .query(({ input }) => db.getAuditLogs(input.limit)),
});

// ─── Dashboard Router ─────────────────────────────────────────────────────────
const dashboardRouter = router({
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

// ─── Connector Router ─────────────────────────────────────────────────────────
const connectorRouter = router({
  list: adminProcedure.query(() => db.getExternalConnectors()),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(2),
        host: z.string().min(2),
        port: z.number().default(3306),
        database: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(1),
        syncConfig: z.any().optional(),
      })
    )
    .mutation(({ input }) => db.createExternalConnector(input)),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        host: z.string().optional(),
        port: z.number().optional(),
        database: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...rest } = input;
      return db.updateExternalConnector(id, rest);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteExternalConnector(input.id)),

  testConnection: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const connectors = await db.getExternalConnectors();
      const connector = connectors.find((c) => c.id === input.id);
      if (!connector) throw new TRPCError({ code: "NOT_FOUND" });

      try {
        const mysql2 = await import("mysql2/promise");
        const conn = await mysql2.createConnection({
          host: connector.host,
          port: connector.port,
          user: connector.username,
          password: connector.password,
          database: connector.database,
          connectTimeout: 5000,
        });
        await conn.ping();
        await conn.end();
        await db.updateExternalConnector(input.id, { syncStatus: "connected", lastSync: new Date() });
        return { success: true, message: "Conexão bem-sucedida!" };
      } catch (err: any) {
        await db.updateExternalConnector(input.id, { syncStatus: "error" });
        return { success: false, message: err.message ?? "Falha na conexão" };
      }
    }),
});

// // ─── Notifications Router ──────────────────────────────────────────────────
const notificationsRouter = router({
  list: protectedProcedure.query(() => db.getScheduledNotifications()),

  create: managerProcedure
    .input(
      z.object({
        type: z.enum(["birthday", "points", "promotion", "custom"]),
        customerId: z.number().optional(),
        phone: z.string().min(10),
        message: z.string().min(5),
        scheduledAt: z.string().optional(),
      })
    )
    .mutation(({ input }) =>
      db.createScheduledNotification({
        ...input,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      })
    ),

  updateStatus: managerProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "sent", "failed", "cancelled"]),
        errorMessage: z.string().optional(),
      })
    )
    .mutation(({ input }) =>
      db.updateNotificationStatus(input.id, input.status, input.errorMessage)
    ),

  // Templates
  getTemplates: protectedProcedure.query(() => db.getNotificationTemplates()),

  createTemplate: managerProcedure
    .input(
      z.object({
        name: z.string().min(2),
        type: z.enum(["birthday", "points_milestone", "promotion", "custom"]),
        channel: z.enum(["whatsapp", "instagram", "meta", "email"]),
        subject: z.string().optional(),
        message: z.string().min(5),
      })
    )
    .mutation(({ input }) => db.createNotificationTemplate(input)),

  updateTemplate: managerProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(2).optional(),
        type: z.enum(["birthday", "points_milestone", "promotion", "custom"]).optional(),
        channel: z.enum(["whatsapp", "instagram", "meta", "email"]).optional(),
        subject: z.string().optional(),
        message: z.string().min(5).optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return db.updateNotificationTemplate(id, data);
    }),

  deleteTemplate: managerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteNotificationTemplate(input.id)),

  // Logs
  getLogs: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ input }) => db.getNotificationLogs(input?.limit)),

  // Send
  send: managerProcedure
    .input(
      z.object({
        templateId: z.number().optional(),
        customerId: z.number().optional(),
        channel: z.enum(["whatsapp", "instagram", "meta", "email"]),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Log the notification
      let customerName: string | undefined;
      if (input.customerId) {
        const customer = await db.getCustomerById(input.customerId);
        customerName = customer?.fullName ?? undefined;
      }
      await db.createNotificationLog({
        templateId: input.templateId,
        customerId: input.customerId,
        customerName,
        channel: input.channel,
        message: input.message,
        status: "sent",
        sentAt: new Date(),
      });
      return { success: true, message: "Notificação registrada com sucesso!" };
    }),
});

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
