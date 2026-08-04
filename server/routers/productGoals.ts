import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { productGoals } from "../../drizzle/schema";

export const productGoalsRouter = router({
  // Listar metas de produtos (por mês ou todas ativas)
  list: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const month = input?.month || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
      const rows = await db.select().from(productGoals)
        .where(and(
          eq(productGoals.month, month),
          eq(productGoals.active, true)
        ))
        .orderBy(desc(productGoals.createdAt));
      return rows;
    }),

  // Listar todos (incluindo inativos) para gerenciamento
  listAll: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      if (input?.month) {
        return await db.select().from(productGoals)
          .where(eq(productGoals.month, input.month))
          .orderBy(desc(productGoals.createdAt));
      }
      return await db.select().from(productGoals).orderBy(desc(productGoals.createdAt));
    }),

  // Criar nova meta de produto
  create: protectedProcedure
    .input(z.object({
      productName: z.string().min(1),
      searchKeywords: z.string().min(1),
      targetQuantity: z.number().int().min(0),
      targetRevenue: z.number().min(0).optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      icon: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(productGoals).values({
        productName: input.productName,
        searchKeywords: input.searchKeywords,
        targetQuantity: input.targetQuantity,
        targetRevenue: input.targetRevenue?.toString() || "0",
        month: input.month,
        icon: input.icon || "🎯",
        active: true,
      });
      return { id: result.insertId };
    }),

  // Atualizar meta de produto
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      productName: z.string().min(1).optional(),
      searchKeywords: z.string().min(1).optional(),
      targetQuantity: z.number().int().min(0).optional(),
      targetRevenue: z.number().min(0).optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      icon: z.string().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = {};
      if (updates.productName !== undefined) updateData.productName = updates.productName;
      if (updates.searchKeywords !== undefined) updateData.searchKeywords = updates.searchKeywords;
      if (updates.targetQuantity !== undefined) updateData.targetQuantity = updates.targetQuantity;
      if (updates.targetRevenue !== undefined) updateData.targetRevenue = updates.targetRevenue.toString();
      if (updates.month !== undefined) updateData.month = updates.month;
      if (updates.icon !== undefined) updateData.icon = updates.icon;
      if (updates.active !== undefined) updateData.active = updates.active;
      await db.update(productGoals).set(updateData).where(eq(productGoals.id, id));
      return { success: true };
    }),

  // Deletar meta de produto
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(productGoals).where(eq(productGoals.id, input.id));
      return { success: true };
    }),

  // Duplicar metas do mês anterior para o mês atual
  copyFromPreviousMonth: protectedProcedure
    .input(z.object({ targetMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Calcular mês anterior
      const [year, month] = input.targetMonth.split('-').map(Number);
      const prevDate = new Date(year, month - 2, 1);
      const prevMonth = prevDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
      // Buscar metas do mês anterior
      const prevGoals = await db.select().from(productGoals)
        .where(and(eq(productGoals.month, prevMonth), eq(productGoals.active, true)));
      if (prevGoals.length === 0) return { copied: 0 };
      // Copiar para o mês alvo
      let copied = 0;
      for (const goal of prevGoals) {
        // Verificar se já existe meta para este produto no mês alvo
        const existing = await db.select().from(productGoals)
          .where(and(
            eq(productGoals.productName, goal.productName),
            eq(productGoals.month, input.targetMonth)
          ));
        if (existing.length === 0) {
          await db.insert(productGoals).values({
            productName: goal.productName,
            searchKeywords: goal.searchKeywords!,
            targetQuantity: goal.targetQuantity,
            targetRevenue: goal.targetRevenue,
            month: input.targetMonth,
            icon: goal.icon,
            active: true,
          });
          copied++;
        }
      }
      return { copied };
    }),
});
