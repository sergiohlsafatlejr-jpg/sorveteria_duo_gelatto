/**
 * Cron Jobs — Tarefas agendadas automáticas
 *
 * Todos os horários estão em UTC-3 (horário de Brasília).
 * O servidor usa a timezone America/Sao_Paulo.
 */
import cron from "node-cron";
import { notifyOwner } from "./_core/notification";
import { getDb, getUserByOpenId } from "./db";
import { 
  inoveConnectorConfig, 
  finDailyRevenue, 
  cronJobLog, 
  inoveSalesCache,
  sales,
  customers,
  customerPurchases,
  customerLoyaltyTokens,
  forecastSettings,
  finGoals,
  finRevenueForecasts,
} from "../drizzle/schema";
import { boxStock } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import * as mssqlLib from "mssql";
import { ENV } from "./_core/env";

// ── Tipo do pool mssql ──────────────────────────────────────────────────────
type MssqlPool = {
  request: () => { query: (sql: string) => Promise<{ recordset: Record<string, unknown>[] }> };
  close: () => Promise<void>;
};

type MssqlConfig = {
  server: string;
  port: number;
  user: string;
  password: string;
  database: string;
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    connectTimeout?: number;
    requestTimeout?: number;
  };
};

async function createInovePool(config: {
  host: string; port: number; username: string;
  password: string; database: string;
}): Promise<MssqlPool> {
  const mssqlAny = mssqlLib as unknown as Record<string, unknown>;
  const PoolClass = (mssqlAny.ConnectionPool
    ?? (mssqlAny.default as Record<string, unknown>)?.ConnectionPool) as new (cfg: MssqlConfig) => { connect: () => Promise<MssqlPool> };
  
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

  if (PoolClass) {
    const poolInstance = new PoolClass(mssqlConfig);
    return poolInstance.connect();
  }

  const connectFn = (mssqlLib as unknown as { connect: (cfg: MssqlConfig) => Promise<MssqlPool> }).connect
    ?? ((mssqlLib as unknown as { default: { connect: (cfg: MssqlConfig) => Promise<MssqlPool> } }).default?.connect);
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

// Helper para normalizar CPF e telefone para busca
function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

function normalizePhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  return clean.length >= 9 ? clean.slice(-9) : clean;
}

function mapPaymentMethod(forma: string): "cash" | "credit_card" | "debit_card" | "pix" | "other" {
  const f = (forma || "").toUpperCase();
  if (f.includes("DINHEIRO") || f.includes("DIN")) return "cash";
  if (f.includes("DEBITO") || f.includes("DÊBITO") || f.includes("DEB")) return "debit_card";
  if (f.includes("CREDITO") || f.includes("CRÉDITO") || f.includes("CRED") || f.includes("CART")) return "credit_card";
  if (f.includes("PIX")) return "pix";
  return "other";
}

/**
 * Sincroniza vendas individuais do INOVE para o BD local automaticamente.
 */
