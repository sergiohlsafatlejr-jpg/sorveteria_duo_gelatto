/**
 * Detecção automática de abertura de caixas 10L por vendas em kg (INOVE).
 *
 * Conceito: para cada caixa com `inoveProductId` e `rendimentoKg` configurados,
 * acumula os kg vendidos no PDV desde a última abertura registrada. Quando o
 * acumulado atinge o rendimento de uma caixa, gera uma sugestão de abertura
 * que o atendente confirma com 1 toque (confirmBoxOpening).
 *
 * Idempotência: o cursor `lastComputedAt` garante que cada venda entra no
 * acumulado uma única vez, mesmo com múltiplas execuções do job.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import {
  boxOpenTracking,
  boxStock,
  boxStockMovements,
  inoveConnectorConfig,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createInovePool } from "./routers/inove";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function fmtMssqlDate(d: Date): string {
  // 'YYYY-MM-DD HH:MM:SS' — seguro para interpolar (gerado internamente)
  return d.toISOString().slice(0, 19).replace("T", " ");
}

type DetectionResult = {
  checked: number;
  suggestions: number;
  message: string;
};

/**
 * Percorre as caixas rastreáveis, soma os kg vendidos no INOVE desde o último
 * cômputo e marca `suggestionPending` quando o acumulado supera o rendimento.
 * Roda pelo cron (2x/dia) e também manualmente via tRPC.
 */
export async function detectBoxOpenings(opts?: {
  notify?: (title: string, content: string) => Promise<void>;
}): Promise<DetectionResult> {
  const db = await getDb();
  if (!db) return { checked: 0, suggestions: 0, message: "Banco indisponível" };

  const boxes = await db.select().from(boxStock).where(eq(boxStock.active, true));
  const trackable = boxes.filter(
    (b) => b.inoveProductId && Number(b.rendimentoKg ?? 0) > 0
  );
  if (trackable.length === 0) {
    return {
      checked: 0,
      suggestions: 0,
      message: "Nenhuma caixa com inoveProductId e rendimentoKg configurados",
    };
  }

  const connRows = await db.select().from(inoveConnectorConfig).limit(1);
  if (!connRows.length || !connRows[0].active) {
    return { checked: 0, suggestions: 0, message: "INOVE não conectado" };
  }

  const pool = await createInovePool(connRows[0]);
  const newSuggestions: string[] = [];
  let checked = 0;

  try {
    for (const box of trackable) {
      const [tracking] = await db
        .select()
        .from(boxOpenTracking)
        .where(eq(boxOpenTracking.boxId, box.id))
        .limit(1);

      const now = new Date();

      // Ponto de partida do cômputo: último cômputo; na 1ª vez, a última
      // abertura registrada; se nunca houve abertura, as últimas 24h.
      let from: Date;
      if (tracking?.lastComputedAt) {
        from = new Date(tracking.lastComputedAt);
      } else {
        const [lastExit] = await db
          .select()
          .from(boxStockMovements)
          .where(
            and(
              eq(boxStockMovements.boxId, box.id),
              eq(boxStockMovements.type, "saida")
            )
          )
          .orderBy(desc(boxStockMovements.createdAt))
          .limit(1);
        from = lastExit
          ? new Date(lastExit.createdAt)
          : new Date(now.getTime() - 24 * 3600 * 1000);
      }

      const res = await pool.request().query(`
        SELECT CAST(ISNULL(SUM(iv.ITE_QUANTIDADE), 0) AS float) AS kg
        FROM ITENS_VENDAS iv
        JOIN VENDAS v ON v.VENDA = iv.VENDA
        WHERE v.VEN_SITUACAO = 2
          AND iv.PRODUTO = ${box.inoveProductId}
          AND v.VEN_DATA_FIM >= '${fmtMssqlDate(from)}'
      `);
      const kgSold = Number((res.recordset[0] as Record<string, unknown> | undefined)?.kg ?? 0);

      const accumulated = Number(tracking?.accumulatedKg ?? 0) + kgSold;
      const rendimento = Number(box.rendimentoKg);
      const shouldSuggest = accumulated >= rendimento;
      const alreadyPending = tracking?.suggestionPending ?? false;

      if (tracking) {
        await db
          .update(boxOpenTracking)
          .set({
            accumulatedKg: accumulated.toFixed(3),
            lastComputedAt: now,
            suggestionPending: alreadyPending || shouldSuggest,
          })
          .where(eq(boxOpenTracking.boxId, box.id));
      } else {
        await db.insert(boxOpenTracking).values({
          boxId: box.id,
          accumulatedKg: accumulated.toFixed(3),
          lastOpeningAt: from,
          lastComputedAt: now,
          suggestionPending: shouldSuggest,
        });
      }

      if (shouldSuggest && !alreadyPending) {
        newSuggestions.push(
          `• ${box.name}: ${accumulated.toFixed(1)} kg vendidos (caixa ≈ ${rendimento} kg)`
        );
      }
      checked++;
    }
  } finally {
    try { await pool.close(); } catch { /* ignora erro de close */ }
  }

  if (newSuggestions.length > 0 && opts?.notify) {
    await opts.notify(
      `🍦 ${newSuggestions.length} caixa(s) 10L provavelmente acabaram`,
      "Vendas acumuladas desde a última abertura superam o rendimento da caixa:\n\n" +
        newSuggestions.join("\n") +
        "\n\nConfirme a abertura em /stock/boxes."
    );
  }

  return {
    checked,
    suggestions: newSuggestions.length,
    message: newSuggestions.length > 0
      ? `${newSuggestions.length} nova(s) sugestão(ões) de abertura`
      : `${checked} caixa(s) verificadas, nenhuma sugestão nova`,
  };
}

