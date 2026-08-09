import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { boxStock, boxStockMovements } from "../../drizzle/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export const boxStockRouter = router({
  // Listar todas as caixas ativas
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    return db.select().from(boxStock).where(eq(boxStock.active, true)).orderBy(boxStock.name);
  }),

  // Criar nova caixa
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      inoveProductId: z.number().optional(),
      costPrice: z.string().optional(),
      currentStock: z.number().int().min(0).default(0),
      minStock: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(boxStock).values({
        name: input.name,
        inoveProductId: input.inoveProductId ?? null,
        costPrice: input.costPrice ?? "0",
        currentStock: input.currentStock,
        minStock: input.minStock,
      });
      return { success: true };
    }),

  // Atualizar caixa
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      costPrice: z.string().optional(),
      minStock: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const updates: any = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.costPrice !== undefined) updates.costPrice = input.costPrice;
      if (input.minStock !== undefined) updates.minStock = input.minStock;
      await db.update(boxStock).set(updates).where(eq(boxStock.id, input.id));
      return { success: true };
    }),

  // Desativar caixa
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(boxStock).set({ active: false }).where(eq(boxStock.id, input.id));
      return { success: true };
    }),

  // Registrar entrada de caixas
  addEntry: protectedProcedure
    .input(z.object({
      boxId: z.number(),
      quantity: z.number().int().min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [box] = await db.select().from(boxStock).where(eq(boxStock.id, input.boxId));
      if (!box) throw new Error("Caixa não encontrada");
      const previousStock = box.currentStock;
      const newStock = previousStock + input.quantity;
      await db.insert(boxStockMovements).values({
        boxId: input.boxId,
        type: "entrada",
        quantity: input.quantity,
        previousStock,
        newStock,
        notes: input.notes ?? null,
        userId: ctx.user?.id ?? null,
      });
      await db.update(boxStock).set({ currentStock: newStock }).where(eq(boxStock.id, input.boxId));
      return { success: true, newStock };
    }),

  // Registrar saída de caixas
  addExit: protectedProcedure
    .input(z.object({
      boxId: z.number(),
      quantity: z.number().int().min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [box] = await db.select().from(boxStock).where(eq(boxStock.id, input.boxId));
      if (!box) throw new Error("Caixa não encontrada");
      const previousStock = box.currentStock;
      const newStock = Math.max(0, previousStock - input.quantity);
      await db.insert(boxStockMovements).values({
        boxId: input.boxId,
        type: "saida",
        quantity: input.quantity,
        previousStock,
        newStock,
        notes: input.notes ?? null,
        userId: ctx.user?.id ?? null,
      });
      await db.update(boxStock).set({ currentStock: newStock }).where(eq(boxStock.id, input.boxId));
      return { success: true, newStock };
    }),

  // Histórico de movimentações
  getMovements: protectedProcedure
    .input(z.object({
      boxId: z.number().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const conditions = input.boxId ? eq(boxStockMovements.boxId, input.boxId) : undefined;
      return db.select().from(boxStockMovements)
        .where(conditions)
        .orderBy(desc(boxStockMovements.createdAt))
        .limit(input.limit);
    }),
});
