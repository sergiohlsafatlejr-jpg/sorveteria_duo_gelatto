/**
 * Router: INOVE Connector
 * Gerencia a integração com o banco de dados do PDV INOVE (SQL Server).
 * Banco: DUOGELATTO
 * Tabelas principais:
 *   - VENDAS: vendas do PDV (VENDA, CLIENTE, VEN_DATA_FIM, VEN_TOTAL, VEN_SITUACAO=2 para finalizada)
 *   - ITENS_VENDAS: itens de cada venda (ITEM_VENDA, VENDA, ITE_NOME, ITE_VALOR, ITE_QUANTIDADE)
 *   - PAGAMENTOS_VENDAS: pagamentos (PAGAMENTO_VENDA, VENDA, PAG_VALOR, PESSOA, FORMA_PAGAMENTO)
 *   - PESSOAS: dados pessoais (PESSOA, PES_NOME, PES_TELEFONE, PES_RG_CPF, PES_DATA_NASCIMENTO)
 *   - CLIENTES: dados comerciais (PESSOA = FK para PESSOAS)
 * Vinculação: VENDAS.CLIENTE → CLIENTES.PESSOA → PESSOAS.PESSOA
 */
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  inoveConnectorConfig,
  inoveSyncLog,
  customers,
  customerPurchases,
  customerLoyaltyTokens,
  products,
  stockMovements,
  salesImports,
  salesImportItems,
  salesImportPayments,
  purchaseProductConfig,
  finDailyRevenue,
  inoveSalesCache,
  productGoals,
} from "../../drizzle/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import crypto from "crypto";
import * as mssqlLib from "mssql";
import { notifyOwner } from "../_core/notification";
import { invokeLLM } from "../_core/llm";
import {
  buildCachedKpis,
  buildCachedSalesByDay,
  getSaoPauloDate,
  parseCachedProducts,
  subtractIsoDays,
} from "../inove-dashboard-fallback";
import {
  calculateProductGoalProgress,
  normalizeEpochTimestamp,
  type ProductSale,
} from "../product-goal-progress";

async function getCachedDailyRevenue(dateFrom?: string) {
  const db = await getDb();
  if (!db) return [];
  const today = getSaoPauloDate();
  const start = dateFrom ?? `${today.slice(0, 7)}-01`;
  return db.select().from(finDailyRevenue)
    .where(and(gte(finDailyRevenue.revenueDate, start), lte(finDailyRevenue.revenueDate, today)))
    .orderBy(finDailyRevenue.revenueDate);
}

async function getCachedMonthlyProducts(limit: number) {
  const db = await getDb();
  if (!db) return [];
  const monthKey = getSaoPauloDate().slice(0, 7);
  const rows = await db.select().from(inoveSalesCache)
    .where(eq(inoveSalesCache.cacheKey, monthKey)).limit(1);
  return rows.length > 0 ? parseCachedProducts(rows[0].data, limit) : [];
}

type MonthlyProductSnapshot = {
  products: ProductSale[];
  source: "live" | "cache";
  updatedAt: string | null;
  isPartial: boolean;
};

async function getCachedMonthlyProductSnapshot(monthKey: string, limit: number): Promise<MonthlyProductSnapshot> {
  const db = await getDb();
  if (!db) return { products: [], source: "cache", updatedAt: null, isPartial: true };
  const rows = await db.select().from(inoveSalesCache)
    .where(eq(inoveSalesCache.cacheKey, monthKey)).limit(1);
  if (rows.length === 0) return { products: [], source: "cache", updatedAt: null, isPartial: true };

  let isPartial = true;
  try {
    const parsed = JSON.parse(rows[0].data) as { products?: unknown[] };
    isPartial = !Array.isArray(parsed.products);
  } catch {
    isPartial = true;
  }

  return {
    products: parseCachedProducts(rows[0].data, limit),
    source: "cache",
    updatedAt: normalizeEpochTimestamp(rows[0].updatedAt),
    isPartial,
  };
}

async function getMonthlyProductSnapshot(monthKey: string, limit: number): Promise<MonthlyProductSnapshot> {
  const db = await getDb();
  if (!db) return { products: [], source: "cache", updatedAt: null, isPartial: true };
  const configRows = await db.select().from(inoveConnectorConfig).limit(1);
  if (configRows.length === 0 || !configRows[0].active) {
    return getCachedMonthlyProductSnapshot(monthKey, limit);
  }

  const [year, month] = monthKey.split("-").map(Number);
  let pool: MssqlPool | null = null;
  try {
    pool = await createInovePool(configRows[0]);
    const result = await pool.request().query(`
      SELECT
        p.PRODUTO AS produtoId,
        ISNULL(p.PRO_NOME, 'Produto s/nome') AS nome,
        p.PRO_CODIGO AS codPdv,
        CAST(SUM(iv.ITE_QUANTIDADE) AS float) AS qtd,
        CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) AS float) AS total
      FROM ITENS_VENDAS iv
      JOIN VENDAS v ON v.VENDA = iv.VENDA
      JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
      WHERE v.VEN_SITUACAO = 2
        AND YEAR(v.VEN_DATA_FIM) = ${year}
        AND MONTH(v.VEN_DATA_FIM) = ${month}
      GROUP BY p.PRODUTO, p.PRO_NOME, p.PRO_CODIGO
      ORDER BY total DESC
    `);
    await pool.close();
    pool = null;

    const products = (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      produtoId: Number(row.produtoId),
      codPdv: row.codPdv === null || row.codPdv === undefined ? null : String(row.codPdv),
      nome: String(row.nome ?? "Produto sem nome"),
      qtd: Number(row.qtd ?? 0),
      total: Number(row.total ?? 0),
    }));
    const updatedAtSeconds = Math.floor(Date.now() / 1000);
    const cacheData = JSON.stringify({
      month: monthKey,
      top10: products.slice(0, 10).map((product) => ({ ...product, faturamento: product.total })),
      products: products.map((product) => ({ ...product, faturamento: product.total })),
      totalFaturamento: products.reduce((sum, product) => sum + product.total, 0),
      totalQtd: products.reduce((sum, product) => sum + product.qtd, 0),
      totalProdutos: products.length,
    });

    await db.insert(inoveSalesCache)
      .values({ cacheKey: monthKey, data: cacheData, updatedAt: updatedAtSeconds })
      .onDuplicateKeyUpdate({ set: { data: cacheData, updatedAt: updatedAtSeconds } });

    return {
      products: products.slice(0, limit),
      source: "live",
      updatedAt: new Date(updatedAtSeconds * 1000).toISOString(),
      isPartial: false,
    };
  } catch (error) {
    if (pool) await pool.close().catch(() => {});
    console.error("[getMonthlyProductSnapshot] Erro ao consultar INOVE:", error);
    return getCachedMonthlyProductSnapshot(monthKey, limit);
  }
}

// ── Tipos do SQL Server ───────────────────────────────────────────────────────
interface MssqlConfig {
  server: string;
  port: number;
  user: string;
  password: string;
  database: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    connectTimeout: number;
    requestTimeout: number;
  };
}

// Tipo do pool mssql
export type MssqlPool = {
  request: () => { query: (sql: string) => Promise<{ recordset: Record<string, unknown>[] }> };
  close: () => Promise<void>;
};

// Helper: criar conexão com o banco INOVE (SQL Server)
// Usa ConnectionPool diretamente para evitar cache global de pool que fica abortado após restart
export async function createInovePool(config: {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}): Promise<MssqlPool> {
  const mssqlAny = mssqlLib as unknown as Record<string, unknown>;
  // Tenta usar ConnectionPool diretamente (mais confiável que mssql.connect que usa cache global)
  const PoolClass = (mssqlAny.ConnectionPool
    ?? (mssqlAny.default as Record<string, unknown>)?.ConnectionPool) as new (cfg: MssqlConfig) => { connect: () => Promise<MssqlPool> };
  if (PoolClass) {
    const mssqlConfig: MssqlConfig = {
      server: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database || "DUOGELATTO",
        options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 10000,
        requestTimeout: 15000,
      },
    };
    const pool = new PoolClass(mssqlConfig);
    return pool.connect();
  }
  // Fallback: usar mssql.connect
  const connectFn = (typeof mssqlAny.connect === 'function'
    ? mssqlAny.connect
    : (mssqlAny.default as Record<string, unknown>)?.connect) as (cfg: MssqlConfig) => Promise<MssqlPool>;
  if (typeof connectFn !== 'function') throw new Error('mssql.connect não encontrado');
  const mssqlConfig: MssqlConfig = {
    server: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database || "DUOGELATTO",
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 10000,
      requestTimeout: 15000,
    },
  };
  return connectFn(mssqlConfig);
}

// Helper: gera token único para o link público de fidelidade
function generateLoyaltyToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Helper: garante que o cliente tem um token público gerado
async function ensureLoyaltyToken(customerId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(customerLoyaltyTokens)
    .where(eq(customerLoyaltyTokens.customerId, customerId))
    .limit(1);
  if (existing.length > 0) return existing[0].token;
  const token = generateLoyaltyToken();
  await db.insert(customerLoyaltyTokens).values({ customerId, token });
  return token;
}

// Helper: normalizar telefone para comparação (apenas dígitos, últimos 9)
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-9);
}

// Helper: normalizar CPF (apenas dígitos)
function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

