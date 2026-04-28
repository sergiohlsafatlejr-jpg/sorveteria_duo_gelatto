/**
 * Rotas para tarefas agendadas (scheduled tasks)
 * Endpoint: POST /api/scheduled/sync-stock
 * Autenticação: cookie app_session_id (role: user ou admin)
 */
import { Router } from "express";
import { getDb } from "../db";
import {
  inoveConnectorConfig,
  products,
  stockMovements,
} from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import * as mssqlLib from "mssql";
import { notifyOwner } from "../_core/notification";
import { sdk } from "../_core/sdk";

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
