/**
 * Motor de Baixa Automática de Estoque por Vendas do PDV INOVE
 * e Unificação com Entradas de Notas Fiscais (NF-e).
 *
 * Fluxo:
 * 1. NF-e confirmada -> converte caixas/packs (ex: 30 UND, PACK 4 UND) em unidades
 *    e soma no estoque interno (`operational_items` e `products`).
 * 2. Vendas finalizadas no PDV INOVE (`ITENS_VENDAS` com `VEN_SITUACAO = 2`) ->
 *    desconta automaticamente as unidades vendidas de `products` e `operational_items`,
 *    registrando movimentação e log idempotente em `inove_stock_deduction_log`.
 * 3. Caixas 10L (sorvete por kg) -> continuam com detecção por rendimento e
 *    confirmação em 1 clique em `server/box-opening.ts`.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  inoveConnectorConfig,
  inoveStockDeductionLog,
  operationalItems,
  operationalStockMovements,
  products,
  stockMovements,
  stockScheduledJobs,
} from "../drizzle/schema";
import { getDb } from "./db";
import { isTenLiterItem } from "./purchase-invoice-extraction";
import { createInovePool } from "./routers/inove";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Extrai a quantidade de unidades por embalagem a partir da descrição do produto na NF-e.
 * Ex: "CAJA 30 UND - FRUTA" -> 30, "PACK 4 UND NAPOLITANO 1,5 LITROS" -> 4
 */
export function extractUnitsPerPackage(description: string): number {
  const match = description.match(/(?<![\d.,])\b(\d+)\s*(?:UND|UNID|UNIDADES|UN)\b/i);
  if (match) {
    const val = Number(match[1]);
    if (val > 0) return val;
  }
  const packMatch = description.match(/\bPACK\s*(\d+)/i);
  if (packMatch) {
    const val = Number(packMatch[1]);
    if (val > 0) return val;
  }
  const cxMatch = description.match(/\bCX\s*(?:C\/\s*|COM\s*)?(\d+)/i);
  if (cxMatch) {
    const val = Number(cxMatch[1]);
    if (val > 0) return val;
  }
  return 1;
}

export function normalizeStockName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/**
 * Remove sufixos/prefixos de embalagem de atacado da NF-e para facilitar o
 * cruzamento automático com o nome unitário cadastrado no PDV INOVE.
 * Ex: "PACK 4 UND NAPOLITANO 1,5 LITROS" -> "napolitano15litros"
 *     "CAJA 30 UND - FRUTA" -> "caja"
 */
export function normalizeCoreFlavorName(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bPACK\s*\d*\s*(UND|UNID|UN)?\b/g, " ")
    .replace(/\b\d+\s*(UND|UNID|UNIDADES|UN)\b/g, " ")
    .replace(/(?:-\s*|\b)(FRUTA|CREME|SP|CLASSICOS|KIDS|ESPECIAL)\b/g, " ")
    .replace(/\b(PICOLE|SORVETE|POTE|CAIXA|CX)\b/g, " ")
    .replace(/[^A-Z0-9]/g, "")
    .toLowerCase();
  return cleaned || normalizeStockName(value);
}

export function isBulkKgSaleItem(name: string, unit?: string | null): boolean {
  if (isTenLiterItem(name)) return true;
  const u = (unit ?? "").trim().toUpperCase();
  if (u === "KG" || u === "QUILO" || u === "KILO") return true;
  if (/\bSORVETE\s+KG\b/i.test(name) || /\bSELF\s*SERVICE\b/i.test(name) || /\bBUFFET\b/i.test(name)) {
    return true;
  }
  return false;
}

export type AutoDeductionResult = {
  salesChecked: number;
  itemsDeducted: number;
  unmatchedItems: number;
  message: string;
};

function fmtInoveDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}.${String(date.getUTCMilliseconds()).padStart(3, "0")}`;
}

/**
 * Sincroniza vínculos de catálogo entre produtos do PDV INOVE e o estoque interno
 * (`products` e `operational_items`), preenchendo `inoveProductId` automaticamente.
 */
export async function syncInoveCatalogLinks(opts?: { createMissingProducts?: boolean }): Promise<{
  linkedProducts: number;
  linkedOperational: number;
  createdProducts: number;
  message: string;
}> {
  const db = await getDb();
  if (!db) return { linkedProducts: 0, linkedOperational: 0, createdProducts: 0, message: "Banco indisponível" };

  const connRows = await db.select().from(inoveConnectorConfig).limit(1);
  if (!connRows.length || !connRows[0].active) {
    return { linkedProducts: 0, linkedOperational: 0, createdProducts: 0, message: "INOVE não conectado" };
  }

  const pool = await createInovePool(connRows[0]);
  let inoveRows: Array<{
    id: number;
    codigo: string | null;
    nome: string;
    unidade: string | null;
    precoVenda: number;
    precoCusto: number;
  }> = [];

  try {
    const res = await pool.request().query(`
      SELECT
        p.PRODUTO AS id,
        p.PRO_CODIGO AS codigo,
        ISNULL(p.PRO_NOME, 'Produto sem nome') AS nome,
        p.PRO_UNIDADE AS unidade,
        CAST(ISNULL(p.PRO_VENDA, 0) AS float) AS precoVenda,
        CAST(ISNULL(p.PRO_CUSTO, 0) AS float) AS precoCusto
      FROM PRODUTOS p
      WHERE p.PRO_ATIVO = 'S'
      ORDER BY p.PRO_NOME
    `);
    inoveRows = (res.recordset as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      codigo: r.codigo ? String(r.codigo) : null,
      nome: String(r.nome ?? ""),
      unidade: r.unidade ? String(r.unidade) : null,
      precoVenda: Number(r.precoVenda ?? 0),
      precoCusto: Number(r.precoCusto ?? 0),
    }));
  } finally {
    try { await pool.close(); } catch { /* ignore */ }
  }

  const localProducts = await db.select().from(products).where(eq(products.active, true));
  const localOperational = await db.select().from(operationalItems).where(eq(operationalItems.active, true));

  let linkedProducts = 0;
  let linkedOperational = 0;
  let createdProducts = 0;

  // Mapas de busca do INOVE
  const byExactNorm = new Map<string, typeof inoveRows[0] | null>();
  const byCoreNorm = new Map<string, typeof inoveRows[0] | null>();
  for (const row of inoveRows) {
    if (isBulkKgSaleItem(row.nome, row.unidade)) continue;
    const exact = normalizeStockName(row.nome);
    const core = normalizeCoreFlavorName(row.nome);
    if (exact) byExactNorm.set(exact, byExactNorm.has(exact) ? null : row);
    if (core && core.length >= 3) byCoreNorm.set(core, byCoreNorm.has(core) ? null : row);
  }

  // 1. Vincular products existentes sem inoveProductId
  for (const prod of localProducts) {
    if (prod.inoveProductId) continue;
    const extId = prod.externalCode ? Number(prod.externalCode) : NaN;
    let matched = !Number.isNaN(extId) && extId > 0
      ? inoveRows.find((r) => r.id === extId || r.codigo === prod.externalCode)
      : undefined;
    if (!matched) {
      const exact = byExactNorm.get(normalizeStockName(prod.name));
      matched = exact === null ? undefined
        : exact ?? byCoreNorm.get(normalizeCoreFlavorName(prod.name)) ?? undefined;
    }
    if (matched) {
      await db.update(products).set({
        inoveProductId: matched.id,
        externalCode: prod.externalCode ?? String(matched.id),
        salePrice: Number(prod.salePrice) > 0 ? prod.salePrice : matched.precoVenda.toFixed(2),
      }).where(eq(products.id, prod.id));
      prod.inoveProductId = matched.id;
      linkedProducts++;
    }
  }

  // 2. Vincular operational_items existentes sem inoveProductId
  for (const op of localOperational) {
    if (op.inoveProductId) continue;
    const exact = byExactNorm.get(normalizeStockName(op.name));
    const matched = exact === null ? undefined
      : exact ?? byCoreNorm.get(normalizeCoreFlavorName(op.name)) ?? undefined;
    if (matched) {
      await db.update(operationalItems).set({
        inoveProductId: matched.id,
      }).where(eq(operationalItems.id, op.id));
      op.inoveProductId = matched.id;
      linkedOperational++;
    }
  }

  // 3. Opcionalmente cadastrar em `products` os itens ativos do INOVE que ainda não existem
  if (opts?.createMissingProducts) {
    const existingInoveIds = new Set(localProducts.map((p) => p.inoveProductId).filter(Boolean));
    const existingNames = new Set(localProducts.map((p) => normalizeStockName(p.name)));
    for (const row of inoveRows) {
      if (isBulkKgSaleItem(row.nome, row.unidade)) continue;
      if (existingInoveIds.has(row.id) || existingNames.has(normalizeStockName(row.nome))) continue;
      await db.insert(products).values({
        name: row.nome,
        sku: row.codigo ?? String(row.id),
        externalCode: String(row.id),
        inoveProductId: row.id,
        costPrice: row.precoCusto.toFixed(2),
        salePrice: row.precoVenda.toFixed(2),
        currentStock: 0,
        minStock: 5,
        unit: (row.unidade ?? "un").toLowerCase().slice(0, 20),
        purchaseUnit: "un",
        conversionFactor: 1,
        active: true,
      });
      createdProducts++;
    }
  }

  return {
    linkedProducts,
    linkedOperational,
    createdProducts,
    message: `Vínculos sincronizados: ${linkedProducts} produto(s), ${linkedOperational} item(ns) de notas e ${createdProducts} novo(s) produto(s) importado(s).`,
  };
}

/**
 * Busca os itens vendidos no PDV INOVE nas últimas `hoursBack` horas e dá baixa
 * automática e idempotente em `products` e `operational_items`.
 */
export async function deductStockFromInoveSales(opts?: {
  hoursBack?: number;
}): Promise<AutoDeductionResult> {
  const hoursBack = opts?.hoursBack ?? 24;
  const db = await getDb();
  if (!db) {
    return { salesChecked: 0, itemsDeducted: 0, unmatchedItems: 0, message: "Banco indisponível" };
  }

  // Saldo já implantado/importado contém vendas anteriores; não reexecutar histórico.
  // Ausência do marco deve falhar fechada, inclusive na execução manual.
  const [baselineJob] = await db.select().from(stockScheduledJobs)
    .where(eq(stockScheduledJobs.jobKey, "stock-deduction")).limit(1);
  const baseline = baselineJob?.createdAt ? new Date(baselineJob.createdAt) : null;
  if (!baseline || !Number.isFinite(baseline.getTime())) {
    throw new Error("PRECONDITION_FAILED: marco inicial da baixa automática não configurado (stock-deduction).");
  }

  const connRows = await db.select().from(inoveConnectorConfig).limit(1);
  if (!connRows.length || !connRows[0].active) {
    return { salesChecked: 0, itemsDeducted: 0, unmatchedItems: 0, message: "INOVE não conectado" };
  }

  const pool = await createInovePool(connRows[0]);
  let saleItemsRows: Array<{
    itemVendaId: number;
    vendaId: number;
    inoveProductId: number;
    productName: string;
    unit: string | null;
    quantity: number;
    soldAt: Date;
  }> = [];

  try {
    const res = await pool.request().query(`
      SELECT
        iv.ITEM_VENDA AS itemVendaId,
        iv.VENDA AS vendaId,
        iv.PRODUTO AS inoveProductId,
        ISNULL(p.PRO_NOME, ISNULL(iv.ITE_NOME, 'Produto sem nome')) AS productName,
        p.PRO_UNIDADE AS unit,
        CAST(ISNULL(iv.ITE_QUANTIDADE, 0) AS float) AS quantity,
        v.VEN_DATA_FIM AS soldAt
      FROM ITENS_VENDAS iv
      JOIN VENDAS v ON v.VENDA = iv.VENDA
      LEFT JOIN PRODUTOS p ON p.PRODUTO = iv.PRODUTO
      WHERE v.VEN_SITUACAO = 2
        AND ISNULL(v.VEN_ESTORNADO, 'N') = 'N'
        AND v.VEN_DATA_FIM >= DATEADD(HOUR, -${Math.max(1, Math.min(720, Math.floor(hoursBack)))}, GETDATE())
        AND v.VEN_DATA_FIM >= '${fmtInoveDate(baseline)}'
      ORDER BY v.VEN_DATA_FIM ASC, iv.ITEM_VENDA ASC
    `);

    saleItemsRows = (res.recordset as Array<Record<string, unknown>>).map((r) => ({
      itemVendaId: Number(r.itemVendaId),
      vendaId: Number(r.vendaId),
      inoveProductId: Number(r.inoveProductId),
      productName: String(r.productName ?? ""),
      unit: r.unit ? String(r.unit) : null,
      quantity: Number(r.quantity ?? 0),
      soldAt: r.soldAt instanceof Date ? r.soldAt : new Date(String(r.soldAt)),
    })).filter((r) => r.itemVendaId > 0 && r.quantity > 0);
  } finally {
    try { await pool.close(); } catch { /* ignore */ }
  }

  if (saleItemsRows.length === 0) {
    return {
      salesChecked: 0,
      itemsDeducted: 0,
      unmatchedItems: 0,
      message: "Nenhum item vendido no período consultado",
    };
  }

  // Filtrar itens que já tiveram baixa registrada (idempotência por ITEM_VENDA)
  const itemIds = saleItemsRows.map((r) => r.itemVendaId);
  const alreadyProcessed = new Set<number>();
  const chunkSize = 500;
  for (let i = 0; i < itemIds.length; i += chunkSize) {
    const batch = itemIds.slice(i, i + chunkSize);
    const existingLogs = await db
      .select({ inoveItemVendaId: inoveStockDeductionLog.inoveItemVendaId })
      .from(inoveStockDeductionLog)
      .where(inArray(inoveStockDeductionLog.inoveItemVendaId, batch));
    existingLogs.forEach((row) => alreadyProcessed.add(row.inoveItemVendaId));
  }

  const pendingItems = saleItemsRows.filter((r) => !alreadyProcessed.has(r.itemVendaId));
  if (pendingItems.length === 0) {
    return {
      salesChecked: saleItemsRows.length,
      itemsDeducted: 0,
      unmatchedItems: 0,
      message: `${saleItemsRows.length} item(ns) verificado(s), todas as baixas já estavam atualizadas`,
    };
  }

  const activeProducts = await db.select().from(products).where(eq(products.active, true));
  const activeOperational = await db.select().from(operationalItems).where(eq(operationalItems.active, true));

  let itemsDeducted = 0;
  let unmatchedItems = 0;

  for (const saleItem of pendingItems) {
    if (isBulkKgSaleItem(saleItem.productName, saleItem.unit)) {
      continue;
    }

    const normExact = normalizeStockName(saleItem.productName);
    const normCore = normalizeCoreFlavorName(saleItem.productName);
    const unique = <T,>(rows: T[]): T | undefined => rows.length === 1 ? rows[0] : undefined;
    const allowsLink = (row: { inoveProductId: number | null }) =>
      row.inoveProductId == null || row.inoveProductId === saleItem.inoveProductId;
    const productById = activeProducts.filter((p) => p.inoveProductId === saleItem.inoveProductId);
    const operationalById = activeOperational.filter((op) => op.inoveProductId === saleItem.inoveProductId);
    const eligibleProducts = activeProducts.filter(allowsLink);
    const eligibleOperational = activeOperational.filter(allowsLink);
    // Nunca escolher o primeiro de múltiplos candidatos, nem ignorar vínculo explícito.
    const matchedProduct = productById.length ? unique(productById)
      : unique(eligibleProducts.filter((p) => p.externalCode && Number(p.externalCode) === saleItem.inoveProductId))
        ?? unique(eligibleProducts.filter((p) => normalizeStockName(p.name) === normExact))
        ?? (normCore.length >= 3 ? unique(eligibleProducts.filter((p) => normalizeCoreFlavorName(p.name) === normCore)) : undefined);
    const matchedOperational = operationalById.length ? unique(operationalById)
      : unique(eligibleOperational.filter((op) => normalizeStockName(op.name) === normExact))
        ?? (normCore.length >= 3 ? unique(eligibleOperational.filter((op) => normalizeCoreFlavorName(op.name) === normCore)) : undefined);

    if ((!matchedProduct && !matchedOperational) || !Number.isFinite(saleItem.quantity)
      || !Number.isInteger(saleItem.inoveProductId) || saleItem.inoveProductId <= 0
      || (matchedProduct && !Number.isInteger(saleItem.quantity))) {
      unmatchedItems++;
      continue;
    }

    const reasonText = `Baixa automática PDV INOVE • Venda #${saleItem.vendaId} (${saleItem.productName})`.slice(0, 250);
    try {
      const outcome = await db.transaction(async (tx) => {
        // Mesma ordem de locks em todas as baixas; usar saldo atual, não snapshot do catálogo.
        const [product] = matchedProduct ? await tx.select().from(products)
          .where(eq(products.id, matchedProduct.id)).limit(1).for("update") : [];
        const [operational] = matchedOperational ? await tx.select().from(operationalItems)
          .where(eq(operationalItems.id, matchedOperational.id)).limit(1).for("update") : [];
        const [processed] = await tx.select().from(inoveStockDeductionLog)
          .where(eq(inoveStockDeductionLog.inoveItemVendaId, saleItem.itemVendaId)).limit(1).for("update");
        if (processed) return "processed";
        if ((matchedProduct && (!product?.active || !allowsLink(product)))
          || (matchedOperational && (!operational?.active || !allowsLink(operational)))) return "unmatched";
        const prevStock = Number(product?.currentStock ?? 0);
        const prevOpStock = Number(operational?.currentStock ?? 0);
        if (operational) {
          const unitsPerPackage = extractUnitsPerPackage(operational.name);
          if (!["un", "und", "unid", "unidade", "unidades"].includes(operational.unit.trim().toLowerCase())
            || (unitsPerPackage > 1 && operational.unitsPerPackage !== unitsPerPackage)) return "unmatched";
        }
        // Não criar saída fictícia/clamp a zero: insuficiência fica pendente para conciliação.
        if ((product && (!Number.isFinite(prevStock) || prevStock < saleItem.quantity))
          || (operational && (!Number.isFinite(prevOpStock) || prevOpStock < saleItem.quantity))) return "unmatched";
        // Claim único dentro da mesma transação; erro posterior desfaz log e todas as baixas.
        await tx.insert(inoveStockDeductionLog).values({
          inoveSaleId: saleItem.vendaId,
          inoveItemVendaId: saleItem.itemVendaId,
          inoveProductId: saleItem.inoveProductId,
          productName: saleItem.productName.slice(0, 255),
          quantitySold: saleItem.quantity.toFixed(3),
          productId: product?.id ?? null,
          operationalItemId: operational?.id ?? null,
          soldAt: saleItem.soldAt,
        });
        if (product) {
          const nextStock = prevStock - saleItem.quantity;
          await tx.insert(stockMovements).values({
            productId: product.id, type: "sale", quantity: saleItem.quantity,
            previousStock: prevStock, newStock: nextStock, reason: reasonText,
          });
          await tx.update(products).set({ currentStock: nextStock,
            inoveProductId: product.inoveProductId ?? saleItem.inoveProductId, updatedAt: new Date(),
          }).where(eq(products.id, product.id));
        }
        if (operational) {
          const nextStock = prevOpStock - saleItem.quantity;
          await tx.insert(operationalStockMovements).values({
            itemId: operational.id, type: "consumption", quantity: saleItem.quantity.toFixed(2),
            previousStock: prevOpStock.toFixed(2), newStock: nextStock.toFixed(2), reason: reasonText,
          });
          await tx.update(operationalItems).set({ currentStock: nextStock.toFixed(2),
            inoveProductId: operational.inoveProductId ?? saleItem.inoveProductId, updatedAt: new Date(),
          }).where(eq(operationalItems.id, operational.id));
        }
        return "deducted";
      });
      if (outcome === "deducted") itemsDeducted++;
      if (outcome === "unmatched") unmatchedItems++;
    } catch (error) {
      const dbError = error as { code?: string; cause?: { code?: string } };
      if (dbError.code === "ER_DUP_ENTRY" || dbError.cause?.code === "ER_DUP_ENTRY") continue;
      throw error;
    }
  }

  return {
    salesChecked: saleItemsRows.length,
    itemsDeducted,
    unmatchedItems,
    message: itemsDeducted > 0
      ? `${itemsDeducted} item(ns) baixado(s) automaticamente do estoque`
      : `Nenhuma nova baixa pendente (${saleItemsRows.length} itens verificados)`,
  };
}
