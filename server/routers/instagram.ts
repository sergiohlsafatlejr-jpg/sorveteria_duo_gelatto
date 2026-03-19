import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { instagramPosts } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync } from "fs";

const execAsync = promisify(exec);

// ─── MCP helpers ─────────────────────────────────────────────────────────────
async function mcpCall(toolName: string, inputJson: string) {
  try {
    const { stdout } = await execAsync(
      `manus-mcp-cli tool call ${toolName} --server instagram --input ${JSON.stringify(inputJson)}`
    );
    const match = stdout.match(/saved to:\s*(\S+)/);
    if (match) {
      const raw = readFileSync(match[1], "utf-8");
      return JSON.parse(raw);
    }
    return null;
  } catch (e: unknown) {
    console.error(`[Instagram MCP] ${toolName} error:`, e);
    return null;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const instagramRouter = router({
  // Informações da conta conectada
  getAccountInfo: protectedProcedure.query(async () => {
    return await mcpCall("get_account_info", "{}");
  }),

  // Listar posts recentes do Instagram via MCP
  getRecentPosts: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(20).default(10) }))
    .query(async ({ input }) => {
      return await mcpCall("get_post_list", JSON.stringify({ limit: input.limit }));
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

  // Criar rascunho de post
  createDraft: protectedProcedure
    .input(z.object({
      type: z.enum(["post", "story", "reels"]).default("post"),
      caption: z.string().max(2200).optional(),
      imageUrl: z.string().url(),
      promotionTitle: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.insert(instagramPosts).values({
        type: input.type,
        caption: input.caption ?? null,
        imageUrl: input.imageUrl,
        promotionTitle: input.promotionTitle ?? null,
        status: "draft",
        createdBy: ctx.user.id,
      });
      return { success: true };
    }),

  // Publicar post via MCP (cria container — usuário confirma na UI do Manus)
  publishPost: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const [post] = await db
        .select()
        .from(instagramPosts)
        .where(and(eq(instagramPosts.id, input.postId), eq(instagramPosts.createdBy, ctx.user.id)));

      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post não encontrado" });
      if (!post.imageUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Post sem imagem" });

      const mcpInput = JSON.stringify({
        type: post.type,
        caption: post.caption ?? "",
        media: [{ type: "image", media_url: post.imageUrl }],
      });

      try {
        const result = await mcpCall("create_instagram", mcpInput);
        await db
          .update(instagramPosts)
          .set({
            status: "published",
            instagramPostId: result?.id ?? null,
            publishedAt: new Date(),
          })
          .where(eq(instagramPosts.id, input.postId));
        return { success: true, result };
      } catch (e: unknown) {
        await db
          .update(instagramPosts)
          .set({ status: "failed", errorMessage: String(e) })
          .where(eq(instagramPosts.id, input.postId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(e) });
      }
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

  // Buscar métricas de um post publicado
  getPostInsights: protectedProcedure
    .input(z.object({ instagramPostId: z.string() }))
    .query(async ({ input }) => {
      return await mcpCall("get_post_insights", JSON.stringify({ post_id: input.instagramPostId }));
    }),

  // Sincronizar métricas de todos os posts publicados
  syncMetrics: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { updated: 0 };

    const published = await db
      .select()
      .from(instagramPosts)
      .where(and(eq(instagramPosts.createdBy, ctx.user.id), eq(instagramPosts.status, "published")));

    let updated = 0;
    for (const post of published) {
      if (!post.instagramPostId) continue;
      const insights = await mcpCall("get_post_insights", JSON.stringify({ post_id: post.instagramPostId }));
      if (insights) {
        await db
          .update(instagramPosts)
          .set({
            likes: insights.like_count ?? post.likes,
            reach: insights.reach ?? post.reach,
            impressions: insights.impressions ?? post.impressions,
            comments: insights.comments_count ?? post.comments,
          })
          .where(eq(instagramPosts.id, post.id));
        updated++;
      }
    }
    return { updated };
  }),
});
