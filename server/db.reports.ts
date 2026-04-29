import { getDb } from "./db";
import { sql, desc, asc, eq, and, gte, lte, isNotNull, gt } from "drizzle-orm";
import {
  products,
  salesImportItems,
  salesImports,
  salesImportPayments,
  stockMovements,
  finTransactions,
  finCategories,
  finCosts,
} from "../drizzle/schema";

// ─── Relatório: Custo x Venda por Produto ─────────────────────────────────────
export async function getCostVsSalesReport(referenceMonth?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Buscar itens de vendas vinculados a produtos, com custo
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      costPrice: products.costPrice,
      salePrice: products.salePrice,
      totalQty: sql<number>`SUM(${salesImportItems.quantity})`,
      totalRevenue: sql<number>`SUM(${salesImportItems.totalPrice})`,
      avgUnitPrice: sql<number>`AVG(${salesImportItems.unitPrice})`,
      referenceMonth: salesImports.referenceMonth,
    })
    .from(salesImportItems)
    .innerJoin(products, eq(salesImportItems.productId, products.id))
    .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
    .where(
      and(
        eq(salesImportItems.linkStatus, "linked"),
        eq(salesImports.status, "confirmed"),
        referenceMonth ? eq(salesImports.referenceMonth, referenceMonth) : undefined
      )
    )
    .groupBy(
      products.id,
      products.name,
      products.costPrice,
      products.salePrice,
      salesImports.referenceMonth
    )
    .orderBy(desc(sql`SUM(${salesImportItems.totalPrice})`));

  return rows.map((r) => {
    const avgPrice = Number(r.avgUnitPrice) || 0;
    const costPrice = Number(r.costPrice) || 0;
    const totalRevenue = Number(r.totalRevenue) || 0;
    const totalQty = Number(r.totalQty) || 0;
    const totalCost = costPrice * totalQty;
    const grossProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      productId: r.productId,
      productName: r.productName,
      costPrice,
      avgSalePrice: avgPrice,
      totalQty,
      totalRevenue,
      totalCost,
      grossProfit,
      margin: parseFloat(margin.toFixed(2)),
      referenceMonth: r.referenceMonth,
    };
  });
}

// ─── Relatório: Top Produtos Mais Vendidos ────────────────────────────────────
export async function getTopProductsReport(referenceMonth?: string, limit = 20) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      costPrice: products.costPrice,
      totalQty: sql<number>`SUM(${salesImportItems.quantity})`,
      totalRevenue: sql<number>`SUM(${salesImportItems.totalPrice})`,
      avgUnitPrice: sql<number>`AVG(${salesImportItems.unitPrice})`,
    })
    .from(salesImportItems)
    .innerJoin(products, eq(salesImportItems.productId, products.id))
    .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
    .where(
      and(
        eq(salesImportItems.linkStatus, "linked"),
        eq(salesImports.status, "confirmed"),
        referenceMonth ? eq(salesImports.referenceMonth, referenceMonth) : undefined
      )
    )
    .groupBy(products.id, products.name, products.costPrice)
    .orderBy(desc(sql`SUM(${salesImportItems.totalPrice})`))
    .limit(limit);

  return rows.map((r, i) => {
    const avgPrice = Number(r.avgUnitPrice) || 0;
    const costPrice = Number(r.costPrice) || 0;
    const totalRevenue = Number(r.totalRevenue) || 0;
    const totalQty = Number(r.totalQty) || 0;
    const totalCost = costPrice * totalQty;
    const grossProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      rank: i + 1,
      productId: r.productId,
      productName: r.productName,
      costPrice,
      avgSalePrice: avgPrice,
      totalQty,
      totalRevenue,
      totalCost,
      grossProfit,
      margin: parseFloat(margin.toFixed(2)),
    };
  });
}

