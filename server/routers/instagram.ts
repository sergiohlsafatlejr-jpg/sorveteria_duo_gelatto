import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { instagramPosts, instagramCache, metaAdsCache } from "../../drizzle/schema";
import { eq, desc, and, lte, isNotNull } from "drizzle-orm";
import { generateImage } from "../_core/imageGeneration";

// ─── Cache Helper: lê dados do banco MySQL ────────────────────────────────────
async function getCacheData(table: 'instagram_cache' | 'meta_ads_cache', key: string): Promise<any> {
  try {
    const db = await getDb();
    if (!db) return null;
    const tableRef = table === 'instagram_cache' ? instagramCache : metaAdsCache;
    const rows = await db.select().from(tableRef as any).where(eq((tableRef as any).cacheKey, key)).limit(1);
    if (!rows.length) return null;
    return rows[0].data;
  } catch {
    return null;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const instagramRouter = router({
  // ── Informações da conta (lidas do cache no banco MySQL) ────────────────────
  getAccountInfo: protectedProcedure.query(async () => {
    return await getCacheData('instagram_cache', 'account_info');
  }),

  // ── Posts recentes (lidos do cache no banco MySQL) ───────────────────────────
  getRecentPosts: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(20).default(10), pageCursor: z.string().optional() }).optional())
    .query(async () => {
      const cached = await getCacheData('instagram_cache', 'recent_posts');
      if (!cached) return { data: [], nextCursor: null };
      return cached;
    }),

  // ── Insights de um post específico (do cache de insights) ───────────────────
  getPostInsights: protectedProcedure
    .input(z.object({ instagramPostId: z.string() }))
    .query(async ({ input }) => {
      const cached = await getCacheData('instagram_cache', 'post_insights') as any;
      if (!cached) return null;
      return cached[input.instagramPostId] ?? null;
    }),

  // ── Resumo de performance (do cache no banco MySQL) ──────────────────────────
  getPerformanceSummary: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(20).default(10) }).optional())
    .query(async () => {
      return await getCacheData('instagram_cache', 'performance_summary');
    }),

  // ── Campanhas Meta Ads (do cache no banco MySQL) ─────────────────────────────
  getMetaAdsCampaigns: protectedProcedure
    .input(z.object({
      datePreset: z.enum([
        "today", "yesterday", "last_7d", "last_14d", "last_30d",
        "last_90d", "this_month", "last_month"
      ]).optional(),
    }).optional())
    .query(async () => {
      const cached = await getCacheData('meta_ads_cache', 'campaigns_last_30d');
      if (!cached) return { campaigns: [], summary: null };
      return cached;
    }),

  // ── Insights no nível de anúncio (do cache no banco MySQL) ─────────────────────
  getMetaAdsInsightsByAd: protectedProcedure
    .input(z.object({
      datePreset: z.enum([
        "today", "yesterday", "last_7d", "last_14d", "last_30d",
        "last_90d", "this_month", "last_month"
      ]).optional(),
    }).optional())
    .query(async () => {
      const cached = await getCacheData('meta_ads_cache', 'ads_last_30d');
      if (!cached) return [];
      return Array.isArray(cached) ? cached : [];
    }),

  // ── Listar rascunhos e publicados do banco local ───────────────────────────
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

  // ── Criar rascunho de post ─────────────────────────────────────────────────
  createDraft: protectedProcedure
    .input(z.object({
      type: z.enum(["post", "story", "reels"]).default("post"),
      caption: z.string().max(2200).optional(),
      imageUrl: z.string().url().optional(),
      promotionTitle: z.string().max(200).optional(),
      aiPrompt: z.string().max(500).optional(),
      scheduledAt: z.string().optional(),
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

  // ── Gerar imagem por IA ────────────────────────────────────────────────────
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
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha ao gerar imagem: ${String(e)}` });
      }
    }),

  // ── Atualizar rascunho ─────────────────────────────────────────────────────
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
      if (input.scheduledAt !== undefined) updateData.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      await db.update(instagramPosts).set(updateData)
        .where(and(eq(instagramPosts.id, input.postId), eq(instagramPosts.createdBy, ctx.user.id)));
      return { success: true };
    }),

  // ── Marcar como publicado ──────────────────────────────────────────────────
  markPublished: protectedProcedure
    .input(z.object({ postId: z.number(), instagramPostId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.update(instagramPosts).set({
        status: "published",
        instagramPostId: input.instagramPostId ?? null,
        publishedAt: new Date(),
      }).where(and(eq(instagramPosts.id, input.postId), eq(instagramPosts.createdBy, ctx.user.id)));
      return { success: true };
    }),

  // ── Deletar rascunho ───────────────────────────────────────────────────────
  deleteDraft: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.delete(instagramPosts)
        .where(and(eq(instagramPosts.id, input.postId), eq(instagramPosts.createdBy, ctx.user.id)));
      return { success: true };
    }),

  // ── Posts agendados ────────────────────────────────────────────────────────
  getScheduledPosts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return await db.select().from(instagramPosts).where(
      and(
        eq(instagramPosts.createdBy, ctx.user.id),
        eq(instagramPosts.status, "draft"),
        isNotNull(instagramPosts.scheduledAt),
        lte(instagramPosts.scheduledAt, new Date())
      )
    ).orderBy(instagramPosts.scheduledAt);
  }),
  // ── Sincronizar métricas (legado) ─────────────────────────────────────────────
  syncMetrics: protectedProcedure.mutation(async () => {
    return { updated: 0 };
  }),

  // ── Status do cache (quando foi a última sincronização) ───────────────────
  getCacheStatus: protectedProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) return { lastSync: null, isConnected: false };
      const igRows = await db.select().from(instagramCache)
        .where(eq(instagramCache.cacheKey, 'account_info')).limit(1);
      const metaRows = await db.select().from(metaAdsCache)
        .where(eq(metaAdsCache.cacheKey, 'campaigns_last_30d')).limit(1);
      const igSync = igRows[0]?.syncedAt ?? null;
      const metaSync = metaRows[0]?.syncedAt ?? null;
      const lastSyncMs = [igSync, metaSync]
        .filter(Boolean)
        .map(d => new Date(d as Date).getTime());
      const lastSync = lastSyncMs.length > 0 ? new Date(Math.max(...lastSyncMs)).toISOString() : null;
      return {
        isConnected: igRows.length > 0,
        lastSync,
        igSyncedAt: igSync ? new Date(igSync as Date).toISOString() : null,
        metaSyncedAt: metaSync ? new Date(metaSync as Date).toISOString() : null,
      };
    } catch {
      return { isConnected: false, lastSync: null, igSyncedAt: null, metaSyncedAt: null };
    }
  }),

  // ── Tendência semanal de CTR e gasto (últimas 4 semanas) ─────────────────────
  getWeeklyTrend: protectedProcedure.query(async () => {
    const cached = await getCacheData('meta_ads_cache', 'weekly_trend') as any;
    if (!cached) return { weeks: [] };
    return cached;
  }),

  // ── Alertas de CTR baixo (< 1%) ───────────────────────────────────────────────
  getCtrAlerts: protectedProcedure.query(async () => {
    const cached = await getCacheData('meta_ads_cache', 'weekly_trend') as any;
    if (!cached?.weeks) return [];
    const alerts: Array<{ campaignName: string; ctr: number; week: string; spend: number; impressions: number }> = [];
    for (const week of cached.weeks) {
      for (const camp of week.campaigns ?? []) {
        if (camp.ctr < 1.0) {
          alerts.push({
            campaignName: camp.name,
            ctr: camp.ctr,
            week: week.weekLabel,
            spend: camp.spend,
            impressions: camp.impressions,
          });
        }
      }
    }
    return alerts;
  }),

  // ── Solicitar sincronização manual (envia notificação ao owner) ─────────────
  requestSync: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const { notifyOwner } = await import('../_core/notification');
      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      await notifyOwner({
        title: 'Solicitação de Sincronização Instagram/Meta Ads',
        content: `O usuário ${ctx.user.name} solicitou uma sincronização manual dos dados do Instagram e Meta Ads em ${now}.`,
      });
      return { success: true, message: 'Solicitação enviada! Os dados serão atualizados em breve.' };
    } catch {
      return { success: false, message: 'Não foi possível enviar a solicitação.' };
    }
  }),
});
