import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { boxStock, boxStockMovements, inoveConnectorConfig } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import * as mssqlLib from "mssql";

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

  // Relatório mensal de consumo (saídas por mês/sabor)
  getMonthlyConsumption: protectedProcedure
    .input(z.object({ months: z.number().int().min(0).max(12).default(6) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const since = new Date();
      if (input.months === 0) { since.setDate(since.getDate() - 7); } else { since.setMonth(since.getMonth() - input.months); }
      const rows = await db.select({
        boxId: boxStockMovements.boxId,
        month: sql<string>`DATE_FORMAT(${boxStockMovements.createdAt}, '%Y-%m')`,
        totalQty: sql<number>`SUM(${boxStockMovements.quantity})`,
      }).from(boxStockMovements)
        .where(and(
          eq(boxStockMovements.type, "saida"),
          gte(boxStockMovements.createdAt, since)
        ))
        .groupBy(boxStockMovements.boxId, sql`DATE_FORMAT(${boxStockMovements.createdAt}, '%Y-%m')`)
        .orderBy(sql`DATE_FORMAT(${boxStockMovements.createdAt}, '%Y-%m')`);
      return rows.map(r => ({
        boxId: r.boxId,
        month: r.month,
        totalQty: Number(r.totalQty) || 0,
      }));
    }),

  // Sincronizar custos com INOVE
  syncCosts: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const connRows = await db.select().from(inoveConnectorConfig).limit(1);
    if (!connRows.length || !connRows[0].active) return { updated: 0, message: "INOVE não conectado" };
    const config = connRows[0];
    const allBoxes = await db.select().from(boxStock).where(eq(boxStock.active, true));
    if (allBoxes.length === 0) return { updated: 0, message: "Nenhuma caixa cadastrada" };
    try {
      const pool = await new mssqlLib.ConnectionPool({
        server: config.host,
        port: config.port ?? 1433,
        database: config.database,
        user: config.username,
        password: config.password ?? "",
        options: { encrypt: false, trustServerCertificate: true },
        connectionTimeout: 10000,
        requestTimeout: 15000,
      }).connect();
      const names = allBoxes.map(b => `'${b.name.replace(/'/g, "''")}'`).join(",");
      const res = await pool.request().query(`
        SELECT PRO_NOME as nome, CAST(ISNULL(PRO_CUSTO, 0) as float) as custo
        FROM PRODUTOS WHERE PRO_ATIVO = 'S' AND PRO_NOME IN (${names})
      `);
      await pool.close();
      let updated = 0;
      for (const row of res.recordset as Array<{nome: string; custo: number}>) {
        const box = allBoxes.find(b => b.name.toLowerCase() === row.nome.toLowerCase());
        if (box && Number(box.costPrice) !== row.custo) {
          await db.update(boxStock).set({ costPrice: row.custo.toFixed(2) }).where(eq(boxStock.id, box.id));
          updated++;
        }
      }
      return { updated, message: `${updated} custo(s) atualizado(s)` };
    } catch (err) {
      return { updated: 0, message: `Erro: ${err instanceof Error ? err.message : "desconhecido"}` };
    }
  }),

  // Sincronizar caixas 10L do INOVE automaticamente
  syncFromInove: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const connRows = await db.select().from(inoveConnectorConfig).limit(1);
    if (!connRows.length || !connRows[0].active) return { added: 0, message: "INOVE não conectado" };
    const config = connRows[0];
    try {
      const pool = await new mssqlLib.ConnectionPool({
        server: config.host,
        port: config.port ?? 1433,
        database: config.database,
        user: config.username,
        password: config.password ?? "",
        options: { encrypt: false, trustServerCertificate: true },
        connectionTimeout: 10000,
        requestTimeout: 15000,
      }).connect();
      const res = await pool.request().query(`
        SELECT PRO_NOME as nome, CAST(ISNULL(PRO_CUSTO, 0) as float) as custo
        FROM PRODUTOS
        WHERE PRO_ATIVO = 'S'
          AND (PRO_NOME LIKE '%10 L%' OR PRO_NOME LIKE '%10L%' OR PRO_NOME LIKE '%10 Litros%' OR PRO_NOME LIKE '%10Litros%')
        ORDER BY PRO_NOME
      `);
      await pool.close();
      const existingBoxes = await db.select().from(boxStock);
      const existingNames = existingBoxes.map(b => b.name.toLowerCase());
      let added = 0;
      for (const row of res.recordset as Array<{nome: string; custo: number}>) {
        if (!existingNames.includes(row.nome.toLowerCase())) {
          await db.insert(boxStock).values({
            name: row.nome,
            costPrice: row.custo.toFixed(2),
            currentStock: 0,
            minStock: 2,
            active: true,
          });
          added++;
        }
      }
      return { added, total: res.recordset.length, message: `${added} caixa(s) importada(s) do INOVE (${res.recordset.length} encontradas)` };
    } catch (err) {
      return { added: 0, total: 0, message: `Erro: ${err instanceof Error ? err.message : "desconhecido"}` };
    }
  }),

  // CMV baseado nas caixas abertas no período
  getCmvReport: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const now = new Date();
      const month = input.referenceMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [year, mon] = month.split("-").map(Number);
      const startDate = new Date(year, mon - 1, 1);
      const endDate = new Date(year, mon, 0, 23, 59, 59);
      const movs = await db.select().from(boxStockMovements)
        .where(and(
          eq(boxStockMovements.type, "saida"),
          gte(boxStockMovements.createdAt, startDate),
          lte(boxStockMovements.createdAt, endDate)
        ));
      const allBoxes = await db.select().from(boxStock);
      const report = allBoxes.filter(b => movs.some(m => m.boxId === b.id)).map(box => {
        const exits = movs.filter(m => m.boxId === box.id);
        const totalExits = exits.reduce((s, m) => s + m.quantity, 0);
        const costPerBox = Number(box.costPrice) || 0;
        const totalCmv = totalExits * costPerBox;
        return { id: box.id, name: box.name, exits: totalExits, costPerBox, totalCmv };
      });
      const totalCmvGeral = report.reduce((s, r) => s + r.totalCmv, 0);
      const totalCaixas = report.reduce((s, r) => s + r.exits, 0);
      return { month, report, totalCmvGeral, totalCaixas };
    }),
});
