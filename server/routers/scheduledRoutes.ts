/**
 * Rotas para tarefas agendadas (scheduled tasks)
 * Endpoint: POST /api/scheduled/sync-stock
 * Autenticação: cookie app_session_id (role: user ou admin)
 */
import { Router } from "express";
import { getDb, getUserByOpenId } from "../db";
import {
  inoveConnectorConfig,
  products,
  stockMovements,
  finDailyRevenue,
  instagramCache,
  metaAdsCache,
} from "../../drizzle/schema";
import { eq, sql, and } from "drizzle-orm";
import * as mssqlLib from "mssql";
import { notifyOwner } from "../_core/notification";
import { sdk } from "../_core/sdk";
import { ENV } from "../_core/env";

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

// ── Lógica de sincronização de estoque ─────────────────────────────────────
async function runSyncStock() {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  const rows = await db.select().from(inoveConnectorConfig).limit(1);
  if (rows.length === 0 || !rows[0].active) throw new Error("Conector INOVE não está ativo");

  const config = rows[0];
  const pool = await createInovePool(config);

  try {
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
        const local = bc
          ? localProducts.find(lp =>
              (lp.barcode && lp.barcode.trim() === bc) ||
              (lp.externalCode && lp.externalCode.trim() === bc)
            )
          : undefined;

        const saldoInt = Math.round(ip.saldo);

        if (local) {
          const updates: Record<string, unknown> = {
            currentStock: saldoInt,
            updatedAt: new Date(),
          };
          if (ip.custo > 0) {
            updates.costPrice = String(ip.custo.toFixed(2));
            costUpdated++;
          }
          await db.update(products).set(updates).where(eq(products.id, local.id));

          if (local.currentStock !== saldoInt) {
            await db.insert(stockMovements).values({
              productId: local.id,
              type: "adjustment",
              quantity: Math.abs(saldoInt - local.currentStock),
              previousStock: local.currentStock,
              newStock: saldoInt,
              reason: `Sincronização automática INOVE (${new Date().toLocaleDateString("pt-BR")})`,
            });
          }
          synced++;
        } else if (ip.nome && ip.nome.trim().length > 1) {
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
          const rawInsertId = (newProd as unknown as { insertId: bigint | number }).insertId;
          const newId = rawInsertId ? Number(rawInsertId) : 0;

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
              reason: `Importado automaticamente do INOVE (${new Date().toLocaleDateString("pt-BR")})`,
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
}

// ── Router Express ──────────────────────────────────────────────────────────
export const scheduledRouter = Router();

// ── Sincronizar vendas do dia anterior do INOVE → Previsão de Faturamento ──
async function runSyncRevenue(): Promise<{ date: string; total: number; alreadyExisted: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  // Buscar config do conector INOVE
  const rows = await db.select().from(inoveConnectorConfig).limit(1);
  if (rows.length === 0 || !rows[0].active) throw new Error("Conector INOVE não está ativo");
  const config = rows[0];

  // Conectar ao SQL Server INOVE
  const pool = await createInovePool(config);
  try {
    // Buscar total de vendas do dia anterior (horário de Brasília = GETDATE()-1)
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

    const row = result.recordset[0] as { data_ontem: string; total_vendas: number; qtd_vendas: number };
    if (!row || !row.data_ontem) throw new Error("Nenhum dado retornado do INOVE");

    const revenueDate = row.data_ontem; // YYYY-MM-DD
    const totalVendas = row.total_vendas ?? 0;

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
      // Atualizar se já existe
      await db.update(finDailyRevenue)
        .set({
          realAmount: String(totalVendas.toFixed(2)),
          note: `Importado automaticamente do PDV INOVE (${row.qtd_vendas} vendas)`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(finDailyRevenue.userId, ownerUser.id),
          eq(finDailyRevenue.revenueDate, revenueDate),
        ));
    } else {
      // Inserir novo registro
      await db.insert(finDailyRevenue).values({
        userId: ownerUser.id,
        revenueDate,
        realAmount: String(totalVendas.toFixed(2)),
        note: `Importado automaticamente do PDV INOVE (${row.qtd_vendas} vendas)`,
      });
    }

    return { date: revenueDate, total: totalVendas, alreadyExisted };
  } catch (err) {
    await pool.close().catch(() => {});
    throw new Error(err instanceof Error ? err.message : String(err));
  }
}

scheduledRouter.post("/api/scheduled/sync-revenue", async (req, res) => {
  try {
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) {
      res.status(401).json({ error: "Não autorizado" });
      return;
    }

    const result = await runSyncRevenue();

    const action = result.alreadyExisted ? "atualizado" : "registrado";
    const msg = `✅ Faturamento real ${action} automaticamente:\n• Data: ${result.date}\n• Total vendas INOVE: R$ ${result.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n• Previsão de Faturamento atualizada`;
    await notifyOwner({ title: "Faturamento Real INOVE Sincronizado", content: msg }).catch(() => {});

    res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduled/sync-revenue] Erro:", message);
    await notifyOwner({
      title: "❌ Falha na Sincronização de Faturamento",
      content: `Erro ao importar vendas do INOVE para Previsão de Faturamento: ${message}`,
    }).catch(() => {});
    res.status(500).json({ error: message });
  }
});