async function syncSalesFromInoveBackground(): Promise<void> {
  const startedAt = Date.now();
  console.log("[cron/sync-sales-background] Iniciando sincronização em lote de vendas do INOVE...");

  const db = await getDb();
  if (!db) {
    console.error("[cron/sync-sales-background] DB local indisponível");
    await logCronJob("sync-sales-background", "error", "DB local indisponível", Date.now() - startedAt);
    return;
  }

  const rows = await db.select().from(inoveConnectorConfig).limit(1);
  if (rows.length === 0 || !rows[0].active) {
    console.log("[cron/sync-sales-background] Conector INOVE inativo ou não configurado");
    return;
  }
  const config = rows[0];

  let pool: MssqlPool | null = null;
  try {
    pool = await createInovePool(config);

    // Buscar vendas finalizadas e não estornadas das últimas 12 horas
    const result = await pool.request().query(`
      SELECT 
        v.VENDA as id, 
        v.VEN_DATA_FIM as dataFim, 
        CAST(v.VEN_TOTAL as float) as total,
        CAST(ISNULL(v.VEN_DESCONTO, 0) as float) as desconto,
        v.CLIENTE as clienteId,
        p.PES_NOME as clienteNome,
        p.PES_TELEFONE as clienteTelefone,
        p.PES_TELEFONE2 as clienteTelefone2,
        p.PES_RG_CPF as clienteCpf,
        p.PES_DATA_NASCIMENTO as clienteNascimento,
        (
          SELECT TOP 1 fp.PAG_NOME 
          FROM PAGAMENTOS_VENDAS pv 
          JOIN FORMAS_PAGAMENTOS fp ON fp.FORMA_PAGAMENTO = pv.FORMA_PAGAMENTO
          WHERE pv.VENDA = v.VENDA
          ORDER BY pv.PAG_VALOR DESC
        ) as formaPrincipal
      FROM VENDAS v
      LEFT JOIN CLIENTES c ON v.CLIENTE = c.PESSOA
      LEFT JOIN PESSOAS p ON c.PESSOA = p.PESSOA
      WHERE v.VEN_SITUACAO = 2
        AND v.VEN_ESTORNADO = 'N'
        AND v.VEN_DATA_FIM >= DATEADD(HOUR, -12, GETDATE())
      ORDER BY v.VEN_DATA_FIM ASC
    `);

    await pool.close();
    pool = null;

    const inoveSales = result.recordset as Array<{
      id: number;
      dataFim: Date;
      total: number;
      desconto: number;
      clienteId: number | null;
      clienteNome: string | null;
      clienteTelefone: string | null;
      clienteTelefone2: string | null;
      clienteCpf: string | null;
      clienteNascimento: Date | null;
      formaPrincipal: string | null;
    }>;

    console.log(`[cron/sync-sales-background] Encontradas ${inoveSales.length} vendas nas últimas 12h no INOVE.`);

    let insertedCount = 0;

    for (const is of inoveSales) {
      const saleRef = `INOVE-${is.id}`;

      // 1. Verificar se a venda já existe no BD local
      const existing = await db
        .select({ id: sales.id })
        .from(sales)
        .where(eq(sales.notes, saleRef))
        .limit(1);

      if (existing.length > 0) continue;

      // 2. Tentar encontrar ou criar cliente no sistema de fidelidade
      let customerId: number | null = null;
      if (is.clienteId) {
        const cpf = is.clienteCpf ? normalizeCpf(is.clienteCpf) : "";
        const phone = normalizePhone(is.clienteTelefone || is.clienteTelefone2 || "");

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

        // Criar automaticamente no fidelidade se tiver nome
        if (!customerId && is.clienteNome && is.clienteNome.trim().length > 2) {
          try {
            const newCust = await db.insert(customers).values({
              fullName: is.clienteNome.trim(),
              phone: phone.length >= 9 ? phone : undefined,
              notes: cpf.length >= 11 ? `CPF: ${cpf}` : `Importado INOVE`,
              birthDate: is.clienteNascimento ? new Date(is.clienteNascimento) : undefined,
              totalPoints: 0,
              totalPurchases: "0.00",
              active: true,
            });
            customerId = (newCust as unknown as { insertId: number }).insertId;
            
            // Gerar token de fidelidade
            const hexToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
            await db.insert(customerLoyaltyTokens).values({
              customerId,
              token: hexToken.slice(0, 64),
            });
          } catch (err) {
            console.error(`[cron/sync-sales-background] Erro ao cadastrar cliente automático ${is.clienteNome}:`, err);
          }
        }
      }

      // 3. Mapear forma de pagamento
      const paymentMethod = mapPaymentMethod(is.formaPrincipal || "other");

      // 4. Inserir venda local
      await db.insert(sales).values({
        customerId,
        total: String((is.total + is.desconto).toFixed(2)),
        discount: String(is.desconto.toFixed(2)),
        finalTotal: String(is.total.toFixed(2)),
        paymentMethod,
        pointsEarned: customerId ? Math.floor(is.total) : 0,
        notes: saleRef,
        status: "completed",
        createdAt: new Date(is.dataFim),
      });

      // 5. Se for cliente de fidelidade, registrar em customerPurchases e atualizar pontos
      if (customerId) {
        const points = Math.floor(is.total);
        await db.insert(customerPurchases).values({
          customerId,
          amount: String(is.total.toFixed(2)),
          paymentMethod,
          pointsEarned: points,
          notes: saleRef,
          createdAt: new Date(is.dataFim),
        });

        await db.update(customers)
          .set({
            totalPoints: sql`totalPoints + ${points}`,
            totalPurchases: sql`totalPurchases + ${is.total}`,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customerId));
      }

      insertedCount++;
    }

    const msg = `Sincronização de vendas concluída: ${insertedCount} novas vendas importadas para o BD local.`;
    console.log(`[cron/sync-sales-background] ✅ ${msg}`);
    await logCronJob("sync-sales-background", "success", msg, Date.now() - startedAt);

  } catch (err) {
    if (pool) await pool.close().catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-sales-background] Erro na sincronização automática:", message);
    await logCronJob("sync-sales-background", "error", message, Date.now() - startedAt);
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

    // Buscar total de vendas dos últimos 7 dias (cobre falhas e garante dados atualizados)
    const result = await pool.request().query(`
      SELECT
        CONVERT(varchar(10), CAST(VEN_DATA_FIM as date), 120) as data_venda,
        CAST(ISNULL(SUM(VEN_TOTAL), 0) as float) as total_vendas,
        COUNT(*) as qtd_vendas
      FROM VENDAS
      WHERE VEN_SITUACAO = 2
        AND CAST(VEN_DATA_FIM as date) >= CAST(DATEADD(day, -7, GETDATE()) as date)
        AND CAST(VEN_DATA_FIM as date) < CAST(GETDATE() as date)
      GROUP BY CAST(VEN_DATA_FIM as date)
      ORDER BY data_venda
    `);
    await pool.close();
    pool = null;

    if (!result.recordset || result.recordset.length === 0) {
      const msg = "Nenhum dado de vendas encontrado nos últimos 7 dias";
      console.warn(`[cron/sync-revenue] ${msg}`);
      await logCronJob("sync-daily-revenue", "skipped", msg, Date.now() - startedAt);
      return;
    }

    // Buscar userId do dono do sistema (para manter compatibilidade)
    const ownerUser = await getUserByOpenId(ENV.ownerOpenId);
    if (!ownerUser) throw new Error("Usuário dono não encontrado no sistema");

    let updatedCount = 0;
    let createdCount = 0;

    for (const row of result.recordset) {
      const revenueDate = row.data_venda as string;
      const totalVendas = (row.total_vendas as number) ?? 0;
      const qtdVendas = (row.qtd_vendas as number) ?? 0;

      if (totalVendas <= 0) continue;

      // Verificar se já existe registro para essa data (compartilhado, sem filtro userId)
      const existing = await db.select()
        .from(finDailyRevenue)
        .where(eq(finDailyRevenue.revenueDate, revenueDate))
        .limit(1);

      if (existing.length > 0) {
        await db.update(finDailyRevenue)
          .set({
            realAmount: String(totalVendas.toFixed(2)),
            note: `Importado automaticamente do PDV INOVE (${qtdVendas} vendas)`,
            updatedAt: new Date(),
          })
          .where(eq(finDailyRevenue.revenueDate, revenueDate));
        updatedCount++;
      } else {
        await db.insert(finDailyRevenue).values({
          userId: ownerUser.id,
          revenueDate,
          realAmount: String(totalVendas.toFixed(2)),
          note: `Importado automaticamente do PDV INOVE (${qtdVendas} vendas)`,
        });
        createdCount++;
      }
    }

    const msg = `Faturamento sincronizado — ${createdCount} novo(s), ${updatedCount} atualizado(s) nos últimos 7 dias`;
    console.log(`[cron/sync-revenue] ✅ ${msg}`);

    await logCronJob("sync-daily-revenue", "success", msg, Date.now() - startedAt);

    if (createdCount > 0) {
      await notifyOwner({
        title: "📊 Faturamento Real INOVE Sincronizado",
        content: `✅ ${msg}\n• Previsão de Faturamento atualizada automaticamente`,
      }).catch(() => {});
    }

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
  console.log("[cron/sync-sales-cache] Iniciando sincronização del cache de vendas por produto...");

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
      // Otimização: pular consulta do INOVE se for mês passado e o cache já existir
      const isCurrentMonth = monthKey === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      if (!isCurrentMonth) {
        const existingCache = await db
          .select({ id: inoveSalesCache.id })
          .from(inoveSalesCache)
          .where(eq(inoveSalesCache.cacheKey, monthKey))
          .limit(1);

        if (existingCache.length > 0) {
          console.log(`[cron/sync-sales-cache] Cache já existe para o mês passado ${monthKey} — pulando.`);
          continue;
        }
      }

      const [year, month] = monthKey.split("-").map(Number);
      const prevDate = new Date(year, month - 2, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonth = prevDate.getMonth() + 1;

      const currRes = await pool.request().query(`
        SELECT
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
        products: curr.map((c: CurrRow) => ({
          produtoId: Number(c.produtoId),
          nome: c.nome,
          codPdv: c.codPdv,
          qtd: Number(c.qtd),
          faturamento: Number(c.faturamento),
        })),
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
 * Verifica se a meta diária foi atingida e envia alerta se não.
 * Roda às 22:00 (Brasília).
 */
async function checkDailyGoalAlert(): Promise<void> {
  const startedAt = Date.now();
  console.log("[cron/goal-alert] Verificando meta diária...");

  const db = await getDb();
  if (!db) {
    await logCronJob("check-daily-goal-alert", "error", "DB indisponível", Date.now() - startedAt);
    return;
  }

  try {
    // Buscar faturamento real de hoje
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const todayRows = await db.select()
      .from(finDailyRevenue)
      .where(eq(finDailyRevenue.revenueDate, today))
      .limit(1);

    const realToday = todayRows.length > 0 ? Number(todayRows[0].realAmount) : 0;

    // Buscar meta do mês do Forecast (soma dos valores diários do calendário)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const forecastRows = await db.select().from(finRevenueForecasts)
      .where(and(
        sql`${finRevenueForecasts.forecastDate} >= ${monthStart}`,
        sql`${finRevenueForecasts.forecastDate} <= ${monthEnd}`,
      ));

    const monthlyGoal = forecastRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    if (monthlyGoal <= 0) {
      await logCronJob("check-daily-goal-alert", "skipped", "Meta mensal do Forecast zerada ou não definida", Date.now() - startedAt);
      return;
    }

    const dailyGoal = monthlyGoal / daysInMonth;
    const percentage = realToday > 0 ? (realToday / dailyGoal) * 100 : 0;

    if (percentage < 80) {
      await notifyOwner({
        title: "⚠️ Meta Diária Não Atingida",
        content: `Faturamento de hoje (${today}): R$ ${realToday.toFixed(2)}\nMeta diária: R$ ${dailyGoal.toFixed(2)}\nAtingido: ${percentage.toFixed(0)}%\n\n⚠️ Abaixo de 80% da meta!`,
      }).catch(() => {});
      const msg = `Alerta enviado: ${percentage.toFixed(0)}% da meta (R$ ${realToday.toFixed(2)} / R$ ${dailyGoal.toFixed(2)})`;
      console.log(`[cron/goal-alert] ${msg}`);
      await logCronJob("check-daily-goal-alert", "success", msg, Date.now() - startedAt);
    } else {
      const msg = `Meta OK: ${percentage.toFixed(0)}% (R$ ${realToday.toFixed(2)} / R$ ${dailyGoal.toFixed(2)})`;
      console.log(`[cron/goal-alert] ✅ ${msg}`);
      await logCronJob("check-daily-goal-alert", "success", msg, Date.now() - startedAt);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/goal-alert] Erro:", message);
    await logCronJob("check-daily-goal-alert", "error", message, Date.now() - startedAt);
  }
}

/**
 * Registra todos os cron jobs.
 * Chamado uma vez durante a inicialização do servidor.
 */
export function registerCronJobs(): void {
  // Sincronização periódica de vendas individuais do INOVE — a cada 5 minutos
  cron.schedule("*/5 * * * *", syncSalesFromInoveBackground, {
    timezone: "America/Sao_Paulo",
    name: "sync-sales-background",
  });

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

  // Segunda importação diária às 20:00 para pegar o dia completo
  cron.schedule("0 20 * * *", syncDailyRevenue, {
    timezone: "America/Sao_Paulo",
    name: "sync-daily-revenue-noite",
  });

  // Alerta de meta não atingida às 22:00
  cron.schedule("0 22 * * *", checkDailyGoalAlert, {
    timezone: "America/Sao_Paulo",
    name: "check-daily-goal-alert",
  });
  // Alerta de reposição de caixas 10L — todos os dias às 09:00
  cron.schedule("0 9 * * *", checkBoxStockAlert, {
    timezone: "America/Sao_Paulo",
    name: "check-box-stock-alert",
  });

  console.log("[cron] Cron jobs registrados:");
  console.log("[cron]   → sync-sales-background: a cada 5 minutos (Brasília)");
  console.log("[cron]   → sync-daily-revenue: todos os dias às 08:00 e 20:00 (Brasília)");
  console.log("[cron]   → sync-sales-cache: todos os dias às 08:05 (Brasília)");
  console.log("[cron]   → check-daily-goal-alert: todos os dias às 22:00 (Brasília)");
  console.log("[cron]   → check-box-stock-alert: todos os dias às 09:00 (Brasília)");
  // Snapshot mensal de caixas no dia 1 às 00:05
  cron.schedule("5 0 1 * *", createMonthlyBoxSnapshot, {
    timezone: "America/Sao_Paulo",
  });
  console.log("[cron]   → box-monthly-snapshot: dia 1 de cada mês às 00:05 (Brasília)");
}

// Exportar para uso no endpoint manual (disparar agora)
export { syncDailyRevenue, syncSalesCache, syncSalesFromInoveBackground };

// ── Alerta de reposição de caixas 10L ───────────────────────────────────────
async function checkBoxStockAlert() {
  try {
    const db = await getDb();
    if (!db) return;
    const lowBoxes = await db.select().from(boxStock).where(
      and(eq(boxStock.active, true), sql`${boxStock.currentStock} <= ${boxStock.minStock}`)
    );
    if (lowBoxes.length === 0) return;
    const lista = lowBoxes.map(b => `• ${b.name}: ${b.currentStock} cx (mín: ${b.minStock})`).join("\n");
    await notifyOwner({
      title: `⚠️ ${lowBoxes.length} caixa(s) 10L com estoque baixo`,
      content: `As seguintes caixas estão abaixo do estoque mínimo:\n\n${lista}\n\nAcesse /stock/boxes para verificar.`,
    });
    console.log(`[cron] Alerta de caixas: ${lowBoxes.length} abaixo do mínimo`);
  } catch (err) {
    console.error("[cron] Erro checkBoxStockAlert:", err instanceof Error ? err.message : err);
  }
}

// Snapshot mensal de estoque de caixas (dia 1 de cada mês às 00:05)
async function createMonthlyBoxSnapshot() {
  try {
    const { getDb } = await import("./db");
    const { boxStock, boxStockSnapshots } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const existing = await db.select().from(boxStockSnapshots).where(eq(boxStockSnapshots.month, month));
    if (existing.length > 0) { console.log(`[cron/box-snapshot] Snapshot de ${month} já existe`); return; }
    const allBoxes = await db.select().from(boxStock).where(eq(boxStock.active, true));
    for (const box of allBoxes) {
      await db.insert(boxStockSnapshots).values({
        boxId: box.id, month, initialStock: box.currentStock,
        entries: 0, exits: 0, adjustments: 0, finalStock: box.currentStock,
      });
    }
    console.log(`[cron/box-snapshot] ✅ Snapshot de ${month} criado com ${allBoxes.length} caixa(s)`);
  } catch (err) {
    console.error("[cron] Erro createMonthlyBoxSnapshot:", err instanceof Error ? err.message : err);
  }
}
