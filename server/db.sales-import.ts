import { getDb } from "./db";
import {
  salesImports,
  salesImportItems,
  salesImportPayments,
  products,
  stockMovements,
} from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ParsedProduct {
  external_code: string;
  external_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface ParsedPayment {
  method: string;
  total: number;
  count: number;
}

// ─── Fuzzy match: casar produto PDV com produto do estoque ────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Jaccard similarity por palavras
  const wa = na.split(" ");
  const wb = nb.split(" ");
  const waSet = new Set<string>(wa);
  const wbSet = new Set<string>(wb);
  const intersectionSize = wa.filter((x) => wbSet.has(x)).length;
  const unionSize = new Set<string>([...wa, ...wb]).size;
  return intersectionSize / unionSize;
}

export async function matchProductsToStock(
  items: ParsedProduct[]
): Promise<
  Array<
    ParsedProduct & {
      productId: number | null;
      productName: string | null;
      matchScore: number;
      linkStatus: "linked" | "pending";
    }
  >
> {
  const db = await getDb();
  if (!db) return items.map((i) => ({ ...i, productId: null, productName: null, matchScore: 0, linkStatus: "pending" as const }));

  const allProducts = await db
    .select({ id: products.id, name: products.name, externalCode: products.externalCode })
    .from(products)
    .where(eq(products.active, true));

  return items.map((item) => {
    // 1. Tentar por externalCode exato
    const byCode = allProducts.find((p: { id: number; name: string; externalCode: string | null }) => p.externalCode === item.external_code);
    if (byCode) {
      return { ...item, productId: byCode.id, productName: byCode.name, matchScore: 1.0, linkStatus: "linked" as const };
    }

    // 2. Fuzzy match por nome
    let bestMatch: { id: number; name: string; score: number } | null = null;
    for (const p of allProducts as Array<{ id: number; name: string; externalCode: string | null }>) {
      const score = similarity(item.external_name, p.name);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: p.id, name: p.name, score };
      }
    }

    const THRESHOLD = 0.5;
    if (bestMatch && bestMatch.score >= THRESHOLD) {
      return {
        ...item,
        productId: bestMatch.id,
        productName: bestMatch.name,
        matchScore: bestMatch.score,
        linkStatus: "linked" as const,
      };
    }

    return { ...item, productId: null, productName: null, matchScore: bestMatch?.score ?? 0, linkStatus: "pending" as const };
  });
}

// ─── Criar importação ─────────────────────────────────────────────────────────

export async function createSalesImport(
  userId: number,
  referenceMonth: string,
  items: ParsedProduct[],
  payments: ParsedPayment[],
  totalRevenue: number,
  totalTransactions: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const matchedItems = await matchProductsToStock(items);
  const linkedCount = matchedItems.filter((i) => i.linkStatus === "linked").length;
  const pendingCount = matchedItems.filter((i) => i.linkStatus === "pending").length;

  // Inserir cabeçalho
  const [result] = await db.insert(salesImports).values({
    userId,
    referenceMonth,
    status: "pending",
    totalRevenue: String(totalRevenue),
    totalItems: items.length,
    totalTransactions,
    linkedItems: linkedCount,
    pendingItems: pendingCount,
  });

  const importId = (result as unknown as { insertId: number }).insertId;

  // Inserir itens
  if (matchedItems.length > 0) {
    await db.insert(salesImportItems).values(
      matchedItems.map((item) => ({
        importId,
        externalCode: item.external_code,
        externalName: item.external_name,
        unit: item.unit,
        quantity: String(item.quantity),
        unitPrice: String(item.unit_price),
        totalPrice: String(item.total_price),
        productId: item.productId,
        linkStatus: item.linkStatus,
      }))
    );
  }

  // Inserir formas de pagamento
  if (payments.length > 0) {
    await db.insert(salesImportPayments).values(
      payments.map((p) => ({
        importId,
        paymentMethod: p.method,
        totalAmount: String(p.total),
        transactionCount: p.count,
      }))
    );
  }

  return { importId, linkedCount, pendingCount };
}

// ─── Listar importações ───────────────────────────────────────────────────────

export async function getSalesImports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(salesImports).orderBy(desc(salesImports.createdAt));
}

// ─── Detalhe de uma importação ────────────────────────────────────────────────