// ─── Relatório: Formas de Pagamento do Caixa ─────────────────────────────────
export async function getPaymentMethodsReport(referenceMonth?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = await db
    .select({
      paymentMethod: salesImportPayments.paymentMethod,
      totalAmount: sql<number>`SUM(${salesImportPayments.totalAmount})`,
      transactionCount: sql<number>`SUM(${salesImportPayments.transactionCount})`,
      referenceMonth: salesImports.referenceMonth,
    })
    .from(salesImportPayments)
    .innerJoin(salesImports, eq(salesImportPayments.importId, salesImports.id))
    .where(
      and(
        eq(salesImports.status, "confirmed"),
        referenceMonth ? eq(salesImports.referenceMonth, referenceMonth) : undefined
      )
    )
    .groupBy(salesImportPayments.paymentMethod, salesImports.referenceMonth)
    .orderBy(desc(sql`SUM(${salesImportPayments.totalAmount})`));

  const totalAmount = rows.reduce((s, r) => s + Number(r.totalAmount), 0);

  return rows.map((r) => ({
    paymentMethod: r.paymentMethod,
    totalAmount: Number(r.totalAmount),
    transactionCount: Number(r.transactionCount),
    percentage: totalAmount > 0 ? parseFloat(((Number(r.totalAmount) / totalAmount) * 100).toFixed(2)) : 0,
    referenceMonth: r.referenceMonth,
  }));
}

// ─── Relatório: DRE (Demonstrativo de Resultado) ─────────────────────────────
export async function getDREReport(referenceMonth?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // 1. Receita Bruta de Vendas (sales_imports confirmados)
  const salesRows = await db
    .select({
      referenceMonth: salesImports.referenceMonth,
      totalRevenue: sql<number>`SUM(${salesImports.totalRevenue})`,
    })
    .from(salesImports)
    .where(
      and(
        eq(salesImports.status, "confirmed"),
        referenceMonth ? eq(salesImports.referenceMonth, referenceMonth) : undefined
      )
    )
    .groupBy(salesImports.referenceMonth);

  // 2. CMV (Custo das Mercadorias Vendidas) — custo * quantidade vendida
  const cmvRows = await db
    .select({
      referenceMonth: salesImports.referenceMonth,
      totalCost: sql<number>`SUM(${products.costPrice} * ${salesImportItems.quantity})`,
    })
    .from(salesImportItems)
    .innerJoin(products, eq(salesImportItems.productId, products.id))
    .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
    .where(
      and(
        eq(salesImportItems.linkStatus, "linked"),
        eq(salesImports.status, "confirmed"),
        referenceMonth ? eq(salesImports.referenceMonth, referenceMonth) : undefined
      )
    )
    .groupBy(salesImports.referenceMonth);

  // 3. Despesas por categoria (fin_transactions)
  // Extrair mês/ano das transações para filtrar
  const expenseRows = await db
    .select({
      categoryName: finCategories.name,
      totalAmount: sql<number>`SUM(ABS(${finTransactions.amount}))`,
      transactionCount: sql<number>`COUNT(*)`,
    })
    .from(finTransactions)
    .leftJoin(finCategories, eq(finTransactions.categoryId, finCategories.id))
    .where(
      and(
        referenceMonth
          ? sql`DATE_FORMAT(${finTransactions.paymentDate}, '%Y-%m') = ${referenceMonth}`
          : undefined
      )
    )
    .groupBy(finCategories.name)
    .orderBy(desc(sql`SUM(ABS(${finTransactions.amount}))`));

  // 4. Montar DRE
  const totalRevenue = salesRows.reduce((s, r) => s + Number(r.totalRevenue), 0);
  const totalCMV = cmvRows.reduce((s, r) => s + Number(r.totalCost), 0);
  const grossProfit = totalRevenue - totalCMV;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const expenses = expenseRows.map((r) => ({
    category: r.categoryName || "Sem categoria",
    amount: Number(r.totalAmount),
    count: Number(r.transactionCount),
  }));

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const ebitda = grossProfit - totalExpenses;
  const netMargin = totalRevenue > 0 ? (ebitda / totalRevenue) * 100 : 0;

  // 5. Formas de pagamento para o DRE
  const payments = await getPaymentMethodsReport(referenceMonth);

  return {
    referenceMonth: referenceMonth || "all",
    // Receita
    totalRevenue,
    // CMV
    totalCMV,
    cmvPercentage: totalRevenue > 0 ? parseFloat(((totalCMV / totalRevenue) * 100).toFixed(2)) : 0,
    // Lucro Bruto
    grossProfit,
    grossMargin: parseFloat(grossMargin.toFixed(2)),
    // Despesas
    expenses,
    totalExpenses,
    // EBITDA / Resultado
    ebitda,
    netMargin: parseFloat(netMargin.toFixed(2)),
    // Formas de pagamento
    payments,
  };
}

