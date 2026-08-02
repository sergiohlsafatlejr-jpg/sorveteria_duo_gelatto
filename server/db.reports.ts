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
  redeSalesImport,
  sales,
  customers,
  customerPurchases,
  finDailyRevenue,
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

  // 2. CMV Histórico Ponderado (Custo das Mercadorias Vendidas)
  // Busca as vendas agrupadas por produto no período
  const cmvItems = await db
    .select({
      productId: salesImportItems.productId,
      quantity: sql<number>`SUM(${salesImportItems.quantity})`,
      currentCost: products.costPrice,
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
    .groupBy(salesImportItems.productId, products.costPrice);

  let totalCMV = 0;
  for (const item of cmvItems) {
    if (!item.productId) continue;

    // Tenta encontrar o custo médio histórico das entradas no mês de referência
    let cost = parseFloat(item.currentCost || "0");

    if (referenceMonth) {
      const [yearStr, monthStr] = referenceMonth.split("-");
      const startDate = new Date(Number(yearStr), Number(monthStr) - 1, 1);
      const endDate = new Date(Number(yearStr), Number(monthStr), 0, 23, 59, 59);

      const stockMove = await db
        .select({
          avgCost: sql<number>`AVG(${stockMovements.unitCost})`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.productId, item.productId),
            eq(stockMovements.type, "in"),
            gte(stockMovements.createdAt, startDate),
            lte(stockMovements.createdAt, endDate),
            gt(stockMovements.unitCost, "0")
          )
        );

      if (stockMove[0]?.avgCost) {
        cost = Number(stockMove[0].avgCost);
      }
    }

    totalCMV += cost * Number(item.quantity);
  }

  // 3. Taxas de Cartão/Adquirente (MDR e Antecipação da Rede)
  const cardFeesRows = await db
    .select({
      totalFees: sql<number>`SUM(${redeSalesImport.valorTotalTaxas})`,
    })
    .from(redeSalesImport)
    .where(
      and(
        referenceMonth
          ? sql`DATE_FORMAT(${redeSalesImport.dataDaVenda}, '%Y-%m') = ${referenceMonth}`
          : undefined
      )
    );
  const cardFees = Number(cardFeesRows[0]?.totalFees) || 0;

  // 4. Receita de Itens não Vinculados (CMV não calculado)
  const unlinkedRevenueRows = await db
    .select({
      totalUnlinkedRevenue: sql<number>`SUM(${salesImportItems.totalPrice})`,
    })
    .from(salesImportItems)
    .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
    .where(
      and(
        eq(salesImports.status, "confirmed"),
        sql`${salesImportItems.linkStatus} != 'linked'`,
        referenceMonth ? eq(salesImports.referenceMonth, referenceMonth) : undefined
      )
    );
  const unlinkedRevenue = Number(unlinkedRevenueRows[0]?.totalUnlinkedRevenue) || 0;

  // 5. Despesas por categoria (fin_transactions)
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

  // 6. Montar DRE
  const totalRevenue = salesRows.reduce((s, r) => s + Number(r.totalRevenue), 0);
  
  // Lucro Bruto desconta CMV e taxas MDR da Rede
  const grossProfit = totalRevenue - totalCMV - cardFees;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const expenses = expenseRows.map((r) => ({
    category: r.categoryName || "Sem categoria",
    amount: Number(r.totalAmount),
    count: Number(r.transactionCount),
  }));

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const ebitda = grossProfit - totalExpenses;
  const netMargin = totalRevenue > 0 ? (ebitda / totalRevenue) * 100 : 0;

  // Formas de pagamento
  const payments = await getPaymentMethodsReport(referenceMonth);

  return {
    referenceMonth: referenceMonth || "all",
    totalRevenue,
    totalCMV,
    cmvPercentage: totalRevenue > 0 ? parseFloat(((totalCMV / totalRevenue) * 100).toFixed(2)) : 0,
    cardFees,
    cardFeesPercentage: totalRevenue > 0 ? parseFloat(((cardFees / totalRevenue) * 100).toFixed(2)) : 0,
    unlinkedRevenue,
    grossProfit,
    grossMargin: parseFloat(grossMargin.toFixed(2)),
    expenses,
    totalExpenses,
    ebitda,
    netMargin: parseFloat(netMargin.toFixed(2)),
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

// ─── Helpers Puros para Relatórios de BI (Testáveis) ─────────────────────────
export function classifyChannel(paymentMethodName: string): "delivery" | "balcao" {
  const method = paymentMethodName.toLowerCase();
  const isDelivery = method.includes("ifood") ||
                     method.includes("delivery") ||
                     method.includes("rappi") ||
                     method.includes("zapi") ||
                     method.includes("z-api") ||
                     method.includes("whatsapp") ||
                     method.includes("motoboy") ||
                     method.includes("entrega");
  return isDelivery ? "delivery" : "balcao";
}

export function classifyAbcProduct(
  revenue: number,
  cumulativePct: number,
  marginPct: number
): { volumeClass: "A" | "B" | "C"; matrixCategory: "estrela" | "cavalo_batalha" | "quebra_cabeca" | "abacaxi" } {
  let volumeClass: "A" | "B" | "C" = "C";
  if (revenue > 0) {
    if (cumulativePct <= 70) volumeClass = "A";
    else if (cumulativePct <= 90) volumeClass = "B";
  }

  const isHighVolume = volumeClass === "A" || volumeClass === "B";
  const isHighMargin = marginPct >= 40.0;

  let matrixCategory: "estrela" | "cavalo_batalha" | "quebra_cabeca" | "abacaxi";
  if (isHighVolume && isHighMargin) matrixCategory = "estrela";
  else if (isHighVolume && !isHighMargin) matrixCategory = "cavalo_batalha";
  else if (!isHighVolume && isHighMargin) matrixCategory = "quebra_cabeca";
  else matrixCategory = "abacaxi";

  return { volumeClass, matrixCategory };
}

export function calculatePurchaseSuggestion(
  currentStock: number,
  minStock: number,
  projectedWeeklySales: number
): { coverageDays: number; suggestedQty: number; status: "crítico" | "sugerido" | "ok" } {
  const dailySalesRate = projectedWeeklySales / 7;
  const coverageDays = dailySalesRate > 0 ? Math.round(currentStock / dailySalesRate) : 999;

  let suggestedQty = 0;
  let status: "crítico" | "sugerido" | "ok" = "ok";

  if (coverageDays < 7 || currentStock <= minStock) {
    const targetStock = projectedWeeklySales * 2;
    suggestedQty = Math.max(Math.ceil(targetStock - currentStock), 0);
    status = currentStock <= minStock ? "crítico" : "sugerido";
  }

  return { coverageDays, suggestedQty, status };
}

// ─── Relatório BI 1: Correlação Climática (Clima x Faturamento) ────────────────
export async function getClimateCorrelationReport() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Buscar faturamentos diários dos últimos 90 dias
  const now = new Date();
  const dateFromObj = new Date(now);
  dateFromObj.setDate(now.getDate() - 90);
  const dateFrom = dateFromObj.toISOString().split("T")[0];
  const dateTo = now.toISOString().split("T")[0];

  // 1. Receitas oficiais do finDailyRevenue
  const realRevenues = await db
    .select({
      date: finDailyRevenue.revenueDate,
      amount: finDailyRevenue.realAmount,
    })
    .from(finDailyRevenue)
    .where(
      and(
        gte(finDailyRevenue.revenueDate, dateFrom),
        lte(finDailyRevenue.revenueDate, dateTo)
      )
    );

  // 2. Receitas em tempo real do sales local para preencher lacunas
  const salesRevenues = await db
    .select({
      day: sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`,
      total: sql<number>`SUM(${sales.finalTotal})`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.status, "completed"),
        gte(sales.createdAt, new Date(dateFrom + "T00:00:00")),
        lte(sales.createdAt, new Date(dateTo + "T23:59:59"))
      )
    )
    .groupBy(sql`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`);

  const revenueMap = new Map<string, number>();
  for (const r of realRevenues) {
    revenueMap.set(r.date, parseFloat(String(r.amount)));
  }
  for (const s of salesRevenues) {
    if (!revenueMap.has(s.day)) {
      revenueMap.set(s.day, Number(s.total));
    }
  }

  // 3. Buscar dados históricos do clima via Open-Meteo Archive
  const weatherMap = new Map<string, { tempMax: number; precip: number }>();
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=-16.6864&longitude=-49.2643&start_date=${dateFrom}&end_date=${dateTo}&daily=temperature_2m_max,precipitation_sum&timezone=America%2FSao_Paulo`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.daily && data.daily.time) {
        data.daily.time.forEach((t: string, i: number) => {
          weatherMap.set(t, {
            tempMax: data.daily.temperature_2m_max[i] ?? 25,
            precip: data.daily.precipitation_sum[i] ?? 0,
          });
        });
      }
    }
  } catch (err) {
    console.error("[climateCorrelation] Falha ao consultar arquivo Open-Meteo:", err);
  }

  // 4. Correlacionar
  const correlations: Array<{
    date: string;
    revenue: number;
    tempMax: number;
    precip: number;
    tempGroup: "frio" | "ameno" | "quente" | "calor_extremo";
    isRainy: boolean;
  }> = [];

  for (const [dateStr, revenue] of Array.from(revenueMap.entries())) {
    const weather = weatherMap.get(dateStr) || { tempMax: 27, precip: 0 };
    const tempMax = weather.tempMax;
    const precip = weather.precip;

    let tempGroup: "frio" | "ameno" | "quente" | "calor_extremo" = "ameno";
    if (tempMax < 22) tempGroup = "frio";
    else if (tempMax <= 26) tempGroup = "ameno";
    else if (tempMax <= 30) tempGroup = "quente";
    else tempGroup = "calor_extremo";

    correlations.push({
      date: dateStr,
      revenue,
      tempMax,
      precip,
      tempGroup,
      isRainy: precip > 1.0,
    });
  }

  // Agrupar médias por grupo de temperatura
  const groupsSummary = {
    frio: { count: 0, total: 0 },
    ameno: { count: 0, total: 0 },
    quente: { count: 0, total: 0 },
    calor_extremo: { count: 0, total: 0 },
    chuvoso: { count: 0, total: 0 },
    limpo: { count: 0, total: 0 },
  };

  for (const item of correlations) {
    groupsSummary[item.tempGroup].count++;
    groupsSummary[item.tempGroup].total += item.revenue;

    if (item.isRainy) {
      groupsSummary.chuvoso.count++;
      groupsSummary.chuvoso.total += item.revenue;
    } else {
      groupsSummary.limpo.count++;
      groupsSummary.limpo.total += item.revenue;
    }
  }

  const averages = {
    frio: groupsSummary.frio.count > 0 ? parseFloat((groupsSummary.frio.total / groupsSummary.frio.count).toFixed(2)) : 0,
    ameno: groupsSummary.ameno.count > 0 ? parseFloat((groupsSummary.ameno.total / groupsSummary.ameno.count).toFixed(2)) : 0,
    quente: groupsSummary.quente.count > 0 ? parseFloat((groupsSummary.quente.total / groupsSummary.quente.count).toFixed(2)) : 0,
    calor_extremo: groupsSummary.calor_extremo.count > 0 ? parseFloat((groupsSummary.calor_extremo.total / groupsSummary.calor_extremo.count).toFixed(2)) : 0,
    chuvoso: groupsSummary.chuvoso.count > 0 ? parseFloat((groupsSummary.chuvoso.total / groupsSummary.chuvoso.count).toFixed(2)) : 0,
    limpo: groupsSummary.limpo.count > 0 ? parseFloat((groupsSummary.limpo.total / groupsSummary.limpo.count).toFixed(2)) : 0,
  };

  return {
    history: correlations.sort((a,b) => a.date.localeCompare(b.date)),
    averages,
  };
}

