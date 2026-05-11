/**
 * Cron Jobs — Tarefas agendadas automáticas
 *
 * Todos os horários estão em UTC-3 (horário de Brasília).
 * O servidor usa a timezone America/Sao_Paulo.
 */
import cron from "node-cron";
import { notifyOwner } from "./_core/notification";
import { getDb, getUserByOpenId } from "./db";
import { inoveConnectorConfig, finDailyRevenue, cronJobLog } from "../drizzle/schema";
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
 * Registra todos os cron jobs.
 * Chamado uma vez durante a inicialização do servidor.
 */
export function registerCronJobs(): void {
  // Sincronização de faturamento do dia anterior — todos os dias às 8h (horário de Brasília)
  cron.schedule("0 8 * * *", syncDailyRevenue, {
    timezone: "America/Sao_Paulo",
    name: "sync-daily-revenue",
  });

  console.log("[cron] Cron jobs registrados:");
  console.log("[cron]   → sync-daily-revenue: todos os dias às 08:00 (Brasília)");
}

// Exportar para uso no endpoint manual (disparar agora)
export { syncDailyRevenue };