// ─── Relatório: Evolução Mensal de Vendas ─────────────────────────────────────
export async function getMonthlySalesEvolution() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = await db
    .select({
      referenceMonth: salesImports.referenceMonth,
      totalRevenue: sql<number>`SUM(${salesImports.totalRevenue})`,
      totalItems: sql<number>`SUM(${salesImports.totalItems})`,
      totalTransactions: sql<number>`SUM(${salesImports.totalTransactions})`,
    })
    .from(salesImports)
    .where(eq(salesImports.status, "confirmed"))
    .groupBy(salesImports.referenceMonth)
    .orderBy(asc(salesImports.referenceMonth));

  return rows.map((r) => ({
    referenceMonth: r.referenceMonth,
    totalRevenue: Number(r.totalRevenue),
    totalItems: Number(r.totalItems),
    totalTransactions: Number(r.totalTransactions),
    avgTicket: Number(r.totalTransactions) > 0
      ? parseFloat((Number(r.totalRevenue) / Number(r.totalTransactions)).toFixed(2))
      : 0,
  }));
}

// ─── Relatório: Meses disponíveis ─────────────────────────────────────────────
export async function getAvailableMonths() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = await db
    .select({ referenceMonth: salesImports.referenceMonth })
    .from(salesImports)
    .where(eq(salesImports.status, "confirmed"))
    .groupBy(salesImports.referenceMonth)
    .orderBy(desc(salesImports.referenceMonth));

  return rows.map((r) => r.referenceMonth);
}

// ─── Relatório: Produtos Mais Comprados (via NF-e / Movimentações de Entrada) ──
export async function getMostPurchasedReport(limit = 30) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      categoryId: products.categoryId,
      currentStock: products.currentStock,
      minStock: products.minStock,
      costPrice: products.costPrice,
      totalQtyIn: sql<number>`SUM(${stockMovements.quantity})`,
      totalCostIn: sql<number>`SUM(${stockMovements.quantity} * COALESCE(${stockMovements.unitCost}, ${products.costPrice}, 0))`,
      movCount: sql<number>`COUNT(*)`,
      lastPurchase: sql<string>`MAX(${stockMovements.createdAt})`,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .where(eq(stockMovements.type, "in"))
    .groupBy(products.id, products.name, products.categoryId, products.currentStock, products.minStock, products.costPrice)
    .orderBy(desc(sql`SUM(${stockMovements.quantity})`))
    .limit(limit);

  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    currentStock: Number(r.currentStock) || 0,
    minStock: Number(r.minStock) || 0,
    costPrice: Number(r.costPrice) || 0,
    totalQtyIn: Number(r.totalQtyIn) || 0,
    totalCostIn: Number(r.totalCostIn) || 0,
    movCount: Number(r.movCount) || 0,
    lastPurchase: r.lastPurchase,
  }));
}

