import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { instagramPosts } from "../../drizzle/schema";
import { eq, desc, and, lte, isNotNull } from "drizzle-orm";
import { generateImage } from "../_core/imageGeneration";

// ─── Router ───────────────────────────────────────────────────────────────────
export const instagramRouter = router({
  // Informações da conta conectada — retorna null graciosamente (MCP não disponível no runtime)
  getAccountInfo: protectedProcedure.query(async () => {
    return null;
  }),

  // Listar posts recentes do Instagram — retorna vazio graciosamente
  getRecentPosts: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(20).default(10) }))
    .query(async () => {
      return { data: [] };
    }),

  // Listar rascunhos e publicados do banco local
  getPosts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return await db
      .select()
      .from(instagramPosts)
      .where(eq(instagramPosts.createdBy, ctx.user.id))
      .orderBy(desc(instagramPosts.createdAt))
      .limit(50);
  }),

  // Criar rascunho de post (com suporte a agendamento)
  createDraft: protectedProcedure
    .input(z.object({
      type: z.enum(["post", "story", "reels"]).default("post"),
      caption: z.string().max(2200).optional(),
      imageUrl: z.string().url().optional(),
      promotionTitle: z.string().max(200).optional(),
      aiPrompt: z.string().max(500).optional(),
      scheduledAt: z.string().optional(), // ISO datetime string
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      if (!input.imageUrl && !input.aiPrompt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a URL da imagem ou um prompt para geração por IA" });
      }

      await db.insert(instagramPosts).values({
        type: input.type,
        caption: input.caption ?? null,
        imageUrl: input.imageUrl ?? null,
        promotionTitle: input.promotionTitle ?? null,
        aiPrompt: input.aiPrompt ?? null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status: "draft",
        createdBy: ctx.user.id,
      });
      return { success: true };
    }),

  // Gerar imagem por IA para o post
  generateImage: protectedProcedure
    .input(z.object({
      prompt: z.string().min(10).max(500),
      style: z.enum(["realistic", "cartoon", "watercolor", "minimalist"]).default("realistic"),
    }))
    .mutation(async ({ input }) => {
      const styleGuides: Record<string, string> = {
        realistic: "high quality, photorealistic, vibrant colors, professional food photography",
        cartoon: "colorful cartoon style, fun and playful, bold outlines, bright colors",
        watercolor: "beautiful watercolor illustration, soft colors, artistic, hand-painted look",
        minimalist: "clean minimalist design, flat design, simple shapes, modern aesthetic",
      };

      const fullPrompt = `Instagram post for an ice cream shop called Duo Gelatto in Goiânia Brazil. ${input.prompt}. ${styleGuides[input.style]}. Square format 1:1, suitable for Instagram post.`;

      try {
        const { url } = await generateImage({ prompt: fullPrompt });
        return { success: true, imageUrl: url };
      } catch (e: unknown) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao gerar imagem: ${String(e)}`,
        });
      }
    }),

  // Atualizar rascunho (imagem, legenda, agendamento)
  updateDraft: protectedProcedure
    .input(z.object({
      postId: z.number(),
      caption: z.string().max(2200).optional(),
      imageUrl: z.string().url().optional(),
      promotionTitle: z.string().max(200).optional(),
      scheduledAt: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const updateData: Record<string, unknown> = {};
      if (input.caption !== undefined) updateData.caption = input.caption;
      if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
      if (input.promotionTitle !== undefined) updateData.promotionTitle = input.promotionTitle;
      if (input.scheduledAt !== undefined) {
        updateData.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      }

      await db
        .update(instagramPosts)
        .set(updateData)
        .where(and(eq(instagramPosts.id, input.postId), eq(instagramPosts.createdBy, ctx.user.id)));

      return { success: true };
    }),

  // Marcar post como publicado manualmente (usuário publicou fora do sistema)
  markPublished: protectedProcedure
    .input(z.object({ postId: z.number(), instagramPostId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db
        .update(instagramPosts)
        .set({
          status: "published",
          instagramPostId: input.instagramPostId ?? null,
          publishedAt: new Date(),
        })
        .where(and(eq(instagramPosts.id, input.postId), eq(instagramPosts.createdBy, ctx.user.id)));
      return { success: true };
    }),

  // Deletar rascunho
  deleteDraft: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db
        .delete(instagramPosts)
        .where(and(eq(instagramPosts.id, input.postId), eq(instagramPosts.createdBy, ctx.user.id)));
      return { success: true };
    }),

  // Listar posts agendados (scheduledAt <= agora e ainda draft)
  getScheduledPosts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return await db
      .select()
      .from(instagramPosts)
      .where(
        and(
          eq(instagramPosts.createdBy, ctx.user.id),
          eq(instagramPosts.status, "draft"),
          isNotNull(instagramPosts.scheduledAt),
          lte(instagramPosts.scheduledAt, new Date())
        )
      )
      .orderBy(instagramPosts.scheduledAt);
  }),

  // Sincronizar métricas (stub — retorna 0 pois MCP não disponível no runtime)
  syncMetrics: protectedProcedure.mutation(async () => {
    return { updated: 0 };
  }),

  // Buscar métricas de um post (stub)
  getPostInsights: protectedProcedure
    .input(z.object({ instagramPostId: z.string() }))
    .query(async () => {
      return null;
    }),
});
