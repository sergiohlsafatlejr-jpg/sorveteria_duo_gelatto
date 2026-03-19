import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as dbWa from "../db.whatsapp";
import { sendWhatsAppMessage, checkZApiConnection, buildMessage, DEFAULT_TEMPLATES } from "../zapi";

// ─── WhatsApp Router ──────────────────────────────────────────────────────────
export const whatsappRouter = router({

  // ── Config ──────────────────────────────────────────────────────────────────
  getConfig: protectedProcedure.query(async () => {
    const config = await dbWa.getWhatsappConfig();
    if (!config) return null;
    // Mask token for security
    return {
      ...config,
      token: config.token ? `${config.token.slice(0, 8)}${"*".repeat(Math.max(0, config.token.length - 8))}` : "",
      tokenSet: !!config.token,
    };
  }),

  saveConfig: protectedProcedure
    .input(z.object({
      instanceId: z.string().min(1),
      token: z.string().min(1),
      active: z.boolean().optional(),
      notifyOnPoints: z.boolean().optional(),
      notifyOnGoalNear: z.boolean().optional(),
      notifyOnGoalReached: z.boolean().optional(),
      msgPointsEarned: z.string().optional(),
      msgGoalNear: z.string().optional(),
      msgGoalReached: z.string().optional(),
      msgPromotion: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await dbWa.upsertWhatsappConfig(input);
      return { success: true };
    }),

  testConnection: protectedProcedure.query(async () => {
    const config = await dbWa.getWhatsappConfig();
    if (!config || !config.instanceId || !config.token) {
      return { connected: false, error: "Configuração não encontrada. Configure o Z-API primeiro." };
    }
    return checkZApiConnection({ instanceId: config.instanceId, token: config.token });
  }),

  // ── Campaigns ───────────────────────────────────────────────────────────────
  getCampaigns: protectedProcedure.query(() => dbWa.getWhatsappCampaigns()),

  createCampaign: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      message: z.string().min(1),
      segment: z.enum(["all", "with_points", "no_points", "near_goal"]),
      scheduledAt: z.string().optional(), // ISO string
    }))
    .mutation(async ({ ctx, input }: { ctx: { user: { id: number } }, input: { name: string; message: string; segment: "all" | "with_points" | "no_points" | "near_goal"; scheduledAt?: string } }) => {
      const id = await dbWa.createWhatsappCampaign({
        name: input.name,
        message: input.message,
        segment: input.segment,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdBy: ctx.user.id,
      });
      return { id };
    }),

  deleteCampaign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }: { input: { id: number } }) => dbWa.deleteWhatsappCampaign(input.id)),

  countRecipients: protectedProcedure
    .input(z.object({ segment: z.string() }))
    .query(({ input }: { input: { segment: string } }) => dbWa.countCustomersBySegment(input.segment)),

  sendCampaign: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }: { input: { campaignId: number } }) => {
      const config = await dbWa.getWhatsappConfig();
      if (!config || !config.active || !config.instanceId || !config.token) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WhatsApp não configurado ou inativo." });
      }

      const campaign = await dbWa.getWhatsappCampaign(input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });

      const recipients = await dbWa.getCustomersBySegment(campaign.segment);
      const validRecipients = recipients.filter(r => r.phone != null && r.phone.trim().length >= 10) as Array<{ id: number; fullName: string; phone: string; totalPoints: number }>;

      await dbWa.updateCampaignStatus(input.campaignId, "sending", { totalRecipients: validRecipients.length });

      let sent = 0;
      let failed = 0;

      for (const customer of validRecipients) {
        const message = buildMessage(campaign.message, {
          nome: customer.fullName,
          pontos: customer.totalPoints,
        });

        const result = await sendWhatsAppMessage(
          { instanceId: config.instanceId, token: config.token },
          customer.phone,
          message
        );

        await dbWa.createWhatsappLog({
          customerId: customer.id,
          phone: customer.phone ?? "",
          type: "campaign",
          message,
          status: result.success ? "sent" : "failed",
          errorMessage: result.error ?? null,
          campaignId: input.campaignId,
          sentAt: result.success ? new Date() : undefined,
        });

        if (result.success) sent++;
        else failed++;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      await dbWa.updateCampaignStatus(input.campaignId, "sent", {
        totalSent: sent,
        totalFailed: failed,
        sentAt: new Date(),
      });

      return { sent, failed, total: validRecipients.length };
    }),

  // ── Logs ────────────────────────────────────────────────────────────────────
  getLogs: protectedProcedure
    .input(z.object({ limit: z.number().default(100) }).optional())
    .query(({ input }: { input?: { limit?: number } }) => dbWa.getWhatsappLogs(input?.limit ?? 100)),

  // ── Manual send (test) ───────────────────────────────────────────────────────
  sendTest: protectedProcedure
    .input(z.object({ phone: z.string(), message: z.string() }))
    .mutation(async ({ input }: { input: { phone: string; message: string } }) => {
      const config = await dbWa.getWhatsappConfig();
      if (!config || !config.instanceId || !config.token) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WhatsApp não configurado." });
      }

      const result = await sendWhatsAppMessage(
        { instanceId: config.instanceId, token: config.token },
        input.phone,
        input.message
      );

      await dbWa.createWhatsappLog({
        customerId: null,
          phone: input.phone ?? "",
          type: "test",
          message: input.message,
          status: result.success ? "sent" : "failed",
          errorMessage: result.error ?? null,
          campaignId: undefined,
          sentAt: result.success ? new Date() : undefined,
      });

      return result;
    }),

  // ── Default templates ────────────────────────────────────────────────────────
  getDefaultTemplates: protectedProcedure.query(() => DEFAULT_TEMPLATES),
});