// ─── Relatório: Giro de Estoque + Cobertura + Compras x Vendas ────────────────
export async function getStockTurnoverReport() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Entradas (compras via NF-e)
  const inRows = await db
    .select({
      productId: stockMovements.productId,
      totalQtyIn: sql<number>`SUM(${stockMovements.quantity})`,
      totalCostIn: sql<number>`SUM(${stockMovements.quantity} * COALESCE(${stockMovements.unitCost}, 0))`,
    })
    .from(stockMovements)
    .where(eq(stockMovements.type, "in"))
    .groupBy(stockMovements.productId);

  // Saídas por vendas (sales_import_items confirmados)
  const outRows = await db
    .select({
      productId: salesImportItems.productId,
      totalQtySold: sql<number>`SUM(${salesImportItems.quantity})`,
      totalRevenue: sql<number>`SUM(${salesImportItems.totalPrice})`,
    })
    .from(salesImportItems)
    .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
    .where(
      and(
        eq(salesImportItems.linkStatus, "linked"),
        eq(salesImports.status, "confirmed"),
        isNotNull(salesImportItems.productId)
      )
    )
    .groupBy(salesImportItems.productId);

  // Produtos com estoque atual
  const allProducts = await db
    .select({
      id: products.id,
      name: products.name,
      currentStock: products.currentStock,
      minStock: products.minStock,
      costPrice: products.costPrice,
      salePrice: products.salePrice,
    })
    .from(products)
    .where(gt(products.currentStock, 0))
    .orderBy(products.name);

  // Montar mapa
  const inMap = new Map(inRows.map(r => [r.productId, r]));
  const outMap = new Map(outRows.map(r => [r.productId, r]));

  return allProducts.map((p) => {
    const inData = inMap.get(p.id);
    const outData = outMap.get(p.id);

    const totalQtyIn = Number(inData?.totalQtyIn) || 0;
    const totalCostIn = Number(inData?.totalCostIn) || 0;
    const totalQtySold = Number(outData?.totalQtySold) || 0;
    const totalRevenue = Number(outData?.totalRevenue) || 0;
    const currentStock = Number(p.currentStock) || 0;
    const costPrice = Number(p.costPrice) || 0;
    const salePrice = Number(p.salePrice) || 0;

    // Giro de estoque = qtd vendida / estoque atual (quanto o estoque "gira" por período)
    const turnover = currentStock > 0 ? parseFloat((totalQtySold / currentStock).toFixed(2)) : 0;

    // Cobertura = estoque atual / (qtd vendida / meses com vendas) — estimativa em dias
    // Usa média diária de vendas (considerando 30 dias por mês)
    const avgDailySales = totalQtySold > 0 ? totalQtySold / 30 : 0;
    const coverageDays = avgDailySales > 0 ? Math.round(currentStock / avgDailySales) : 999;

    // Margem bruta
    const totalCostSold = costPrice * totalQtySold;
    const grossProfit = totalRevenue - totalCostSold;
    const margin = totalRevenue > 0 ? parseFloat(((grossProfit / totalRevenue) * 100).toFixed(1)) : 0;

    // Status de estoque
    const minStock = Number(p.minStock) || 0;
    const stockStatus =
      currentStock <= 0 ? "sem_estoque" :
      currentStock <= minStock ? "critico" :
      currentStock <= minStock * 1.5 ? "baixo" :
      coverageDays < 7 ? "baixo" :
      "ok";

    return {
      productId: p.id,
      productName: p.name,
      currentStock,
      minStock,
      costPrice,
      salePrice,
      totalQtyIn,
      totalCostIn,
      totalQtySold,
      totalRevenue,
      grossProfit,
      margin,
      turnover,
      coverageDays,
      stockStatus,
    };
  });
}

// ─── Relatório: Resumo Executivo de Estoque ───────────────────────────────────
export async function getStockSummaryReport() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = await db
    .select({
      totalProducts: sql<number>`COUNT(*)`,
      totalStockValue: sql<number>`SUM(${products.currentStock} * COALESCE(${products.costPrice}, 0))`,
      totalSaleValue: sql<number>`SUM(${products.currentStock} * COALESCE(${products.salePrice}, 0))`,
      lowStockCount: sql<number>`SUM(CASE WHEN ${products.currentStock} <= ${products.minStock} AND ${products.minStock} > 0 THEN 1 ELSE 0 END)`,
      zeroStockCount: sql<number>`SUM(CASE WHEN ${products.currentStock} = 0 THEN 1 ELSE 0 END)`,
      withCostCount: sql<number>`SUM(CASE WHEN ${products.costPrice} > 0 THEN 1 ELSE 0 END)`,
    })
    .from(products);

  const r = rows[0];
  return {
    totalProducts: Number(r.totalProducts) || 0,
    totalStockValue: Number(r.totalStockValue) || 0,
    totalSaleValue: Number(r.totalSaleValue) || 0,
    potentialProfit: (Number(r.totalSaleValue) || 0) - (Number(r.totalStockValue) || 0),
    lowStockCount: Number(r.lowStockCount) || 0,
    zeroStockCount: Number(r.zeroStockCount) || 0,
    withCostCount: Number(r.withCostCount) || 0,
  };
}

