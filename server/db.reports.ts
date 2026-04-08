import { getDb } from "./db";
import { sql, desc, asc, eq, and, gte, lte, isNotNull, gt } from "drizzle-orm";
import {
  products,
  salesImportItems,
  salesImports,
  salesImportPayments,
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