/** Lista as sugestões pendentes para exibição na tela de caixas. */
export async function getOpeningSuggestions(db: Database) {
  const rows = await db
    .select({
      boxId: boxStock.id,
      name: boxStock.name,
      currentStock: boxStock.currentStock,
      rendimentoKg: boxStock.rendimentoKg,
      accumulatedKg: boxOpenTracking.accumulatedKg,
      lastOpeningAt: boxOpenTracking.lastOpeningAt,
      lastComputedAt: boxOpenTracking.lastComputedAt,
    })
    .from(boxOpenTracking)
    .innerJoin(boxStock, eq(boxOpenTracking.boxId, boxStock.id))
    .where(
      and(eq(boxOpenTracking.suggestionPending, true), eq(boxStock.active, true))
    );

  return rows.map((r) => {
    const acc = Number(r.accumulatedKg ?? 0);
    const rendimento = Number(r.rendimentoKg ?? 0);
    return {
      ...r,
      accumulatedKg: acc,
      rendimentoKg: rendimento,
      estimatedBoxesMissing: rendimento > 0 ? Math.max(1, Math.floor(acc / rendimento)) : 1,
    };
  });
}

/**
 * Confirma a abertura de uma nova caixa (1 toque):
 * registra a saída, baixa o estoque e carrega o excedente de kg
 * para o acumulado da próxima caixa.
 */
export async function confirmBoxOpening(boxId: number, userId: number | null) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

  return db.transaction(async (tx) => {
    const [box] = await tx
      .select()
      .from(boxStock)
      .where(eq(boxStock.id, boxId))
      .limit(1)
      .for("update");
    if (!box) throw new TRPCError({ code: "NOT_FOUND", message: "Caixa não encontrada." });

    const rendimento = Number(box.rendimentoKg ?? 0);
    const [tracking] = await tx
      .select()
      .from(boxOpenTracking)
      .where(eq(boxOpenTracking.boxId, boxId))
      .limit(1)
      .for("update");

    const accumulated = Number(tracking?.accumulatedKg ?? 0);
    const previousStock = box.currentStock;
    const newStock = Math.max(0, previousStock - 1);

    await tx.insert(boxStockMovements).values({
      boxId,
      type: "saida",
      quantity: 1,
      previousStock,
      newStock,
      notes: "Abertura confirmada via sugestão automática (vendas em kg)",
      userId: userId ?? null,
    });
    await tx.update(boxStock).set({ currentStock: newStock }).where(eq(boxStock.id, boxId));

    // Excedente vai para a próxima caixa; se ainda passar do rendimento,
    // mantém a sugestão pendente (ficou mais de uma caixa sem registrar).
    const carryover = rendimento > 0 ? Math.max(0, accumulated - rendimento) : 0;
    const stillPending = rendimento > 0 && carryover >= rendimento;

    if (tracking) {
      await tx
        .update(boxOpenTracking)
        .set({
          accumulatedKg: carryover.toFixed(3),
          lastOpeningAt: new Date(),
          suggestionPending: stillPending,
        })
        .where(eq(boxOpenTracking.boxId, boxId));
    } else {
      await tx.insert(boxOpenTracking).values({
        boxId,
        accumulatedKg: carryover.toFixed(3),
        lastOpeningAt: new Date(),
        lastComputedAt: new Date(),
        suggestionPending: stillPending,
      });
    }

    return { success: true, newStock, carryoverKg: carryover, stillPending };
  });
}