scheduledRouter.post("/api/scheduled/sync-stock", async (req, res) => {
  try {
    // Validar sessão (aceita role: user ou admin — tarefa agendada usa cookie de nível user)
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) {
      res.status(401).json({ error: "Não autorizado" });
      return;
    }

    const result = await runSyncStock();

    // Notificar dono com resumo
    const msg = `✅ Sincronização automática de estoque concluída:\n• ${result.synced} produtos atualizados\n• ${result.created} produtos criados\n• ${result.costUpdated} custos atualizados\n• Total INOVE: ${result.total} produtos`;
    await notifyOwner({ title: "Estoque INOVE Sincronizado", content: msg }).catch(() => {});

    res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduled/sync-stock] Erro:", message);

    // Notificar dono sobre falha
    await notifyOwner({
      title: "❌ Falha na Sincronização de Estoque",
      content: `Erro na sincronização automática INOVE: ${message}`,
    }).catch(() => {});

    res.status(500).json({ error: message });
  }
});

// ── Relatório Semanal Automático ─────────────────────────────────────────────
scheduledRouter.post("/api/scheduled/weekly-report", async (req, res) => {
  try {
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) {
      res.status(401).json({ error: "Não autorizado" });
      return;
    }

    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");

    // 1. Buscar configuração do conector INOVE
    const [config] = await db.select().from(inoveConnectorConfig).limit(1);
    if (!config || !config.active) {
      res.json({ ok: false, reason: "Conector INOVE inativo" });
      return;
    }

    const pool = await createInovePool({
      host: config.host,
      port: config.port ?? 1433,
      username: config.username,
      password: config.password,
      database: config.database,
    });

    // 2. Calcular datas da semana anterior (segunda a domingo, horário Brasília)
    // SQL Server GETDATE() já está em horário de Brasília
    const weeklyQuery = `
      DECLARE @hoje DATE = CAST(GETDATE() AS DATE);
      DECLARE @inicioSemanaAtual DATE = DATEADD(DAY, -(DATEPART(WEEKDAY, @hoje) + 5) % 7, @hoje);
      DECLARE @inicioSemanaAnterior DATE = DATEADD(DAY, -7, @inicioSemanaAtual);
      DECLARE @fimSemanaAnterior DATE = DATEADD(DAY, -1, @inicioSemanaAtual);

      -- Totais semana anterior
      SELECT
        @inicioSemanaAnterior AS semana_inicio,
        @fimSemanaAnterior AS semana_fim,
        COUNT(*) AS total_vendas,
        ISNULL(SUM(VEN_TOTAL), 0) AS faturamento,
        ISNULL(AVG(VEN_TOTAL), 0) AS ticket_medio
      FROM VENDAS
      WHERE VEN_SITUACAO = 2
        AND CAST(VEN_DATA_FIM AS DATE) BETWEEN @inicioSemanaAnterior AND @fimSemanaAnterior;

      -- Totais semana retrasada (para comparativo)
      SELECT
        COUNT(*) AS total_vendas_ant,
        ISNULL(SUM(VEN_TOTAL), 0) AS faturamento_ant
      FROM VENDAS
      WHERE VEN_SITUACAO = 2
        AND CAST(VEN_DATA_FIM AS DATE) BETWEEN DATEADD(DAY, -14, @inicioSemanaAtual) AND DATEADD(DAY, -8, @inicioSemanaAtual);

      -- Top 10 produtos da semana anterior
      SELECT TOP 10
        P.PRO_DESCRICAO AS produto,
        SUM(IV.IVE_QUANTIDADE) AS qtd,
        SUM(IV.IVE_TOTAL) AS total
      FROM ITENS_VENDAS IV
      JOIN PRODUTOS P ON P.PRODUTO = IV.PRODUTO
      JOIN VENDAS V ON V.VENDA = IV.VENDA
      WHERE V.VEN_SITUACAO = 2
        AND CAST(V.VEN_DATA_FIM AS DATE) BETWEEN @inicioSemanaAnterior AND @fimSemanaAnterior
      GROUP BY P.PRO_DESCRICAO
      ORDER BY total DESC;

      -- Vendas por dia da semana anterior
      SELECT
        CAST(VEN_DATA_FIM AS DATE) AS dia,
        COUNT(*) AS vendas,
        ISNULL(SUM(VEN_TOTAL), 0) AS total
      FROM VENDAS
      WHERE VEN_SITUACAO = 2
        AND CAST(VEN_DATA_FIM AS DATE) BETWEEN @inicioSemanaAnterior AND @fimSemanaAnterior
      GROUP BY CAST(VEN_DATA_FIM AS DATE)
      ORDER BY dia;
    `;

    const result = await pool.request().query(weeklyQuery) as unknown as {
      recordsets: Record<string, unknown>[][];
    };
    await pool.close();

    const [resumoArr, comparativoArr, topProdutosArr, porDiaArr] = result.recordsets;
    const resumo = resumoArr[0] as {
      semana_inicio: Date; semana_fim: Date;
      total_vendas: number; faturamento: number; ticket_medio: number;
    };
    const comparativo = comparativoArr[0] as {
      total_vendas_ant: number; faturamento_ant: number;
    };
    const topProdutos = topProdutosArr as { produto: string; qtd: number; total: number }[];
    const porDia = porDiaArr as { dia: Date; vendas: number; total: number }[];

    // 3. Formatar datas
    const fmtDate = (d: Date) => {
      const dt = new Date(d);
      return dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    };
    const fmtMoney = (v: number) =>
      Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const varFaturamento = resumo.faturamento - comparativo.faturamento_ant;
    const varPct = comparativo.faturamento_ant > 0
      ? ((varFaturamento / comparativo.faturamento_ant) * 100).toFixed(1)
      : "N/A";
    const sinal = varFaturamento >= 0 ? "▲" : "▼";

    // 4. Montar HTML do e-mail
    const topProdutosHtml = topProdutos
      .map((p, i) =>
        `<tr style="background:${i % 2 === 0 ? "#f9f9f9" : "#fff"}">
          <td style="padding:6px 10px">${i + 1}. ${p.produto}</td>
          <td style="padding:6px 10px;text-align:right">${Number(p.qtd).toFixed(0)} un</td>
          <td style="padding:6px 10px;text-align:right">${fmtMoney(p.total)}</td>
        </tr>`
      )
      .join("");

    const porDiaHtml = porDia
      .map(d =>
        `<tr>
          <td style="padding:5px 10px">${fmtDate(d.dia)}</td>
          <td style="padding:5px 10px;text-align:right">${d.vendas}</td>
          <td style="padding:5px 10px;text-align:right">${fmtMoney(d.total)}</td>
        </tr>`
      )
      .join("");

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#6c3fc5,#e91e8c);padding:24px;border-radius:12px;text-align:center;margin-bottom:24px">
    <h1 style="color:#fff;margin:0;font-size:22px">🍦 Duo Gelatto</h1>
    <p style="color:rgba(255,255,255,0.9);margin:8px 0 0">Relatório Semanal — ${fmtDate(resumo.semana_inicio)} a ${fmtDate(resumo.semana_fim)}</p>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
    <div style="background:#f0f4ff;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:bold;color:#6c3fc5">${fmtMoney(resumo.faturamento)}</div>
      <div style="font-size:12px;color:#666;margin-top:4px">Faturamento</div>
    </div>
    <div style="background:#f0fff4;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:bold;color:#16a34a">${resumo.total_vendas}</div>
      <div style="font-size:12px;color:#666;margin-top:4px">Vendas</div>
    </div>
    <div style="background:#fff7f0;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:bold;color:#ea580c">${fmtMoney(resumo.ticket_medio)}</div>
      <div style="font-size:12px;color:#666;margin-top:4px">Ticket Médio</div>
    </div>
  </div>

  <div style="background:${varFaturamento >= 0 ? "#f0fff4" : "#fff0f0"};border-radius:8px;padding:14px;margin-bottom:24px;text-align:center">
    <strong>Comparativo com semana anterior:</strong>
    ${sinal} ${fmtMoney(Math.abs(varFaturamento))} (${varPct}%) em relação a ${fmtMoney(comparativo.faturamento_ant)}
  </div>

  <h3 style="color:#6c3fc5;border-bottom:2px solid #6c3fc5;padding-bottom:8px">🏆 Top 10 Produtos</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <thead>
      <tr style="background:#6c3fc5;color:#fff">
        <th style="padding:8px 10px;text-align:left">Produto</th>
        <th style="padding:8px 10px;text-align:right">Qtd</th>
        <th style="padding:8px 10px;text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${topProdutosHtml}</tbody>
  </table>

  <h3 style="color:#6c3fc5;border-bottom:2px solid #6c3fc5;padding-bottom:8px">📅 Vendas por Dia</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <thead>
      <tr style="background:#6c3fc5;color:#fff">
        <th style="padding:8px 10px;text-align:left">Data</th>
        <th style="padding:8px 10px;text-align:right">Vendas</th>
        <th style="padding:8px 10px;text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${porDiaHtml}</tbody>
  </table>

  <div style="text-align:center;color:#999;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">
    Relatório gerado automaticamente pelo Sistema Duo Gelatto<br>
    Dados do PDV INOVE — ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
  </div>
</body>
</html>`;

    // 5. Texto simples para fallback
    const textBody = `Relatório Semanal Duo Gelatto — ${fmtDate(resumo.semana_inicio)} a ${fmtDate(resumo.semana_fim)}
Faturamento: ${fmtMoney(resumo.faturamento)} | Vendas: ${resumo.total_vendas} | Ticket Médio: ${fmtMoney(resumo.ticket_medio)}
Comparativo: ${sinal} ${fmtMoney(Math.abs(varFaturamento))} (${varPct}%) vs semana anterior

Top Produtos:
${topProdutos.map((p, i) => `${i + 1}. ${p.produto} — ${fmtMoney(p.total)}`).join("\n")}`;

    // 6. Buscar e-mails de admin e manager
    const { users } = await import("../../drizzle/schema");
    const { inArray } = await import("drizzle-orm");
    const db2 = await getDb();
    if (!db2) throw new Error("Banco de dados indisponível");
    const adminUsers = await db2
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.role, ["admin", "manager"]));

    const emails = adminUsers
      .map((u: { name: string | null; email: string | null }) => u.email)
      .filter((e: string | null): e is string => typeof e === "string" && e.includes("@"));

    // 7. Enviar e-mails
    let emailsSent = 0;
    if (emails.length > 0) {
      const { sendEmail, isEmailConfigured } = await import("../_core/email");
      if (isEmailConfigured()) {
        const subject = `📊 Relatório Semanal Duo Gelatto — ${fmtDate(resumo.semana_inicio)} a ${fmtDate(resumo.semana_fim)}`;
        for (const email of emails) {
          const sent = await sendEmail({ to: email, subject, html: htmlBody, text: textBody });
          if (sent) emailsSent++;
        }
      }
    }

    // 8. Notificar dono via sistema
    const notifContent = `📊 Relatório Semanal ${fmtDate(resumo.semana_inicio)} a ${fmtDate(resumo.semana_fim)}
• Faturamento: ${fmtMoney(resumo.faturamento)} (${sinal} ${varPct}% vs semana anterior)
• Vendas: ${resumo.total_vendas} | Ticket Médio: ${fmtMoney(resumo.ticket_medio)}
• Top produto: ${topProdutos[0]?.produto ?? "N/A"} (${fmtMoney(topProdutos[0]?.total ?? 0)})
• E-mails enviados: ${emailsSent}/${emails.length}`;

    await notifyOwner({ title: "📊 Relatório Semanal Duo Gelatto", content: notifContent }).catch(() => {});

    res.json({
      ok: true,
      semana: `${fmtDate(resumo.semana_inicio)} a ${fmtDate(resumo.semana_fim)}`,
      faturamento: resumo.faturamento,
      totalVendas: resumo.total_vendas,
      ticketMedio: resumo.ticket_medio,
      emailsSent,
      emailsTotal: emails.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduled/weekly-report] Erro:", message);
    await notifyOwner({
      title: "❌ Falha no Relatório Semanal",
      content: `Erro ao gerar relatório semanal: ${message}`,
    }).catch(() => {});
    res.status(500).json({ error: message });
  }
});

// ── Rota: Sincronizar Instagram + Meta Ads (recebe dados do agente Manus) ──
scheduledRouter.post("/api/scheduled/sync-instagram", async (req, res) => {
  try {
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) {
      res.status(401).json({ error: "Não autorizado" });
      return;
    }

    const db = await getDb();
    if (!db) throw new Error("DB indisponível");

    const { accountInfo, recentPosts, performanceSummary, metaAdsCampaigns, postInsights } = req.body as {
      accountInfo?: unknown;
      recentPosts?: unknown;
      performanceSummary?: unknown;
      metaAdsCampaigns?: unknown;
      postInsights?: unknown;
    };

    const now = new Date();
    let igSynced = false;
    let metaSynced = false;

    // Salvar dados do Instagram no cache
    if (accountInfo) {
      await db.insert(instagramCache as any).values({ cacheKey: 'account_info', data: JSON.stringify(accountInfo), syncedAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { data: sql`VALUES(data)`, syncedAt: sql`VALUES(syncedAt)`, updatedAt: sql`VALUES(updatedAt)` } });
      igSynced = true;
    }
    if (recentPosts) {
      await db.insert(instagramCache as any).values({ cacheKey: 'recent_posts', data: JSON.stringify(recentPosts), syncedAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { data: sql`VALUES(data)`, syncedAt: sql`VALUES(syncedAt)`, updatedAt: sql`VALUES(updatedAt)` } });
      igSynced = true;
    }
    if (performanceSummary) {
      await db.insert(instagramCache as any).values({ cacheKey: 'performance_summary', data: JSON.stringify(performanceSummary), syncedAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { data: sql`VALUES(data)`, syncedAt: sql`VALUES(syncedAt)`, updatedAt: sql`VALUES(updatedAt)` } });
      igSynced = true;
    }

    // Salvar insights de posts no cache
    if (postInsights) {
      await db.insert(instagramCache as any).values({ cacheKey: 'post_insights', data: JSON.stringify(postInsights), syncedAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { data: sql`VALUES(data)`, syncedAt: sql`VALUES(syncedAt)`, updatedAt: sql`VALUES(updatedAt)` } });
      igSynced = true;
    }

    // Salvar dados do Meta Ads no cache
    if (metaAdsCampaigns) {
      await db.insert(metaAdsCache as any).values({ cacheKey: 'campaigns_last_30d', data: JSON.stringify(metaAdsCampaigns), syncedAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { data: sql`VALUES(data)`, syncedAt: sql`VALUES(syncedAt)`, updatedAt: sql`VALUES(updatedAt)` } });
      metaSynced = true;
    }

    const parts = [];
    if (igSynced) parts.push('Instagram');
    if (metaSynced) parts.push('Meta Ads');

    await notifyOwner({
      title: '📱 Instagram + Meta Ads Sincronizados',
      content: `Dados atualizados: ${parts.join(' e ')} — ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    }).catch(() => {});

    res.json({ ok: true, synced: parts, timestamp: now.toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[scheduled/sync-instagram] Erro:', message);
    res.status(500).json({ error: message });
  }
});

// scheduledRouter já exportado na linha 181
