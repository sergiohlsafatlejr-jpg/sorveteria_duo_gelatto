/**
 * Cron Jobs — Tarefas agendadas automáticas
 *
 * Todos os horários estão em UTC-3 (horário de Brasília).
 * O servidor usa a timezone America/Sao_Paulo.
 */
import cron from "node-cron";
import { notifyOwner } from "./_core/notification";
import { getDb, getUserByOpenId } from "./db";
import { inoveConnectorConfig, finDailyRevenue, cronJobLog, inoveSalesCache } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as mssqlLib from "mssql";
import { ENV } from "./_core/env";

// ── Tipo do pool mssql ──────────────────────────────────────────────────────
type MssqlPool = {
  request: () => { query: (sql: string) => Promise<{ recordset: Record<string, unknown>[] }> };
  close: () => Promise<void>;
};

async function createInovePool(config: {
  host: string; port: number; username: string;
  password: string; database: string;
}): Promise<MssqlPool> {
  const mssqlConfig = {
    server: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 15000,
      requestTimeout: 30000,
    },
  };
  const connectFn = (mssqlLib as unknown as { connect: (cfg: typeof mssqlConfig) => Promise<MssqlPool> }).connect
    ?? ((mssqlLib as unknown as { default: { connect: (cfg: typeof mssqlConfig) => Promise<MssqlPool> } }).default?.connect);
  if (!connectFn) throw new Error("mssql.connect não disponível");
  return connectFn(mssqlConfig);
}

async function logCronJob(
  jobName: string,
  status: "success" | "error" | "skipped",
  message: string,
  durationMs: number,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(cronJobLog).values({ jobName, status, message, durationMs });
  } catch {
    // não deixar falha no log quebrar o fluxo
  }
}

/**
 * Importa automaticamente o faturamento do dia anterior do INOVE PDV
 * e salva na tabela fin_daily_revenue.
 */
async function syncDailyRevenue(): Promise<void> {
  const startedAt = Date.now();
  console.log("[cron/sync-revenue] Iniciando sincronização automática de faturamento...");

  const db = await getDb();
  if (!db) {
    console.error("[cron/sync-revenue] DB indisponível");
    await logCronJob("sync-daily-revenue", "error", "DB indisponível", Date.now() - startedAt);
    return;
  }

  // Buscar config do conector INOVE
  const rows = await db.select().from(inoveConnectorConfig).limit(1);
  if (rows.length === 0 || !rows[0].active) {
    const msg = "Conector INOVE não está ativo — sincronização pulada";
    console.warn(`[cron/sync-revenue] ${msg}`);
    await logCronJob("sync-daily-revenue", "skipped", msg, Date.now() - startedAt);
    return;
  }
  const config = rows[0];

  let pool: MssqlPool | null = null;
  try {
    pool = await createInovePool(config);

    // Buscar total de vendas do dia anterior
    const result = await pool.request().query(`
      SELECT
        CAST(DATEADD(day, -1, CAST(GETDATE() as date)) as varchar(10)) as data_ontem,
        CAST(ISNULL(SUM(VEN_TOTAL), 0) as float) as total_vendas,
        COUNT(*) as qtd_vendas
      FROM VENDAS
      WHERE VEN_SITUACAO = 2
        AND CAST(VEN_DATA_FIM as date) = CAST(DATEADD(day, -1, GETDATE()) as date)
    `);
    await pool.close();
    pool = null;

    const row = result.recordset[0] as { data_ontem: string; total_vendas: number; qtd_vendas: number };
    if (!row || !row.data_ontem) throw new Error("Nenhum dado retornado do INOVE");

    const revenueDate = row.data_ontem; // YYYY-MM-DD
    const totalVendas = row.total_vendas ?? 0;
    const qtdVendas = row.qtd_vendas ?? 0;

    // Buscar userId do dono do sistema
    const ownerUser = await getUserByOpenId(ENV.ownerOpenId);
    if (!ownerUser) throw new Error("Usuário dono não encontrado no sistema");

    // Verificar se já existe registro para essa data
    const existing = await db.select()
      .from(finDailyRevenue)
      .where(and(
        eq(finDailyRevenue.userId, ownerUser.id),
        eq(finDailyRevenue.revenueDate, revenueDate),
      ))
      .limit(1);

    const alreadyExisted = existing.length > 0;

    if (alreadyExisted) {
      await db.update(finDailyRevenue)
        .set({
          realAmount: String(totalVendas.toFixed(2)),
          note: `Importado automaticamente do PDV INOVE (${qtdVendas} vendas)`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(finDailyRevenue.userId, ownerUser.id),
          eq(finDailyRevenue.revenueDate, revenueDate),
        ));
    } else {
      await db.insert(finDailyRevenue).values({
        userId: ownerUser.id,
        revenueDate,
        realAmount: String(totalVendas.toFixed(2)),
        note: `Importado automaticamente do PDV INOVE (${qtdVendas} vendas)`,
      });
    }

    const action = alreadyExisted ? "atualizado" : "registrado";
    const msg = `Faturamento ${action} — ${revenueDate} — R$ ${totalVendas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${qtdVendas} vendas)`;
    console.log(`[cron/sync-revenue] ✅ ${msg}`);

    await logCronJob("sync-daily-revenue", "success", msg, Date.now() - startedAt);

    await notifyOwner({
      title: "📊 Faturamento Real INOVE Sincronizado",
      content: `✅ ${msg}\n• Previsão de Faturamento atualizada automaticamente`,
    }).catch(() => {});

  } catch (err) {
    if (pool) await pool.close().catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-revenue] Erro:", message);

    await logCronJob("sync-daily-revenue", "error", message, Date.now() - startedAt);

    await notifyOwner({
      title: "❌ Falha na Sincronização de Faturamento",
      content: `Erro ao importar vendas do INOVE para Previsão de Faturamento: ${message}`,
    }).catch(() => {});
  }
}

