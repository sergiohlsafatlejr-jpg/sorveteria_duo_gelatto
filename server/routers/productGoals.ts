import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { productGoals } from "../../drizzle/schema";
import { buildCopiedProductGoal, getPreviousMonthKey, normalizeProductGoalName } from "../product-goal-copy";

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
      // Cálculo textual evita o deslocamento de fuso que transformava agosto em julho.
      const prevMonth = getPreviousMonthKey(input.targetMonth);
      // Buscar metas do mês anterior
      const prevGoals = await db.select().from(productGoals)
        .where(and(eq(productGoals.month, prevMonth), eq(productGoals.active, true)));
      if (prevGoals.length === 0) return { copied: 0, reactivated: 0, skipped: 0, previousMonth: prevMonth };

      const targetGoals = await db.select().from(productGoals)
        .where(eq(productGoals.month, input.targetMonth));
      const existingByName = new Map(targetGoals.map((goal) => [normalizeProductGoalName(goal.productName), goal]));

      let copied = 0;
      let reactivated = 0;
      let skipped = 0;
      for (const goal of prevGoals) {
        const key = normalizeProductGoalName(goal.productName);
        const existing = existingByName.get(key);
        const copiedValues = buildCopiedProductGoal(goal, input.targetMonth);

        if (!existing) {
          const [result] = await db.insert(productGoals).values(copiedValues);
          existingByName.set(key, { ...goal, ...copiedValues, id: result.insertId });
          copied += 1;
        } else if (!existing.active) {
          await db.update(productGoals).set(copiedValues).where(eq(productGoals.id, existing.id));
          existingByName.set(key, { ...existing, ...copiedValues });
          reactivated += 1;
        } else {
          skipped += 1;
        }
      }
      return { copied, reactivated, skipped, previousMonth: prevMonth };
    }),
});