// ─── Relatório BI 2: Análise Cohort de Fidelidade & Prevenção de Churn ──────────
export async function getLoyaltyCohortReport() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const allCusts = await db.select({
    id: customers.id,
    fullName: customers.fullName,
    phone: customers.phone,
    totalPoints: customers.totalPoints,
    createdAt: customers.createdAt,
    active: customers.active,
  }).from(customers);

  const allPurchases = await db.select({
    customerId: customerPurchases.customerId,
    createdAt: customerPurchases.createdAt,
  }).from(customerPurchases);

  // Mapear data do primeiro contato ou compra de cada cliente
  const firstContactMap = new Map<number, Date>();
  for (const c of allCusts) {
    firstContactMap.set(c.id, c.createdAt);
  }

  // Se o cliente tem compras anteriores ao cadastro por algum motivo, ajustamos
  for (const p of allPurchases) {
    const currentFirst = firstContactMap.get(p.customerId);
    if (!currentFirst || p.createdAt < currentFirst) {
      firstContactMap.set(p.customerId, p.createdAt);
    }
  }

  // Agrupar clientes por mês de entrada
  const cohortGroups = new Map<string, Set<number>>(); // "YYYY-MM" -> Set of customerIds
  for (const [cId, firstDate] of Array.from(firstContactMap.entries())) {
    const monthKey = firstDate.toISOString().slice(0, 7); // "YYYY-MM"
    if (!cohortGroups.has(monthKey)) {
      cohortGroups.set(monthKey, new Set());
    }
    cohortGroups.get(monthKey)!.add(cId);
  }

  // Montar matrix
  const cohortMatrix: Array<{
    cohortMonth: string;
    size: number;
    retention: Array<{ monthIndex: number; activeCount: number; percentage: number }>;
  }> = [];

  const monthKeys = Array.from(cohortGroups.keys()).sort();
  const now = new Date();

  for (const cohortMonth of monthKeys) {
    const memberIds = cohortGroups.get(cohortMonth)!;
    const size = memberIds.size;
    if (size === 0) continue;

    // Calcular retenção para os meses seguintes
    const retentionData: Array<{ monthIndex: number; activeCount: number; percentage: number }> = [];
    const maxMonths = 6; // Mostrar até 6 meses

    const [cohortYear, cohortMon] = cohortMonth.split("-").map(Number);

    for (let index = 0; index < maxMonths; index++) {
      const targetMonthDate = new Date(cohortYear, cohortMon - 1 + index, 1);
      if (targetMonthDate > now) break;

      const targetMonthStr = `${targetMonthDate.getFullYear()}-${String(targetMonthDate.getMonth() + 1).padStart(2, "0")}`;

      // Quantos desse cohort compraram nesse mês alvo?
      const buyersInTargetMonth = new Set<number>();
      for (const p of allPurchases) {
        if (memberIds.has(p.customerId)) {
          const purchaseMonthStr = p.createdAt.toISOString().slice(0, 7);
          if (purchaseMonthStr === targetMonthStr) {
            buyersInTargetMonth.add(p.customerId);
          }
        }
      }

      // No mês 0, adicionamos por padrão todos (ou os que compraram no mês de entrada)
      const activeCount = index === 0 ? size : buyersInTargetMonth.size;
      const percentage = parseFloat(((activeCount / size) * 100).toFixed(1));

      retentionData.push({
        monthIndex: index,
        activeCount,
        percentage,
      });
    }

    cohortMatrix.push({
      cohortMonth,
      size,
      retention: retentionData,
    });
  }

  // Identificar clientes em risco de Churn (inativos há mais de 30 dias mas que já compraram no passado)
  const churnRiskDays = 30;
  const churnRiskList: Array<{
    customerId: number;
    fullName: string;
    phone: string | null;
    totalPoints: number;
    daysInactive: number;
    lastPurchaseDate: Date | null;
  }> = [];

  const lastPurchaseMap = new Map<number, Date>();
  for (const p of allPurchases) {
    const prev = lastPurchaseMap.get(p.customerId);
    if (!prev || p.createdAt > prev) {
      lastPurchaseMap.set(p.customerId, p.createdAt);
    }
  }

  for (const c of allCusts) {
    if (!c.active) continue;
    const lastDate = lastPurchaseMap.get(c.id);
    if (lastDate) {
      const diffMs = now.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays >= churnRiskDays) {
        churnRiskList.push({
          customerId: c.id,
          fullName: c.fullName,
          phone: c.phone ?? null,
          totalPoints: c.totalPoints,
          daysInactive: diffDays,
          lastPurchaseDate: lastDate,
        });
      }
    }
  }

  // Ordenar clientes em Churn pelos que estão inativos há menos tempo primeiro (mais fácil de reativar)
  churnRiskList.sort((a,b) => a.daysInactive - b.daysInactive);

  return {
    matrix: cohortMatrix.reverse().slice(0, 12), // mostrar os últimos 12 cohorts
    churnRisk: churnRiskList.slice(0, 30), // top 30 em risco
  };
}

