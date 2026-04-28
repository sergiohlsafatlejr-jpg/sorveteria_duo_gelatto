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
} from "../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "crypto";
import * as mssqlLib from "mssql";

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
type MssqlPool = {
  request: () => { query: (sql: string) => Promise<{ recordset: Record<string, unknown>[] }> };
  close: () => Promise<void>;
};

// Helper: criar conexão com o banco INOVE (SQL Server)
async function createInovePool(config: {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}): Promise<MssqlPool> {
  // tsx expõe connect diretamente no namespace; fallback para .default em outros runtimes
  const mssqlAny = mssqlLib as unknown as Record<string, unknown>;
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
      connectTimeout: 15000,
      requestTimeout: 30000,
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
      if (rows.length === 0 || !rows[0].active) return [];
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
        return [];
      }
    }),

  // ── Top Produtos Mais Vendidos ────────────────────────────────────────────
  getTopProducts: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30), limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const rows = await db.select().from(inoveConnectorConfig).limit(1);
      if (rows.length === 0 || !rows[0].active) return [];
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
        return [];
      }
    }),

  // ── KPIs do INOVE ─────────────────────────────────────────────────────────
  getKpis: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select().from(inoveConnectorConfig).limit(1);
    if (rows.length === 0 || !rows[0].active) return null;
    const config = rows[0];
    try {
      const pool = await createInovePool(config);
      const hoje = await pool.request().query(`
        SELECT COUNT(*) as qtd, ISNULL(CAST(SUM(VEN_TOTAL) as float),0) as total
        FROM VENDAS WHERE VEN_SITUACAO = 2 AND CONVERT(date, VEN_DATA_FIM) = CONVERT(date, GETDATE())
      `);
      const mes = await pool.request().query(`
        SELECT COUNT(*) as qtd, ISNULL(CAST(SUM(VEN_TOTAL) as float),0) as total
        FROM VENDAS WHERE VEN_SITUACAO = 2
          AND YEAR(VEN_DATA_FIM) = YEAR(GETDATE()) AND MONTH(VEN_DATA_FIM) = MONTH(GETDATE())
      `);
      const ticket = await pool.request().query(`
        SELECT ISNULL(CAST(AVG(VEN_TOTAL) as float),0) as ticket_medio
        FROM VENDAS WHERE VEN_SITUACAO = 2 AND VEN_DATA_FIM >= DATEADD(day, -30, GETDATE())
      `);
      const ontem = await pool.request().query(`
        SELECT COUNT(*) as qtd, ISNULL(CAST(SUM(VEN_TOTAL) as float),0) as total
        FROM VENDAS WHERE VEN_SITUACAO = 2
          AND CONVERT(date, VEN_DATA_FIM) = CONVERT(date, DATEADD(day, -1, GETDATE()))
      `);
      await pool.close();
      return {
        vendas_hoje: hoje.recordset[0] as { qtd: number; total: number },
        vendas_mes: mes.recordset[0] as { qtd: number; total: number },
        ticket_medio: (ticket.recordset[0] as { ticket_medio: number }).ticket_medio,
        vendas_ontem: ontem.recordset[0] as { qtd: number; total: number },
      };
    } catch {
      return null;
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
    .query(async ({ input }) => {
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
          WITH SaldoAtual AS (
            SELECT PRODUTO,
              (SELECT TOP 1 MVE_SALDO_ATUAL FROM MOVIMENTOS_ESTOQUES
               WHERE PRODUTO = p2.PRODUTO ORDER BY MOVIMENTO_ESTOQUE DESC) as saldo_atual
            FROM PRODUTOS p2
            WHERE p2.PRO_ATIVO = 'S' AND p2.PRO_ESTOQUE = 'S'
          )
          SELECT
            p.PRODUTO as id,
            p.PRO_NOME as nome,
            ISNULL(g.GRU_NOME, 'Sem Grupo') as grupo,
            CAST(p.PRO_VENDA as float) as preco_venda,
            CAST(ISNULL(p.PRO_CUSTO, 0) as float) as preco_custo,
            CAST(ISNULL(saldo.saldo_atual, 0) as float) as saldo_atual
          FROM PRODUTOS p
          LEFT JOIN GRUPOS_DE_PRODUTOS g ON p.GRUPO_DE_PRODUTOS = g.GRUPO_DE_PRODUTOS
          LEFT JOIN SaldoAtual saldo ON saldo.PRODUTO = p.PRODUTO
          WHERE p.PRO_ATIVO = 'S' AND p.PRO_ESTOQUE = 'S'
            ${searchFilter} ${grupoFilter} ${lowStockFilter}
          ORDER BY p.PRO_NOME
          OFFSET ${offset} ROWS FETCH NEXT ${input.pageSize} ROWS ONLY
        `);

        const countResult = await pool.request().query(`
          WITH SaldoAtual AS (
            SELECT PRODUTO,
              (SELECT TOP 1 MVE_SALDO_ATUAL FROM MOVIMENTOS_ESTOQUES
               WHERE PRODUTO = p2.PRODUTO ORDER BY MOVIMENTO_ESTOQUE DESC) as saldo_atual
            FROM PRODUTOS p2
            WHERE p2.PRO_ATIVO = 'S' AND p2.PRO_ESTOQUE = 'S'
          )
          SELECT COUNT(*) as total
          FROM PRODUTOS p
          LEFT JOIN GRUPOS_DE_PRODUTOS g ON p.GRUPO_DE_PRODUTOS = g.GRUPO_DE_PRODUTOS
          LEFT JOIN SaldoAtual saldo ON saldo.PRODUTO = p.PRODUTO
          WHERE p.PRO_ATIVO = 'S' AND p.PRO_ESTOQUE = 'S'
            ${searchFilter} ${grupoFilter} ${lowStockFilter}
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
        let dateFilter = `v.VEN_DATA_FIM >= DATEADD(day, -${input.days}, GETDATE())`;
        if (input.dateFrom && input.dateTo) {
          dateFilter = `v.VEN_DATA_FIM >= '${input.dateFrom}' AND v.VEN_DATA_FIM <= '${input.dateTo} 23:59:59'`;
        }
        const result = await pool.request().query(`
          SELECT
            fp.PAG_NOME as forma,
            COUNT(DISTINCT pv.VENDA) as qtd_vendas,
            CAST(SUM(pv.PAG_VALOR) as float) as total,
            CAST(AVG(pv.PAG_VALOR) as float) as ticket_medio
          FROM PAGAMENTOS_VENDAS pv
          JOIN FORMAS_PAGAMENTOS fp ON fp.FORMA_PAGAMENTO = pv.FORMA_PAGAMENTO
          JOIN VENDAS v ON v.VENDA = pv.VENDA
          WHERE v.VEN_SITUACAO = 2 AND ${dateFilter}
          GROUP BY fp.PAG_NOME
          ORDER BY total DESC
        `);
        await pool.close();
        return result.recordset as Array<{ forma: string; qtd_vendas: number; total: number; ticket_medio: number }>;
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
});

