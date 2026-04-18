import { getDb } from "./db";
import {
  salesImports,
  salesImportItems,
  salesImportPayments,
  products,
  stockMovements,
  finDailyRevenue,
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
    .select({
      id: products.id,
      name: products.name,
      externalCode: products.externalCode,
      sku: products.sku,
      supplierCode: products.supplierCode,
    })
    .from(products)
    .where(eq(products.active, true));

  return items.map((item) => {
    const code = item.external_code?.trim();

    // 1. Tentar por externalCode exato
    if (code) {
      const byExtCode = allProducts.find((p) => p.externalCode?.trim() === code);
      if (byExtCode) {
        return { ...item, productId: byExtCode.id, productName: byExtCode.name, matchScore: 1.0, linkStatus: "linked" as const };
      }

      // 2. Tentar por SKU (código PDV geralmente salvo aqui)
      const bySku = allProducts.find((p) => p.sku?.trim() === code);
      if (bySku) {
        return { ...item, productId: bySku.id, productName: bySku.name, matchScore: 1.0, linkStatus: "linked" as const };
      }

      // 3. Tentar por supplierCode
      const bySupplier = allProducts.find((p) => p.supplierCode?.trim() === code);
      if (bySupplier) {
        return { ...item, productId: bySupplier.id, productName: bySupplier.name, matchScore: 1.0, linkStatus: "linked" as const };
      }
    }

    // 4. Fuzzy match por nome
    let bestMatch: { id: number; name: string; score: number } | null = null;
    for (const p of allProducts) {
      const score = similarity(item.external_name, p.name);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: p.id, name: p.name, score };
      }
    }

    const THRESHOLD = 0.75;
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

export interface DailySummaryEntry {
  date: string;
  total: number;
  transactions: number;
  payments: Record<string, number | unknown>;
}

export async function createSalesImport(
  userId: number,
  referenceMonth: string,
  items: (ParsedProduct & { productId?: number | null; linkStatus?: string })[],
  payments: ParsedPayment[],
  totalRevenue: number,
  totalTransactions: number,
  importMode: "monthly" | "daily" = "monthly",
  saleDate?: string,
  dailySummary?: DailySummaryEntry[]
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Se os itens já vierem com vínculos do frontend, usar diretamente
  // Caso contrário, tentar fuzzy match automático
  const hasPreLinked = items.some((i) => i.productId !== undefined || i.linkStatus !== undefined);
  const matchedItems = hasPreLinked
    ? items.map((item) => ({
        ...item,
        productId: item.productId ?? null,
        productName: null,
        matchScore: item.productId ? 1.0 : 0,
        linkStatus: (item.linkStatus ?? (item.productId ? "linked" : "pending")) as "linked" | "pending" | "ignored",
      }))
    : await matchProductsToStock(items);
  const linkedCount = matchedItems.filter((i) => i.linkStatus === "linked").length;
  const pendingCount = matchedItems.filter((i) => i.linkStatus === "pending").length;

  // Inserir cabeçalho
  const [result] = await db.insert(salesImports).values({
    userId,
    referenceMonth,
    importMode,
    saleDate: saleDate ? new Date(saleDate) : null,
    status: "pending",
    totalRevenue: String(totalRevenue),
    totalItems: items.length,
    totalTransactions,
    linkedItems: linkedCount,
    pendingItems: pendingCount,
    caixaDailySummary: dailySummary && dailySummary.length > 0 ? dailySummary : null,
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

    // Salvar externalCode nos produtos vinculados para uso em futuras importações
    const linkedItems = matchedItems.filter(i => i.linkStatus === "linked" && i.productId);
    for (const item of linkedItems) {
      if (!item.productId) continue;
      // Verificar se o produto já tem um externalCode diferente
      const [prod] = await db.select({ externalCode: products.externalCode }).from(products).where(eq(products.id, item.productId));
      if (prod && !prod.externalCode) {
        // Salvar apenas se ainda não tiver código externo
        await db.update(products).set({ externalCode: item.external_code }).where(eq(products.id, item.productId));
      }
    }
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

export async function getSalesImports(showArchived = false) {
  const db = await getDb();
  if (!db) return [];
  if (showArchived) {
    return db.select().from(salesImports).orderBy(desc(salesImports.createdAt));
  }
  return db
    .select()
    .from(salesImports)
    .where(eq(salesImports.archived, false))
    .orderBy(desc(salesImports.createdAt));
}

// ─── Arquivar importação (ocultar da lista principal) ─────────────────────────

export async function archiveSalesImport(importId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [header] = await db.select().from(salesImports).where(eq(salesImports.id, importId));
  if (!header) throw new Error("Importação não encontrada");

  await db
    .update(salesImports)
    .set({ archived: true, archivedAt: new Date() })
    .where(eq(salesImports.id, importId));

  return { success: true };
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

  // ── Verificar se já existe importação confirmada para o mesmo mês (reimportação) ──
  // Busca a última importação confirmada do mesmo mês (excluindo a atual)
  const previousImports = await db
    .select({ id: salesImports.id })
    .from(salesImports)
    .where(
      and(
        eq(salesImports.referenceMonth, header.referenceMonth),
        eq(salesImports.status, "confirmed")
      )
    )
    .orderBy(desc(salesImports.confirmedAt))
    .limit(1);

  // Mapa de qtd anterior por productId (da última importação confirmada do mesmo mês)
  const previousQtyMap = new Map<number, number>();
  let isReimport = false;

  if (previousImports.length > 0) {
    isReimport = true;
    const prevImportId = previousImports[0].id;
    const prevItems = await db
      .select({ productId: salesImportItems.productId, quantity: salesImportItems.quantity })
      .from(salesImportItems)
      .where(
        and(
          eq(salesImportItems.importId, prevImportId),
          eq(salesImportItems.linkStatus, "linked")
        )
      );
    for (const pi of prevItems) {
      if (!pi.productId) continue;
      const prev = previousQtyMap.get(pi.productId) ?? 0;
      previousQtyMap.set(pi.productId, prev + Math.round(Number(pi.quantity)));
    }
  }

  let stockUpdated = 0;

  for (const item of items) {
    if (!item.productId) continue;

    const newQty = Math.round(Number(item.quantity));
    if (newQty < 0) continue;

    // Calcular delta: nova qtd - qtd anterior (0 se primeira importação)
    const prevQty = previousQtyMap.get(item.productId) ?? 0;
    const delta = newQty - prevQty;

    // Se delta = 0, nada a fazer para este produto
    if (delta === 0) continue;

    // Buscar estoque atual
    const [prod] = await db.select({ currentStock: products.currentStock }).from(products).where(eq(products.id, item.productId));
    if (!prod) continue;

    let newStock: number;
    let movType: "sale" | "adjustment";
    let movQty: number;
    let movReason: string;

    if (delta > 0) {
      // Vendeu mais que antes → descontar o delta
      newStock = Math.max(0, prod.currentStock - delta);
      movType = isReimport ? "adjustment" : "sale";
      movQty = delta;
      movReason = isReimport
        ? `Reimportação ${header.referenceMonth} — delta +${delta} un (ID: ${importId})`
        : `Importação de vendas ${header.referenceMonth} (ID: ${importId})`;
    } else {
      // Vendeu menos que antes → devolver o delta ao estoque
      newStock = prod.currentStock + Math.abs(delta);
      movType = "adjustment";
      movQty = Math.abs(delta);
      movReason = `Reimportação ${header.referenceMonth} — delta ${delta} un, estoque devolvido (ID: ${importId})`;
    }

    await db.update(products).set({ currentStock: newStock }).where(eq(products.id, item.productId));

    // Registrar movimentação de estoque
    await db.insert(stockMovements).values({
      productId: item.productId,
      type: movType,
      quantity: movQty,
      previousStock: prod.currentStock,
      newStock,
      unitCost: item.unitPrice,
      reason: movReason,
      userId,
    });

    stockUpdated++;
  }

  // Produtos que existiam na importação anterior mas não existem na nova → devolver ao estoque
  if (isReimport) {
    const newProductIds = new Set(items.filter(i => i.productId).map(i => i.productId!));
    for (const [productId, prevQty] of Array.from(previousQtyMap.entries())) {
      if (!newProductIds.has(productId) && prevQty > 0) {
        const [prod] = await db.select({ currentStock: products.currentStock }).from(products).where(eq(products.id, productId));
        if (!prod) continue;
        const newStock = prod.currentStock + prevQty;
        await db.update(products).set({ currentStock: newStock }).where(eq(products.id, productId));
        await db.insert(stockMovements).values({
          productId,
          type: "adjustment",
          quantity: prevQty,
          previousStock: prod.currentStock,
          newStock,
          reason: `Reimportação ${header.referenceMonth} — produto removido, estoque devolvido (ID: ${importId})`,
          userId,
        });
        stockUpdated++;
      }
    }
  }

  // Marcar como confirmada
  await db
    .update(salesImports)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(salesImports.id, importId));

  // Popular automaticamente o faturamento real na Previsão de Faturamento
  const note = `Importado automaticamente da planilha PDV (ID: ${importId})`;

  if (header.importMode === "daily" && header.saleDate) {
    // Modo diário: usar a data específica da importação
    const revenueDate = header.saleDate instanceof Date
      ? header.saleDate.toISOString().slice(0, 10)
      : String(header.saleDate).slice(0, 10);
    const realAmount = String(header.totalRevenue);

    const existing = await db.select().from(finDailyRevenue)
      .where(eq(finDailyRevenue.revenueDate, revenueDate))
      .limit(1);

    if (existing.length > 0) {
      await db.update(finDailyRevenue)
        .set({ realAmount, note, updatedAt: new Date() })
        .where(eq(finDailyRevenue.revenueDate, revenueDate));
    } else {
      await db.insert(finDailyRevenue).values({ userId, revenueDate, realAmount, note });
    }
  } else if (header.caixaDailySummary && Array.isArray(header.caixaDailySummary) && header.caixaDailySummary.length > 0) {
    // Modo mensal com arquivo de caixa: popular cada dia individualmente
    const dailyEntries = header.caixaDailySummary as DailySummaryEntry[];
    for (const entry of dailyEntries) {
      if (!entry.date || !entry.total) continue;
      const revenueDate = entry.date; // já está no formato YYYY-MM-DD
      const realAmount = String(Math.round(entry.total * 100) / 100);

      const existing = await db.select().from(finDailyRevenue)
        .where(eq(finDailyRevenue.revenueDate, revenueDate))
        .limit(1);

      if (existing.length > 0) {
        await db.update(finDailyRevenue)
          .set({ realAmount, note, updatedAt: new Date() })
          .where(eq(finDailyRevenue.revenueDate, revenueDate));
      } else {
        await db.insert(finDailyRevenue).values({ userId, revenueDate, realAmount, note });
      }
    }
  }

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

// ─── Listar todos os mapeamentos PDV → Estoque ────────────────────────────────

export async function getAllMappings() {
  const db = await getDb();
  if (!db) return [];

  // Produtos com externalCode definido (já mapeados)
  const mapped = await db
    .select({
      productId: products.id,
      productName: products.name,
      externalCode: products.externalCode,
      currentStock: products.currentStock,
      unit: products.unit,
      active: products.active,
    })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(products.name);

  // Buscar nomes do PDV para cada externalCode (da tabela sales_import_items)
  const codesWithNames: Record<string, string> = {};
  const allCodes = mapped.filter(p => p.externalCode).map(p => p.externalCode as string);
  if (allCodes.length > 0) {
    const items = await db
      .select({ externalCode: salesImportItems.externalCode, externalName: salesImportItems.externalName })
      .from(salesImportItems)
      .where(inArray(salesImportItems.externalCode, allCodes));
    for (const item of items) {
      if (!codesWithNames[item.externalCode]) {
        codesWithNames[item.externalCode] = item.externalName;
      }
    }
  }

  return mapped.map(p => ({
    ...p,
    externalName: p.externalCode ? (codesWithNames[p.externalCode] ?? null) : null,
  }));
}

// ─── Atualizar mapeamento de um produto (externalCode) ────────────────────────

export async function updateProductMapping(productId: number, externalCode: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.update(products).set({ externalCode }).where(eq(products.id, productId));
  return { success: true };
}

// ─── Relatório de vendas por produto (top N por mês) ─────────────────────────

export async function getSalesReport(referenceMonth: string, compareMonth?: string) {
  const db = await getDb();
  if (!db) return { current: [], previous: [] };

  // Buscar itens confirmados do mês atual
  const currentImports = await db
    .select({ id: salesImports.id })
    .from(salesImports)
    .where(and(eq(salesImports.referenceMonth, referenceMonth), eq(salesImports.status, "confirmed")));

  const currentImportIds = currentImports.map((i: { id: number }) => i.id);

  let currentItems: any[] = [];
  if (currentImportIds.length > 0) {
    currentItems = await db
      .select({
        externalCode: salesImportItems.externalCode,
        externalName: salesImportItems.externalName,
        productId: salesImportItems.productId,
        productName: products.name,
        totalQuantity: salesImportItems.quantity,
        totalRevenue: salesImportItems.totalPrice,
        unitPrice: salesImportItems.unitPrice,
      })
      .from(salesImportItems)
      .leftJoin(products, eq(salesImportItems.productId, products.id))
      .where(inArray(salesImportItems.importId, currentImportIds));
  }

  // Agregar por produto
  const currentAgg: Record<string, { externalCode: string; externalName: string; productName: string | null; totalQuantity: number; totalRevenue: number; unitPrice: number }> = {};
  for (const item of currentItems) {
    const key = item.externalCode;
    if (!currentAgg[key]) {
      currentAgg[key] = {
        externalCode: item.externalCode,
        externalName: item.externalName,
        productName: item.productName,
        totalQuantity: 0,
        totalRevenue: 0,
        unitPrice: Number(item.unitPrice),
      };
    }
    currentAgg[key].totalQuantity += Number(item.totalQuantity);
    currentAgg[key].totalRevenue += Number(item.totalRevenue);
  }

  const currentSorted = Object.values(currentAgg)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 20);

  // Mês anterior para comparativo
  let previousSorted: typeof currentSorted = [];
  if (compareMonth) {
    const prevImports = await db
      .select({ id: salesImports.id })
      .from(salesImports)
      .where(and(eq(salesImports.referenceMonth, compareMonth), eq(salesImports.status, "confirmed")));

    const prevImportIds = prevImports.map((i: { id: number }) => i.id);
    if (prevImportIds.length > 0) {
      const prevItems = await db
        .select({
          externalCode: salesImportItems.externalCode,
          externalName: salesImportItems.externalName,
          productId: salesImportItems.productId,
          productName: products.name,
          totalQuantity: salesImportItems.quantity,
          totalRevenue: salesImportItems.totalPrice,
          unitPrice: salesImportItems.unitPrice,
        })
        .from(salesImportItems)
        .leftJoin(products, eq(salesImportItems.productId, products.id))
        .where(inArray(salesImportItems.importId, prevImportIds));

      const prevAgg: typeof currentAgg = {};
      for (const item of prevItems) {
        const key = item.externalCode;
        if (!prevAgg[key]) {
          prevAgg[key] = {
            externalCode: item.externalCode,
            externalName: item.externalName,
            productName: item.productName,
            totalQuantity: 0,
            totalRevenue: 0,
            unitPrice: Number(item.unitPrice),
          };
        }
        prevAgg[key].totalQuantity += Number(item.totalQuantity);
        prevAgg[key].totalRevenue += Number(item.totalRevenue);
      }
      previousSorted = Object.values(prevAgg)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 20);
    }
  }

  return { current: currentSorted, previous: previousSorted };
}

// ─── Importação Diária Express: parseia, vincula e baixa estoque em uma operação ──
export async function importDiarioExpress(
  items: ParsedProduct[],
  saleDate: string, // YYYY-MM-DD
  userId: number,
  totalRevenue: number
): Promise<{
  importId: number;
  stockUpdated: number;
  notLinked: Array<{ external_code: string; external_name: string; quantity: number }>;
  message: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // 1. Fazer matching automático
  const matched = await matchProductsToStock(items);
  const linked = matched.filter((i) => i.linkStatus === "linked" && i.productId);
  const notLinked = matched
    .filter((i) => i.linkStatus === "pending" || !i.productId)
    .map((i) => ({ external_code: i.external_code, external_name: i.external_name, quantity: i.quantity }));

  // 2. Criar registro de importação (modo diário, já confirmado)
  const referenceMonth = saleDate.slice(0, 7);
  const [result] = await db.insert(salesImports).values({
    userId,
    referenceMonth,
    importMode: "daily",
    saleDate: new Date(saleDate + "T12:00:00Z"),
    status: "confirmed",
    totalRevenue: String(Math.round(totalRevenue * 100) / 100),
    totalItems: items.length,
    totalTransactions: 0,
    linkedItems: linked.length,
    pendingItems: notLinked.length,
    confirmedAt: new Date(),
  }).$returningId();
  const importId = (result as unknown as { id: number }).id;

  // 3. Salvar itens e baixar estoque
  let stockUpdated = 0;
  for (const item of matched) {
    await db.insert(salesImportItems).values({
      importId,
      externalCode: item.external_code,
      externalName: item.external_name,
      unit: item.unit,
      quantity: String(item.quantity),
      unitPrice: String(item.unit_price),
      totalPrice: String(item.total_price),
      productId: item.productId ?? null,
      linkStatus: item.linkStatus,
    });
    if (item.productId && item.linkStatus === "linked") {
      const qty = Math.round(item.quantity);
      if (qty <= 0) continue;
      const [prod] = await db.select({ currentStock: products.currentStock }).from(products).where(eq(products.id, item.productId));
      if (!prod) continue;
      const newStock = Math.max(0, prod.currentStock - qty);
      await db.update(products).set({ currentStock: newStock }).where(eq(products.id, item.productId));
      await db.insert(stockMovements).values({
        productId: item.productId,
        type: "sale",
        quantity: qty,
        previousStock: prod.currentStock,
        newStock,
        unitCost: String(item.unit_price),
        reason: `Importação diária ${saleDate} (ID: ${importId})`,
        userId,
      });
      // Salvar externalCode no produto para futuras importações
      if (item.external_code) {
        const [p] = await db.select({ externalCode: products.externalCode }).from(products).where(eq(products.id, item.productId));
        if (p && !p.externalCode) {
          await db.update(products).set({ externalCode: item.external_code }).where(eq(products.id, item.productId));
        }
      }
      stockUpdated++;
    }
  }

  // 4. Popular Previsão de Faturamento
  const note = `Importação diária ${saleDate} (ID: ${importId})`;
  const realAmount = String(Math.round(totalRevenue * 100) / 100);
  const existing = await db.select().from(finDailyRevenue).where(eq(finDailyRevenue.revenueDate, saleDate)).limit(1);
  if (existing.length > 0) {
    await db.update(finDailyRevenue).set({ realAmount, note, updatedAt: new Date() }).where(eq(finDailyRevenue.revenueDate, saleDate));
  } else {
    await db.insert(finDailyRevenue).values({ userId, revenueDate: saleDate, realAmount, note });
  }

  return {
    importId,
    stockUpdated,
    notLinked,
    message: `${stockUpdated} produto(s) com estoque baixado.${notLinked.length > 0 ? ` ${notLinked.length} produto(s) sem vínculo — vincule manualmente.` : " Todos os produtos foram vinculados automaticamente!"}`,
  };
}

// ─── Listar meses com importações confirmadas ─────────────────────────────────
export async function getConfirmedMonths() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ referenceMonth: salesImports.referenceMonth })
    .from(salesImports)
    .where(eq(salesImports.status, "confirmed"))
    .orderBy(desc(salesImports.referenceMonth));
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const r of rows) {
    if (!seen.has(r.referenceMonth)) {
      seen.add(r.referenceMonth);
      unique.push(r.referenceMonth);
    }
  }
  return unique;
}
