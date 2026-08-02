import { z } from "zod";
import { protectedProcedure, managerProcedure, publicProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getDb } from "../db";

export const pointsRouter = router({
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

  // ── Link público de fidelidade ──────────────────────────────────────────────
  getPublicToken: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) return null;
      const { customerLoyaltyTokens } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const crypto = await import("crypto");
      const existing = await dbInstance.select().from(customerLoyaltyTokens).where(eq(customerLoyaltyTokens.customerId, input.customerId)).limit(1);
      if (existing.length > 0) return existing[0].token;
      const token = crypto.randomBytes(32).toString("hex");
      await dbInstance.insert(customerLoyaltyTokens).values({ customerId: input.customerId, token });
      return token;
    }),

  // ── Consulta pública por token (sem login) ────────────────────────────────
  getPublicProfile: publicProcedure
    .input(z.object({ token: z.string().min(10) }))
    .query(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) return null;
      const { customerLoyaltyTokens, customers, pointsTransactions, pointsRules } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      const tokenRow = await dbInstance.select().from(customerLoyaltyTokens).where(eq(customerLoyaltyTokens.token, input.token)).limit(1);
      if (tokenRow.length === 0) return null;
      const customerId = tokenRow[0].customerId;
      // Atualizar lastAccessedAt
      await dbInstance.update(customerLoyaltyTokens).set({ lastAccessedAt: new Date() }).where(eq(customerLoyaltyTokens.customerId, customerId));
      const customer = await dbInstance.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (customer.length === 0) return null;
      const history = await dbInstance.select().from(pointsTransactions).where(eq(pointsTransactions.customerId, customerId)).orderBy(desc(pointsTransactions.createdAt)).limit(10);
      const rules = await dbInstance.select().from(pointsRules).where(eq(pointsRules.active, true)).limit(1);
      const rule = rules[0] ?? null;
      const totalPoints = customer[0].totalPoints ?? 0;
      const meta = rule ? rule.rewardThreshold : 100;
      const rewardValue = rule ? rule.rewardValue : "0";
      const progress = Math.min(100, Math.round((totalPoints / meta) * 100));
      const faltam = Math.max(0, meta - totalPoints);
      return {
        name: customer[0].fullName,
        totalPoints,
        meta,
        rewardValue,
        progress,
        faltam,
        history: history.map((h) => ({
          type: h.type,
          points: h.points,
          description: h.description,
          createdAt: h.createdAt,
        })),
      };
    }),

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
            const { getWhatsappConfig, createWhatsappLog } = await import("../db.whatsapp");
            const { sendWhatsAppMessage, buildMessage, DEFAULT_TEMPLATES } = await import("../zapi");
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
              template = waConfig.msgGoalReached || DEFAULT_TEMPLATES.goalReached;
              type = "goal_reached";
            } else if (pct >= 0.8 && waConfig.notifyOnGoalNear) {
              template = waConfig.msgGoalNear || DEFAULT_TEMPLATES.goalNear;
              type = "goal_near";
            } else if (waConfig.notifyOnPoints) {
              template = waConfig.msgPointsEarned || DEFAULT_TEMPLATES.pointsEarned;
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