export async function getSalesImportDetail(importId: number) {
  const db = await getDb();
  if (!db) return null;

  const [header] = await db.select().from(salesImports).where(eq(salesImports.id, importId));
  if (!header) return null;

  const items = await db
    .select({
      id: salesImportItems.id,
      externalCode: salesImportItems.externalCode,
      externalName: salesImportItems.externalName,
      unit: salesImportItems.unit,
      quantity: salesImportItems.quantity,
      unitPrice: salesImportItems.unitPrice,
      totalPrice: salesImportItems.totalPrice,
      productId: salesImportItems.productId,
      linkStatus: salesImportItems.linkStatus,
      productName: products.name,
    })
    .from(salesImportItems)
    .leftJoin(products, eq(salesImportItems.productId, products.id))
    .where(eq(salesImportItems.importId, importId))
    .orderBy(desc(salesImportItems.totalPrice));

  const payments = await db
    .select()
    .from(salesImportPayments)
    .where(eq(salesImportPayments.importId, importId))
    .orderBy(desc(salesImportPayments.totalAmount));

  return { header, items, payments };
}

// ─── Vincular item a produto ──────────────────────────────────────────────────

export async function linkImportItem(
  itemId: number,
  productId: number | null,
  linkStatus: "linked" | "pending" | "ignored",
  saveExternalCode: boolean
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db
    .update(salesImportItems)
    .set({ productId, linkStatus })
    .where(eq(salesImportItems.id, itemId));

  // Se solicitado, salvar o externalCode no produto para uso futuro
  if (saveExternalCode && productId) {
    const [item] = await db.select().from(salesImportItems).where(eq(salesImportItems.id, itemId));
    if (item) {
      await db
        .update(products)
        .set({ externalCode: item.externalCode })
        .where(eq(products.id, productId));
    }
  }

  // Atualizar contadores do cabeçalho
  const [item] = await db.select().from(salesImportItems).where(eq(salesImportItems.id, itemId));
  if (item) {
    const allItems = await db
      .select({ linkStatus: salesImportItems.linkStatus })
      .from(salesImportItems)
      .where(eq(salesImportItems.importId, item.importId));

    const linkedCount = allItems.filter((i: { linkStatus: string }) => i.linkStatus === "linked").length;
    const pendingCount = allItems.filter((i: { linkStatus: string }) => i.linkStatus === "pending").length;

    await db
      .update(salesImports)
      .set({ linkedItems: linkedCount, pendingItems: pendingCount })
      .where(eq(salesImports.id, item.importId));
  }

  return { success: true };
}

// ─── Confirmar importação (descontar estoque) ─────────────────────────────────

export async function confirmSalesImport(importId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [header] = await db.select().from(salesImports).where(eq(salesImports.id, importId));
  if (!header) throw new Error("Importação não encontrada");
  if (header.status === "confirmed") throw new Error("Importação já foi confirmada");

  const items = await db
    .select()
    .from(salesImportItems)
    .where(and(eq(salesImportItems.importId, importId), eq(salesImportItems.linkStatus, "linked")));

  let stockUpdated = 0;

  for (const item of items) {
    if (!item.productId) continue;

    const qty = Math.round(Number(item.quantity));
    if (qty <= 0) continue;

    // Descontar do estoque
    const [prod] = await db.select({ currentStock: products.currentStock }).from(products).where(eq(products.id, item.productId));
    if (!prod) continue;

    const newStock = Math.max(0, prod.currentStock - qty);
    await db.update(products).set({ currentStock: newStock }).where(eq(products.id, item.productId));

    // Registrar movimentação de estoque
    await db.insert(stockMovements).values({
      productId: item.productId,
      type: "sale",
      quantity: qty,
      previousStock: prod.currentStock,
      newStock,
      unitCost: item.unitPrice,
      reason: `Importação de vendas ${header.referenceMonth} (ID: ${importId})`,
      userId,
    });

    stockUpdated++;
  }

  // Marcar como confirmada
  await db
    .update(salesImports)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(salesImports.id, importId));

  return { success: true, stockUpdated, itemsLinked: items.length };
}

// ─── Cancelar/excluir importação pendente ────────────────────────────────────

export async function deleteSalesImport(importId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [header] = await db.select().from(salesImports).where(eq(salesImports.id, importId));
  if (!header) throw new Error("Importação não encontrada");
  if (header.status === "confirmed") throw new Error("Não é possível excluir uma importação já confirmada");

  await db.delete(salesImportItems).where(eq(salesImportItems.importId, importId));
  await db.delete(salesImportPayments).where(eq(salesImportPayments.importId, importId));
  await db.delete(salesImports).where(eq(salesImports.id, importId));

  return { success: true };
}

// ─── Listar produtos do estoque para seleção manual ──────────────────────────

export async function getProductsForLinking() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: products.id, name: products.name, externalCode: products.externalCode, currentStock: products.currentStock, unit: products.unit })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(products.name);
}
