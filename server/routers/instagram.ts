import { z } from "zod";
import { execSync } from "child_process";
import * as fs from "fs";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { instagramPosts } from "../../drizzle/schema";
import { eq, desc, and, lte, isNotNull } from "drizzle-orm";
import { generateImage } from "../_core/imageGeneration";

// ─── MCP Helper: Instagram ────────────────────────────────────────────────────
function callInstagramMcp(toolName: string, input: Record<string, unknown>): unknown {
  const inputJson = JSON.stringify(input).replace(/'/g, "'\\''");
  const cmd = `manus-mcp-cli tool call ${toolName} --server instagram --input '${inputJson}' 2>/dev/null`;
  try {
    execSync(cmd, { timeout: 25000 });
    const listOut = execSync("ls -t /tmp/manus-mcp/mcp_result_*.json 2>/dev/null | head -1")
      .toString().trim();
    if (!listOut) return null;
    const content = fs.readFileSync(listOut, "utf-8");
    const parsed = JSON.parse(content);
    return parsed?.result ?? parsed;
  } catch {
    return null;
  }
}

// ─── MCP Helper: Meta Marketing ──────────────────────────────────────────────
function callMetaMcp(toolName: string, input: Record<string, unknown>): unknown {
  const inputJson = JSON.stringify(input).replace(/'/g, "'\\''");
  const cmd = `manus-mcp-cli tool call ${toolName} --server meta-marketing --input '${inputJson}' 2>/dev/null`;
  try {
    execSync(cmd, { timeout: 30000 });
    const listOut = execSync("ls -t /tmp/manus-mcp/mcp_result_*.json 2>/dev/null | head -1")
      .toString().trim();
    if (!listOut) return null;
    const content = fs.readFileSync(listOut, "utf-8");
    const parsed = JSON.parse(content);
    return parsed?.result ?? parsed;
  } catch {
    return null;
  }
}

const DUO_ACCOUNT_ID = "act_1821396852023766";

// ─── Router ───────────────────────────────────────────────────────────────────
export const instagramRouter = router({
  // ── Informações da conta conectada (dados reais via MCP) ──────────────────
  getAccountInfo: protectedProcedure.query(async () => {
    try {
      const result = callInstagramMcp("get_account_info", {}) as any;
      if (!result) return null;
      // O MCP retorna campos diretos
      return {
        username: result.username ?? null,
        name: result.name ?? null,
        bio: result.bio ?? null,
        followers: result.followers_count ?? result.followers ?? null,
        following: result.follows_count ?? result.following ?? null,
        posts: result.media_count ?? result.posts ?? null,
        website: result.website ?? null,
        profile_picture: result.profile_picture_url ?? result.profile_picture ?? null,
      };
    } catch {
      return null;
    }
  }),

  // ── Posts recentes do Instagram (dados reais via MCP) ─────────────────────
  getRecentPosts: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(20).default(10), pageCursor: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const params: Record<string, unknown> = { limit: input.limit };
        if (input.pageCursor) params.page_cursor = input.pageCursor;
        const result = callInstagramMcp("get_post_list", params) as any;
        if (!result) return { data: [], nextCursor: null };
        // O MCP retorna { data: [...], paging: { cursors: { after } } }
        const posts = Array.isArray(result.data) ? result.data : [];
        return {
          data: posts.map((p: any) => ({
            id: p.id,
            media_type: p.media_type ?? "POST",
            media_url: p.media_url ?? null,
            thumbnail_url: p.thumbnail_url ?? null,
            permalink: p.permalink ?? null,
            caption: p.caption ?? null,
            timestamp: p.timestamp ?? null,
            like_count: p.like_count ?? p.likes ?? 0,
            comments_count: p.comments_count ?? p.comments ?? 0,
          })),
          nextCursor: result.paging?.cursors?.after ?? null,
        };
      } catch {
        return { data: [], nextCursor: null };
      }
    }),

  // ── Insights de um post específico (dados reais via MCP) ──────────────────
  getPostInsights: protectedProcedure
    .input(z.object({ instagramPostId: z.string() }))
    .query(async ({ input }) => {
      try {
        const result = callInstagramMcp("get_post_insights", { post_id: input.instagramPostId }) as any;
        if (!result) return null;
        return {
          likes: result.likes ?? 0,
          comments: result.comments ?? 0,
          shares: result.shares ?? 0,
          saved: result.saved ?? 0,
          reach: result.reach ?? 0,
          views: result.views ?? result.impressions ?? 0,
          totalInteractions: result.total_interactions ?? 0,
        };
      } catch {
        return null;
      }
    }),

  // ── Resumo de performance do Instagram (últimos N posts) ──────────────────
  getPerformanceSummary: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(20).default(10) }))
    .query(async ({ input }) => {
      try {
        const result = callInstagramMcp("get_post_list", { limit: input.limit }) as any;
        if (!result) return null;
        const posts = Array.isArray(result.data) ? result.data : [];
        if (posts.length === 0) return null;

        const totalLikes = posts.reduce((s: number, p: any) => s + (p.like_count ?? p.likes ?? 0), 0);
        const totalComments = posts.reduce((s: number, p: any) => s + (p.comments_count ?? p.comments ?? 0), 0);
        const avgLikes = Math.round(totalLikes / posts.length);
        const avgComments = Math.round(totalComments / posts.length);

        // Tipo de conteúdo mais frequente
        const typeCounts: Record<string, number> = {};
        for (const p of posts) {
          const t = p.media_type ?? "POST";
          typeCounts[t] = (typeCounts[t] ?? 0) + 1;
        }
        const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "POST";

        // Post com mais curtidas
        const topPost = posts.reduce((best: any, p: any) =>
          (p.like_count ?? p.likes ?? 0) > (best.like_count ?? best.likes ?? 0) ? p : best, posts[0]);

        return {
          totalPosts: posts.length,
          totalLikes,
          totalComments,
          avgLikes,
          avgComments,
          topContentType: topType,
          topPost: {
            id: topPost.id,
            likes: topPost.like_count ?? topPost.likes ?? 0,
            comments: topPost.comments_count ?? topPost.comments ?? 0,
            permalink: topPost.permalink ?? null,
            thumbnail: topPost.thumbnail_url ?? topPost.media_url ?? null,
            caption: topPost.caption ?? null,
          },
        };
      } catch {
        return null;
      }
    }),

  // ── Campanhas Meta Ads com foco em Instagram ──────────────────────────────
  getMetaAdsCampaigns: protectedProcedure
    .input(z.object({
      datePreset: z.enum([
        "today", "yesterday", "last_7d", "last_14d", "last_30d",
        "last_90d", "this_month", "last_month"
      ]).optional(),
    }).optional())
    .query(({ input }) => {
      try {
        const payload: Record<string, unknown> = {
          object_type: "ad_account",
          object_id: DUO_ACCOUNT_ID,
          level: "campaign",
          date_preset: input?.datePreset ?? "last_30d",
          limit: 50,
        };
        const result = callMetaMcp("meta_marketing_get_insights", payload) as any;
        if (!result) return { campaigns: [], summary: null };

        const rows: any[] = Array.isArray(result.insights) ? result.insights
          : Array.isArray(result.data) ? result.data
          : Array.isArray(result) ? result : [];

        const campaigns = rows.map((r: any) => {
          const actions: Record<string, number> = {};
          if (Array.isArray(r.actions)) {
            for (const a of r.actions) actions[a.action_type] = parseFloat(a.value ?? "0");
          }
          return {
            campaignId: r.campaign_id ?? null,
            campaignName: r.campaign_name ?? "—",
            impressions: parseInt(r.impressions ?? "0"),
            reach: parseInt(r.reach ?? "0"),
            spend: parseFloat(r.spend ?? "0"),
            ctr: parseFloat(r.ctr ?? "0"),
            cpc: parseFloat(r.cpc ?? "0"),
            cpm: parseFloat(r.cpm ?? "0"),
            linkClicks: parseInt(r.inline_link_clicks ?? "0"),
            frequency: parseFloat(r.frequency ?? "0"),
            postEngagements: actions["post_engagement"] ?? 0,
            pageEngagements: actions["page_engagement"] ?? 0,
            videoViews: actions["video_view"] ?? 0,
            dateStart: r.date_start ?? null,
            dateStop: r.date_stop ?? null,
          };
        });

        // Resumo agregado
        const summary = campaigns.length > 0 ? {
          totalSpend: campaigns.reduce((s, c) => s + c.spend, 0),
          totalImpressions: campaigns.reduce((s, c) => s + c.impressions, 0),
          totalReach: campaigns.reduce((s, c) => s + c.reach, 0),
          totalLinkClicks: campaigns.reduce((s, c) => s + c.linkClicks, 0),
          avgCtr: campaigns.reduce((s, c) => s + c.ctr, 0) / campaigns.length,
          avgCpm: campaigns.reduce((s, c) => s + c.cpm, 0) / campaigns.length,
          totalEngagements: campaigns.reduce((s, c) => s + c.postEngagements, 0),
          activeCampaigns: campaigns.length,
        } : null;

        return { campaigns, summary };
      } catch {
        return { campaigns: [], summary: null };
      }
    }),

  // ── Insights no nível de anúncio (para ver quais criativos performam melhor) ─
  getMetaAdsInsightsByAd: protectedProcedure
    .input(z.object({
      datePreset: z.enum([
        "today", "yesterday", "last_7d", "last_14d", "last_30d",
        "last_90d", "this_month", "last_month"
      ]).optional(),
    }).optional())
    .query(({ input }) => {
      try {
        const payload: Record<string, unknown> = {
          object_type: "ad_account",
          object_id: DUO_ACCOUNT_ID,
          level: "ad",
          date_preset: input?.datePreset ?? "last_30d",
          limit: 30,
        };
        const result = callMetaMcp("meta_marketing_get_insights", payload) as any;
        if (!result) return [];

        const rows: any[] = Array.isArray(result.insights) ? result.insights
          : Array.isArray(result.data) ? result.data
          : Array.isArray(result) ? result : [];

        return rows.map((r: any) => ({
          adId: r.ad_id ?? null,
          adName: r.ad_name ?? "—",
          campaignName: r.campaign_name ?? "—",
          impressions: parseInt(r.impressions ?? "0"),
          reach: parseInt(r.reach ?? "0"),
          spend: parseFloat(r.spend ?? "0"),
          ctr: parseFloat(r.ctr ?? "0"),
          cpc: parseFloat(r.cpc ?? "0"),
          cpm: parseFloat(r.cpm ?? "0"),
          linkClicks: parseInt(r.inline_link_clicks ?? "0"),
          qualityRanking: r.quality_ranking ?? null,
          engagementRateRanking: r.engagement_rate_ranking ?? null,
        }));
      } catch {
        return [];
      }
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

  // ── Sincronizar métricas ───────────────────────────────────────────────────
  syncMetrics: protectedProcedure.mutation(async () => {
    return { updated: 0 };
  }),
});