// ─── Relatório: Giro de Estoque por Semana ────────────────────────────────────
// Retorna as últimas N semanas com vendas por produto, cobertura e sugestão de compra
export async function getWeeklyStockTurnoverReport(weeksBack = 6) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Calcular as semanas: cada semana começa na segunda-feira
  const weeks: Array<{ label: string; start: Date; end: Date }> = [];
  const now = new Date();
  // Encontrar a segunda-feira da semana atual
  const dayOfWeek = now.getDay(); // 0=dom, 1=seg, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - daysToMonday);
  thisMonday.setHours(0, 0, 0, 0);

  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const label = `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} – ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
    weeks.push({ label, start, end });
  }

  // Buscar vendas por produto e por semana usando saleDate ou createdAt da importação
  // Agrupa por productId e por semana (usando YEARWEEK do MySQL)
  const salesByWeek = await db
    .select({
      productId: salesImportItems.productId,
      weekStart: sql<string>`DATE(DATE_SUB(COALESCE(${salesImports.saleDate}, ${salesImports.createdAt}), INTERVAL (WEEKDAY(COALESCE(${salesImports.saleDate}, ${salesImports.createdAt}))) DAY))`,
      totalQty: sql<number>`SUM(${salesImportItems.quantity})`,
      totalRevenue: sql<number>`SUM(${salesImportItems.totalPrice})`,
    })
    .from(salesImportItems)
    .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
    .where(
      and(
        eq(salesImportItems.linkStatus, "linked"),
        eq(salesImports.status, "confirmed"),
        isNotNull(salesImportItems.productId),
        gte(
          sql`COALESCE(${salesImports.saleDate}, ${salesImports.createdAt})`,
          sql`DATE_SUB(NOW(), INTERVAL ${weeksBack} WEEK)`
        )
      )
    )
    .groupBy(
      salesImportItems.productId,
      sql`DATE(DATE_SUB(COALESCE(${salesImports.saleDate}, ${salesImports.createdAt}), INTERVAL (WEEKDAY(COALESCE(${salesImports.saleDate}, ${salesImports.createdAt}))) DAY))`
    );

  // Buscar estoque atual e preços de todos os produtos que tiveram vendas no período
  const productIds = Array.from(new Set(salesByWeek.map(r => r.productId).filter(Boolean))) as number[];
  if (productIds.length === 0) return { weeks: weeks.map(w => w.label), products: [] };

  const productData = await db
    .select({
      id: products.id,
      name: products.name,
      currentStock: products.currentStock,
      minStock: products.minStock,
      costPrice: products.costPrice,
      salePrice: products.salePrice,
    })
    .from(products)
    .where(
      sql`${products.id} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`
    )
    .orderBy(asc(products.name));

  // Montar mapa: productId -> weekStart -> qty
  type WeekSales = { qty: number; revenue: number };
  const salesMap = new Map<number, Map<string, WeekSales>>();
  for (const row of salesByWeek) {
    if (!row.productId) continue;
    if (!salesMap.has(row.productId)) salesMap.set(row.productId, new Map());
    salesMap.get(row.productId)!.set(row.weekStart, {
      qty: Number(row.totalQty) || 0,
      revenue: Number(row.totalRevenue) || 0,
    });
  }

  // Montar resultado por produto
  const result = productData.map(p => {
    const weekSales = salesMap.get(p.id) ?? new Map<string, WeekSales>();
    const rawStock = Number(p.currentStock) || 0;
    // Estoque negativo indica divergência de dados (vendas importadas > estoque cadastrado)
    // Para cálculos de cobertura/sugestão usamos 0; mas exibimos o valor real
    const isNegativeStock = rawStock < 0;
    const currentStock = Math.max(0, rawStock);
    const costPrice = Number(p.costPrice) || 0;
    const salePrice = Number(p.salePrice) || 0;
    const minStock = Number(p.minStock) || 0;

    // Vendas por semana (na ordem das semanas)
    const weekData = weeks.map(w => {
      const weekKey = w.start.toISOString().split("T")[0]; // YYYY-MM-DD
      // Procurar a semana no mapa (pode ter pequenas diferenças de timezone)
      let found: WeekSales | undefined;
      for (const [key, val] of Array.from(weekSales.entries())) {
        // Comparar apenas a data (YYYY-MM-DD)
        if (key && key.substring(0, 10) === weekKey) {
          found = val;
          break;
        }
      }
      return {
        weekLabel: w.label,
        qty: found?.qty ?? 0,
        revenue: found?.revenue ?? 0,
      };
    });

    // Total vendido no período
    const totalQtySold = weekData.reduce((s, w) => s + w.qty, 0);
    const weeksWithSales = weekData.filter(w => w.qty > 0).length;

    // Média de vendas por semana (últimas semanas com dados)
    const avgQtyPerWeek = weeksWithSales > 0
      ? parseFloat((totalQtySold / Math.max(weeksWithSales, 1)).toFixed(1))
      : 0;

    // Cobertura em semanas = estoque atual / média semanal
    const coverageWeeks = avgQtyPerWeek > 0
      ? parseFloat((currentStock / avgQtyPerWeek).toFixed(1))
      : 999;

    // Sugestão de compra para próxima semana
    // Fórmula: max(0, (avgQtyPerWeek * 2) - currentStock + minStock)
    // Garante estoque para 2 semanas + estoque mínimo
    const suggestedPurchase = avgQtyPerWeek > 0
      ? Math.max(0, Math.ceil(avgQtyPerWeek * 2 - currentStock + minStock))
      : 0;

    // Giro = total vendido / estoque atual
    const turnover = currentStock > 0
      ? parseFloat((totalQtySold / currentStock).toFixed(1))
      : totalQtySold > 0 ? 99 : 0;

    // Margem bruta estimada
    const totalRevenue = weekData.reduce((s, w) => s + w.revenue, 0);
    const totalCostSold = costPrice * totalQtySold;
    const margin = totalRevenue > 0
      ? parseFloat(((totalRevenue - totalCostSold) / totalRevenue * 100).toFixed(1))
      : 0;

    // Status de estoque
    const stockStatus =
      isNegativeStock ? "negativo" :
      currentStock <= 0 ? "sem_estoque" :
      currentStock <= minStock ? "critico" :
      coverageWeeks < 1 ? "critico" :
      coverageWeeks < 2 ? "baixo" :
      "ok";

    return {
      productId: p.id,
      productName: p.name,
      currentStock: rawStock,        // valor real (pode ser negativo)
      currentStockCalc: currentStock, // valor para cálculos (nunca negativo)
      isNegativeStock,
      minStock,
      costPrice,
      salePrice,
      avgQtyPerWeek,
      coverageWeeks,
      suggestedPurchase,
      turnover,
      margin,
      stockStatus,
      totalQtySold,
      weekData,
    };
  });

  // Ordenar por urgência: negativo > crítico > baixo > ok
  result.sort((a, b) => {
    const statusOrder = { negativo: 0, sem_estoque: 1, critico: 2, baixo: 3, ok: 4 };
    const sa = statusOrder[a.stockStatus as keyof typeof statusOrder] ?? 3;
    const sb = statusOrder[b.stockStatus as keyof typeof statusOrder] ?? 3;
    if (sa !== sb) return sa - sb;
    return a.coverageWeeks - b.coverageWeeks;
  });

  return {
    weeks: weeks.map(w => w.label),
    products: result,
    generatedAt: new Date().toISOString(),
  };
}
