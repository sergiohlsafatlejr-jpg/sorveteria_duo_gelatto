import { z } from "zod";
import { protectedProcedure, managerProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const customersRouter = router({
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
      // ── WhatsApp boas-vindas (fire-and-forget) ────────────────────────────
      if (input.phone) {
        void (async () => {
          try {
            const { getWhatsappConfig, createWhatsappLog } = await import("../db.whatsapp");
            const { sendWhatsAppMessage, buildMessage, DEFAULT_TEMPLATES } = await import("../zapi");
            const waConfig = await getWhatsappConfig();
            if (!waConfig || !waConfig.active || !waConfig.notifyOnWelcome) return;
            const rules = await db.getPointsRules();
            const meta = rules[0]?.rewardThreshold ?? 100;
            // Gerar token de fidelidade para o link
            const { customerLoyaltyTokens } = await import("../../drizzle/schema");
            const { getDb } = await import("../db");
            const dbInst = await getDb();
            const { eq } = await import("drizzle-orm");
            const cryptoMod = await import("crypto");
            let loyaltyToken: string;
            if (dbInst) {
              const existingToken = await dbInst.select().from(customerLoyaltyTokens).where(eq(customerLoyaltyTokens.customerId, id)).limit(1);
              if (existingToken.length > 0) {
                loyaltyToken = existingToken[0].token;
              } else {
                loyaltyToken = cryptoMod.randomBytes(32).toString("hex");
                await dbInst.insert(customerLoyaltyTokens).values({ customerId: id, token: loyaltyToken });
              }
            } else {
              loyaltyToken = cryptoMod.randomBytes(32).toString("hex");
            }
            const link = `https://duogelatto-wyap3gu8.manus.space/fidelidade/${loyaltyToken}`;
            const template = waConfig.msgWelcome || DEFAULT_TEMPLATES.welcome;
            const message = buildMessage(template, { nome: input.fullName, meta, link });
            const result = await sendWhatsAppMessage(
              { instanceId: waConfig.instanceId, token: waConfig.token },
              input.phone!,
              message
            );
            await createWhatsappLog({
              customerId: id,
              phone: input.phone!,
              type: "welcome",
              message,
              status: result.success ? "sent" : "failed",
              errorMessage: result.error ?? null,
              sentAt: result.success ? new Date() : undefined,
            });
          } catch (err) {
            console.error("[WhatsApp] Welcome error:", err);
          }
        })();
      }
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

  registerPurchase: protectedProcedure
    .input(
      z.object({
        customerId: z.number(),
        amount: z.number().positive(),
        paymentMethod: z.enum(["cash", "credit_card", "debit_card", "pix", "other"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await db.registerCustomerPurchaseInTable({
        ...input,
        userId: ctx.user.id,
      });
      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "create",
        module: "customers",
        targetId: input.customerId,
        details: `Compra registrada: R$ ${input.amount.toFixed(2)} (${input.paymentMethod}) — ${result.pointsEarned} pts`,
      });
      return result;
    }),

  purchaseHistory: protectedProcedure
    .input(z.object({ customerId: z.number(), limit: z.number().optional() }))
    .query(({ input }) => db.getCustomerPurchaseHistory(input.customerId, input.limit ?? 20)),

  purchaseStatsFromTable: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(({ input }) => db.getCustomerPurchaseStatsFromTable(input.customerId)),
});