// ─── Relatório BI 3: Curva ABC Matricial (Volume x Margem) ────────────────────
export async function getAbcMatrixReport() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Buscar faturamento e quantidade dos produtos em itens confirmados
  const salesData = await db
    .select({
      productId: salesImportItems.productId,
      totalQty: sql<number>`SUM(${salesImportItems.quantity})`,
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

  const allProds = await db.select({
    id: products.id,
    name: products.name,
    costPrice: products.costPrice,
    salePrice: products.salePrice,
    currentStock: products.currentStock,
  }).from(products);

  const salesMap = new Map(salesData.map(s => [s.productId, s]));

  // Formar a lista de produtos com as métricas calculadas
  interface ProdMetric {
    id: number;
    name: string;
    costPrice: number;
    salePrice: number;
    currentStock: number;
    qtySold: number;
    revenue: number;
    marginPct: number;
    cumulativePct: number;
    volumeClass: "A" | "B" | "C";
    matrixCategory: "estrela" | "cavalo_batalha" | "quebra_cabeca" | "abacaxi";
  }

  const productsWithMetrics: ProdMetric[] = allProds.map(p => {
    const s = salesMap.get(p.id) || { totalQty: 0, totalRevenue: 0 };
    const cost = parseFloat(p.costPrice || "0");
    const sale = parseFloat(p.salePrice || "0");
    const marginPct = sale > 0 ? ((sale - cost) / sale) * 100 : 0;

    return {
      id: p.id,
      name: p.name,
      costPrice: cost,
      salePrice: sale,
      currentStock: Number(p.currentStock) || 0,
      qtySold: Number(s.totalQty) || 0,
      revenue: Number(s.totalRevenue) || 0,
      marginPct: parseFloat(marginPct.toFixed(1)),
      cumulativePct: 0,
      volumeClass: "C",
      matrixCategory: "abacaxi",
    };
  });

  // Ordenar decrescente por faturamento para fazer Curva ABC
  productsWithMetrics.sort((a, b) => b.revenue - a.revenue);

  const totalStoreRevenue = productsWithMetrics.reduce((sum, p) => sum + p.revenue, 0);
  let runningSum = 0;

  for (const p of productsWithMetrics) {
    if (totalStoreRevenue > 0) {
      runningSum += p.revenue;
      p.cumulativePct = parseFloat(((runningSum / totalStoreRevenue) * 100).toFixed(2));
    }
    const abcClass = classifyAbcProduct(p.revenue, p.cumulativePct, p.marginPct);
    p.volumeClass = abcClass.volumeClass;
    p.matrixCategory = abcClass.matrixCategory;
  }

  // Agrupar contagem
  const counts = {
    estrela: productsWithMetrics.filter(p => p.matrixCategory === "estrela").length,
    cavalo_batalha: productsWithMetrics.filter(p => p.matrixCategory === "cavalo_batalha").length,
    quebra_cabeca: productsWithMetrics.filter(p => p.matrixCategory === "quebra_cabeca").length,
    abacaxi: productsWithMetrics.filter(p => p.matrixCategory === "abacaxi").length,
  };

  return {
    products: productsWithMetrics,
    counts,
  };
}

// ─── Relatório BI 4: Sugestão de Compras & Planejamento Preditivo ──────────────
export async function getPredictivePurchasePlanning() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // 1. Obter velocidade de vendas dos produtos nos últimos 30 dias
  const salesLast30 = await db
    .select({
      productId: salesImportItems.productId,
      totalQty: sql<number>`SUM(${salesImportItems.quantity})`,
    })
    .from(salesImportItems)
    .innerJoin(salesImports, eq(salesImportItems.importId, salesImports.id))
    .where(
      and(
        eq(salesImportItems.linkStatus, "linked"),
        eq(salesImports.status, "confirmed"),
        gte(salesImports.createdAt, sql`DATE_SUB(NOW(), INTERVAL 30 DAY)`),
        isNotNull(salesImportItems.productId)
      )
    )
    .groupBy(salesImportItems.productId);

  const salesMap = new Map(salesLast30.map(s => [s.productId, Number(s.totalQty)]));

  // 2. Buscar previsão do tempo para Goiânia nos próximos 7 dias
  let tempAvg = 27;
  let rainSum = 0;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=-16.6864&longitude=-49.2643&daily=temperature_2m_max,precipitation_sum&timezone=America%2FSao_Paulo&forecast_days=7`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.daily) {
        const temps = data.daily.temperature_2m_max as number[];
        const rains = data.daily.precipitation_sum as number[];
        tempAvg = temps.reduce((s, t) => s + t, 0) / temps.length;
        rainSum = rains.reduce((s, r) => s + r, 0);
      }
    }
  } catch (err) {
    console.error("[predictivePurchasePlanning] Falha ao ler previsão clima:", err);
  }

  // 3. Fator climático multiplicador de demanda
  let multiplier = 1.0;
  let climateNotes = "Demanda dentro da média histórica (clima ameno).";

  if (tempAvg >= 30) {
    multiplier = 1.15; // +15% de demanda
    climateNotes = `Previsão de Calor Extremo (Média de ${tempAvg.toFixed(1)}°C). Aumento projetado de +15% na velocidade das saídas.`;
  } else if (rainSum >= 25) {
    multiplier = 0.80; // -20% de demanda
    climateNotes = `Previsão de Chuvas Intensas (Acumulado de ${rainSum.toFixed(1)}mm). Redução projetada de -20% nas vendas.`;
  }

  // 4. Analisar estoque de todos os produtos
  const allProds = await db.select({
    id: products.id,
    name: products.name,
    currentStock: products.currentStock,
    minStock: products.minStock,
    costPrice: products.costPrice,
  }).from(products);

  const suggestions: Array<{
    productId: number;
    productName: string;
    currentStock: number;
    minStock: number;
    avgWeeklySales: number;
    projectedWeeklySales: number;
    coverageDays: number;
    suggestedQty: number;
    estimatedCost: number;
    status: "crítico" | "sugerido" | "ok";
  }> = [];

  for (const p of allProds) {
    const total30 = salesMap.get(p.id) || 0;
    const avgWeeklySales = total30 / 4; // Média semanal real
    const projectedWeeklySales = avgWeeklySales * multiplier; // Projeção semanal com clima

    const currentStock = Number(p.currentStock) || 0;
    const minStock = Number(p.minStock) || 0;
    const costPrice = parseFloat(p.costPrice || "0");

    const suggestion = calculatePurchaseSuggestion(currentStock, minStock, projectedWeeklySales);
    const { coverageDays, suggestedQty, status } = suggestion;

    if (suggestedQty > 0) {
      suggestions.push({
        productId: p.id,
        productName: p.name,
        currentStock,
        minStock,
        avgWeeklySales: parseFloat(avgWeeklySales.toFixed(1)),
        projectedWeeklySales: parseFloat(projectedWeeklySales.toFixed(1)),
        coverageDays,
        suggestedQty,
        estimatedCost: parseFloat((suggestedQty * costPrice).toFixed(2)),
        status,
      });
    }
  }

  // Ordenar críticos primeiro, depois pelo custo estimado maior
  suggestions.sort((a,b) => {
    if (a.status === "crítico" && b.status !== "crítico") return -1;
    if (a.status !== "crítico" && b.status === "crítico") return 1;
    return b.estimatedCost - a.estimatedCost;
  });

  return {
    suggestions,
    climateInfo: {
      tempAvg: parseFloat(tempAvg.toFixed(1)),
      rainSum: parseFloat(rainSum.toFixed(1)),
      multiplier,
      notes: climateNotes,
    }
  };
}

// ─── Relatório BI 5: DRE por Canal (Delivery vs Balcão) ───────────────────────
export async function getDreByChannelReport(referenceMonth?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Buscar todos os pagamentos das importações confirmadas no mês
  const payments = await db
    .select({
      paymentMethod: salesImportPayments.paymentMethod,
      totalAmount: sql<number>`SUM(${salesImportPayments.totalAmount})`,
      transactionCount: sql<number>`SUM(${salesImportPayments.transactionCount})`,
    })
    .from(salesImportPayments)
    .innerJoin(salesImports, eq(salesImportPayments.importId, salesImports.id))
    .where(
      and(
        eq(salesImports.status, "confirmed"),
        referenceMonth ? eq(salesImports.referenceMonth, referenceMonth) : undefined
      )
    )
    .groupBy(salesImportPayments.paymentMethod);

  // Buscar taxas MDR da Rede associadas no mesmo mês
  const redeTxRows = await db
    .select({
      totalFees: sql<number>`SUM(${redeSalesImport.valorTotalTaxas})`,
    })
    .from(redeSalesImport)
    .where(
      and(
        referenceMonth
          ? sql`DATE_FORMAT(${redeSalesImport.dataDaVenda}, '%Y-%m') = ${referenceMonth}`
          : undefined
      )
    );

  const cardFees = Number(redeTxRows[0]?.totalFees) || 0;

  let deliveryRevenue = 0;
  let deliveryCount = 0;
  let balcaoRevenue = 0;
  let balcaoCount = 0;

  for (const p of payments) {
    const isDelivery = classifyChannel(p.paymentMethod) === "delivery";
    if (isDelivery) {
      deliveryRevenue += Number(p.totalAmount);
      deliveryCount += Number(p.transactionCount);
    } else {
      balcaoRevenue += Number(p.totalAmount);
      balcaoCount += Number(p.transactionCount);
    }
  }

  const totalRevenue = deliveryRevenue + balcaoRevenue;

  // Estimar CMV por canal proporcionalmente ao faturamento do canal (DRE simplificado)
  const dreSummary = await getDREReport(referenceMonth);
  const totalCMV = dreSummary.totalCMV;

  const deliveryCMV = totalRevenue > 0 ? (deliveryRevenue / totalRevenue) * totalCMV : 0;
  const balcaoCMV = totalRevenue > 0 ? (balcaoRevenue / totalRevenue) * totalCMV : 0;

  // Ratear taxas de cartão MDR proporcionalmente ao faturamento eletrônico se houver
  const deliveryFees = totalRevenue > 0 ? (deliveryRevenue / totalRevenue) * cardFees : 0;
  const balcaoFees = totalRevenue > 0 ? (balcaoRevenue / totalRevenue) * cardFees : 0;

  const deliveryGrossProfit = deliveryRevenue - deliveryCMV - deliveryFees;
  const balcaoGrossProfit = balcaoRevenue - balcaoCMV - balcaoFees;

  return {
    referenceMonth: referenceMonth || "all",
    totalRevenue,
    delivery: {
      revenue: deliveryRevenue,
      count: deliveryCount,
      pct: totalRevenue > 0 ? parseFloat(((deliveryRevenue / totalRevenue) * 100).toFixed(1)) : 0,
      cmv: parseFloat(deliveryCMV.toFixed(2)),
      fees: parseFloat(deliveryFees.toFixed(2)),
      grossProfit: parseFloat(deliveryGrossProfit.toFixed(2)),
      margin: deliveryRevenue > 0 ? parseFloat(((deliveryGrossProfit / deliveryRevenue) * 100).toFixed(1)) : 0,
    },
    balcao: {
      revenue: balcaoRevenue,
      count: balcaoCount,
      pct: totalRevenue > 0 ? parseFloat(((balcaoRevenue / totalRevenue) * 100).toFixed(1)) : 0,
      cmv: parseFloat(balcaoCMV.toFixed(2)),
      fees: parseFloat(balcaoFees.toFixed(2)),
      grossProfit: parseFloat(balcaoGrossProfit.toFixed(2)),
      margin: balcaoRevenue > 0 ? parseFloat(((balcaoGrossProfit / balcaoRevenue) * 100).toFixed(1)) : 0,
    }
  };
}