/**
 * Sincroniza o cache de vendas por produto (top 10 dos últimos 2 meses)
 * para que o site publicado possa exibir dados mesmo sem conexão direta ao SQL Server.
 */
async function syncSalesCache(): Promise<void> {
  const startedAt = Date.now();
  console.log("[cron/sync-sales-cache] Iniciando sincronização do cache de vendas por produto...");

  const db = await getDb();
  if (!db) {
    await logCronJob("sync-sales-cache", "error", "DB indisponível", Date.now() - startedAt);
    return;
  }

  const rows = await db.select().from(inoveConnectorConfig).limit(1);
  if (rows.length === 0 || !rows[0].active) {
    await logCronJob("sync-sales-cache", "skipped", "Conector INOVE inativo", Date.now() - startedAt);
    return;
  }
  const config = rows[0];

  let pool: MssqlPool | null = null;
  try {
    pool = await createInovePool(config);

    // Sincronizar os últimos 3 meses
    const now = new Date();
    const monthsToSync: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthsToSync.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    let synced = 0;
    for (const monthKey of monthsToSync) {
      const [year, month] = monthKey.split("-").map(Number);
      const prevDate = new Date(year, month - 2, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonth = prevDate.getMonth() + 1;

      const currRes = await pool.request().query(`
        SELECT TOP 10
          p.PRODUTO as produtoId,
          ISNULL(p.PRO_NOME, 'Produto s/nome') as nome,
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

      type CurrRow = { produtoId: number; nome: string; codPdv: string; qtd: number; faturamento: number };
      type PrevRow = { produtoId: number; qtd: number; faturamento: number };
      const curr = currRes.recordset as CurrRow[];
      const prev = prevRes.recordset as PrevRow[];
      const prevMap = new Map(prev.map((p: PrevRow) => [Number(p.produtoId), p]));

      const top10 = curr.slice(0, 10).map((c: CurrRow) => {
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

      const totalFaturamento = curr.reduce((s: number, c: CurrRow) => s + Number(c.faturamento), 0);
      const totalQtd = curr.reduce((s: number, c: CurrRow) => s + Number(c.qtd), 0);
      const totalFaturamentoPrev = prev.reduce((s: number, p: PrevRow) => s + Number(p.faturamento), 0);
      const top10Faturamento = top10.reduce((s, c) => s + c.faturamento, 0);
      const top10Qtd = top10.reduce((s, c) => s + c.qtd, 0);

      const cacheData = JSON.stringify({
        month: monthKey,
        prevMonth: `${prevYear}-${String(prevMonth).padStart(2, "0")}`,
        top10,
        totalFaturamento,
        totalQtd,
        totalFaturamentoPrev,
        top10Faturamento,
        top10Qtd,
        totalProdutos: curr.length,
      });

      // Upsert no cache
      const existingCache = await db.select().from(inoveSalesCache).where(eq(inoveSalesCache.cacheKey, monthKey)).limit(1);
      if (existingCache.length > 0) {
        await db.update(inoveSalesCache).set({ data: cacheData, updatedAt: Math.floor(Date.now() / 1000) }).where(eq(inoveSalesCache.cacheKey, monthKey));
      } else {
        await db.insert(inoveSalesCache).values({ cacheKey: monthKey, data: cacheData, updatedAt: Math.floor(Date.now() / 1000) });
      }
      synced++;
    }

    await pool.close();
    pool = null;

    const msg = `Cache de vendas por produto atualizado para ${synced} mês(es)`;
    console.log(`[cron/sync-sales-cache] ✅ ${msg}`);
    await logCronJob("sync-sales-cache", "success", msg, Date.now() - startedAt);

  } catch (err) {
    if (pool) await pool.close().catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-sales-cache] Erro:", message);
    await logCronJob("sync-sales-cache", "error", message, Date.now() - startedAt);
  }
}

/**
 * Registra todos os cron jobs.
 * Chamado uma vez durante a inicialização do servidor.
 */
export function registerCronJobs(): void {
  // Sincronização de faturamento do dia anterior — todos os dias às 8h (horário de Brasília)
  cron.schedule("0 8 * * *", syncDailyRevenue, {
    timezone: "America/Sao_Paulo",
    name: "sync-daily-revenue",
  });

  // Sincronização do cache de vendas por produto — todos os dias às 8h05 (após o faturamento)
  cron.schedule("5 8 * * *", syncSalesCache, {
    timezone: "America/Sao_Paulo",
    name: "sync-sales-cache",
  });

  console.log("[cron] Cron jobs registrados:");
  console.log("[cron]   → sync-daily-revenue: todos os dias às 08:00 (Brasília)");
  console.log("[cron]   → sync-sales-cache: todos os dias às 08:05 (Brasília)");
}

// Exportar para uso no endpoint manual (disparar agora)
export { syncDailyRevenue, syncSalesCache };