export const inoveRouter = router({
  // ── Configuração ──────────────────────────────────────────────────────────
  getConfig: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0) return null;
    const { password: _pw, ...safe } = rows[0];
    return { ...safe, passwordSet: !!_pw };
  }),

  saveConfig: adminProcedure
    .input(
      z.object({
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535).default(55444),
        database: z.string().min(1).default("DUOGELATTO"),
        username: z.string().min(1),
        password: z.string().min(1),
        syncIntervalMinutes: z.number().int().min(1).max(60).default(5),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const existing = await db.select({ id: inoveConnectorConfig.id }).from(inoveConnectorConfig).limit(1);
      if (existing.length > 0) {
        await db.update(inoveConnectorConfig).set({ ...input, updatedAt: new Date() }).where(eq(inoveConnectorConfig.id, existing[0].id));
      } else {
        await db.insert(inoveConnectorConfig).values({ ...input, active: false });
      }
      return { success: true };
    }),

  toggleActive: adminProcedure
    .input(z.object({ active: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(inoveConnectorConfig).set({ active: input.active, updatedAt: new Date() });
      return { success: true };
    }),

  // ── Teste de conexão ──────────────────────────────────────────────────────
  testConnection: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0) {
      return { success: false, message: "Nenhuma configuração salva. Configure o conector primeiro." };
    }
    const config = rows[0];
    try {
      const pool = await createInovePool(config);
      // Verificar tabelas principais do INOVE
      const result = await pool.request().query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `);
      const tableList = result.recordset.map((r) => (r as { TABLE_NAME: string }).TABLE_NAME);

      // Contar vendas finalizadas
      const countResult = await pool.request().query(`
        SELECT COUNT(*) as total FROM VENDAS WHERE VEN_SITUACAO = 2
      `);
      const totalVendas = countResult.recordset[0]?.total ?? 0;

      await pool.close();

      await db.update(inoveConnectorConfig).set({
        lastSyncStatus: "success",
        lastSyncMessage: `Conexão OK (SQL Server). ${tableList.length} tabelas. ${totalVendas} vendas finalizadas.`,
        updatedAt: new Date(),
      }).where(eq(inoveConnectorConfig.id, config.id));

      return {
        success: true,
        message: `Conexão estabelecida com SQL Server! ${tableList.length} tabelas encontradas. ${totalVendas} vendas finalizadas.`,
        tables: tableList,
        totalVendas,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(inoveConnectorConfig).set({
        lastSyncStatus: "error",
        lastSyncMessage: msg,
        updatedAt: new Date(),
      }).where(eq(inoveConnectorConfig.id, config.id));
      return { success: false, message: `Erro de conexão: ${msg}` };
    }
  }),

  // ── Listar tabelas do INOVE ───────────────────────────────────────────────
  listTables: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0) return { tables: [] };
    const config = rows[0];
    try {
      const pool = await createInovePool(config);
      const result = await pool.request().query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `);
      await pool.close();
      const tableList = result.recordset.map((r) => (r as { TABLE_NAME: string }).TABLE_NAME);
      return { tables: tableList };
    } catch {
      return { tables: [] };
    }
  }),

  // ── Pré-visualizar colunas de uma tabela do INOVE ─────────────────────────
  previewTable: adminProcedure
    .input(z.object({ tableName: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0) return { columns: [], sample: [] };
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        const colsResult = await pool.request().query(`
          SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = '${input.tableName}' ORDER BY ORDINAL_POSITION
        `);
        const sampleResult = await pool.request().query(`
          SELECT TOP 3 * FROM [${input.tableName}]
        `);
        await pool.close();
        return { columns: colsResult.recordset, sample: sampleResult.recordset };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg);
      }
    }),

  // ── Estatísticas do banco INOVE ───────────────────────────────────────────
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0) return null;
    const config = rows[0];
    try {
      const pool = await createInovePool(config);
      const statsResult = await pool.request().query(`
        SELECT
          COUNT(*) as total_vendas,
          COUNT(CASE WHEN VEN_SITUACAO = 2 THEN 1 END) as finalizadas,
          COUNT(CASE WHEN VEN_SITUACAO = 2 AND CLIENTE IS NOT NULL THEN 1 END) as com_cliente,
          SUM(CASE WHEN VEN_SITUACAO = 2 THEN VEN_TOTAL ELSE 0 END) as faturado_total,
          MIN(VEN_DATA_FIM) as primeira_venda,
          MAX(VEN_DATA_FIM) as ultima_venda
        FROM VENDAS
      `);
      const clientesResult = await pool.request().query(`
        SELECT COUNT(*) as total FROM PESSOAS p JOIN CLIENTES c ON p.PESSOA = c.PESSOA
      `);
      await pool.close();
      return {
        ...statsResult.recordset[0],
        total_clientes: clientesResult.recordset[0]?.total ?? 0,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: msg };
    }
  }),

  // ── Sincronização de vendas INOVE → Pontos de Fidelidade ─────────────────
  syncSales: adminProcedure
    .input(
      z.object({
        hoursBack: z.number().int().min(1).max(720).default(24), // últimas N horas
        pointsPerReal: z.number().min(0.1).max(10).default(1),   // pontos por R$1,00
        minAmount: z.number().min(0).default(5),                  // valor mínimo para ganhar pontos
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const configRows = await db.select().from(inoveConnectorConfig).limit(1);
      if (configRows.length === 0) throw new Error("Conector não configurado");
      const config = configRows[0];

      let salesFound = 0;
      let salesProcessed = 0;
      let customersLinked = 0;
      let pointsGranted = 0;
      const errors: string[] = [];

      try {
        const pool = await createInovePool(config);

        // Buscar vendas finalizadas das últimas N horas com dados do cliente
        const salesResult = await pool.request().query(`
          SELECT
            v.VENDA,
            v.VEN_DATA_FIM,
            v.VEN_TOTAL,
            v.CLIENTE,
            p.PES_NOME,
            p.PES_TELEFONE,
            p.PES_TELEFONE2,
            p.PES_RG_CPF,
            p.PES_DATA_NASCIMENTO
          FROM VENDAS v
          JOIN CLIENTES c ON v.CLIENTE = c.PESSOA
          JOIN PESSOAS p ON c.PESSOA = p.PESSOA
          WHERE v.VEN_SITUACAO = 2
            AND v.VEN_ESTORNADO = 'N'
            AND v.VEN_DATA_FIM >= DATEADD(HOUR, -${input.hoursBack}, GETDATE())
            AND v.VEN_TOTAL >= ${input.minAmount}
          ORDER BY v.VEN_DATA_FIM DESC
        `);

        await pool.close();

        const sales = salesResult.recordset as Array<{
          VENDA: number;
          VEN_DATA_FIM: Date;
          VEN_TOTAL: number;
          CLIENTE: number;
          PES_NOME: string;
          PES_TELEFONE: string | null;
          PES_TELEFONE2: string | null;
          PES_RG_CPF: string | null;
          PES_DATA_NASCIMENTO: Date | null;
        }>;

        salesFound = sales.length;

        for (const sale of sales) {
          try {
            const amount = parseFloat(String(sale.VEN_TOTAL ?? "0"));
            if (amount < input.minAmount) continue;

            const cpf = normalizeCpf(sale.PES_RG_CPF ?? "");
            const phone = normalizePhone(sale.PES_TELEFONE ?? sale.PES_TELEFONE2 ?? "");
            const name = (sale.PES_NOME ?? "").trim();
            const saleRef = `INOVE-${sale.VENDA}`;

            // Verificar se essa venda já foi sincronizada
            const alreadySynced = await db
              .select({ id: customerPurchases.id })
              .from(customerPurchases)
              .where(eq(customerPurchases.notes, saleRef))
              .limit(1);
            if (alreadySynced.length > 0) continue;

            // Tentar vincular cliente por CPF ou telefone
            let customerId: number | null = null;

            if (cpf.length >= 11) {
              const [found] = await db
                .select({ id: customers.id })
                .from(customers)
                .where(sql`REPLACE(REPLACE(REPLACE(${customers.notes}, '.', ''), '-', ''), ' ', '') LIKE ${`%${cpf}%`}`)
                .limit(1);
              if (found) customerId = found.id;
            }

            if (!customerId && phone.length >= 9) {
              const [found] = await db
                .select({ id: customers.id })
                .from(customers)
                .where(sql`RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(${customers.phone}, '(', ''), ')', ''), ' ', ''), '-', ''), 9) = ${phone}`)
                .limit(1);
              if (found) customerId = found.id;
            }

            // Se não encontrou e tem nome, criar cliente automaticamente
            if (!customerId && name.length > 2) {
              const newCustomer = await db.insert(customers).values({
                fullName: name,
                phone: phone.length >= 9 ? phone : undefined,
                notes: cpf.length >= 11 ? `CPF: ${cpf}` : `Importado INOVE`,
                birthDate: sale.PES_DATA_NASCIMENTO ? new Date(sale.PES_DATA_NASCIMENTO) : undefined,
                totalPoints: 0,
                totalPurchases: "0.00",
                active: true,
              });
              customerId = (newCustomer as unknown as { insertId: number }).insertId;
              customersLinked++;

              // Garantir token de fidelidade
              await ensureLoyaltyToken(customerId);
            }

            if (!customerId) continue;

            // Calcular pontos
            const points = Math.floor(amount * input.pointsPerReal);

            // Registrar compra
            await db.insert(customerPurchases).values({
              customerId,
              amount: String(amount.toFixed(2)),
              paymentMethod: "other",
              pointsEarned: points,
              notes: saleRef,
            });

            // Atualizar totais do cliente
            await db.update(customers)
              .set({
                totalPoints: sql`totalPoints + ${points}`,
                totalPurchases: sql`totalPurchases + ${amount}`,
                updatedAt: new Date(),
              })
              .where(eq(customers.id, customerId));

            // Garantir token de fidelidade
            await ensureLoyaltyToken(customerId);

            pointsGranted += points;
            salesProcessed++;
          } catch (saleErr) {
            errors.push(`Venda ${sale.VENDA}: ${String(saleErr)}`);
          }
        }

        // Registrar log de sincronização
        await db.insert(inoveSyncLog).values({
          status: "success",
          salesFound,
          salesProcessed,
          customersLinked,
        });

        // Atualizar status do conector
        await db.update(inoveConnectorConfig).set({
          lastSyncAt: new Date(),
          lastSyncStatus: "success",
          lastSyncMessage: `${salesProcessed}/${salesFound} vendas processadas, ${customersLinked} clientes criados, ${pointsGranted} pontos lançados`,
          updatedAt: new Date(),
        }).where(eq(inoveConnectorConfig.id, config.id));

        return {
          success: true,
          salesFound,
          salesProcessed,
          customersLinked,
          pointsGranted,
          errors: errors.slice(0, 10),
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.insert(inoveSyncLog).values({
          status: "error",
          salesFound: 0,
          salesProcessed: 0,
          customersLinked: 0,
          errorMessage: msg,
        });
        await db.update(inoveConnectorConfig).set({
          lastSyncStatus: "error",
          lastSyncMessage: msg,
          updatedAt: new Date(),
        });
        throw new Error(msg);
      }
    }),

  // ── Histórico de sincronizações ───────────────────────────────────────────
  getSyncHistory: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(inoveSyncLog).orderBy(desc(inoveSyncLog.syncedAt)).limit(20);
  }),

  // ── Dados de Vendas por Dia (gráfico) ────────────────────────────────────
  getSalesByDay: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      const dateFrom = subtractIsoDays(getSaoPauloDate(), input.days);
      if (rows.length === 0 || !rows[0].active) {
        return buildCachedSalesByDay(await getCachedDailyRevenue(dateFrom), dateFrom);
      }
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        const result = await pool.request().query(`
          SELECT
            CONVERT(varchar(10), VEN_DATA_FIM, 23) as dia,
            COUNT(*) as qtd,
            CAST(SUM(VEN_TOTAL) as float) as total
          FROM VENDAS
          WHERE VEN_SITUACAO = 2
            AND VEN_DATA_FIM >= DATEADD(day, -${input.days}, GETDATE())
          GROUP BY CONVERT(varchar(10), VEN_DATA_FIM, 23)
          ORDER BY dia
        `);
        await pool.close();
        return result.recordset as Array<{ dia: string; qtd: number; total: number }>;
      } catch {
        return buildCachedSalesByDay(await getCachedDailyRevenue(dateFrom), dateFrom);
      }
    }),

  // ── Metas de Produtos com realizado mensal exato ─────────────────────────
  getProductGoalsProgress: protectedProcedure
    .input(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      includeInactive: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const goals = await db.select().from(productGoals)
        .where(input.includeInactive
          ? eq(productGoals.month, input.month)
          : and(eq(productGoals.month, input.month), eq(productGoals.active, true)))
        .orderBy(desc(productGoals.createdAt));
      const snapshot = await getMonthlyProductSnapshot(input.month, 500);

      return {
        ...snapshot,
        goals: goals.map((goal) => calculateProductGoalProgress(goal, snapshot.products)),
      };
    }),

  // ── Top Produtos Mais Vendidos ────────────────────────────────────────────
  getTopProducts: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30), limit: z.number().int().min(1).max(200).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return getCachedMonthlyProducts(input.limit);
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        const result = await pool.request().query(`
          SELECT TOP ${input.limit}
            p.PRO_NOME as nome,
            CAST(SUM(i.ITE_QUANTIDADE) as float) as qtd,
            CAST(SUM(i.ITE_VALOR * i.ITE_QUANTIDADE) as float) as total
          FROM ITENS_VENDAS i
          JOIN VENDAS v ON i.VENDA = v.VENDA
          JOIN PRODUTOS p ON i.PRODUTO = p.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND v.VEN_DATA_FIM >= DATEADD(day, -${input.days}, GETDATE())
          GROUP BY p.PRO_NOME
          ORDER BY total DESC
        `);
        await pool.close();
        return result.recordset as Array<{ nome: string; qtd: number; total: number }>;
      } catch {
        return getCachedMonthlyProducts(input.limit);
      }
    }),

  // ── KPIs do INOVE ─────────────────────────────────────────────────────────
  getKpis: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0 || !rows[0].active) {
      return buildCachedKpis(await getCachedDailyRevenue());
    }
    const config = rows[0];
    try {
      const pool = await createInovePool(config);
      // Uma única query com múltiplos resultsets para reduzir latência
      const result = await pool.request().query(`
        SELECT COUNT(*) as qtd, ISNULL(CAST(SUM(VEN_TOTAL) as float),0) as total
        FROM VENDAS WHERE VEN_SITUACAO = 2 AND CONVERT(date, VEN_DATA_FIM) = CONVERT(date, GETDATE());

        SELECT COUNT(*) as qtd, ISNULL(CAST(SUM(VEN_TOTAL) as float),0) as total
        FROM VENDAS WHERE VEN_SITUACAO = 2
          AND YEAR(VEN_DATA_FIM) = YEAR(GETDATE()) AND MONTH(VEN_DATA_FIM) = MONTH(GETDATE());

        SELECT ISNULL(CAST(AVG(VEN_TOTAL) as float),0) as ticket_medio
        FROM VENDAS WHERE VEN_SITUACAO = 2 AND VEN_DATA_FIM >= DATEADD(day, -30, GETDATE());

        SELECT COUNT(*) as qtd, ISNULL(CAST(SUM(VEN_TOTAL) as float),0) as total
        FROM VENDAS WHERE VEN_SITUACAO = 2
          AND CONVERT(date, VEN_DATA_FIM) = CONVERT(date, DATEADD(day, -1, GETDATE()));
      `);
      await pool.close();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sets = (result as any).recordsets as Array<Array<Record<string, number>>>;
      return {
        vendas_hoje: { qtd: Number(sets[0][0].qtd), total: Number(sets[0][0].total) },
        vendas_mes: { qtd: Number(sets[1][0].qtd), total: Number(sets[1][0].total) },
        ticket_medio: Number(sets[2][0].ticket_medio),
        vendas_ontem: { qtd: Number(sets[3][0].qtd), total: Number(sets[3][0].total) },
        source: "live" as const,
        cachedAt: null,
      };
    } catch (err) {
      console.error('[getKpis] Erro:', err);
      return buildCachedKpis(await getCachedDailyRevenue());
    }
  }),

  // ── Estoque do INOVE ──────────────────────────────────────────────────────
  getStock: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      grupo: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
      lowStock: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return { items: [], total: 0, grupos: [] };
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        const offset = (input.page - 1) * input.pageSize;
        const searchFilter = input.search ? `AND p.PRO_NOME LIKE '%${input.search.replace(/'/g, "''")}%'` : '';
        const grupoFilter = input.grupo ? `AND g.GRU_NOME = '${input.grupo.replace(/'/g, "''")}'` : '';
        const lowStockFilter = input.lowStock ? 'AND saldo.saldo_atual <= 5' : '';

        const result = await pool.request().query(`
          SELECT
            p.PRODUTO as id,
            p.PRO_NOME as nome,
            ISNULL(g.GRU_NOME, 'Sem Grupo') as grupo,
            CAST(p.PRO_VENDA as float) as preco_venda,
            CAST(ISNULL(p.PRO_CUSTO, 0) as float) as preco_custo,
            CAST(ISNULL(me.MVE_SALDO_ATUAL, 0) as float) as saldo_atual
          FROM PRODUTOS p
          LEFT JOIN GRUPOS_DE_PRODUTOS g ON p.GRUPO_DE_PRODUTOS = g.GRUPO_DE_PRODUTOS
          LEFT JOIN (
            SELECT PRODUTO, MAX(MOVIMENTO_ESTOQUE) as ultimo_mov
            FROM MOVIMENTOS_ESTOQUES GROUP BY PRODUTO
          ) ult ON ult.PRODUTO = p.PRODUTO
          LEFT JOIN MOVIMENTOS_ESTOQUES me ON me.MOVIMENTO_ESTOQUE = ult.ultimo_mov
          WHERE p.PRO_ATIVO = 'S' AND p.PRO_ESTOQUE = 'S'
            ${searchFilter} ${grupoFilter} ${input.lowStock ? 'AND ISNULL(me.MVE_SALDO_ATUAL, 0) <= 5' : ''}
          ORDER BY p.PRO_NOME
          OFFSET ${offset} ROWS FETCH NEXT ${input.pageSize} ROWS ONLY
        `);

        const countResult = await pool.request().query(`
          SELECT COUNT(*) as total
          FROM PRODUTOS p
          LEFT JOIN GRUPOS_DE_PRODUTOS g ON p.GRUPO_DE_PRODUTOS = g.GRUPO_DE_PRODUTOS
          LEFT JOIN (
            SELECT PRODUTO, MAX(MOVIMENTO_ESTOQUE) as ultimo_mov
            FROM MOVIMENTOS_ESTOQUES GROUP BY PRODUTO
          ) ult ON ult.PRODUTO = p.PRODUTO
          LEFT JOIN MOVIMENTOS_ESTOQUES me ON me.MOVIMENTO_ESTOQUE = ult.ultimo_mov
          WHERE p.PRO_ATIVO = 'S' AND p.PRO_ESTOQUE = 'S'
            ${searchFilter} ${grupoFilter} ${input.lowStock ? 'AND ISNULL(me.MVE_SALDO_ATUAL, 0) <= 5' : ''}
        `);

        const gruposResult = await pool.request().query(`
          SELECT DISTINCT ISNULL(g.GRU_NOME, 'Sem Grupo') as grupo
          FROM PRODUTOS p
          LEFT JOIN GRUPOS_DE_PRODUTOS g ON p.GRUPO_DE_PRODUTOS = g.GRUPO_DE_PRODUTOS
          WHERE p.PRO_ATIVO = 'S' AND p.PRO_ESTOQUE = 'S'
          ORDER BY grupo
        `);

        await pool.close();
        return {
          items: result.recordset as Array<{ id: number; nome: string; grupo: string; preco_venda: number; preco_custo: number; saldo_atual: number }>,
          total: (countResult.recordset[0] as { total: number }).total,
          grupos: (gruposResult.recordset as Array<{ grupo: string }>).map(r => r.grupo),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg);
      }
    }),

  exportStock: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      grupo: z.string().optional(),
      lowStock: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return { items: [] };
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        const searchFilter = input.search ? `AND p.PRO_NOME LIKE '%${input.search.replace(/'/g, "''")}%'` : '';
        const grupoFilter = input.grupo ? `AND g.GRU_NOME = '${input.grupo.replace(/'/g, "''")}'` : '';
        const result = await pool.request().query(`
          SELECT
            p.PRO_NOME as nome,
            ISNULL(g.GRU_NOME, 'Sem Grupo') as grupo,
            CAST(p.PRO_VENDA as float) as preco_venda,
            CAST(ISNULL(p.PRO_CUSTO, 0) as float) as preco_custo,
            CAST(ISNULL(me.MVE_SALDO_ATUAL, 0) as float) as saldo_atual
          FROM PRODUTOS p
          LEFT JOIN GRUPOS_DE_PRODUTOS g ON p.GRUPO_DE_PRODUTOS = g.GRUPO_DE_PRODUTOS
          LEFT JOIN (
            SELECT PRODUTO, MAX(MOVIMENTO_ESTOQUE) as ultimo_mov
            FROM MOVIMENTOS_ESTOQUES GROUP BY PRODUTO
          ) ult ON ult.PRODUTO = p.PRODUTO
          LEFT JOIN MOVIMENTOS_ESTOQUES me ON me.MOVIMENTO_ESTOQUE = ult.ultimo_mov
          WHERE p.PRO_ATIVO = 'S' AND p.PRO_ESTOQUE = 'S'
            ${searchFilter} ${grupoFilter} ${input.lowStock ? 'AND ISNULL(me.MVE_SALDO_ATUAL, 0) <= 5' : ''}
          ORDER BY p.PRO_NOME
        `);
        await pool.close();
        return { items: result.recordset as Array<{ nome: string; grupo: string; preco_venda: number; preco_custo: number; saldo_atual: number }> };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg);
      }
    }),

  // ── Vendas Recentes do INOVE ──────────────────────────────────────────────
  getRecentSales: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      days: z.number().int().min(1).max(365).default(30),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return { items: [], total: 0 };
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        const offset = (input.page - 1) * input.pageSize;
        const searchFilter = input.search
          ? `AND (p.PES_NOME LIKE '%${input.search.replace(/'/g, "''")}%' OR CAST(v.VENDA as varchar) LIKE '%${input.search.replace(/'/g, "''")}%')`
          : '';

        const result = await pool.request().query(`
          SELECT
            v.VENDA as id,
            CONVERT(varchar(19), v.VEN_DATA_FIM, 120) as data,
            CAST(v.VEN_TOTAL as float) as total,
            ISNULL(p.PES_NOME, v.VEN_NOME_CLIENTE) as cliente,
            v.VEN_SITUACAO as situacao
          FROM VENDAS v
          LEFT JOIN CLIENTES c ON v.CLIENTE = c.PESSOA
          LEFT JOIN PESSOAS p ON c.PESSOA = p.PESSOA
          WHERE v.VEN_SITUACAO = 2
            AND v.VEN_DATA_FIM >= DATEADD(day, -${input.days}, GETDATE())
            ${searchFilter}
          ORDER BY v.VEN_DATA_FIM DESC
          OFFSET ${offset} ROWS FETCH NEXT ${input.pageSize} ROWS ONLY
        `);

        const countResult = await pool.request().query(`
          SELECT COUNT(*) as total
          FROM VENDAS v
          LEFT JOIN CLIENTES c ON v.CLIENTE = c.PESSOA
          LEFT JOIN PESSOAS p ON c.PESSOA = p.PESSOA
          WHERE v.VEN_SITUACAO = 2
            AND v.VEN_DATA_FIM >= DATEADD(day, -${input.days}, GETDATE())
            ${searchFilter}
        `);

        await pool.close();
        return {
          items: result.recordset as Array<{ id: number; data: string; total: number; cliente: string | null; situacao: number }>,
          total: (countResult.recordset[0] as { total: number }).total,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg);
      }
    }),

  // ── Sincronizar estoque INOVE → sistema local ───────────────────────────────────────────
  syncStockFromInove: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0 || !rows[0].active) throw new Error("Conector INOVE não está ativo");
    const config = rows[0];
    const pool = await createInovePool(config);
    try {
      // Buscar todos os produtos do INOVE com saldo e custo
      const result = await pool.request().query(`
        SELECT
          p.PRODUTO as inove_id,
          p.PRO_NOME as nome,
          p.PRO_CODIGO_BARRAS as barcode,
          CAST(ISNULL(p.PRO_CUSTO, 0) as float) as custo,
          CAST(ISNULL(p.PRO_VENDA, 0) as float) as venda,
          CAST(ISNULL(
            (SELECT TOP 1 MVE_SALDO_ATUAL FROM MOVIMENTOS_ESTOQUES
             WHERE PRODUTO = p.PRODUTO ORDER BY MOVIMENTO_ESTOQUE DESC), 0
          ) as float) as saldo
        FROM PRODUTOS p
        WHERE p.PRO_ATIVO = 'S' AND p.PRO_ESTOQUE = 'S'
        ORDER BY p.PRO_NOME
      `);
      await pool.close();

      const inoveProducts = result.recordset as Array<{
        inove_id: number; nome: string; barcode: string | null;
        custo: number; venda: number; saldo: number;
      }>;

      // Buscar produtos locais para vincular por barcode ou externalCode
      const { products, stockMovements } = await import("../../drizzle/schema");
      const localProducts = await db.select({
        id: products.id,
        name: products.name,
        barcode: products.barcode,
        externalCode: products.externalCode,
        currentStock: products.currentStock,
      }).from(products).where(eq(products.active, true));

      let synced = 0;
      let created = 0;
      let costUpdated = 0;
      const errors: string[] = [];

      for (const ip of inoveProducts) {
        try {
          const bc = ip.barcode ? String(ip.barcode).trim() : null;
          // Tentar vincular: barcode local = barcode INOVE, ou externalCode = barcode INOVE
          let local = bc
            ? localProducts.find(lp =>
                (lp.barcode && lp.barcode.trim() === bc) ||
                (lp.externalCode && lp.externalCode.trim() === bc)
              )
            : undefined;

          const saldoInt = Math.round(ip.saldo);

          if (local) {
            // Atualizar saldo e custo
            const updates: Record<string, unknown> = {
              currentStock: saldoInt,
              updatedAt: new Date(),
            };
            if (ip.custo > 0) {
              updates.costPrice = String(ip.custo.toFixed(2));
              costUpdated++;
            }
            await db.update(products).set(updates).where(eq(products.id, local.id));

            // Registrar movimentação de ajuste se saldo mudou
            if (local.currentStock !== saldoInt) {
              await db.insert(stockMovements).values({
                productId: local.id,
                type: "adjustment",
                quantity: Math.abs(saldoInt - local.currentStock),
                previousStock: local.currentStock,
                newStock: saldoInt,
                reason: `Sincronização INOVE (barcode: ${bc ?? ip.inove_id})`,
              });
            }
            synced++;
          } else if (ip.nome && ip.nome.trim().length > 1) {
            // Criar produto novo no sistema local
            const newProd = await db.insert(products).values({
              name: ip.nome.trim(),
              barcode: bc ?? undefined,
              externalCode: bc ?? String(ip.inove_id),
              costPrice: ip.custo > 0 ? String(ip.custo.toFixed(2)) : "0.00",
              salePrice: ip.venda > 0 ? String(ip.venda.toFixed(2)) : "0.00",
              currentStock: saldoInt,
              minStock: 5,
              unit: "un",
              active: true,
            });
            // Drizzle com MySQL retorna insertId como BigInt — converter para number
            const rawInsertId = (newProd as unknown as { insertId: bigint | number }).insertId;
            const newId = rawInsertId ? Number(rawInsertId) : 0;

            // Fallback: se insertId não veio, buscar pelo barcode/externalCode
            let resolvedId = newId;
            if (!resolvedId) {
              const lookupKey = bc ?? String(ip.inove_id);
              const [found] = await db
                .select({ id: products.id })
                .from(products)
                .where(sql`externalCode = ${lookupKey} OR barcode = ${lookupKey}`)
                .limit(1);
              resolvedId = found?.id ?? 0;
            }

            if (resolvedId && saldoInt !== 0) {
              await db.insert(stockMovements).values({
                productId: resolvedId,
                type: "adjustment",
                quantity: Math.abs(saldoInt),
                previousStock: 0,
                newStock: saldoInt,
                reason: `Importado do INOVE (barcode: ${bc ?? ip.inove_id})`,
              });
            }
            created++;
          }
        } catch (e) {
          errors.push(`${ip.nome}: ${String(e)}`);
        }
      }

      return { synced, created, costUpdated, total: inoveProducts.length, errors: errors.slice(0, 10) };
    } catch (err) {
      await pool.close().catch(() => {});
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  }),

  // ── Vendas por Hora (relatório) ─────────────────────────────────────────────────────────
  getSalesByHour: protectedProcedure
    .input(z.object({
      days: z.number().int().min(1).max(365).default(30),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return [];
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        let dateFilter = `VEN_DATA_FIM >= DATEADD(day, -${input.days}, GETDATE())`;
        if (input.dateFrom && input.dateTo) {
          dateFilter = `VEN_DATA_FIM >= '${input.dateFrom}' AND VEN_DATA_FIM <= '${input.dateTo} 23:59:59'`;
        }
        const result = await pool.request().query(`
          SELECT
            DATEPART(HOUR, VEN_DATA_FIM) as hora,
            COUNT(*) as qtd_vendas,
            CAST(SUM(VEN_TOTAL) as float) as total,
            CAST(AVG(VEN_TOTAL) as float) as ticket_medio
          FROM VENDAS
          WHERE VEN_SITUACAO = 2 AND ${dateFilter}
          GROUP BY DATEPART(HOUR, VEN_DATA_FIM)
          ORDER BY hora
        `);
        await pool.close();
        return result.recordset as Array<{ hora: number; qtd_vendas: number; total: number; ticket_medio: number }>;
      } catch {
        return [];
      }
    }),

  // ── Vendas por Tipo de Pagamento (relatório) ────────────────────────────────────────────
  getSalesByPaymentType: protectedProcedure
    .input(z.object({
      days: z.number().int().min(1).max(365).default(30),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return [];
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        let dateFilter = '';
        if (input.dateFrom && input.dateTo) {
          dateFilter = `CAST(v.VEN_DATA_FIM AS DATE) >= '${input.dateFrom}' AND CAST(v.VEN_DATA_FIM AS DATE) <= '${input.dateTo}'`;
        } else if (input.days === 1) {
          dateFilter = `CAST(v.VEN_DATA_FIM AS DATE) = CAST(GETDATE() AS DATE)`;
        } else {
          dateFilter = `CAST(v.VEN_DATA_FIM AS DATE) >= CAST(DATEADD(day, -${input.days}, GETDATE()) AS DATE)`;
        }
        const result = await pool.request().query(`
          SELECT
            fp.PAG_NOME as forma,
            COUNT(DISTINCT pv.VENDA) as qtd_vendas,
            CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(fp.PAG_NOME))) = 'DINHEIRO'
              THEN pv.PAG_VALOR - ISNULL(pv.PAG_DEVOLUCAO, 0)
              ELSE pv.PAG_VALOR END) as float) as total,
            CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(fp.PAG_NOME))) = 'DINHEIRO'
              THEN ISNULL(pv.PAG_DEVOLUCAO, 0) ELSE 0 END) as float) as troco,
            CAST(CASE WHEN COUNT(DISTINCT pv.VENDA) > 0 THEN SUM(CASE WHEN UPPER(LTRIM(RTRIM(fp.PAG_NOME))) = 'DINHEIRO'
              THEN pv.PAG_VALOR - ISNULL(pv.PAG_DEVOLUCAO, 0)
              ELSE pv.PAG_VALOR END) / COUNT(DISTINCT pv.VENDA) ELSE 0 END as float) as ticket_medio
          FROM PAGAMENTOS_VENDAS pv
          JOIN FORMAS_PAGAMENTOS fp ON fp.FORMA_PAGAMENTO = pv.FORMA_PAGAMENTO
          JOIN VENDAS v ON v.VENDA = pv.VENDA
          WHERE v.VEN_SITUACAO = 2 AND ${dateFilter}
          GROUP BY fp.PAG_NOME
          ORDER BY total DESC
        `);
        await pool.close();
        return result.recordset as Array<{ forma: string; qtd_vendas: number; total: number; troco: number; ticket_medio: number }>;
      } catch {
        return [];
      }
    }),

  // ── Detalhes de uma venda do INOVE ────────────────────────────────────────────────
  getSaleDetail: protectedProcedure
    .input(z.object({ vendaId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return null;
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        const venda = await pool.request().query(`
          SELECT v.VENDA as id, CONVERT(varchar(19), v.VEN_DATA_FIM, 120) as data,
            CAST(v.VEN_TOTAL as float) as total, ISNULL(p.PES_NOME, v.VEN_NOME_CLIENTE) as cliente,
            p.PES_TELEFONE as telefone, p.PES_RG_CPF as cpf
          FROM VENDAS v
          LEFT JOIN CLIENTES c ON v.CLIENTE = c.PESSOA
          LEFT JOIN PESSOAS p ON c.PESSOA = p.PESSOA
          WHERE v.VENDA = ${input.vendaId}
        `);
        const itens = await pool.request().query(`
          SELECT i.ITE_NOME as nome, CAST(i.ITE_QUANTIDADE as float) as qtd,
            CAST(i.ITE_VALOR as float) as valor_unit,
            CAST(i.ITE_VALOR * i.ITE_QUANTIDADE as float) as total
          FROM ITENS_VENDAS i WHERE i.VENDA = ${input.vendaId}
          ORDER BY i.ITE_NUMERO
        `);
        const pagamentos = await pool.request().query(`
          SELECT f.FOR_DESCRICAO as forma, CAST(pag.PAG_VALOR as float) as valor
          FROM PAGAMENTOS_VENDAS pag
          LEFT JOIN FORMAS_PAGAMENTOS f ON pag.FORMA_PAGAMENTO = f.FORMA_PAGAMENTO
          WHERE pag.VENDA = ${input.vendaId}
        `);
        await pool.close();
        return {
          venda: venda.recordset[0] as { id: number; data: string; total: number; cliente: string | null; telefone: string | null; cpf: string | null } | undefined,
          itens: itens.recordset as Array<{ nome: string; qtd: number; valor_unit: number; total: number }>,
          pagamentos: pagamentos.recordset as Array<{ forma: string; valor: number }>,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg);
      }
    }),

  // ── KPI Vendas do Dia (INOVE) ─────────────────────────────────────────────────
  getVendasHoje: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0 || !rows[0].active) return null;
    const config = rows[0];
    try {
      const pool = await createInovePool(config);
      const res = await pool.request().query(`
        SELECT
          COUNT(*) as qtd,
          ISNULL(SUM(VEN_TOTAL), 0) as total,
          ISNULL(AVG(VEN_TOTAL), 0) as ticketMedio,
          ISNULL(SUM(CASE WHEN CAST(VEN_DATA_FIM AS TIME) < '12:00' THEN VEN_TOTAL ELSE 0 END), 0) as manha,
          ISNULL(SUM(CASE WHEN CAST(VEN_DATA_FIM AS TIME) >= '12:00' THEN VEN_TOTAL ELSE 0 END), 0) as tarde
        FROM VENDAS
        WHERE CAST(VEN_DATA_FIM AS DATE) = CAST(GETDATE() AS DATE)
          AND VEN_SITUACAO = 2
      `);
      await pool.close();
      const r = res.recordset[0] as { qtd: number; total: number; ticketMedio: number; manha: number; tarde: number };
      return { qtd: r.qtd, total: Number(r.total), ticketMedio: Number(r.ticketMedio), manha: Number(r.manha), tarde: Number(r.tarde) };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  }),

  // ── Dados de Ontem por Forma de Pagamento (para Previsão de Pagamento) ────────
  getVendasOntem: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0 || !rows[0].active) return null;
    const config = rows[0];
    try {
      const pool = await createInovePool(config);
      const res = await pool.request().query(`
        SELECT fp.PAG_NOME as forma,
          ISNULL(SUM(CASE WHEN UPPER(LTRIM(RTRIM(fp.PAG_NOME))) = 'DINHEIRO'
            THEN pv.PAG_VALOR - ISNULL(pv.PAG_DEVOLUCAO, 0)
            ELSE pv.PAG_VALOR END), 0) as valor,
          COUNT(DISTINCT pv.VENDA) as qtd
        FROM PAGAMENTOS_VENDAS pv
        JOIN FORMAS_PAGAMENTOS fp ON fp.FORMA_PAGAMENTO = pv.FORMA_PAGAMENTO
        JOIN VENDAS v ON v.VENDA = pv.VENDA
        WHERE CAST(v.VEN_DATA_FIM AS DATE) = CAST(DATEADD(day,-1,GETDATE()) AS DATE)
          AND v.VEN_SITUACAO = 2
        GROUP BY fp.PAG_NOME ORDER BY valor DESC
      `);
      const tot = await pool.request().query(`
        SELECT ISNULL(SUM(VEN_TOTAL),0) as total, COUNT(*) as qtd
        FROM VENDAS
        WHERE CAST(VEN_DATA_FIM AS DATE) = CAST(DATEADD(day,-1,GETDATE()) AS DATE)
          AND VEN_SITUACAO = 2
      `);
      await pool.close();
      return {
        formas: res.recordset as Array<{ forma: string; valor: number; qtd: number }>,
        total: Number((tot.recordset[0] as { total: number }).total),
        qtd: Number((tot.recordset[0] as { qtd: number }).qtd),
      };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  }),

  // ── Vendas por Datas Específicas (para preencher dias faltantes no calendário) ──
  getVendasMissingDays: protectedProcedure
    .input(z.object({
      dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(60),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return null;
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        // Busca total de vendas para cada data em uma única query
        const dateList = input.dates.map(d => `'${d}'`).join(",");
        const res = await pool.request().query(`
          SELECT
            CAST(VEN_DATA_FIM AS DATE) as data,
            ISNULL(SUM(VEN_TOTAL), 0) as total,
            COUNT(*) as qtd
          FROM VENDAS
          WHERE CAST(VEN_DATA_FIM AS DATE) IN (${dateList})
            AND VEN_SITUACAO = 2
          GROUP BY CAST(VEN_DATA_FIM AS DATE)
          ORDER BY data
        `);
        await pool.close();
        // Montar mapa de data -> { total, qtd }
        const result: Record<string, { total: number; qtd: number }> = {};
        for (const row of res.recordset as Array<{ data: Date | string; total: number; qtd: number }>) {
          const dateStr = typeof row.data === 'string'
            ? row.data.slice(0, 10)
            : new Date(row.data).toISOString().slice(0, 10);
          result[dateStr] = { total: Number(row.total), qtd: Number(row.qtd) };
        }
        // Garantir que todas as datas solicitadas apareçam no resultado (mesmo sem vendas)
        for (const d of input.dates) {
          if (!result[d]) result[d] = { total: 0, qtd: 0 };
        }
        return result;
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }),

  // ── Médias Históricas por Mês (para Fluxo de Caixa Preditivo) ─────────────────
  getMediasHistoricas: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0 || !rows[0].active) return null;
    const config = rows[0];
    try {
      const pool = await createInovePool(config);
      const res = await pool.request().query(`
        SELECT MONTH(VEN_DATA_FIM) as mes, YEAR(VEN_DATA_FIM) as ano,
          ISNULL(SUM(VEN_TOTAL), 0) as total, COUNT(*) as qtd,
          ISNULL(AVG(VEN_TOTAL), 0) as ticketMedio
        FROM VENDAS
        WHERE VEN_SITUACAO = 2 AND VEN_DATA_FIM >= DATEADD(year,-3,GETDATE())
        GROUP BY YEAR(VEN_DATA_FIM), MONTH(VEN_DATA_FIM)
        ORDER BY ano, mes
      `);
      await pool.close();
      return res.recordset as Array<{ mes: number; ano: number; total: number; qtd: number; ticketMedio: number }>;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  }),

  // ── Baixa Automática de Estoque pelas Vendas INOVE ───────────────────────────
  syncStockFromSales: protectedProcedure
    .input(z.object({ hours: z.number().int().min(1).max(48).default(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) throw new Error("Conector INOVE não ativo");
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        const itens = await pool.request().query(`
          SELECT i.ITE_NOME as nome, p.PRO_CODIGO_BARRAS as barcode,
            ISNULL(SUM(i.ITE_QUANTIDADE), 0) as qtdVendida
          FROM ITENS_VENDAS i
          JOIN VENDAS v ON v.VENDA = i.VENDA
          LEFT JOIN PRODUTOS p ON p.PRODUTO = i.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND v.VEN_DATA_FIM >= DATEADD(hour, -${input.hours}, GETDATE())
          GROUP BY i.ITE_NOME, p.PRO_CODIGO_BARRAS
        `);
        await pool.close();
        let baixados = 0; let naoEncontrados = 0;
        const erros: string[] = [];
        for (const item of itens.recordset as Array<{ nome: string; barcode: string | null; qtdVendida: number }>) {
          try {
            const qtd = Math.round(Number(item.qtdVendida));
            if (qtd <= 0) continue;
            const [local] = await db
              .select({ id: products.id, currentStock: products.currentStock })
              .from(products)
              .where(item.barcode
                ? sql`barcode = ${item.barcode} OR externalCode = ${item.barcode}`
                : sql`name = ${item.nome}`)
              .limit(1);
            if (!local) { naoEncontrados++; continue; }
            const novoSaldo = local.currentStock - qtd;
            await db.update(products).set({ currentStock: novoSaldo, updatedAt: new Date() }).where(eq(products.id, local.id));
            await db.insert(stockMovements).values({
              productId: local.id, type: "sale", quantity: qtd,
              previousStock: local.currentStock, newStock: novoSaldo,
              reason: `Venda PDV INOVE (últimas ${input.hours}h)`,
            });
            baixados++;
          } catch (e) { erros.push(`${item.nome}: ${String(e)}`); }
        }
        return { baixados, naoEncontrados, total: (itens.recordset as unknown[]).length, erros: erros.slice(0, 10) };
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }),

  // ── Relatório de Custo/Margem por Produto ─────────────────────────────────────
  getCostMarginReport: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      minMargin: z.number().optional(),
      maxMargin: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) {
        const prods = await db.select({
          id: products.id, name: products.name, barcode: products.barcode,
          costPrice: products.costPrice, salePrice: products.salePrice, currentStock: products.currentStock,
        }).from(products).where(eq(products.active, true));
        return prods.map(p => ({
          id: p.id, nome: p.name, barcode: p.barcode,
          custo: Number(p.costPrice), venda: Number(p.salePrice),
          margem: p.salePrice && p.costPrice && Number(p.salePrice) > 0
            ? ((Number(p.salePrice) - Number(p.costPrice)) / Number(p.salePrice)) * 100 : 0,
          lucro: Number(p.salePrice) - Number(p.costPrice),
          estoque: p.currentStock, fonte: "local" as const,
        }));
      }
      const config = rows[0];
      try {
        const pool = await createInovePool(config);
        const sf = input.search ? `AND (p.PRO_NOME LIKE '%${input.search.replace(/'/g,"''")}%' OR p.PRO_CODIGO_BARRAS LIKE '%${input.search.replace(/'/g,"''")}%')` : "";
        const res = await pool.request().query(`
          SELECT p.PRODUTO as id, p.PRO_NOME as nome, p.PRO_CODIGO_BARRAS as barcode,
            ISNULL(CAST(p.PRO_CUSTO as float), 0) as custo,
            ISNULL(CAST(p.PRO_VENDA as float), 0) as venda,
            ISNULL((
              SELECT TOP 1 CAST(MVE_SALDO_ATUAL as float) FROM MOVIMENTOS_ESTOQUES me
              WHERE me.PRODUTO = p.PRODUTO ORDER BY me.MOVIMENTO_ESTOQUE DESC
            ), 0) as estoque
          FROM PRODUTOS p WHERE p.PRO_ATIVO = 1 ${sf} ORDER BY p.PRO_NOME
        `);
        await pool.close();
        return (res.recordset as Array<{ id: number; nome: string; barcode: string; custo: number; venda: number; estoque: number }>)
          .map(p => ({
            id: p.id, nome: p.nome, barcode: p.barcode,
            custo: Number(p.custo), venda: Number(p.venda),
            margem: p.venda > 0 ? ((p.venda - p.custo) / p.venda) * 100 : 0,
            lucro: p.venda - p.custo, estoque: Number(p.estoque), fonte: "inove" as const,
          }))
          .filter(p => {
            if (input.minMargin !== undefined && p.margem < input.minMargin) return false;
            if (input.maxMargin !== undefined && p.margem > input.maxMargin) return false;
            return true;
          });
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }),

  // ── Vendas de ontem por forma de pagamento (para popular Previsão de Pagamento) ─────────────────────
  getYesterdayByPayment: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0 || !rows[0].active) return [];
    const config = rows[0];
    try {
      const pool = await createInovePool(config);
      const res = await pool.request().query(`
        SELECT
          fp.PAG_NOME as forma,
          CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(fp.PAG_NOME))) = 'DINHEIRO'
            THEN pv.PAG_VALOR - ISNULL(pv.PAG_DEVOLUCAO, 0)
            ELSE pv.PAG_VALOR END) as float) as total,
          COUNT(DISTINCT pv.VENDA) as qtd
        FROM PAGAMENTOS_VENDAS pv
        JOIN FORMAS_PAGAMENTOS fp ON fp.FORMA_PAGAMENTO = pv.FORMA_PAGAMENTO
        JOIN VENDAS v ON v.VENDA = pv.VENDA
        WHERE v.VEN_SITUACAO = 2
          AND CAST(v.VEN_DATA_FIM as date) = CAST(DATEADD(day,-1,GETDATE()) as date)
        GROUP BY fp.PAG_NOME
        ORDER BY total DESC
      `);
      await pool.close();
      return res.recordset as Array<{ forma: string; total: number; qtd: number }>;
    } catch { return []; }
  }),

  // ── Alerta automático de estoque baixo ─────────────────────────────────────────────
  checkLowStockAlert: protectedProcedure
    .input(z.object({ threshold: z.number().default(0) }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return { sent: false, reason: "Conector inativo" };
      const config = rows[0];
      const threshold = input?.threshold ?? 0;
      try {
        const pool = await createInovePool(config);
        const result = await pool.request().query(`
          SELECT TOP 50
            p.PRO_NOME as nome,
            p.PRO_CODIGO as codigo,
            me.MVE_SALDO_ATUAL as saldo
          FROM PRODUTOS p
          INNER JOIN (
            SELECT PRODUTO, MAX(MOVIMENTO_ESTOQUE) as ultimo_mov
            FROM MOVIMENTOS_ESTOQUES GROUP BY PRODUTO
          ) ult ON ult.PRODUTO = p.PRODUTO
          INNER JOIN MOVIMENTOS_ESTOQUES me ON me.MOVIMENTO_ESTOQUE = ult.ultimo_mov
          WHERE me.MVE_SALDO_ATUAL <= ${threshold}
          ORDER BY me.MVE_SALDO_ATUAL ASC
        `);
        await pool.close();
        const lowItems = result.recordset as Array<{ nome: string; codigo: string; saldo: number }>;
        if (lowItems.length === 0) return { sent: false, reason: "Nenhum produto com estoque baixo" };
        const lines = lowItems.slice(0, 20).map(i => `• ${i.nome}: ${i.saldo} un`).join("\n");
        const content = `Foram encontrados ${lowItems.length} produto(s) com estoque ≤ ${threshold} no PDV INOVE:\n\n${lines}${lowItems.length > 20 ? `\n... e mais ${lowItems.length - 20} produto(s)` : ""}`;
        const sent = await notifyOwner({ title: `⚠️ Alerta de Estoque Baixo — ${lowItems.length} produto(s)`, content });
        return { sent, count: lowItems.length, items: lowItems.slice(0, 10) };
      } catch (err) {
        console.error("[checkLowStockAlert]", err);
        throw new Error("Erro ao verificar estoque no INOVE");
      }
    }),

  // ── Relatório de Vendas por Produto (mês selecionado vs mês anterior) ────────
  getSalesByProduct: protectedProcedure
    .input(z.object({ month: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) throw new Error("Conector INOVE inativo");
      const config = rows[0];
      const [year, month] = input.month.split("-").map(Number);
      const prevDate = new Date(year, month - 2, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonth = prevDate.getMonth() + 1;
      try {
        const pool = await createInovePool(config);
        const currRes = await pool.request().query(`
          SELECT
            p.PRODUTO as produtoId,
            p.PRO_NOME as nome,
            p.PRO_CODIGO as codPdv,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtd,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as faturamento
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND YEAR(v.VEN_DATA_FIM) = ${year}
            AND MONTH(v.VEN_DATA_FIM) = ${month}
          GROUP BY p.PRODUTO, p.PRO_NOME, p.PRO_CODIGO
          ORDER BY faturamento DESC
        `);
        const prevRes = await pool.request().query(`
          SELECT
            p.PRODUTO as produtoId,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtd,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as faturamento
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND YEAR(v.VEN_DATA_FIM) = ${prevYear}
            AND MONTH(v.VEN_DATA_FIM) = ${prevMonth}
          GROUP BY p.PRODUTO
        `);
        await pool.close();
        type CurrRow = { produtoId: number; nome: string; codPdv: string; qtd: number; faturamento: number };
        type PrevRow = { produtoId: number; qtd: number; faturamento: number };
        const curr = currRes.recordset as CurrRow[];
        const prev = prevRes.recordset as PrevRow[];
        const prevMap = new Map(prev.map(p => [Number(p.produtoId), p]));
        const top10 = curr.slice(0, 10).map(c => {
          const p = prevMap.get(Number(c.produtoId));
          const variacao = p && Number(p.faturamento) > 0
            ? ((Number(c.faturamento) - Number(p.faturamento)) / Number(p.faturamento)) * 100
            : null;
          return {
            produtoId: Number(c.produtoId),
            nome: c.nome,
            codPdv: c.codPdv,
            qtd: Number(c.qtd),
            faturamento: Number(c.faturamento),
            faturamentoPrev: p ? Number(p.faturamento) : null,
            qtdPrev: p ? Number(p.qtd) : null,
            variacao,
          };
        });
        const totalFaturamento = curr.reduce((s, c) => s + Number(c.faturamento), 0);
        const totalQtd = curr.reduce((s, c) => s + Number(c.qtd), 0);
        const totalFaturamentoPrev = prev.reduce((s, p) => s + Number(p.faturamento), 0);
        const top10Faturamento = top10.reduce((s, c) => s + c.faturamento, 0);
        const top10Qtd = top10.reduce((s, c) => s + c.qtd, 0);
        return {
          month: input.month,
          prevMonth: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
          top10,
          totalFaturamento,
          totalQtd,
          totalFaturamentoPrev,
          top10Faturamento,
          top10Qtd,
          totalProdutos: curr.length,
        };
      } catch (err) {
        // Tentar usar cache local se a conexão com o SQL Server falhar
        const { inoveSalesCache } = await import("../../drizzle/schema");
        const cacheKey = input.month;
        const cached = await db.select().from(inoveSalesCache).where(eq(inoveSalesCache.cacheKey, cacheKey)).limit(1);
        if (cached.length > 0) {
          const parsed = JSON.parse(cached[0].data);
          // O cache pode ser um array (formato antigo) ou um objeto completo (formato novo)
          if (Array.isArray(parsed)) {
            // Reconstruir o objeto completo a partir do array
            const top10 = parsed as Array<{ produtoId: number; nome: string; codPdv: string | null; qtd: number; faturamento: number; faturamentoPrev: number | null; qtdPrev: number | null; variacao: number | null }>;
            const [year, month] = input.month.split('-').map(Number);
            const prevDate = new Date(year, month - 2, 1);
            const prevYear = prevDate.getFullYear();
            const prevMonth = prevDate.getMonth() + 1;
            return {
              month: input.month,
              prevMonth: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
              top10,
              totalFaturamento: top10.reduce((s, c) => s + c.faturamento, 0),
              totalQtd: top10.reduce((s, c) => s + c.qtd, 0),
              totalFaturamentoPrev: top10.reduce((s, c) => s + (c.faturamentoPrev ?? 0), 0),
              top10Faturamento: top10.reduce((s, c) => s + c.faturamento, 0),
              top10Qtd: top10.reduce((s, c) => s + c.qtd, 0),
              totalProdutos: top10.length,
            };
          }
          return parsed;
        }
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }),

  // ── Relatório de Custo x Margem com dados reais de vendas do INOVE ──────────
  getCostMarginFull: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      sortBy: z.enum(["revenue", "margin", "profit", "qty"]).default("revenue"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // Helper: buscar dados do banco MySQL local (sales_import_items + products)
      async function getLocalCostMargin() {
        const whereConditions = [
          eq(salesImportItems.linkStatus, "linked"),
          eq(salesImports.status, "confirmed"),
        ];
        const localRows = await db!
          .select({
            produtoId: products.id,
            nome: products.name,
            codPdv: products.externalCode,
            custo: products.costPrice,
            qtd: sql<number>`SUM(${salesImportItems.quantity})`,
            receita: sql<number>`SUM(${salesImportItems.totalPrice})`,
            precoMedio: sql<number>`AVG(${salesImportItems.unitPrice})`,
          })
          .from(salesImportItems)
          .innerJoin(products, eq(salesImportItems.productId, products.id))
          .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
          .where(and(...whereConditions))
          .groupBy(products.id, products.name, products.externalCode, products.costPrice)
          .orderBy(desc(sql`SUM(${salesImportItems.totalPrice})`));
        const data = localRows
          .filter(r => !input.search || r.nome.toLowerCase().includes(input.search!.toLowerCase()))
          .map(r => {
          const custo = Number(r.custo) || 0;
          const qtd = Number(r.qtd) || 0;
          const receita = Number(r.receita) || 0;
          const precoMedio = Number(r.precoMedio) || 0;
          const cmv = custo * qtd;
          const lucroBruto = receita - cmv;
          const margem = receita > 0 ? (lucroBruto / receita) * 100 : 0;
          return { produtoId: r.produtoId, nome: r.nome, codPdv: r.codPdv ?? "", custo, qtd, receita, precoMedio, cmv, lucroBruto, margem, semCusto: custo === 0 };
        });
        data.sort((a, b) => {
          if (input.sortBy === "margin") return b.margem - a.margem;
          if (input.sortBy === "profit") return b.lucroBruto - a.lucroBruto;
          if (input.sortBy === "qty") return b.qtd - a.qtd;
          return b.receita - a.receita;
        });
        const totalReceita = data.reduce((s, r) => s + r.receita, 0);
        const totalCmv = data.filter(r => !r.semCusto).reduce((s, r) => s + r.cmv, 0);
        const totalLucro = data.filter(r => !r.semCusto).reduce((s, r) => s + r.lucroBruto, 0);
        return { items: data, totalReceita, totalCmv, totalLucro, margemGeral: totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0, semCustoCount: data.filter(r => r.semCusto).length, fonte: "local" as const };
      }

      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      // Se conector inativo ou não configurado, usa dados locais importados
      if (connRows.length === 0 || !connRows[0].active) {
        return getLocalCostMargin();
      }
      const config = connRows[0];
      try {
        const pool = await createInovePool(config);
        const sf = input.search
          ? `AND p.PRO_NOME LIKE '%${input.search.replace(/'/g, "''")}%'`
          : "";
        const res = await pool.request().query(`
          SELECT
            p.PRODUTO as produtoId,
            p.PRO_NOME as nome,
            p.PRO_CODIGO as codPdv,
            ISNULL(CAST(p.PRO_CUSTO as float), 0) as custo,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtd,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as receita,
            CAST(AVG(iv.ITE_VALOR) as float) as precoMedio
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND v.VEN_DATA_FIM >= DATEADD(month, -12, GETDATE())
            ${sf}
          GROUP BY p.PRODUTO, p.PRO_NOME, p.PRO_CODIGO, p.PRO_CUSTO
          ORDER BY receita DESC
        `);
        await pool.close();
        type Row = { produtoId: number; nome: string; codPdv: string; custo: number; qtd: number; receita: number; precoMedio: number };
        const data = (res.recordset as Row[]).map(r => {
          const custo = Number(r.custo);
          const qtd = Number(r.qtd);
          const receita = Number(r.receita);
          const precoMedio = Number(r.precoMedio);
          const cmv = custo * qtd;
          const lucroBruto = receita - cmv;
          const margem = receita > 0 ? (lucroBruto / receita) * 100 : 0;
          return { produtoId: Number(r.produtoId), nome: r.nome, codPdv: r.codPdv, custo, qtd, receita, precoMedio, cmv, lucroBruto, margem, semCusto: custo === 0 };
        });
        data.sort((a, b) => {
          if (input.sortBy === "margin") return b.margem - a.margem;
          if (input.sortBy === "profit") return b.lucroBruto - a.lucroBruto;
          if (input.sortBy === "qty") return b.qtd - a.qtd;
          return b.receita - a.receita;
        });
        const totalReceita = data.reduce((s, r) => s + r.receita, 0);
        const totalCmv = data.filter(r => !r.semCusto).reduce((s, r) => s + r.cmv, 0);
        const totalLucro = data.filter(r => !r.semCusto).reduce((s, r) => s + r.lucroBruto, 0);
        return {
          items: data,
          totalReceita,
          totalCmv,
          totalLucro,
          margemGeral: totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0,
          semCustoCount: data.filter(r => r.semCusto).length,
        };
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }),

  // ── Relatório Gerencial: KPIs + Top Receita + Top Qtd + Pagamentos + Estoque ─
  getManagerialReport: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) throw new Error("Conector INOVE inativo");
      const config = rows[0];
      const dateFilter = input.month
        ? `AND YEAR(v.VEN_DATA_FIM) = ${input.month.split('-')[0]} AND MONTH(v.VEN_DATA_FIM) = ${input.month.split('-')[1]}`
        : `AND v.VEN_DATA_FIM >= DATEADD(month, -12, GETDATE())`;
      const dateFilterSimple = input.month
        ? `AND YEAR(VEN_DATA_FIM) = ${input.month.split('-')[0]} AND MONTH(VEN_DATA_FIM) = ${input.month.split('-')[1]}`
        : `AND VEN_DATA_FIM >= DATEADD(month, -12, GETDATE())`;
      try {
        const pool = await createInovePool(config);
        const topReceita = await pool.request().query(`
          SELECT TOP 10 ISNULL(p.PRO_NOME, p.PRO_DESCRICAO) as nome,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as receita,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtd
          FROM ITENS_VENDAS iv JOIN VENDAS v ON v.VENDA = iv.VENDA JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2 ${dateFilter}
          GROUP BY ISNULL(p.PRO_NOME, p.PRO_DESCRICAO) ORDER BY receita DESC
        `);
        const topQtd = await pool.request().query(`
          SELECT TOP 10 ISNULL(p.PRO_NOME, p.PRO_DESCRICAO) as nome,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtd,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as receita
          FROM ITENS_VENDAS iv JOIN VENDAS v ON v.VENDA = iv.VENDA JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2 ${dateFilter}
          GROUP BY ISNULL(p.PRO_NOME, p.PRO_DESCRICAO) ORDER BY qtd DESC
        `);
        const pagamentos = await pool.request().query(`
          SELECT fp.PAG_NOME as forma,
            CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(fp.PAG_NOME))) = 'DINHEIRO'
              THEN pv.PAG_VALOR - ISNULL(pv.PAG_DEVOLUCAO, 0)
              ELSE pv.PAG_VALOR END) as float) as total,
            COUNT(DISTINCT pv.VENDA) as qtdVendas
          FROM PAGAMENTOS_VENDAS pv
          JOIN FORMAS_PAGAMENTOS fp ON fp.FORMA_PAGAMENTO = pv.FORMA_PAGAMENTO
          JOIN VENDAS v ON v.VENDA = pv.VENDA
          WHERE v.VEN_SITUACAO = 2 ${dateFilter}
          GROUP BY fp.PAG_NOME ORDER BY total DESC
        `);
        const kpis = await pool.request().query(`
          SELECT COUNT(DISTINCT v.VENDA) as totalVendas,
            CAST(SUM(v.VEN_TOTAL) as float) as receita,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as itensVendidos,
            COUNT(DISTINCT p.PRODUTO) as produtosAnalisados
          FROM VENDAS v JOIN ITENS_VENDAS iv ON iv.VENDA = v.VENDA JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2 ${dateFilter}
        `);
        const estoque = await pool.request().query(`
          SELECT TOP 50 p.PRO_DESCRICAO as nome, p.PRO_CODIGO as codigo,
            ISNULL(CAST(p.PRO_CUSTO as float), 0) as custo,
            ISNULL(CAST(p.PRO_VENDA as float), 0) as venda,
            ISNULL((SELECT TOP 1 CAST(MVE_SALDO_ATUAL as float) FROM MOVIMENTOS_ESTOQUES me WHERE me.PRODUTO = p.PRODUTO ORDER BY me.MOVIMENTO_ESTOQUE DESC), 0) as saldo
          FROM PRODUTOS p WHERE p.PRO_ATIVO = 1 ORDER BY p.PRO_DESCRICAO
        `);
        await pool.close();
        type KpiRow = { totalVendas: number; receita: number; itensVendidos: number; produtosAnalisados: number };
        const k = (kpis.recordset[0] as KpiRow) ?? { totalVendas: 0, receita: 0, itensVendidos: 0, produtosAnalisados: 0 };
        return {
          kpis: {
            totalVendas: Number(k.totalVendas),
            receita: Number(k.receita),
            itensVendidos: Number(k.itensVendidos),
            produtosAnalisados: Number(k.produtosAnalisados),
            ticketMedio: Number(k.itensVendidos) > 0 ? Number(k.receita) / Number(k.itensVendidos) : 0,
          },
          topReceita: (topReceita.recordset as Array<{ nome: string; receita: number; qtd: number }>).map(r => ({ nome: r.nome, receita: Number(r.receita), qtd: Number(r.qtd) })),
          topQtd: (topQtd.recordset as Array<{ nome: string; qtd: number; receita: number }>).map(r => ({ nome: r.nome, qtd: Number(r.qtd), receita: Number(r.receita) })),
          pagamentos: (pagamentos.recordset as Array<{ forma: string; total: number; qtdVendas: number }>).map(r => ({ forma: r.forma, total: Number(r.total), qtdVendas: Number(r.qtdVendas) })),
          estoque: (estoque.recordset as Array<{ nome: string; codigo: string; custo: number; venda: number; saldo: number }>).map(r => ({ nome: r.nome, codigo: r.codigo, custo: Number(r.custo), venda: Number(r.venda), saldo: Number(r.saldo) })),
        };
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }),

  // ── Relatório: Top Produtos com dados INOVE (com fallback local) ─────────────
  getTopProductsInove: protectedProcedure
    .input(z.object({
      referenceMonth: z.string().optional(),
      limit: z.number().min(5).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      // Fallback local
      async function localTopProducts() {
        const rows = await db!
          .select({
            productId: products.id,
            productName: products.name,
            costPrice: products.costPrice,
            totalQty: sql<number>`SUM(${salesImportItems.quantity})`,
            totalRevenue: sql<number>`SUM(${salesImportItems.totalPrice})`,
            avgUnitPrice: sql<number>`AVG(${salesImportItems.unitPrice})`,
          })
          .from(salesImportItems)
          .innerJoin(products, eq(salesImportItems.productId, products.id))
          .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
          .where(and(
            eq(salesImportItems.linkStatus, "linked"),
            eq(salesImports.status, "confirmed"),
            input.referenceMonth ? eq(salesImports.referenceMonth, input.referenceMonth) : undefined
          ))
          .groupBy(products.id, products.name, products.costPrice)
          .orderBy(desc(sql`SUM(${salesImportItems.totalPrice})`))
          .limit(input.limit);
        return rows.map((r, i) => ({
          rank: i + 1,
          produtoId: r.productId,
          nome: r.productName,
          codPdv: "",
          qtd: Number(r.totalQty) || 0,
          faturamento: Number(r.totalRevenue) || 0,
          custo: Number(r.costPrice) || 0,
          fonte: "local" as const,
        }));
      }
      if (!connRows.length || !connRows[0].active) return localTopProducts();
      const config = connRows[0];
      try {
        const pool = await createInovePool(config);
        const monthFilter = input.referenceMonth
          ? `AND YEAR(v.VEN_DATA_FIM) = ${parseInt(input.referenceMonth.split('-')[0])} AND MONTH(v.VEN_DATA_FIM) = ${parseInt(input.referenceMonth.split('-')[1])}`
          : `AND v.VEN_DATA_FIM >= DATEADD(month, -1, GETDATE())`;
        const res = await pool.request().query(`
          SELECT TOP ${input.limit}
            p.PRODUTO as produtoId,
            ISNULL(p.PRO_NOME, p.PRO_DESCRICAO) as nome,
            p.PRO_CODIGO as codPdv,
            ISNULL(CAST(p.PRO_CUSTO as float), 0) as custo,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtd,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as faturamento
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2 ${monthFilter}
          GROUP BY p.PRODUTO, p.PRO_NOME, p.PRO_DESCRICAO, p.PRO_CODIGO, p.PRO_CUSTO
          ORDER BY faturamento DESC
        `);
        await pool.close();
        return (res.recordset as Array<{produtoId:number;nome:string;codPdv:string;custo:number;qtd:number;faturamento:number}>).map((r, i) => ({
          rank: i + 1,
          produtoId: Number(r.produtoId),
          nome: r.nome,
          codPdv: r.codPdv,
          qtd: Number(r.qtd),
          faturamento: Number(r.faturamento),
          custo: Number(r.custo),
          fonte: "inove" as const,
        }));
      } catch (err) {
        console.error("[getTopProductsInove] Erro:", err instanceof Error ? err.message : err);
        return localTopProducts();
      }
    }),

  // ── Relatório: Formas de Pagamento INOVE (com fallback local) ────────────────
  getPaymentMethodsInove: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional(), dateFrom: z.string().optional(), dateTo: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      async function localPayments() {
        const rows = await db!
          .select({
            paymentMethod: salesImportPayments.paymentMethod,
            totalAmount: sql<number>`SUM(${salesImportPayments.totalAmount})`,
            transactionCount: sql<number>`SUM(${salesImportPayments.transactionCount})`,
          })
          .from(salesImportPayments)
          .innerJoin(salesImports, eq(salesImportPayments.importId, salesImports.id))
          .where(and(
            eq(salesImports.status, "confirmed"),
            input.referenceMonth ? eq(salesImports.referenceMonth, input.referenceMonth) : undefined
          ))
          .groupBy(salesImportPayments.paymentMethod)
          .orderBy(desc(sql`SUM(${salesImportPayments.totalAmount})`));
        const total = rows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
        const reconciliation = {
          grossSales: total,
          discounts: 0,
          netSales: total,
          netReceived: total,
          difference: 0,
        };
        return rows.map(r => ({
          forma: r.paymentMethod,
          total: Number(r.totalAmount) || 0,
          qtdVendas: Number(r.transactionCount) || 0,
          percentual: total > 0 ? ((Number(r.totalAmount) || 0) / total) * 100 : 0,
          fonte: "local" as const,
          reconciliation,
        }));
      }
      if (!connRows.length || !connRows[0].active) return localPayments();
      const config = connRows[0];
      try {
        const pool = await createInovePool(config);
        let monthFilter: string;
        if (input.dateFrom && input.dateTo) {
          monthFilter = `AND CAST(v.VEN_DATA_FIM AS DATE) >= '${input.dateFrom}' AND CAST(v.VEN_DATA_FIM AS DATE) <= '${input.dateTo}'`;
        } else if (input.referenceMonth) {
          monthFilter = `AND YEAR(v.VEN_DATA_FIM) = ${parseInt(input.referenceMonth.split('-')[0])} AND MONTH(v.VEN_DATA_FIM) = ${parseInt(input.referenceMonth.split('-')[1])}`;
        } else {
          monthFilter = `AND v.VEN_DATA_FIM >= DATEADD(month, -1, GETDATE())`;
        }
        const res = await pool.request().query(`
          SELECT
            fp.PAG_NOME as forma,
            CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(fp.PAG_NOME))) = 'DINHEIRO'
              THEN pv.PAG_VALOR - ISNULL(pv.PAG_DEVOLUCAO, 0)
              ELSE pv.PAG_VALOR END) as float) as total,
            CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(fp.PAG_NOME))) = 'DINHEIRO'
              THEN ISNULL(pv.PAG_DEVOLUCAO, 0) ELSE 0 END) as float) as troco,
            COUNT(DISTINCT pv.VENDA) as qtdVendas
          FROM PAGAMENTOS_VENDAS pv
          JOIN VENDAS v ON v.VENDA = pv.VENDA
          JOIN FORMAS_PAGAMENTOS fp ON fp.FORMA_PAGAMENTO = pv.FORMA_PAGAMENTO
          WHERE v.VEN_SITUACAO = 2 ${monthFilter}
          GROUP BY fp.PAG_NOME
          ORDER BY total DESC
        `);
        const salesTotals = await pool.request().query(`
          SELECT
            CAST(ISNULL(SUM(v.VEN_TOTAL), 0) as float) as grossSales,
            CAST(ISNULL(SUM(ISNULL(v.VEN_DESCONTO, 0)), 0) as float) as discounts
          FROM VENDAS v
          WHERE v.VEN_SITUACAO = 2 ${monthFilter}
        `);
        await pool.close();
        const data = res.recordset as Array<{forma:string;total:number;troco:number;qtdVendas:number}>;
        const totalGeral = data.reduce((s, r) => s + Number(r.total), 0);
        const grossSales = Number(salesTotals.recordset[0]?.grossSales) || 0;
        const discounts = Number(salesTotals.recordset[0]?.discounts) || 0;
        const netSales = grossSales - discounts;
        const reconciliation = {
          grossSales,
          discounts,
          netSales,
          netReceived: totalGeral,
          difference: totalGeral - netSales,
        };
        return data.map(r => ({
          forma: r.forma,
          total: Number(r.total),
          troco: Number(r.troco) || 0,
          qtdVendas: Number(r.qtdVendas),
          percentual: totalGeral > 0 ? (Number(r.total) / totalGeral) * 100 : 0,
          fonte: "inove" as const,
          reconciliation,
        }));
      } catch (err) {
        console.error("[getPaymentMethodsInove] Erro:", err instanceof Error ? err.message : err);
        return localPayments();
      }
    }),

  // ── Relatório: Evolução Mensal de Vendas INOVE (com fallback local) ──────────
  getMonthlySalesEvolutionInove: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const connRows = await db.select().from(inoveConnectorConfig).limit(1);
    async function localEvolution() {
      const rows = await db!
        .select({
          month: salesImports.referenceMonth,
          totalRevenue: sql<number>`SUM(${salesImportItems.totalPrice})`,
          totalQty: sql<number>`SUM(${salesImportItems.quantity})`,
          transactionCount: salesImports.totalTransactions,
        })
        .from(salesImportItems)
        .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
        .where(and(
          eq(salesImportItems.linkStatus, "linked"),
          eq(salesImports.status, "confirmed")
        ))
        .groupBy(salesImports.referenceMonth, salesImports.totalTransactions)
        .orderBy(salesImports.referenceMonth);
      return rows.map(r => ({
        month: r.month,
        totalRevenue: Number(r.totalRevenue) || 0,
        totalQty: Number(r.totalQty) || 0,
        transactionCount: Number(r.transactionCount) || 0,
        ticketMedio: Number(r.transactionCount) > 0 ? (Number(r.totalRevenue) || 0) / Number(r.transactionCount) : 0,
        fonte: "local" as const,
      }));
    }
    if (!connRows.length || !connRows[0].active) return localEvolution();
    const config = connRows[0];
    try {
      const pool = await createInovePool(config);
      const res = await pool.request().query(`
        SELECT
          FORMAT(v.VEN_DATA_FIM, 'yyyy-MM') as month,
          CAST(SUM(v.VEN_TOTAL) as float) as totalRevenue,
          COUNT(DISTINCT v.VENDA) as transactionCount
        FROM VENDAS v
        WHERE v.VEN_SITUACAO = 2
          AND v.VEN_DATA_FIM >= DATEADD(month, -12, GETDATE())
        GROUP BY FORMAT(v.VEN_DATA_FIM, 'yyyy-MM')
        ORDER BY month ASC
      `);
      await pool.close();
      return (res.recordset as Array<{month:string;totalRevenue:number;transactionCount:number}>).map(r => ({
        month: r.month,
        totalRevenue: Number(r.totalRevenue),
        totalQty: 0,
        transactionCount: Number(r.transactionCount),
        ticketMedio: Number(r.transactionCount) > 0 ? Number(r.totalRevenue) / Number(r.transactionCount) : 0,
        fonte: "inove" as const,
            }));
    } catch (err) {
      console.error("[getMonthlySalesEvolutionInove] Erro:", err instanceof Error ? err.message : err);
      return localEvolution();
    }
  }),
  // ── Relatório: Custo x Vendas por produto INOVE (com fallback local) ─────────
  getCostVsSalesInove: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      async function localCostVsSales() {
        const rows = await db!
          .select({
            productId: products.id,
            productName: products.name,
            costPrice: products.costPrice,
            salePrice: products.salePrice,
            totalQty: sql<number>`SUM(${salesImportItems.quantity})`,
            totalRevenue: sql<number>`SUM(${salesImportItems.totalPrice})`,
            avgUnitPrice: sql<number>`AVG(${salesImportItems.unitPrice})`,
            referenceMonth: salesImports.referenceMonth,
          })
          .from(salesImportItems)
          .innerJoin(products, eq(salesImportItems.productId, products.id))
          .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
          .where(and(
            eq(salesImportItems.linkStatus, "linked"),
            eq(salesImports.status, "confirmed"),
            input.referenceMonth ? eq(salesImports.referenceMonth, input.referenceMonth) : undefined
          ))
          .groupBy(products.id, products.name, products.costPrice, products.salePrice, salesImports.referenceMonth)
          .orderBy(desc(sql`SUM(${salesImportItems.totalPrice})`));
        return rows.map(r => {
          const costPrice = Number(r.costPrice) || 0;
          const totalRevenue = Number(r.totalRevenue) || 0;
          const totalQty = Number(r.totalQty) || 0;
          const totalCost = costPrice * totalQty;
          const grossProfit = totalRevenue - totalCost;
          const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
          return { productId: r.productId, productName: r.productName, costPrice, avgSalePrice: Number(r.avgUnitPrice)||0, totalQty, totalRevenue, totalCost, grossProfit, margin: parseFloat(margin.toFixed(2)), referenceMonth: r.referenceMonth, fonte: "local" as const };
        });
      }
      if (!connRows.length || !connRows[0].active) return localCostVsSales();
      const config = connRows[0];
      try {
        const pool = await createInovePool(config);
        const monthFilter = input.referenceMonth
          ? `AND YEAR(v.VEN_DATA_FIM) = ${parseInt(input.referenceMonth.split('-')[0])} AND MONTH(v.VEN_DATA_FIM) = ${parseInt(input.referenceMonth.split('-')[1])}`
          : `AND v.VEN_DATA_FIM >= DATEADD(month, -1, GETDATE())`;
        const res = await pool.request().query(`
          SELECT
            p.PRODUTO as productId,
            ISNULL(p.PRO_NOME, p.PRO_DESCRICAO) as productName,
            ISNULL(CAST(p.PRO_CUSTO as float), 0) as costPrice,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as totalQty,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as totalRevenue,
            CAST(AVG(iv.ITE_VALOR) as float) as avgSalePrice,
            FORMAT(v.VEN_DATA_FIM, 'yyyy-MM') as referenceMonth
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2 ${monthFilter}
          GROUP BY p.PRODUTO, p.PRO_NOME, p.PRO_DESCRICAO, p.PRO_CUSTO, FORMAT(v.VEN_DATA_FIM, 'yyyy-MM')
          ORDER BY totalRevenue DESC
        `);
        await pool.close();
        return (res.recordset as Array<{productId:number;productName:string;costPrice:number;totalQty:number;totalRevenue:number;avgSalePrice:number;referenceMonth:string}>).map(r => {
          const costPrice = Number(r.costPrice);
          const totalRevenue = Number(r.totalRevenue);
          const totalQty = Number(r.totalQty);
          const totalCost = costPrice * totalQty;
          const grossProfit = totalRevenue - totalCost;
          const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
          return { productId: Number(r.productId), productName: r.productName, costPrice, avgSalePrice: Number(r.avgSalePrice), totalQty, totalRevenue, totalCost, grossProfit, margin: parseFloat(margin.toFixed(2)), referenceMonth: r.referenceMonth, fonte: "inove" as const };
        });
      } catch {
        return localCostVsSales();
      }
    }),

  // ── Relatório: Giro de Estoque Semanal INOVE (com fallback local) ────────────
  getWeeklyStockTurnoverInove: protectedProcedure
    .input(z.object({ weeksBack: z.number().min(2).max(12).default(6) }).optional())
    .query(async ({ input }) => {
      const weeksBack = input?.weeksBack ?? 6;
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      // Se conector inativo, usa dados locais via função existente
      if (!connRows.length || !connRows[0].active) {
        const { getWeeklyStockTurnoverReport } = await import("../db.reports");
        const result = await getWeeklyStockTurnoverReport(weeksBack);
        return { ...result, fonte: "local" as const };
      }
      const config = connRows[0];
      try {
        const pool = await createInovePool(config);
        // Buscar semanas de vendas por produto do INOVE
        const res = await pool.request().query(`
          SELECT
            p.PRODUTO as produtoId,
            ISNULL(p.PRO_DESCRICAO, 'Produto s/nome') as nome,
            ISNULL(CAST(p.PRO_CODIGO as nvarchar(50)), '') as codPdv,
            ISNULL(p.PRO_ESTOQUE, 0) as estoqueAtual,
            ISNULL(p.PRO_ESTOQUE_MINIMO, 0) as estoqueMinimo,
            FORMAT(
              DATEADD(day,
                1 - CASE
                  WHEN DATEPART(dw, CAST(v.VEN_DATA_FIM as date)) = 1 THEN 7
                  ELSE DATEPART(dw, CAST(v.VEN_DATA_FIM as date)) - 1
                END,
                CAST(v.VEN_DATA_FIM as date)
              ), 'yyyy-MM-dd'
            ) as semanaInicio,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtdVendida
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= CAST(DATEADD(week, -${weeksBack}, GETDATE()) as date)
          GROUP BY p.PRODUTO, p.PRO_DESCRICAO, p.PRO_CODIGO, p.PRO_ESTOQUE, p.PRO_ESTOQUE_MINIMO,
            DATEADD(day,
              1 - CASE
                WHEN DATEPART(dw, CAST(v.VEN_DATA_FIM as date)) = 1 THEN 7
                ELSE DATEPART(dw, CAST(v.VEN_DATA_FIM as date)) - 1
              END,
              CAST(v.VEN_DATA_FIM as date)
            )
          ORDER BY p.PRO_DESCRICAO, semanaInicio
        `);
        await pool.close();
        type WRow = { produtoId: number; nome: string; codPdv: string; estoqueAtual: number; estoqueMinimo: number; semanaInicio: string; qtdVendida: number };
        const rows = res.recordset as WRow[];
        // Agrupar por produto
        const prodMap = new Map<number, { produtoId: number; nome: string; codPdv: string; estoqueAtual: number; estoqueMinimo: number; semanas: Map<string, number> }>();
        for (const r of rows) {
          const id = Number(r.produtoId);
          if (!prodMap.has(id)) prodMap.set(id, { produtoId: id, nome: r.nome, codPdv: r.codPdv, estoqueAtual: Number(r.estoqueAtual), estoqueMinimo: Number(r.estoqueMinimo), semanas: new Map() });
          const prod = prodMap.get(id)!;
          prod.semanas.set(r.semanaInicio, (prod.semanas.get(r.semanaInicio) || 0) + Number(r.qtdVendida));
        }
        // Calcular semanas disponíveis
        const allWeeks = Array.from(new Set(rows.map(r => r.semanaInicio))).sort();
        const products2 = Array.from(prodMap.values()).map(p => {
          const weekSales = allWeeks.map(w => p.semanas.get(w) || 0);
          const avgPerWeek = weekSales.length > 0 ? weekSales.reduce((s, v) => s + v, 0) / weekSales.length : 0;
          const estoque = Math.max(0, p.estoqueAtual);
          const cobertura = avgPerWeek > 0 ? estoque / avgPerWeek : 99;
          const sugestao = Math.max(0, Math.ceil(avgPerWeek * 2) - estoque);
          const status = estoque <= 0 ? "zerado" : cobertura < 1 ? "critico" : cobertura < 2 ? "baixo" : "ok";
          return { ...p, weekSales, avgPerWeek: parseFloat(avgPerWeek.toFixed(1)), cobertura: parseFloat(cobertura.toFixed(1)), sugestao, status };
        }).sort((a, b) => a.cobertura - b.cobertura);
        return { products: products2, weeks: allWeeks, fonte: "inove" as const };
      } catch {
        const { getWeeklyStockTurnoverReport } = await import("../db.reports");
        const result = await getWeeklyStockTurnoverReport(weeksBack);
        return { ...result, fonte: "local" as const };
      }
    }),

  // ── Relatório: Vendas por Período INOVE (com fallback local) ─────────────────
  getSalesReportInove: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      async function localSalesReport() {
        const rows = await db!
          .select({
            referenceMonth: salesImports.referenceMonth,
            totalRevenue: sql<number>`SUM(${salesImportItems.totalPrice})`,
            totalQty: sql<number>`SUM(${salesImportItems.quantity})`,
            transactionCount: salesImports.totalTransactions,
            linkedItems: salesImports.linkedItems,
          })
          .from(salesImportItems)
          .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
          .where(and(
            eq(salesImports.status, "confirmed"),
            input.referenceMonth ? eq(salesImports.referenceMonth, input.referenceMonth) : undefined
          ))
          .groupBy(salesImports.referenceMonth, salesImports.totalTransactions, salesImports.linkedItems)
          .orderBy(desc(salesImports.referenceMonth));
        return { rows: rows.map(r => ({ referenceMonth: r.referenceMonth, totalRevenue: Number(r.totalRevenue)||0, totalQty: Number(r.totalQty)||0, transactionCount: Number(r.transactionCount)||0, linkedItems: Number(r.linkedItems)||0 })), fonte: "local" as const };
      }
      if (!connRows.length || !connRows[0].active) return localSalesReport();
      const config = connRows[0];
      try {
        const pool = await createInovePool(config);
        const monthFilter = input.referenceMonth
          ? `AND YEAR(v.VEN_DATA_FIM) = ${parseInt(input.referenceMonth.split('-')[0])} AND MONTH(v.VEN_DATA_FIM) = ${parseInt(input.referenceMonth.split('-')[1])}`
          : `AND v.VEN_DATA_FIM >= DATEADD(month, -6, GETDATE())`;
        const res = await pool.request().query(`
          SELECT
            FORMAT(v.VEN_DATA_FIM, 'yyyy-MM') as referenceMonth,
            CAST(SUM(v.VEN_TOTAL) as float) as totalRevenue,
            COUNT(DISTINCT v.VENDA) as transactionCount
          FROM VENDAS v
          WHERE v.VEN_SITUACAO = 2 ${monthFilter}
          GROUP BY FORMAT(v.VEN_DATA_FIM, 'yyyy-MM')
          ORDER BY referenceMonth DESC
        `);
        await pool.close();
        return { rows: (res.recordset as Array<{referenceMonth:string;totalRevenue:number;transactionCount:number}>).map(r => ({ referenceMonth: r.referenceMonth, totalRevenue: Number(r.totalRevenue), totalQty: 0, transactionCount: Number(r.transactionCount), linkedItems: 0 })), fonte: "inove" as const };
      } catch {
        return localSalesReport();
      }
    }),

  // ── Relatório: Painel Financeiro INOVE (faturamento, descontos, ticket médio, vendas diárias, formas de pagamento) ──
  getFinancialSummaryInove: protectedProcedure
    .input(z.object({
      from: z.string(), // 'YYYY-MM-DD'
      to: z.string(),   // 'YYYY-MM-DD'
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);

      // Fallback local: busca nas importações MySQL
      async function localFallback() {
        const { from, to } = input;
        const rows = await db!
          .select({
            totalRevenue: sql<number>`COALESCE(SUM(${salesImportItems.totalPrice}), 0)`,
            totalQty: sql<number>`COALESCE(SUM(${salesImportItems.quantity}), 0)`,
            count: sql<number>`COUNT(DISTINCT ${salesImports.id})`,
          })
          .from(salesImportItems)
          .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
          .where(and(
            eq(salesImports.status, "confirmed"),
            sql`${salesImports.referenceMonth} >= ${from.substring(0, 7)}`,
            sql`${salesImports.referenceMonth} <= ${to.substring(0, 7)}`
          ));
        const totalRevenue = Number(rows[0]?.totalRevenue) || 0;
        const count = Number(rows[0]?.count) || 0;
        return {
          totalRevenue,
          totalDiscount: 0,
          count,
          ticketMedio: count > 0 ? totalRevenue / count : 0,
          dailySales: [] as { date: string; total: number; count: number }[],
          byPayment: {} as Record<string, number>,
          topProducts: [] as { name: string; qty: number; revenue: number }[],
          fonte: "local" as const,
        };
      }

      if (!connRows.length || !connRows[0].active) return localFallback();
      const config = connRows[0];

      try {
        const pool = await createInovePool(config);
        const fromDate = input.from;
        const toDate = input.to;

        // 1. Resumo geral
        const summaryRes = await pool.request().query(`
          SELECT
            CAST(COALESCE(SUM(v.VEN_TOTAL), 0) as float) as totalRevenue,
            CAST(COALESCE(SUM(v.VEN_DESCONTO), 0) as float) as totalDiscount,
            COUNT(DISTINCT v.VENDA) as totalCount
          FROM VENDAS v
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= '${fromDate}'
            AND CAST(v.VEN_DATA_FIM as date) <= '${toDate}'
        `);
        const s = summaryRes.recordset[0] as { totalRevenue: number; totalDiscount: number; totalCount: number };
        const totalRevenue = Number(s?.totalRevenue) || 0;
        const totalDiscount = Number(s?.totalDiscount) || 0;
        const count = Number(s?.totalCount) || 0;

        // 2. Vendas diárias
        const dailyRes = await pool.request().query(`
          SELECT
            FORMAT(CAST(v.VEN_DATA_FIM as date), 'yyyy-MM-dd') as dia,
            CAST(SUM(v.VEN_TOTAL) as float) as total,
            COUNT(DISTINCT v.VENDA) as qtd
          FROM VENDAS v
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= '${fromDate}'
            AND CAST(v.VEN_DATA_FIM as date) <= '${toDate}'
          GROUP BY FORMAT(CAST(v.VEN_DATA_FIM as date), 'yyyy-MM-dd')
          ORDER BY dia
        `);
        type DRow = { dia: string; total: number; qtd: number };
        const dailySales = (dailyRes.recordset as DRow[]).map(r => ({
          date: r.dia,
          total: Number(r.total) || 0,
          count: Number(r.qtd) || 0,
        }));

        // 3. Por forma de pagamento
        const payRes = await pool.request().query(`
          SELECT
            ISNULL(fp.PAG_NOME, 'Outros') as formaPagamento,
            CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(fp.PAG_NOME, '')))) = 'DINHEIRO'
              THEN pv.PAG_VALOR - ISNULL(pv.PAG_DEVOLUCAO, 0)
              ELSE pv.PAG_VALOR END) as float) as total
          FROM PAGAMENTOS_VENDAS pv
          JOIN VENDAS v ON v.VENDA = pv.VENDA
          LEFT JOIN FORMAS_PAGAMENTOS fp ON fp.FORMA_PAGAMENTO = pv.FORMA_PAGAMENTO
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= '${fromDate}'
            AND CAST(v.VEN_DATA_FIM as date) <= '${toDate}'
          GROUP BY fp.PAG_NOME
          ORDER BY total DESC
        `);
        type PRow = { formaPagamento: string; total: number };
        const byPayment: Record<string, number> = {};
        for (const r of payRes.recordset as PRow[]) {
          byPayment[r.formaPagamento ?? "Outros"] = Number(r.total) || 0;
        }

        // 4. Top produtos
        const topRes = await pool.request().query(`
          SELECT TOP 10
            ISNULL(p.PRO_NOME, ISNULL(iv.ITE_NOME, 'Produto s/nome')) as nome,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qty,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as revenue
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          LEFT JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= '${fromDate}'
            AND CAST(v.VEN_DATA_FIM as date) <= '${toDate}'
          GROUP BY p.PRO_NOME, iv.ITE_NOME
          ORDER BY revenue DESC
        `);
        type TRow = { nome: string; qty: number; revenue: number };
        const topProducts = (topRes.recordset as TRow[]).map(r => ({
          name: r.nome ?? "Produto s/nome",
          qty: Number(r.qty) || 0,
          revenue: Number(r.revenue) || 0,
        }));

        await pool.close();

        return {
          totalRevenue,
          totalDiscount,
          count,
          ticketMedio: count > 0 ? totalRevenue / count : 0,
          dailySales,
          byPayment,
          topProducts,
          fonte: "inove" as const,
        };
      } catch {
        return localFallback();
      }
    }),

  // ── Comparativo de Vendas: Mês Atual vs Mês Anterior (INOVE) ────────────────────────────────────
  getCashflowComparativo: protectedProcedure.query(async () => {
    const now = new Date();
    // Mês atual
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const curFrom = `${curYear}-${String(curMonth).padStart(2, '0')}-01`;
    const curDays = new Date(curYear, curMonth, 0).getDate();
    const curTo = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(curDays).padStart(2, '0')}`;
    // Mês anterior
    const prevDate = new Date(curYear, curMonth - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;
    const prevFrom = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const prevDays = new Date(prevYear, prevMonth, 0).getDate();
    const prevTo = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevDays).padStart(2, '0')}`;

    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const connRows = await db.select().from(inoveConnectorConfig).limit(1);

    // Helper: busca resumo mensal de vendas no INOVE
    async function fetchMonthSummary(pool: any, fromDate: string, toDate: string) {
      const res = await pool.request().query(`
        SELECT
          CAST(COALESCE(SUM(v.VEN_TOTAL), 0) as float) as totalRevenue,
          CAST(COALESCE(SUM(v.VEN_DESCONTO), 0) as float) as totalDiscount,
          COUNT(DISTINCT v.VENDA) as totalCount,
          CAST(COALESCE(AVG(v.VEN_TOTAL), 0) as float) as ticketMedio
        FROM VENDAS v
        WHERE v.VEN_SITUACAO = 2
          AND CAST(v.VEN_DATA_FIM as date) >= '${fromDate}'
          AND CAST(v.VEN_DATA_FIM as date) <= '${toDate}'
      `);
      const r = res.recordset[0] as any;
      return {
        totalRevenue: Number(r?.totalRevenue) || 0,
        totalDiscount: Number(r?.totalDiscount) || 0,
        totalCount: Number(r?.totalCount) || 0,
        ticketMedio: Number(r?.ticketMedio) || 0,
      };
    }

    // Helper: busca vendas diárias no INOVE
    async function fetchDailySales(pool: any, fromDate: string, toDate: string) {
      const res = await pool.request().query(`
        SELECT
          FORMAT(CAST(v.VEN_DATA_FIM as date), 'yyyy-MM-dd') as dia,
          CAST(SUM(v.VEN_TOTAL) as float) as total,
          COUNT(DISTINCT v.VENDA) as qtd
        FROM VENDAS v
        WHERE v.VEN_SITUACAO = 2
          AND CAST(v.VEN_DATA_FIM as date) >= '${fromDate}'
          AND CAST(v.VEN_DATA_FIM as date) <= '${toDate}'
        GROUP BY FORMAT(CAST(v.VEN_DATA_FIM as date), 'yyyy-MM-dd')
        ORDER BY dia
      `);
      return (res.recordset as any[]).map((r: any) => ({
        date: r.dia as string,
        total: Number(r.total) || 0,
        count: Number(r.qtd) || 0,
      }));
    }

    // Fallback local (MySQL)
    async function localMonthSummary(fromYM: string, toYM: string) {
      const rows = await db!.select({
        totalRevenue: sql<number>`COALESCE(SUM(${salesImportItems.totalPrice}), 0)`,
        totalCount: sql<number>`COUNT(DISTINCT ${salesImports.id})`,
      })
        .from(salesImportItems)
        .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
        .where(and(
          eq(salesImports.status, 'confirmed'),
          sql`${salesImports.referenceMonth} >= ${fromYM}`,
          sql`${salesImports.referenceMonth} <= ${toYM}`,
        ));
      const totalRevenue = Number(rows[0]?.totalRevenue) || 0;
      const totalCount = Number(rows[0]?.totalCount) || 0;
      return { totalRevenue, totalDiscount: 0, totalCount, ticketMedio: totalCount > 0 ? totalRevenue / totalCount : 0 };
    }

    const curMonthLabel = new Date(curYear, curMonth - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const prevMonthLabel = new Date(prevYear, prevMonth - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    if (!connRows.length || !connRows[0].active) {
      const [cur, prev] = await Promise.all([
        localMonthSummary(curFrom.substring(0, 7), curTo.substring(0, 7)),
        localMonthSummary(prevFrom.substring(0, 7), prevTo.substring(0, 7)),
      ]);
      const varPct = prev.totalRevenue > 0 ? ((cur.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100 : null;
      return { current: { ...cur, label: curMonthLabel, from: curFrom, to: curTo }, previous: { ...prev, label: prevMonthLabel, from: prevFrom, to: prevTo }, variationPct: varPct, dailyCurrent: [], fonte: 'local' as const };
    }

    try {
      const pool = await createInovePool(connRows[0]);
      const [cur, prev, dailyCurrent] = await Promise.all([
        fetchMonthSummary(pool, curFrom, curTo),
        fetchMonthSummary(pool, prevFrom, prevTo),
        fetchDailySales(pool, curFrom, curTo),
      ]);
      const varPct = prev.totalRevenue > 0 ? ((cur.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100 : null;
      return {
        current: { ...cur, label: curMonthLabel, from: curFrom, to: curTo },
        previous: { ...prev, label: prevMonthLabel, from: prevFrom, to: prevTo },
        variationPct: varPct,
        dailyCurrent,
        fonte: 'inove' as const,
      };
    } catch {
      const [cur, prev] = await Promise.all([
        localMonthSummary(curFrom.substring(0, 7), curTo.substring(0, 7)),
        localMonthSummary(prevFrom.substring(0, 7), prevTo.substring(0, 7)),
      ]);
      const varPct = prev.totalRevenue > 0 ? ((cur.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100 : null;
      return { current: { ...cur, label: curMonthLabel, from: curFrom, to: curTo }, previous: { ...prev, label: prevMonthLabel, from: prevFrom, to: prevTo }, variationPct: varPct, dailyCurrent: [], fonte: 'local' as const };
    }
  }),

  // ── Comparativo Anual: todos os meses de anoAtual vs anoAnterior ──────────
  getComparativoAnual: protectedProcedure
    .input(z.object({ year: z.number().optional() }))
    .query(async ({ input }) => {
      const now = new Date();
      const anoAtual = input.year ?? now.getFullYear();
      const anoAnterior = anoAtual - 1;

      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);

      const MESES = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
      ];

      // Helper: busca resumo mensal de vendas no INOVE para um mês específico
      async function fetchMes(pool: any, year: number, month: number) {
        const from = `${year}-${String(month).padStart(2, '0')}-01`;
        const days = new Date(year, month, 0).getDate();
        const to = `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
        const res = await pool.request().query(`
          SELECT
            CAST(COALESCE(SUM(v.VEN_TOTAL), 0) as float) as totalRevenue,
            CAST(COALESCE(SUM(v.VEN_DESCONTO), 0) as float) as totalDiscount,
            COUNT(DISTINCT v.VENDA) as totalCount,
            CAST(COALESCE(AVG(v.VEN_TOTAL), 0) as float) as ticketMedio
          FROM VENDAS v
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= '${from}'
            AND CAST(v.VEN_DATA_FIM as date) <= '${to}'
        `);
        const r = res.recordset[0] as any;
        return {
          totalRevenue: Number(r?.totalRevenue) || 0,
          totalDiscount: Number(r?.totalDiscount) || 0,
          totalCount: Number(r?.totalCount) || 0,
          ticketMedio: Number(r?.ticketMedio) || 0,
        };
      }

      // Fallback local (MySQL) para um mês específico
      async function localMes(year: number, month: number) {
        const ym = `${year}-${String(month).padStart(2, '0')}`;
        const rows = await db!.select({
          totalRevenue: sql<number>`COALESCE(SUM(${salesImportItems.totalPrice}), 0)`,
          totalCount: sql<number>`COUNT(DISTINCT ${salesImports.id})`,
        })
          .from(salesImportItems)
          .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
          .where(and(
            eq(salesImports.status, 'confirmed'),
            sql`${salesImports.referenceMonth} = ${ym}`,
          ));
        const totalRevenue = Number(rows[0]?.totalRevenue) || 0;
        const totalCount = Number(rows[0]?.totalCount) || 0;
        return { totalRevenue, totalDiscount: 0, totalCount, ticketMedio: totalCount > 0 ? totalRevenue / totalCount : 0 };
      }

      // Determina até qual mês buscar (não buscar meses futuros do ano atual)
      const maxMonth = anoAtual === now.getFullYear() ? now.getMonth() + 1 : 12;

      if (!connRows.length || !connRows[0].active) {
        // Fallback local
        const meses = await Promise.all(
          Array.from({ length: 12 }, async (_, i) => {
            const m = i + 1;
            const [atual, anterior] = await Promise.all([localMes(anoAtual, m), localMes(anoAnterior, m)]);
            const varPct = anterior.totalRevenue > 0 ? ((atual.totalRevenue - anterior.totalRevenue) / anterior.totalRevenue) * 100 : null;
            return {
              mes: m,
              label: MESES[i],
              atual,
              anterior,
              variationPct: varPct,
              isFuture: m > maxMonth,
            };
          })
        );
        const totalAtual = meses.reduce((s, m) => s + (m.isFuture ? 0 : m.atual.totalRevenue), 0);
        const totalAnterior = meses.reduce((s, m) => s + m.anterior.totalRevenue, 0);
        const totalVarPct = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : null;
        return { meses, anoAtual, anoAnterior, totalAtual, totalAnterior, totalVarPct, fonte: 'local' as const };
      }

      try {
        const pool = await createInovePool(connRows[0]);
        const meses = await Promise.all(
          Array.from({ length: 12 }, async (_, i) => {
            const m = i + 1;
            const [atual, anterior] = await Promise.all([fetchMes(pool, anoAtual, m), fetchMes(pool, anoAnterior, m)]);
            const varPct = anterior.totalRevenue > 0 ? ((atual.totalRevenue - anterior.totalRevenue) / anterior.totalRevenue) * 100 : null;
            return {
              mes: m,
              label: MESES[i],
              atual,
              anterior,
              variationPct: varPct,
              isFuture: m > maxMonth,
            };
          })
        );
        const totalAtual = meses.reduce((s, m) => s + (m.isFuture ? 0 : m.atual.totalRevenue), 0);
        const totalAnterior = meses.reduce((s, m) => s + m.anterior.totalRevenue, 0);
        const totalVarPct = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : null;
        return { meses, anoAtual, anoAnterior, totalAtual, totalAnterior, totalVarPct, fonte: 'inove' as const };
      } catch (err: unknown) {
        console.error('[getComparativoAnual] INOVE error, falling back to local:', err instanceof Error ? err.message : String(err));
        const meses = await Promise.all(
          Array.from({ length: 12 }, async (_, i) => {
            const m = i + 1;
            const [atual, anterior] = await Promise.all([localMes(anoAtual, m), localMes(anoAnterior, m)]);
            const varPct = anterior.totalRevenue > 0 ? ((atual.totalRevenue - anterior.totalRevenue) / anterior.totalRevenue) * 100 : null;
            return { mes: m, label: MESES[i], atual, anterior, variationPct: varPct, isFuture: m > maxMonth };
          })
        );
        const totalAtual = meses.reduce((s, m) => s + (m.isFuture ? 0 : m.atual.totalRevenue), 0);
        const totalAnterior = meses.reduce((s, m) => s + m.anterior.totalRevenue, 0);
        const totalVarPct = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : null;
        return { meses, anoAtual, anoAnterior, totalAtual, totalAnterior, totalVarPct, fonte: 'local' as const };
      }
    }),

  // ── Sugestão de Compras ────────────────────────────────────────────────────
  getSugestaoCompras: protectedProcedure
    .input(z.object({
      diasAnalise: z.number().int().min(7).max(30).default(7),
      diasProjecao: z.number().int().min(7).max(30).default(7),
      fatorSeguranca: z.number().min(0).max(1).default(0.2), // 20% extra de segurança
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      if (connRows.length === 0 || !connRows[0].active) {
        throw new Error('Conector INOVE inativo. Configure e ative o conector INOVE nas configurações.');
      }
      const config = connRows[0];

      // Buscar estoque local do MySQL
      const { products } = await import('../../drizzle/schema');
      const localProducts = await db.select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        currentStock: products.currentStock,
        minStock: products.minStock,
        unit: products.unit,
        costPrice: products.costPrice,
      }).from(products).where(eq(products.active, true));

      const pool = await createInovePool(config);
      try {
        // Query única: vendas + estoque atual do INOVE + custo do produto
        const vendasRes = await pool.request().query(`
          SELECT
            p.PRODUTO as produtoId,
            p.PRO_NOME as nome,
            p.PRO_CODIGO as codPdv,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtdTotal,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as faturamentoTotal,
            COUNT(DISTINCT CAST(v.VEN_DATA_FIM as date)) as diasComVenda,
            CAST(ISNULL(
              (SELECT TOP 1 MVE_SALDO_ATUAL FROM MOVIMENTOS_ESTOQUES
               WHERE PRODUTO = p.PRODUTO ORDER BY MOVIMENTO_ESTOQUE DESC), 0
            ) as float) as estoqueAtual,
            CAST(ISNULL(p.PRO_CUSTO, 0) as float) as custoProduto,
            ISNULL(g.GRU_NOME, 'Sem Grupo') as grupoNome
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          LEFT JOIN GRUPOS_DE_PRODUTOS g ON g.GRUPO_DE_PRODUTOS = p.GRUPO_DE_PRODUTOS
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= CAST(DATEADD(day, -${input.diasAnalise}, GETDATE()) as date)
            AND CAST(v.VEN_DATA_FIM as date) < CAST(GETDATE() as date)
          GROUP BY p.PRODUTO, p.PRO_NOME, p.PRO_CODIGO, p.PRO_CUSTO, g.GRU_NOME
          ORDER BY qtdTotal DESC
        `);

        // Período de análise (datas de início e fim)
        const periodoRes = await pool.request().query(`
          SELECT
            FORMAT(CAST(DATEADD(day, -${input.diasAnalise}, GETDATE()) as date), 'yyyy-MM-dd') as dataInicio,
            FORMAT(CAST(DATEADD(day, -1, GETDATE()) as date), 'yyyy-MM-dd') as dataFim
        `);

        await pool.close();

        type VendaRow = { produtoId: number; nome: string; codPdv: string; qtdTotal: number; faturamentoTotal: number; diasComVenda: number; estoqueAtual: number; custoProduto: number; grupoNome: string };
        const vendas = vendasRes.recordset as VendaRow[];
        const periodo = periodoRes.recordset[0] as { dataInicio: string; dataFim: string };

        // Criar mapa de produtos locais por nome para buscar estoque mínimo
        const localMap = new Map<string, typeof localProducts[0]>();
        for (const lp of localProducts) {
          if (lp.name) localMap.set(lp.name.toLowerCase().trim(), lp);
          if (lp.sku) localMap.set(lp.sku.toLowerCase().trim(), lp);
          if (lp.barcode) localMap.set(lp.barcode.toLowerCase().trim(), lp);
        }

        // Calcular sugestão de compra para cada produto
        const sugestoes = vendas.map(v => {
          const mediaDiaria = v.qtdTotal / input.diasAnalise;
          const necessidadeProjecao = mediaDiaria * input.diasProjecao;
          const necessidadeComSeguranca = necessidadeProjecao * (1 + input.fatorSeguranca);

          // Estoque real vem do INOVE diretamente
          const estoqueAtual = Number(v.estoqueAtual);
          // Custo do produto vem do INOVE; se zero, tenta o local
          const nomeLower = (v.nome || '').toLowerCase().trim();
          const produtoLocal = localMap.get(nomeLower) ||
            localProducts.find(lp => lp.name && nomeLower.includes(lp.name.toLowerCase().trim().substring(0, 6))) ||
            null;
          const estoqueMinimo = produtoLocal ? produtoLocal.minStock : null;
          const custoProduto = Number(v.custoProduto) > 0
            ? Number(v.custoProduto)
            : (produtoLocal ? Number(produtoLocal.costPrice) : null);

          const sugestaoQtd = Math.max(0, Math.ceil(necessidadeComSeguranca - estoqueAtual));

          const prioridade: 'alta' | 'media' | 'baixa' =
            estoqueAtual <= 0 ? 'alta' :
            estoqueMinimo !== null && estoqueAtual <= estoqueMinimo ? 'alta' :
            sugestaoQtd > 0 ? 'media' : 'baixa';

          return {
            produtoId: Number(v.produtoId),
            nome: v.nome,
            codPdv: v.codPdv,
            grupoNome: v.grupoNome ?? 'Sem Grupo',
            qtdVendidaSemana: Number(v.qtdTotal),
            diasComVenda: Number(v.diasComVenda),
            mediaDiaria: Math.round(mediaDiaria * 100) / 100,
            necessidadeProjecao: Math.ceil(necessidadeProjecao),
            necessidadeComSeguranca: Math.ceil(necessidadeComSeguranca),
            estoqueAtual,
            estoqueMinimo,
            sugestaoCompra: sugestaoQtd,
            custoProduto,
            custoTotal: custoProduto !== null ? Math.round(sugestaoQtd * custoProduto * 100) / 100 : null,
            prioridade,
            produtoLocalId: produtoLocal?.id ?? null,
          };
        });

        // Ordenar por prioridade e depois por quantidade sugerida
        const ordemPrioridade = { alta: 0, media: 1, baixa: 2 };
        sugestoes.sort((a, b) => {
          const pa = ordemPrioridade[a.prioridade];
          const pb = ordemPrioridade[b.prioridade];
          if (pa !== pb) return pa - pb;
          return b.sugestaoCompra - a.sugestaoCompra;
        });

        const totalCustoEstimado = sugestoes.reduce((s, x) => s + (x.custoTotal ?? 0), 0);
        const totalItensParaComprar = sugestoes.filter(x => x.sugestaoCompra > 0).length;

        return {
          sugestoes,
          periodo,
          diasAnalise: input.diasAnalise,
          diasProjecao: input.diasProjecao,
          fatorSeguranca: input.fatorSeguranca,
          totalCustoEstimado,
          totalItensParaComprar,
          totalProdutosAnalisados: vendas.length,
        };
      } catch (err) {
        await pool.close().catch(() => {});
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }),

  // ── Planejamento Inteligente de Compras com IA ────────────────────────────
  getSmartPurchasePlan: protectedProcedure
    .input(z.object({
      diasAnalise: z.number().int().min(7).max(30).default(7),
      diasProjecao: z.number().int().min(7).max(14).default(7),
      fatorSeguranca: z.number().min(0).max(1).default(0.2),
      orcamentoTotal: z.number().min(0).optional(), // orçamento máximo em R$
      filtroCategoria: z.string().optional(), // ex: 'picole', 'pote', 'acai'
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      if (connRows.length === 0 || !connRows[0].active) {
        throw new Error('Conector INOVE inativo.');
      }
      const config = connRows[0];
      const pool = await createInovePool(config);

      try {
        // Query 1: Vendas da semana (diasAnalise) por produto com estoque e custo
        const vendasSemanaRes = await pool.request().query(`
          SELECT
            p.PRODUTO as produtoId,
            p.PRO_NOME as nome,
            p.PRO_CODIGO as codPdv,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtdSemana,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as faturamentoSemana,
            COUNT(DISTINCT CAST(v.VEN_DATA_FIM as date)) as diasComVenda,
            CAST(ISNULL(p.PRO_CUSTO, 0) as float) as custoProduto,
            CAST(ISNULL(
              (SELECT TOP 1 MVE_SALDO_ATUAL FROM MOVIMENTOS_ESTOQUES
               WHERE PRODUTO = p.PRODUTO ORDER BY MOVIMENTO_ESTOQUE DESC), 0
            ) as float) as estoqueAtual
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= CAST(DATEADD(day, -${input.diasAnalise}, GETDATE()) as date)
            AND CAST(v.VEN_DATA_FIM as date) < CAST(GETDATE() as date)
          GROUP BY p.PRODUTO, p.PRO_NOME, p.PRO_CODIGO, p.PRO_CUSTO
          ORDER BY qtdSemana DESC
        `);

        // Query 2: Vendas do mês atual para contexto
        const vendasMesRes = await pool.request().query(`
          SELECT
            p.PRODUTO as produtoId,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as qtdMes,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as faturamentoMes
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= CAST(DATEADD(day, -30, GETDATE()) as date)
            AND CAST(v.VEN_DATA_FIM as date) < CAST(GETDATE() as date)
          GROUP BY p.PRODUTO
        `);

        // Query 3: Período
        const periodoRes = await pool.request().query(`
          SELECT
            FORMAT(CAST(DATEADD(day, -${input.diasAnalise}, GETDATE()) as date), 'dd/MM/yyyy') as dataInicio,
            FORMAT(CAST(DATEADD(day, -1, GETDATE()) as date), 'dd/MM/yyyy') as dataFim,
            FORMAT(GETDATE(), 'dd/MM/yyyy') as hoje
        `);

        await pool.close();

        type VendaRow = { produtoId: number; nome: string; codPdv: string; qtdSemana: number; faturamentoSemana: number; diasComVenda: number; custoProduto: number; estoqueAtual: number };
        type MesRow = { produtoId: number; qtdMes: number; faturamentoMes: number };

        const vendas = vendasSemanaRes.recordset as VendaRow[];
        const vendasMesMap = new Map<number, MesRow>();
        for (const m of vendasMesRes.recordset as MesRow[]) {
          vendasMesMap.set(Number(m.produtoId), m);
        }
        const periodo = periodoRes.recordset[0] as { dataInicio: string; dataFim: string; hoje: string };

        // Calcular sugestão de compra para cada produto
        const itens = vendas.map(v => {
          const mediaDiaria = Number(v.qtdSemana) / input.diasAnalise;
          const necessidade = mediaDiaria * input.diasProjecao;
          const necessidadeComSeguranca = necessidade * (1 + input.fatorSeguranca);
          const estoqueAtual = Number(v.estoqueAtual);
          const custoProduto = Number(v.custoProduto);
          const sugestaoQtd = Math.max(0, Math.ceil(necessidadeComSeguranca - estoqueAtual));
          const custoTotal = custoProduto > 0 ? Math.round(sugestaoQtd * custoProduto * 100) / 100 : 0;
          const mesData = vendasMesMap.get(Number(v.produtoId));
          const qtdMes = mesData ? Number(mesData.qtdMes) : 0;
          const faturamentoMes = mesData ? Number(mesData.faturamentoMes) : 0;

          const prioridade: 'alta' | 'media' | 'baixa' =
            estoqueAtual <= 0 ? 'alta' :
            sugestaoQtd > 0 && estoqueAtual < necessidade ? 'alta' :
            sugestaoQtd > 0 ? 'media' : 'baixa';

          return {
            produtoId: Number(v.produtoId),
            nome: v.nome,
            codPdv: v.codPdv,
            qtdSemana: Number(v.qtdSemana),
            qtdMes,
            faturamentoSemana: Number(v.faturamentoSemana),
            faturamentoMes,
            diasComVenda: Number(v.diasComVenda),
            mediaDiaria: Math.round(mediaDiaria * 100) / 100,
            necessidade: Math.ceil(necessidade),
            necessidadeComSeguranca: Math.ceil(necessidadeComSeguranca),
            estoqueAtual,
            custoProduto,
            sugestaoQtd,
            custoTotal,
            custoTotalAjustado: custoTotal, // editável pelo usuário
            qtdAjustada: sugestaoQtd, // editável pelo usuário
            prioridade,
            selecionado: sugestaoQtd > 0, // pré-selecionados os que precisam comprar
          };
        });

        // Ordenar: alta prioridade primeiro, depois por custo total desc
        const ordem = { alta: 0, media: 1, baixa: 2 };
        itens.sort((a, b) => {
          if (ordem[a.prioridade] !== ordem[b.prioridade]) return ordem[a.prioridade] - ordem[b.prioridade];
          return b.custoTotal - a.custoTotal;
        });

        const totalCustoEstimado = itens.reduce((s, x) => s + x.custoTotal, 0);
        const totalItensParaComprar = itens.filter(x => x.sugestaoQtd > 0).length;

        // ── Análise da IA ──────────────────────────────────────────────────────
        // Preparar resumo para a IA (top 20 produtos com maior necessidade)
        const top20 = itens.slice(0, 20);
        const resumoParaIA = top20.map(x =>
          `${x.nome}: vendeu ${x.qtdSemana}un/semana (${x.qtdMes}un/mês), estoque=${x.estoqueAtual}un, custo=R$${x.custoProduto.toFixed(2)}, sugestão=${x.sugestaoQtd}un (R$${x.custoTotal.toFixed(2)}), prioridade=${x.prioridade}`
        ).join('\n');

        const orcamentoInfo = input.orcamentoTotal
          ? `Orçamento total disponível: R$ ${input.orcamentoTotal.toFixed(2)}. Custo estimado total: R$ ${totalCustoEstimado.toFixed(2)}.`
          : `Custo estimado total da compra: R$ ${totalCustoEstimado.toFixed(2)}.`;

        let analiseIA = '';
        try {
          const llmResp = await invokeLLM({
            messages: [
              {
                role: 'system',
                content: `Você é um assistente especialista em gestão de estoque para sorveteria. Analise os dados de vendas e estoque e forneça recomendações práticas e objetivas em português. Seja direto e útil. Máximo 5 pontos principais.`
              },
              {
                role: 'user',
                content: `Analise o planejamento de compras da Sorveteria Duo Gelatto para a próxima semana (${input.diasProjecao} dias):\n\nPeríodo analisado: ${periodo.dataInicio} a ${periodo.dataFim}\n${orcamentoInfo}\n\nTop 20 produtos por necessidade:\n${resumoParaIA}\n\nForneça:\n1. Avaliação geral do plano de compras\n2. Produtos críticos que NÃO podem faltar\n3. Produtos que podem ter quantidade reduzida para economizar\n4. Alerta sobre produtos com estoque negativo ou zerado\n5. Sugestão de priorização se o orçamento for insuficiente`
              }
            ]
          });
          const rawContent = llmResp?.choices?.[0]?.message?.content;
          analiseIA = typeof rawContent === 'string' ? rawContent : (Array.isArray(rawContent) ? rawContent.map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '').join('') : '');
        } catch {
          analiseIA = 'Análise de IA temporariamente indisponível.';
        }

        return {
          itens,
          periodo,
          diasAnalise: input.diasAnalise,
          diasProjecao: input.diasProjecao,
          fatorSeguranca: input.fatorSeguranca,
          totalCustoEstimado: Math.round(totalCustoEstimado * 100) / 100,
          totalItensParaComprar,
          totalProdutosAnalisados: itens.length,
          analiseIA,
          orcamentoTotal: input.orcamentoTotal ?? null,
        };
      } catch (err) {
        await pool.close().catch(() => {});
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }),

  // ── Configuração de produtos para planejamento de compras ─────────────────
  getPurchaseProductConfigs: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const configs = await db.select().from(purchaseProductConfig).orderBy(purchaseProductConfig.nomeProduto);
    return configs;
  }),

  upsertPurchaseProductConfig: protectedProcedure
    .input(z.object({
      produtoId: z.number().int(),
      nomeProduto: z.string().min(1),
      ignorar: z.boolean().default(false),
      motivoIgnorar: z.string().optional(),
      unidadeCompra: z.string().optional(),
      fatorConversao: z.number().optional(),
      qtdMinimaEstoque: z.number().optional(),
      qtdLoteCompra: z.number().optional(),
      observacao: z.string().optional(),
      purchaseCategory: z.enum(["sorvete", "guloseimas", "outros"]).default("sorvete"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const existing = await db.select({ id: purchaseProductConfig.id })
        .from(purchaseProductConfig)
        .where(eq(purchaseProductConfig.produtoId, input.produtoId))
        .limit(1);
      if (existing.length > 0) {
        await db.update(purchaseProductConfig)
          .set({
            nomeProduto: input.nomeProduto,
            ignorar: input.ignorar,
            motivoIgnorar: input.motivoIgnorar ?? null,
            unidadeCompra: input.unidadeCompra ?? null,
            fatorConversao: input.fatorConversao?.toString() ?? null,
            qtdMinimaEstoque: input.qtdMinimaEstoque?.toString() ?? null,
            qtdLoteCompra: input.qtdLoteCompra?.toString() ?? null,
            observacao: input.observacao ?? null,
            purchaseCategory: input.purchaseCategory,
            updatedAt: new Date(),
          })
          .where(eq(purchaseProductConfig.produtoId, input.produtoId));
      } else {
        await db.insert(purchaseProductConfig).values({
          produtoId: input.produtoId,
          nomeProduto: input.nomeProduto,
          ignorar: input.ignorar,
          motivoIgnorar: input.motivoIgnorar ?? null,
          unidadeCompra: input.unidadeCompra ?? null,
          fatorConversao: input.fatorConversao?.toString() ?? null,
          qtdMinimaEstoque: input.qtdMinimaEstoque?.toString() ?? null,
          qtdLoteCompra: input.qtdLoteCompra?.toString() ?? null,
          observacao: input.observacao ?? null,
          purchaseCategory: input.purchaseCategory,
        });
      }
      return { success: true };
    }),

  deletePurchaseProductConfig: protectedProcedure
    .input(z.object({ produtoId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.delete(purchaseProductConfig).where(eq(purchaseProductConfig.produtoId, input.produtoId));
      return { success: true };
    }),

  // ── Vendas por Período (INOVE direto) ─────────────────────────────────────────────
  getSalesByPeriodInove: protectedProcedure
    .input(z.object({
      from: z.string(), // 'YYYY-MM-DD'
      to: z.string(),   // 'YYYY-MM-DD'
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      if (!connRows.length || !connRows[0].active) {
        throw new Error('Conector INOVE inativo. Configure e ative o conector INOVE nas configurações.');
      }
      const config = connRows[0];
      const pool = await createInovePool(config);
      const fromDate = input.from;
      const toDate = input.to;

      try {
        // Itens vendidos no período com custo e grupo
        const itensRes = await pool.request().query(`
          SELECT
            p.PRODUTO as produtoId,
            p.PRO_NOME as nome,
            p.PRO_CODIGO as codPdv,
            ISNULL(g.GRU_NOME, 'Sem Grupo') as grupoNome,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as totalQty,
            CAST(SUM(iv.ITE_VALOR) as float) as precoMedio,
            CAST(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE) as float) as totalRevenue,
            CAST(ISNULL(p.PRO_CUSTO, 0) as float) as custoProduto
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          LEFT JOIN GRUPOS_DE_PRODUTOS g ON g.GRUPO_DE_PRODUTOS = p.GRUPO_DE_PRODUTOS
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= '${fromDate}'
            AND CAST(v.VEN_DATA_FIM as date) <= '${toDate}'
          GROUP BY p.PRODUTO, p.PRO_NOME, p.PRO_CODIGO, p.PRO_CUSTO, g.GRU_NOME
          ORDER BY totalRevenue DESC
        `);

        // Resumo geral do período
        const resumoRes = await pool.request().query(`
          SELECT
            CAST(COALESCE(SUM(iv.ITE_VALOR * iv.ITE_QUANTIDADE), 0) as float) as totalRevenue,
            CAST(COALESCE(SUM(iv.ITE_QUANTIDADE), 0) as float) as totalQty,
            COUNT(DISTINCT v.VENDA) as totalVendas
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          WHERE v.VEN_SITUACAO = 2
            AND CAST(v.VEN_DATA_FIM as date) >= '${fromDate}'
            AND CAST(v.VEN_DATA_FIM as date) <= '${toDate}'
        `);

        await pool.close();

        type ItemRow = { produtoId: number; nome: string; codPdv: string; grupoNome: string; totalQty: number; precoMedio: number; totalRevenue: number; custoProduto: number };
        const itens = (itensRes.recordset as ItemRow[]).map(r => {
          const qty = Number(r.totalQty);
          const revenue = Number(r.totalRevenue);
          const custo = Number(r.custoProduto);
          const custoTotal = custo > 0 ? Math.round(qty * custo * 100) / 100 : null;
          const margem = custoTotal !== null && revenue > 0 ? Math.round(((revenue - custoTotal) / revenue) * 10000) / 100 : null;
          return {
            produtoId: Number(r.produtoId),
            nome: r.nome,
            codPdv: r.codPdv,
            grupoNome: r.grupoNome ?? 'Sem Grupo',
            totalQty: qty,
            precoMedio: qty > 0 ? Math.round((revenue / qty) * 100) / 100 : 0,
            totalRevenue: Math.round(revenue * 100) / 100,
            custoProduto: custo > 0 ? custo : null,
            custoTotal,
            margemBruta: margem,
          };
        });

        const resumo = resumoRes.recordset[0] as { totalRevenue: number; totalQty: number; totalVendas: number };
        const totalRevenue = Math.round(Number(resumo?.totalRevenue) * 100) / 100;
        const totalQty = Number(resumo?.totalQty);
        const totalVendas = Number(resumo?.totalVendas);
        const totalCusto = itens.reduce((s, x) => s + (x.custoTotal ?? 0), 0);
        const margemGeral = totalRevenue > 0 ? Math.round(((totalRevenue - totalCusto) / totalRevenue) * 10000) / 100 : 0;

        return {
          itens,
          resumo: { totalRevenue, totalQty, totalVendas, totalCusto: Math.round(totalCusto * 100) / 100, margemGeral },
          periodo: { from: fromDate, to: toDate },
          fonte: 'inove' as const,
        };
      } catch (err) {
        await pool.close().catch(() => {});
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }),

  // ── Conciliação Bancária: cruzar lançamentos do banco com vendas INOVE ────────
  reconcileWithBank: protectedProcedure
    .input(z.object({
      dateFrom: z.string(), // YYYY-MM-DD
      dateTo: z.string(),   // YYYY-MM-DD
      tolerance: z.number().min(0).max(100).default(5), // % de tolerância na diferença de valor
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // 1. Buscar lançamentos bancários do período (apenas créditos)
      const { finBankStatements } = await import("../../drizzle/schema");
      const { gte, lte, and: drizzleAnd, eq: drizzleEq } = await import("drizzle-orm");
      const dateFromTs = new Date(input.dateFrom + "T00:00:00");
      const dateToTs = new Date(input.dateTo + "T23:59:59");

      const bankEntries = await db
        .select()
        .from(finBankStatements)
        .where(
          drizzleAnd(
            drizzleEq(finBankStatements.userId, ctx.user.id),
            gte(finBankStatements.date, dateFromTs),
            lte(finBankStatements.date, dateToTs)
          )
        )
        .orderBy(finBankStatements.date);

      // 2. Buscar vendas do INOVE agrupadas por dia
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) {
        // Agrupar por dia mesmo sem INOVE
        const byDay: Record<string, typeof bankEntries> = {};
        for (const e of bankEntries) {
          const dia = e.date instanceof Date ? e.date.toISOString().split("T")[0] : String(e.date).split("T")[0];
          if (!dia) continue;
          if (!byDay[dia]) byDay[dia] = [];
          byDay[dia].push(e);
        }
        const items = Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b)).map(([dia, entries]) => ({
          dia,
          bankTotal: entries.filter(e => e.type === "credit").reduce((s, e) => s + Number(e.amount), 0),
          bankEntries: entries.map(e => ({ id: e.id, description: e.description, amount: Number(e.amount), type: e.type, paymentMethod: e.paymentMethod ?? null })),
          inoveSales: null,
          status: "sem_inove" as const,
          diff: null,
        }));
        return {
          items,
          summary: { total: items.length, conciliado: 0, divergente: 0, sem_venda: 0, sem_inove: items.length },
        };
      }

      const config = rows[0];
      let inoveSalesByDay: Record<string, { total: number; qtd: number; vendas: number }> = {};

      try {
        const pool = await createInovePool(config);
        const result = await pool.request().query(`
          SELECT
            CONVERT(varchar(10), v.VEN_DATA_FIM, 23) as dia,
            COUNT(v.VENDA) as qtdVendas,
            CAST(SUM(v.VEN_TOTAL) as float) as totalVendas
          FROM VENDAS v
          WHERE v.VEN_SITUACAO = 2
            AND v.VEN_DATA_FIM >= '${input.dateFrom}'
            AND v.VEN_DATA_FIM <= '${input.dateTo} 23:59:59'
          GROUP BY CONVERT(varchar(10), v.VEN_DATA_FIM, 23)
          ORDER BY dia
        `);
        await pool.close();
        for (const row of result.recordset as Array<{ dia: string; qtdVendas: number; totalVendas: number }>) {
          inoveSalesByDay[row.dia] = { total: Number(row.totalVendas), qtd: Number(row.qtdVendas), vendas: Number(row.qtdVendas) };
        }
      } catch {
        // INOVE indisponível — retornar sem dados INOVE
      }

      // 3. Agrupar lançamentos bancários por dia (somar créditos do mesmo dia)
      // Usa fuso horário de Brasília (UTC-3) para extrair a data
      const toBrasiliaDate = (d: Date | string): string => {
        const dt = d instanceof Date ? d : new Date(d);
        // Ajusta para UTC-3 (Brasília)
        const offset = -3 * 60; // minutos
        const local = new Date(dt.getTime() + (offset - dt.getTimezoneOffset()) * 60000);
        return local.toISOString().split("T")[0]!;
      };

      const toleranceFactor = input.tolerance / 100;
      const bankByDay: Record<string, { totalCredito: number; totalDebito: number; entries: typeof bankEntries }> = {};
      for (const e of bankEntries) {
        const dia = toBrasiliaDate(e.date);
        if (!dia) continue;
        if (!bankByDay[dia]) bankByDay[dia] = { totalCredito: 0, totalDebito: 0, entries: [] };
        const amt = Number(e.amount);
        if (e.type === "credit") bankByDay[dia].totalCredito += amt;
        else bankByDay[dia].totalDebito += amt;
        bankByDay[dia].entries.push(e);
      }

      // 4. Cruzar por dia: total bancário do dia vs total INOVE do dia
      const items: Array<{
        dia: string;
        bankTotal: number;
        bankEntries: Array<{ id: number; description: string; amount: number; type: string; paymentMethod: string | null }>;
        inoveSales: { total: number; qtd: number; vendas: number } | null;
        status: "conciliado" | "divergente" | "sem_venda" | "sem_inove";
        diff: number | null;
      }> = [];

      // Dias com lançamentos bancários
      const allDays = new Set([...Object.keys(bankByDay), ...Object.keys(inoveSalesByDay)]);
      const noInove = Object.keys(inoveSalesByDay).length === 0;

      for (const dia of Array.from(allDays).sort()) {
        const bank = bankByDay[dia];
        const inove = inoveSalesByDay[dia];
        const bankTotal = bank ? bank.totalCredito : 0;

        let status: "conciliado" | "divergente" | "sem_venda" | "sem_inove";
        let diff: number | null = null;

        if (noInove) {
          status = "sem_inove";
        } else if (!inove && bankTotal > 0) {
          status = "sem_venda";
        } else if (!bank && inove) {
          status = "sem_venda";
          diff = -inove.total;
        } else if (inove) {
          diff = bankTotal - inove.total;
          const pct = inove.total > 0 ? Math.abs(diff) / inove.total : Math.abs(diff) > 0 ? 1 : 0;
          status = pct <= toleranceFactor ? "conciliado" : "divergente";
        } else {
          status = "sem_venda";
        }

        items.push({
          dia,
          bankTotal,
          bankEntries: (bank?.entries ?? []).map(e => ({
            id: e.id,
            description: e.description,
            amount: Number(e.amount),
            type: e.type,
            paymentMethod: e.paymentMethod ?? null,
          })),
          inoveSales: inove ?? null,
          status,
          diff,
        });
      }

      // Já ordenado pelo loop de allDays.sort()

      const summary = {
        total: items.length,
        conciliado: items.filter(i => i.status === "conciliado").length,
        divergente: items.filter(i => i.status === "divergente").length,
        sem_venda: items.filter(i => i.status === "sem_venda").length,
        sem_inove: items.filter(i => i.status === "sem_inove").length,
      };

      // ── Agrupamento Semanal ──────────────────────────────────────────────────
      // Semana ISO: segunda-feira como primeiro dia
      const getWeekKey = (dia: string) => {
        const d = new Date(dia + "T12:00:00");
        const day = d.getDay(); // 0=dom, 1=seg...
        const diff = (day === 0 ? -6 : 1 - day); // ajuste para segunda
        const monday = new Date(d);
        monday.setDate(d.getDate() + diff);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const fmt = (dt: Date) => dt.toISOString().split("T")[0]!;
        return { key: fmt(monday), label: `${fmt(monday)} a ${fmt(sunday)}` };
      };

      const weekMap: Record<string, { key: string; label: string; bankTotal: number; inoveTotal: number; qtdVendas: number; dias: string[]; status: string; diff: number }> = {};
      for (const item of items) {
        const { key, label } = getWeekKey(item.dia);
        if (!weekMap[key]) weekMap[key] = { key, label, bankTotal: 0, inoveTotal: 0, qtdVendas: 0, dias: [], status: "sem_inove", diff: 0 };
        weekMap[key]!.bankTotal += item.bankTotal;
        weekMap[key]!.inoveTotal += item.inoveSales?.total ?? 0;
        weekMap[key]!.qtdVendas += item.inoveSales?.vendas ?? 0;
        weekMap[key]!.dias.push(item.dia);
      }
      const weeks = Object.values(weekMap).sort((a, b) => a.key.localeCompare(b.key)).map(w => {
        const diff = w.bankTotal - w.inoveTotal;
        const pct = w.inoveTotal > 0 ? Math.abs(diff) / w.inoveTotal : Math.abs(diff) > 0 ? 1 : 0;
        const status = noInove ? "sem_inove" : w.inoveTotal === 0 && w.bankTotal > 0 ? "sem_venda" : pct <= toleranceFactor ? "conciliado" : "divergente";
        return { ...w, diff, status };
      });

      // ── Agrupamento Mensal ───────────────────────────────────────────────────
      const monthMap: Record<string, { key: string; label: string; bankTotal: number; inoveTotal: number; qtdVendas: number; dias: string[]; status: string; diff: number }> = {};
      for (const item of items) {
        const key = item.dia.substring(0, 7); // YYYY-MM
        const [y, m] = key.split("-");
        const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        const label = `${monthNames[parseInt(m ?? "1") - 1]}/${y}`;
        if (!monthMap[key]) monthMap[key] = { key, label, bankTotal: 0, inoveTotal: 0, qtdVendas: 0, dias: [], status: "sem_inove", diff: 0 };
        monthMap[key]!.bankTotal += item.bankTotal;
        monthMap[key]!.inoveTotal += item.inoveSales?.total ?? 0;
        monthMap[key]!.qtdVendas += item.inoveSales?.vendas ?? 0;
        monthMap[key]!.dias.push(item.dia);
      }
      const months = Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key)).map(mo => {
        const diff = mo.bankTotal - mo.inoveTotal;
        const pct = mo.inoveTotal > 0 ? Math.abs(diff) / mo.inoveTotal : Math.abs(diff) > 0 ? 1 : 0;
        const status = noInove ? "sem_inove" : mo.inoveTotal === 0 && mo.bankTotal > 0 ? "sem_venda" : pct <= toleranceFactor ? "conciliado" : "divergente";
        return { ...mo, diff, status };
      });

      return { items, summary, weeks, months };
    }),

  // ── Média de Vendas por Produto (INOVE direto) ──────────────────────────────────────
  salesAverageInove: protectedProcedure
    .input(z.object({ months: z.number().min(1).max(12).default(3) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const connRows = await db.select().from(inoveConnectorConfig).limit(1);
      if (!connRows.length || !connRows[0].active) return [];
      const config = connRows[0];
      try {
        const pool = await createInovePool(config);
        const res = await pool.request().query(`
          SELECT
            p.PRODUTO as productId,
            ISNULL(p.PRO_NOME, p.PRO_DESCRICAO) as productName,
            p.PRO_CODIGO as externalCode,
            ISNULL(p.PRO_ESTOQUE, 0) as currentStock,
            FORMAT(v.VEN_DATA_FIM, 'yyyy-MM') as saleMonth,
            CAST(SUM(iv.ITE_QUANTIDADE) as float) as totalQty
          FROM ITENS_VENDAS iv
          JOIN VENDAS v ON v.VENDA = iv.VENDA
          JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
          WHERE v.VEN_SITUACAO = 2
            AND v.VEN_DATA_FIM >= DATEADD(month, -${input.months}, GETDATE())
          GROUP BY p.PRODUTO, p.PRO_NOME, p.PRO_DESCRICAO, p.PRO_CODIGO, p.PRO_ESTOQUE, FORMAT(v.VEN_DATA_FIM, 'yyyy-MM')
          ORDER BY ISNULL(p.PRO_NOME, p.PRO_DESCRICAO), saleMonth
        `);
        await pool.close();
        // Agrupar por produto
        const productMap = new Map<number, {
          productId: number; productName: string; externalCode: string;
          currentStock: number; monthlyQty: Record<string, number>;
        }>();
        for (const row of res.recordset as Array<{productId:number;productName:string;externalCode:string;currentStock:number;saleMonth:string;totalQty:number}>) {
          if (!productMap.has(row.productId)) {
            productMap.set(row.productId, {
              productId: row.productId,
              productName: row.productName,
              externalCode: row.externalCode || "",
              currentStock: Number(row.currentStock) || 0,
              monthlyQty: {},
            });
          }
          const p = productMap.get(row.productId)!;
          p.monthlyQty[row.saleMonth] = Number(row.totalQty) || 0;
        }
        // Calcular média e sugestão de estoque mínimo
        return Array.from(productMap.values()).map(p => {
          const qtys = Object.values(p.monthlyQty);
          const monthsWithSales = qtys.filter(q => q > 0).length;
          const avgQty = monthsWithSales > 0 ? qtys.reduce((s, q) => s + q, 0) / monthsWithSales : 0;
          const suggestedMinStock = Math.ceil(avgQty * 1.2);
          return {
            productId: p.productId,
            productName: p.productName,
            externalCode: p.externalCode,
            externalName: p.productName,
            unit: "un",
            monthlyQty: p.monthlyQty,
            avgQty,
            monthsWithSales,
            currentStock: p.currentStock,
            suggestedMinStock,
          };
        }).sort((a, b) => b.avgQty - a.avgQty);
      } catch (err) {
        console.error("[salesAverageInove] Erro:", err instanceof Error ? err.message : err);
        return [];
      }
    }),
});
