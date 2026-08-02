import { z } from "zod";
import { protectedProcedure, managerProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const notificationsRouter = router({
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
