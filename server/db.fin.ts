import { SQL, and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  FinBank,
  FinBankStatement,
  FinCategory,
  FinCost,
  FinPaymentType,
  FinReceivable,
  FinReceivableType,
  FinRevenueForecast,
  FinTransaction,
  InsertFinBank,
  InsertFinBankStatement,
  InsertFinCategory,
  InsertFinCost,
  InsertFinPaymentType,
  InsertFinReceivable,
  InsertFinReceivableType,
  InsertFinRevenueForecast,
  InsertFinTransaction,
  finBankStatements,
  finBanks,
  finCategories,
  finCosts,
  finPaymentTypes,
  finReceivableTypes,
  finReceivables,
  finRevenueForecasts,
  finTransactions,
  finDailyRevenue,
  forecastSettings,
  ForecastSettings,
  finGoals,
  FinGoal,
  InsertFinGoal,
  finGoalExtraCosts,
  FinGoalExtraCost,
  InsertFinGoalExtraCost,
  sales,
} from "../drizzle/schema";
import { getDb } from "./db";

// ─── Fin Categories ───────────────────────────────────────────────────────────
export async function getFinCategories(): Promise<FinCategory[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finCategories).orderBy(finCategories.name);
}
export async function createFinCategory(data: InsertFinCategory): Promise<FinCategory[]> {
  const db = await getDb();
  if (!db) return [];
  await db.insert(finCategories).values(data);
  return db.select().from(finCategories).orderBy(finCategories.name);
}
export async function updateFinCategory(id: number, userId: number, data: { name?: string; type?: "income" | "expense"; color?: string }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finCategories).set(data).where(and(eq(finCategories.id, id), eq(finCategories.userId, userId)));
}
export async function deleteFinCategory(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finCategories).where(and(eq(finCategories.id, id), eq(finCategories.userId, userId)));
}

// ─── Fin Banks ────────────────────────────────────────────────────────────────
export async function getFinBanks(): Promise<FinBank[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finBanks).orderBy(finBanks.name);
}
export async function createFinBank(data: InsertFinBank): Promise<FinBank[]> {
  const db = await getDb();
  if (!db) return [];
  await db.insert(finBanks).values(data);
  return db.select().from(finBanks).orderBy(finBanks.name);
}
export async function updateFinBank(id: number, userId: number, data: Partial<InsertFinBank>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finBanks).set(data).where(and(eq(finBanks.id, id), eq(finBanks.userId, userId)));
}
export async function deleteFinBank(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finBanks).where(and(eq(finBanks.id, id), eq(finBanks.userId, userId)));
}

// ─── Fin Payment Types ────────────────────────────────────────────────────────
export async function getFinPaymentTypes(): Promise<FinPaymentType[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finPaymentTypes).orderBy(finPaymentTypes.description);
}
export async function createFinPaymentType(data: InsertFinPaymentType): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(finPaymentTypes).values(data);
}
export async function updateFinPaymentType(id: number, userId: number, data: Partial<InsertFinPaymentType>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finPaymentTypes).set(data).where(and(eq(finPaymentTypes.id, id), eq(finPaymentTypes.userId, userId)));
}
export async function deleteFinPaymentType(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finPaymentTypes).where(and(eq(finPaymentTypes.id, id), eq(finPaymentTypes.userId, userId)));
}

// ─── Fin Receivable Types ─────────────────────────────────────────────────────
export async function getFinReceivableTypes(): Promise<FinReceivableType[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finReceivableTypes).orderBy(finReceivableTypes.description);
}
export async function createFinReceivableType(data: InsertFinReceivableType): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(finReceivableTypes).values(data);
}
export async function deleteFinReceivableType(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finReceivableTypes).where(and(eq(finReceivableTypes.id, id), eq(finReceivableTypes.userId, userId)));
}

// ─── Fin Costs ────────────────────────────────────────────────────────────────
export async function getFinCosts(): Promise<FinCost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finCosts).orderBy(finCosts.description);
}
export async function createFinCost(data: InsertFinCost): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(finCosts).values(data);
}
export async function updateFinCost(id: number, userId: number, data: Partial<InsertFinCost>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finCosts).set(data).where(and(eq(finCosts.id, id), eq(finCosts.userId, userId)));
}
export async function deleteFinCost(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finCosts).where(and(eq(finCosts.id, id), eq(finCosts.userId, userId)));
}

// ─── Fin Transactions ─────────────────────────────────────────────────────────
export async function getFinTransactions(_userId: number, filters?: {
  categoryId?: number; bankId?: number; isPaid?: boolean;
  dateFrom?: Date; dateTo?: Date;
}): Promise<FinTransaction[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [];
  if (filters?.categoryId) conditions.push(eq(finTransactions.categoryId, filters.categoryId));
  if (filters?.bankId) conditions.push(eq(finTransactions.bankId, filters.bankId));
  if (filters?.isPaid !== undefined) conditions.push(eq(finTransactions.isPaid, filters.isPaid));
  if (filters?.dateFrom) conditions.push(gte(finTransactions.dueDate, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lte(finTransactions.dueDate, filters.dateTo));
  return db.select().from(finTransactions).where(and(...conditions)).orderBy(desc(finTransactions.dueDate));
}
export async function createFinTransaction(data: InsertFinTransaction): Promise<FinTransaction | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(finTransactions).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId;
  if (!insertId) return null;
  const rows = await db.select().from(finTransactions).where(eq(finTransactions.id, insertId)).limit(1);
  return rows[0] ?? null;
}
export async function updateFinTransaction(id: number, userId: number, data: Partial<InsertFinTransaction>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finTransactions).set({ ...data, updatedAt: new Date() }).where(and(eq(finTransactions.id, id), eq(finTransactions.userId, userId)));
}
export async function deleteFinTransaction(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finTransactions).where(and(eq(finTransactions.id, id), eq(finTransactions.userId, userId)));
}

// Busca transações vinculadas a um custo específico
export async function getTransactionsByCost(costId: number, _userId?: number): Promise<FinTransaction[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finTransactions)
    .where(eq(finTransactions.costId, costId))
    .orderBy(desc(finTransactions.dueDate));
}

// Vincula uma transação existente a um custo
export async function linkTransactionToCost(transactionId: number, costId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finTransactions)
    .set({ costId, updatedAt: new Date() })
    .where(and(eq(finTransactions.id, transactionId), eq(finTransactions.userId, userId)));
}

// Remove a vinculação de uma transação com um custo
export async function unlinkTransactionFromCost(transactionId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finTransactions)
    .set({ costId: null, updatedAt: new Date() })
    .where(and(eq(finTransactions.id, transactionId), eq(finTransactions.userId, userId)));
}

// Busca transações sem custo vinculado (disponíveis para vincular)
export async function getUnlinkedTransactions(_userId?: number): Promise<FinTransaction[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finTransactions)
    .where(isNull(finTransactions.costId))
    .orderBy(desc(finTransactions.dueDate))
    .limit(100);
}

// ─── Fin Receivables ──────────────────────────────────────────────────────────
export async function getFinReceivables(_userId: number, filters?: {
  typeId?: number; isReceived?: boolean; dateFrom?: Date; dateTo?: Date;
}): Promise<FinReceivable[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [];
  if (filters?.typeId) conditions.push(eq(finReceivables.typeId, filters.typeId));
  if (filters?.isReceived !== undefined) conditions.push(eq(finReceivables.isReceived, filters.isReceived));
  if (filters?.dateFrom) conditions.push(gte(finReceivables.dueDate, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lte(finReceivables.dueDate, filters.dateTo));
  return db.select().from(finReceivables).where(and(...conditions)).orderBy(desc(finReceivables.dueDate));
}
export async function createFinReceivable(data: InsertFinReceivable): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(finReceivables).values(data);
}
export async function updateFinReceivable(id: number, userId: number, data: Partial<InsertFinReceivable>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finReceivables).set({ ...data, updatedAt: new Date() }).where(and(eq(finReceivables.id, id), eq(finReceivables.userId, userId)));
}
export async function deleteFinReceivable(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finReceivables).where(and(eq(finReceivables.id, id), eq(finReceivables.userId, userId)));
}

// ─── Fin Bank Statements ──────────────────────────────────────────────────────
export async function getFinBankStatements(_userId: number, filters?: {
  bankId?: number; categoryId?: number; dateFrom?: Date; dateTo?: Date;
}): Promise<FinBankStatement[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [];
  if (filters?.bankId) conditions.push(eq(finBankStatements.bankId, filters.bankId));
  if (filters?.categoryId) conditions.push(eq(finBankStatements.categoryId, filters.categoryId));
  if (filters?.dateFrom) conditions.push(gte(finBankStatements.date, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lte(finBankStatements.date, filters.dateTo));
  return db.select().from(finBankStatements).where(and(...conditions)).orderBy(desc(finBankStatements.date));
}
export async function createFinBankStatement(data: InsertFinBankStatement): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(finBankStatements).values(data);
}
export async function createFinBankStatements(data: InsertFinBankStatement[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (data.length === 0) return;
  await db.insert(finBankStatements).values(data);
}
export async function updateFinBankStatement(id: number, userId: number, data: Partial<InsertFinBankStatement>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finBankStatements).set(data).where(and(eq(finBankStatements.id, id), eq(finBankStatements.userId, userId)));
}
export async function deleteFinBankStatement(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finBankStatements).where(and(eq(finBankStatements.id, id), eq(finBankStatements.userId, userId)));
}

// ─── Fin Revenue Forecasts ────────────────────────────────────────────────────
export async function getFinRevenueForecasts(_userId: number, monthStart: string, monthEnd: string): Promise<FinRevenueForecast[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finRevenueForecasts)
    .where(and(

      gte(finRevenueForecasts.forecastDate, monthStart),
      lte(finRevenueForecasts.forecastDate, monthEnd),
    ))
    .orderBy(finRevenueForecasts.forecastDate);
}
export async function upsertFinRevenueForecast(data: InsertFinRevenueForecast): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Check if exists for this user+date
  const existing = await db.select().from(finRevenueForecasts)
    .where(and(eq(finRevenueForecasts.userId, data.userId), eq(finRevenueForecasts.forecastDate, data.forecastDate)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(finRevenueForecasts)
      .set({ amount: data.amount, actualAmount: data.actualAmount, description: data.description, updatedAt: new Date() })
      .where(and(eq(finRevenueForecasts.userId, data.userId), eq(finRevenueForecasts.forecastDate, data.forecastDate)));
  } else {
    await db.insert(finRevenueForecasts).values(data);
  }
}
export async function deleteFinRevenueForecast(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finRevenueForecasts).where(and(eq(finRevenueForecasts.id, id), eq(finRevenueForecasts.userId, userId)));
}

// ─── Fin Dashboard KPIs ───────────────────────────────────────────────────────
export async function getFinDashboardKPIs(_userId: number) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const next7 = new Date(today); next7.setDate(today.getDate() + 7);

  const [allTransactions, allReceivables, allBanks] = await Promise.all([
    db.select().from(finTransactions),
    db.select().from(finReceivables),
    db.select().from(finBanks),
  ]);

  const totalPayable = allTransactions.filter(t => !t.isPaid).reduce((s, t) => s + Number(t.amount), 0);
  const totalPaid = allTransactions.filter(t => t.isPaid).reduce((s, t) => s + Number(t.amount), 0);
  const totalReceivable = allReceivables.filter(r => !r.isReceived).reduce((s, r) => s + Number(r.amount), 0);
  const totalReceived = allReceivables.filter(r => r.isReceived).reduce((s, r) => s + Number(r.amount), 0);
  const overdueTransactions = allTransactions.filter(t => !t.isPaid && t.dueDate < today);
  const totalOverdue = overdueTransactions.reduce((s, t) => s + Number(t.amount), 0);
  const overdueCount = overdueTransactions.length;
  const todayPayments = allTransactions.filter(t => t.dueDate >= today && t.dueDate < tomorrow);
  const todayPaymentsTotal = todayPayments.reduce((s, t) => s + Number(t.amount), 0);
  const todayPaymentsPendingCount = todayPayments.filter(t => !t.isPaid).length;
  const todayPaymentsPendingTotal = todayPayments.filter(t => !t.isPaid).reduce((s, t) => s + Number(t.amount), 0);
  const next7Payments = allTransactions.filter(t => !t.isPaid && t.dueDate >= today && t.dueDate < next7);
  const next7Total = next7Payments.reduce((s, t) => s + Number(t.amount), 0);
  const totalBankBalance = allBanks.reduce((s, b) => s + Number(b.initialBalance || 0), 0);
  const balance = totalReceivable - totalPayable;

  // Monthly evolution (last 6 months)
  const monthlyData: { month: string; paid: number; pending: number; received: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const monthLabel = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    const paid = allTransactions.filter(t => t.isPaid && t.dueDate >= mStart && t.dueDate <= mEnd).reduce((s, t) => s + Number(t.amount), 0);
    const pending = allTransactions.filter(t => !t.isPaid && t.dueDate >= mStart && t.dueDate <= mEnd).reduce((s, t) => s + Number(t.amount), 0);
    const received = allReceivables.filter(r => r.isReceived && r.dueDate >= mStart && r.dueDate <= mEnd).reduce((s, r) => s + Number(r.amount), 0);
    monthlyData.push({ month: monthLabel, paid, pending, received });
  }

  // Category breakdown (top 5)
  const categoryMap = new Map<number, number>();
  allTransactions.forEach(t => {
    if (t.categoryId) categoryMap.set(t.categoryId, (categoryMap.get(t.categoryId) || 0) + Number(t.amount));
  });

  return {
    totalPayable, totalPaid, totalReceivable, totalReceived,
    totalOverdue, overdueCount, todayPaymentsTotal, todayPaymentsCount: todayPayments.length,
    todayPaymentsPendingCount, todayPaymentsPendingTotal, next7Total, next7Count: next7Payments.length,
    totalBankBalance, balance, monthlyData,
    upcomingPayments: next7Payments.slice(0, 5).map(t => ({
      id: t.id, description: t.description, amount: Number(t.amount), dueDate: t.dueDate, categoryId: t.categoryId,
    })),
  };
}

// ─── Cashflow Monthly ─────────────────────────────────────────────────────────
export interface CashflowMonth {
  month: string;
  label: string;
  totalPayable: number;
  totalPaid: number;
  totalReceivable: number;
  totalReceived: number;
  projectedBalance: number;
  realizedBalance: number;
  pendingPayable: number;
  pendingReceivable: number;
}

export async function getCashflowMonthly(
  _userId: number,
  monthsBack = 3,
  monthsAhead = 6,
): Promise<CashflowMonth[]> {
  const db = await getDb();
  if (!db) return [];

  const [allTransactions, allReceivables] = await Promise.all([
    db.select().from(finTransactions),
    db.select().from(finReceivables),
  ]);

  const now = new Date();
  const result: CashflowMonth[] = [];

  for (let i = -monthsBack; i <= monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const rawLabel = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

    const inRange = (date: Date) => date >= mStart && date <= mEnd;

    const monthTx = allTransactions.filter(t => inRange(new Date(t.dueDate)));
    const monthRx = allReceivables.filter(r => inRange(new Date(r.dueDate)));

    const totalPayable = monthTx.reduce((s, t) => s + Number(t.amount), 0);
    const totalPaid = monthTx.filter(t => t.isPaid).reduce((s, t) => s + Number(t.amount), 0);
    const pendingPayable = monthTx.filter(t => !t.isPaid).reduce((s, t) => s + Number(t.amount), 0);

    const totalReceivable = monthRx.reduce((s, r) => s + Number(r.amount), 0);
    const totalReceived = monthRx.filter(r => r.isReceived).reduce((s, r) => s + Number(r.amount), 0);
    const pendingReceivable = monthRx.filter(r => !r.isReceived).reduce((s, r) => s + Number(r.amount), 0);

    result.push({
      month: monthKey,
      label,
      totalPayable,
      totalPaid,
      totalReceivable,
      totalReceived,
      projectedBalance: totalReceivable - totalPayable,
      realizedBalance: totalReceived - totalPaid,
      pendingPayable,
      pendingReceivable,
    });
  }

  return result;
}

// ─── Daily Revenue (Faturamento Real por Dia) ─────────────────────────────────
export async function saveDailyRevenue(
  userId: number,
  revenueDate: string,
  realAmount: number,
  note: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Compartilhado entre todos os usuários - filtra apenas por data
  const existing = await db.select().from(finDailyRevenue)
    .where(eq(finDailyRevenue.revenueDate, revenueDate))
    .limit(1);
  if (existing.length > 0) {
    await db.update(finDailyRevenue)
      .set({ realAmount: String(realAmount), note, updatedAt: new Date() })
      .where(eq(finDailyRevenue.revenueDate, revenueDate));
  } else {
    await db.insert(finDailyRevenue).values({ userId, revenueDate, realAmount: String(realAmount), note });
  }
}

export async function getDailyRevenues(userId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  // 1. Obter os faturamentos reais gravados na tabela finDailyRevenue (compartilhado entre todos)
  const realRows = await db.select().from(finDailyRevenue)
    .where(and(
      gte(finDailyRevenue.revenueDate, dateFrom),
      lte(finDailyRevenue.revenueDate, dateTo),
    ))
    .orderBy(finDailyRevenue.revenueDate);

  // 2. Para dias vazios ou hoje, obter o somatório da tabela local de vendas (sales)
  let salesMap = new Map<string, number>();
  try {
    const rawSales = await db.execute(sql`
      SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') as day_date, SUM(finalTotal) as day_total
      FROM sales
      WHERE status = 'completed'
        AND createdAt >= ${dateFrom + " 00:00:00"}
        AND createdAt <= ${dateTo + " 23:59:59"}
      GROUP BY day_date
    `);
    const rows = (rawSales as any)[0] as Array<{ day_date: string; day_total: number }>;
    if (rows && rows.length > 0) {
      salesMap = new Map(rows.map((r: any) => [r.day_date, Number(r.day_total)]));
    }
  } catch { /* tabela sales pode não existir ou estar vazia */ }

  // Combinar os resultados
  const resultList = [...realRows];
  const existingDates = new Set(realRows.map(r => r.revenueDate));

  for (const [dateStr, totalVal] of Array.from(salesMap.entries())) {
    if (!existingDates.has(dateStr)) {
      resultList.push({
        id: -1, // ID temporário indicando que é tempo real
        userId,
        revenueDate: dateStr,
        realAmount: String(Number(totalVal).toFixed(2)),
        note: "Vendas locais sincronizadas em tempo real",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    }
  }

  return resultList.sort((a, b) => a.revenueDate.localeCompare(b.revenueDate));
}

// Apagar faturamento real de uma data específica
export async function deleteRealRevenue(userId: number, revenueDate: string): Promise<{ deleted: number }> {
  const db = await getDb();
  if (!db) return { deleted: 0 };
  // Compartilhado - filtra apenas por data
  const result = await db.delete(finDailyRevenue)
    .where(eq(finDailyRevenue.revenueDate, revenueDate));
  return { deleted: (result as unknown as { rowsAffected?: number }).rowsAffected ?? 1 };
}

// Apagar todos os faturamentos reais de um mês
export async function clearMonthRealRevenues(userId: number, year: number, month: number): Promise<{ deleted: number }> {
  const db = await getDb();
  if (!db) return { deleted: 0 };
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  // Compartilhado - filtra apenas por período
  const rows = await db.select({ id: finDailyRevenue.id }).from(finDailyRevenue)
    .where(and(
      gte(finDailyRevenue.revenueDate, dateFrom),
      lte(finDailyRevenue.revenueDate, dateTo),
    ));
  if (rows.length === 0) return { deleted: 0 };
  await db.delete(finDailyRevenue)
    .where(and(
      gte(finDailyRevenue.revenueDate, dateFrom),
      lte(finDailyRevenue.revenueDate, dateTo),
    ));
  return { deleted: rows.length };
}

// Histórico de acurácia: compara faturamento real vs projetado por mês
export async function getAccuracyHistory(
  userId: number,
  avgWeekday: number,
  avgSaturday: number,
  avgSundayHoliday: number,
  rainFactor: number,
  months: number,
) {
  const db = await getDb();
  if (!db) return [];

  // Buscar feriados do ano atual e anterior
  let holidays: { date: string }[] = [];
  try {
    const now = new Date();
    const [r1, r2] = await Promise.all([
      fetch(`https://brasilapi.com.br/api/feriados/v1/${now.getFullYear()}`),
      fetch(`https://brasilapi.com.br/api/feriados/v1/${now.getFullYear() - 1}`),
    ]);
    const [h1, h2] = await Promise.all([r1.ok ? r1.json() : [], r2.ok ? r2.json() : []]);
    holidays = [...h1, ...h2];
  } catch { /* ignora */ }
  const holidayDates = new Set(holidays.map((h: { date: string }) => h.date));

  const result = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
    const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

    // Calcular projeção base (sem clima pois não temos histórico de clima)
    let totalProjected = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(year, month - 1, day).getDay();
      const isHoliday = holidayDates.has(dateStr);
      if (isHoliday || weekday === 0) totalProjected += avgSundayHoliday;
      else if (weekday === 6) totalProjected += avgSaturday;
      else totalProjected += avgWeekday;
    }

    // Buscar faturamento real do mês (compartilhado entre todos os usuários)
    const realRows = await db.select().from(finDailyRevenue)
      .where(and(
        gte(finDailyRevenue.revenueDate, dateFrom),
        lte(finDailyRevenue.revenueDate, dateTo),
      ));
    const totalReal = realRows.reduce((s, r) => s + Number(r.realAmount), 0);
    const daysWithData = realRows.length;
    const accuracy = totalProjected > 0 && totalReal > 0
      ? Math.round((totalReal / totalProjected) * 100)
      : null;

    result.push({
      month: `${year}-${String(month).padStart(2, "0")}`,
      label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      totalProjected: Math.round(totalProjected),
      totalReal,
      daysWithData,
      daysInMonth,
      accuracy,
    });
  }

  return result;
}

// Alerta de chuva para os próximos 2 dias
export async function getRainAlert(
  avgWeekday: number,
  avgSaturday: number,
  avgSundayHoliday: number,
  rainFactor: number,
) {
  const alerts: {
    date: string;
    label: string;
    weatherLabel: string;
    tempMax: number;
    precip: number;
    precipProb: number;
    baseAmount: number;
    projectedAmount: number;
    impact: number;
  }[] = [];

  try {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const dayAfter = new Date(now); dayAfter.setDate(now.getDate() + 2);

    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dateFrom = fmt(tomorrow);
    const dateTo = fmt(dayAfter);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=-16.6864&longitude=-49.2643&daily=weathercode,temperature_2m_max,precipitation_sum,precipitation_probability_max&timezone=America%2FSao_Paulo&start_date=${dateFrom}&end_date=${dateTo}`;
    const res = await fetch(url);
    if (!res.ok) return alerts;

    const data = await res.json();
    const { time, weathercode, temperature_2m_max, precipitation_sum, precipitation_probability_max } = data.daily;

    // Feriados
    let holidayDates = new Set<string>();
    try {
      const hr = await fetch(`https://brasilapi.com.br/api/feriados/v1/${now.getFullYear()}`);
      if (hr.ok) {
        const hs: { date: string }[] = await hr.json();
        holidayDates = new Set(hs.map(h => h.date));
      }
    } catch { /* ignora */ }

    time.forEach((dateStr: string, i: number) => {
      const code = weathercode[i];
      const tempMax = temperature_2m_max[i];
      const precip = precipitation_sum[i] ?? 0;
      const precipProb = precipitation_probability_max[i] ?? 0;

      let weatherLabel = "sun";
      if (code === 0) weatherLabel = "sun";
      else if (code <= 3) weatherLabel = "cloud";
      else if (code <= 67 || (code >= 80 && code <= 84)) {
        weatherLabel = precip > 5 || precipProb > 60 ? "rain" : "cloud";
      } else if (code >= 85 || code >= 95) weatherLabel = "storm";
      else weatherLabel = "cloud";

      if (weatherLabel !== "rain" && weatherLabel !== "storm") return; // Só alertas de chuva

      const date = new Date(dateStr + "T12:00:00");
      const weekday = date.getDay();
      const isHoliday = holidayDates.has(dateStr);
      let baseAmount = isHoliday || weekday === 0 ? avgSundayHoliday
        : weekday === 6 ? avgSaturday
        : avgWeekday;

      const projectedAmount = weatherLabel === "storm"
        ? Math.round(baseAmount * rainFactor * 0.8)
        : Math.round(baseAmount * rainFactor);

      const impact = baseAmount - projectedAmount;
      const dayLabel = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

      alerts.push({ date: dateStr, label: dayLabel, weatherLabel, tempMax, precip, precipProb, baseAmount, projectedAmount, impact });
    });
  } catch { /* ignora erros de rede */ }

  return alerts;
}

// ─── Forecast Settings ────────────────────────────────────────────────────────
export async function getForecastSettings(userId: number): Promise<ForecastSettings | null> {
  const db = await getDb();
  if (!db) return null;
  // Compartilhado - busca a primeira configuração existente (global)
  const rows = await db.select().from(forecastSettings).limit(1);
  return rows[0] ?? null;
}

export async function saveForecastSettings(
  userId: number,
  settings: { avgWeekday: number; avgSaturday: number; avgSundayHoliday: number; rainFactor: number }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Compartilhado - busca qualquer configuração existente (global)
  const existing = await db.select({ id: forecastSettings.id }).from(forecastSettings).limit(1);
  if (existing.length > 0) {
    await db.update(forecastSettings)
      .set({
        avgWeekday: settings.avgWeekday,
        avgSaturday: settings.avgSaturday,
        avgSundayHoliday: settings.avgSundayHoliday,
        rainFactor: String(settings.rainFactor),
      })
      .where(eq(forecastSettings.id, existing[0].id));
  } else {
    await db.insert(forecastSettings).values({
      userId,
      avgWeekday: settings.avgWeekday,
      avgSaturday: settings.avgSaturday,
      avgSundayHoliday: settings.avgSundayHoliday,
      rainFactor: String(settings.rainFactor),
    });
  }
}

// ─── Fin Goals (Meta de Gerência) ─────────────────────────────────────────────
export async function getFinGoals(month: string): Promise<FinGoal[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finGoals)
    .where(eq(finGoals.month, month))
    .orderBy(finGoals.sortOrder, finGoals.id);
}

export async function createFinGoal(data: InsertFinGoal): Promise<FinGoal | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(finGoals).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId;
  if (!insertId) return null;
  const rows = await db.select().from(finGoals).where(eq(finGoals.id, insertId)).limit(1);
  return rows[0] ?? null;
}

export async function updateFinGoal(id: number, data: Partial<InsertFinGoal>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finGoals).set({ ...data, updatedAt: new Date() }).where(eq(finGoals.id, id));
}

export async function deleteFinGoal(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finGoals).where(eq(finGoals.id, id));
}

// ─── Fin Goal Extra Costs ─────────────────────────────────────────────────────
export async function getFinGoalExtraCosts(month: string): Promise<FinGoalExtraCost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finGoalExtraCosts)
    .where(eq(finGoalExtraCosts.month, month))
    .orderBy(finGoalExtraCosts.id);
}

export async function createFinGoalExtraCost(data: InsertFinGoalExtraCost): Promise<FinGoalExtraCost | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(finGoalExtraCosts).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId;
  if (!insertId) return null;
  const rows = await db.select().from(finGoalExtraCosts).where(eq(finGoalExtraCosts.id, insertId)).limit(1);
  return rows[0] ?? null;
}

export async function deleteFinGoalExtraCost(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finGoalExtraCosts).where(eq(finGoalExtraCosts.id, id));
}

// ─── Fin Goals Month Summary ──────────────────────────────────────────────────
export async function getFinGoalsMonthSummary(month: string): Promise<{
  totalPayables: number;
  totalPaid: number;
  totalPending: number;
  totalExtraCosts: number;
}> {
  const db = await getDb();
  if (!db) return { totalPayables: 0, totalPaid: 0, totalPending: 0, totalExtraCosts: 0 };

  // Parse month "2025-04" → date range
  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(year, mon - 1, 1);
  const monthEnd = new Date(year, mon, 0, 23, 59, 59);

  const transactions = await db.select().from(finTransactions)
    .where(and(
      gte(finTransactions.dueDate, monthStart),
      lte(finTransactions.dueDate, monthEnd),
    ));

  const extraCosts = await db.select().from(finGoalExtraCosts)
    .where(eq(finGoalExtraCosts.month, month));

  const totalPayables = transactions.reduce((sum, t) => sum + parseFloat(String(t.amount) || "0"), 0);
  const totalPaid = transactions.filter(t => t.isPaid).reduce((sum, t) => sum + parseFloat(String(t.amount) || "0"), 0);
  const totalPending = transactions.filter(t => !t.isPaid).reduce((sum, t) => sum + parseFloat(String(t.amount) || "0"), 0);
  const totalExtraCosts = extraCosts.reduce((sum, e) => sum + parseFloat(String(e.amount) || "0"), 0);

  return { totalPayables, totalPaid, totalPending, totalExtraCosts };
}

/**
 * Distributes a target revenue across all days of a month using the
 * weekday/saturday/sunday weights from forecastSettings.
 * Saves each day as a finDailyRevenue entry (upsert).
 */
export async function populateForecastFromGoal(
  userId: number,
  month: string,       // "YYYY-MM"
  targetRevenue: number,
  overwrite: boolean,  // if false, skip days that already have a value
): Promise<{ populated: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { populated: 0, skipped: 0 };

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();

  // Load forecast settings for weights
  const settingsRows = await db.select().from(forecastSettings)
    .where(eq(forecastSettings.userId, userId)).limit(1);
  const settings = settingsRows[0] ?? {
    avgWeekday: 2000,
    avgSaturday: 5300,
    avgSundayHoliday: 8300,
  };
  const wWeekday = Number(settings.avgWeekday);
  const wSaturday = Number(settings.avgSaturday);
  const wSunday = Number(settings.avgSundayHoliday);

  // Build day list with weights
  const days: { date: string; weight: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, mon - 1, d);
    const dow = dt.getDay(); // 0=Sun, 6=Sat
    const weight = dow === 0 ? wSunday : dow === 6 ? wSaturday : wWeekday;
    const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push({ date: dateStr, weight });
  }

  const totalWeight = days.reduce((s, d) => s + d.weight, 0);
  if (totalWeight === 0) return { populated: 0, skipped: 0 };

  // Load existing forecast entries for this month (finRevenueForecasts)
  const dateFrom = `${year}-${String(mon).padStart(2, "0")}-01`;
  const dateTo = `${year}-${String(mon).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const existing = await db.select({ forecastDate: finRevenueForecasts.forecastDate })
    .from(finRevenueForecasts)
    .where(and(
      eq(finRevenueForecasts.userId, userId),
      gte(finRevenueForecasts.forecastDate, dateFrom),
      lte(finRevenueForecasts.forecastDate, dateTo),
    ));
  const existingDates = new Set(existing.map(r => r.forecastDate));

  let populated = 0;
  let skipped = 0;

  for (const day of days) {
    if (!overwrite && existingDates.has(day.date)) {
      skipped++;
      continue;
    }
    const amount = Math.round((day.weight / totalWeight) * targetRevenue * 100) / 100;
    // Gravar como PREVISÃO (finRevenueForecasts.amount), não como valor real
    await upsertFinRevenueForecast({
      userId,
      forecastDate: day.date,
      amount: String(amount),
      description: "Meta de Gerência",
    });
    populated++;
  }

  return { populated, skipped };
}

// ── Monthly Comparison by Category ──────────────────────────────────────────
export async function getMonthlyComparison(
  month1From: Date,
  month1To: Date,
  month2From: Date,
  month2To: Date
): Promise<{
  categories: string[];
  month1: Record<string, number>;
  month2: Record<string, number>;
  month1Total: number;
  month2Total: number;
}> {
  const db = await getDb();
  if (!db) return { categories: [], month1: {}, month2: {}, month1Total: 0, month2Total: 0 };

  const [txMonth1, txMonth2, cats] = await Promise.all([
    db.select().from(finTransactions)
      .where(and(
        gte(finTransactions.dueDate, month1From),
        lte(finTransactions.dueDate, month1To)
      )),
    db.select().from(finTransactions)
      .where(and(
        gte(finTransactions.dueDate, month2From),
        lte(finTransactions.dueDate, month2To)
      )),
    db.select().from(finCategories),
  ]);

  const categoryMap = new Map(cats.map(c => [c.id, c.name]));

  const buildMap = (txs: typeof txMonth1) => {
    const map: Record<string, number> = {};
    txs.forEach(t => {
      const cat = t.categoryId
        ? (categoryMap.get(t.categoryId) ?? "Outros")
        : "Sem categoria";
      map[cat] = (map[cat] ?? 0) + Number(t.amount);
    });
    return map;
  };

  const m1 = buildMap(txMonth1);
  const m2 = buildMap(txMonth2);

  const allCats = Array.from(new Set([...Object.keys(m1), ...Object.keys(m2)])).sort();

  const m1Total = Object.values(m1).reduce((s, v) => s + v, 0);
  const m2Total = Object.values(m2).reduce((s, v) => s + v, 0);

  return { categories: allCats, month1: m1, month2: m2, month1Total: m1Total, month2Total: m2Total };
}

// ─── Relatório: Contas a Pagar por Dia da Semana ────────────────────────────
export interface WeekdayPayableItem {
  id: number;
  description: string;
  amount: number;
  dueDate: Date;
  isPaid: boolean;
  isOverdue: boolean;
  categoryName: string | null;
  bankName: string | null;
}

export interface WeekdayPayableSummary {
  dayIndex: number;   // 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta
  dayName: string;
  pending: number;
  paid: number;
  overdue: number;
  total: number;
  count: number;
  items: WeekdayPayableItem[];
}

export async function getPayablesByWeekday(
  _userId: number,
  filters: { dateFrom: Date; dateTo: Date }
): Promise<WeekdayPayableSummary[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: finTransactions.id,
      description: finTransactions.description,
      amount: finTransactions.amount,
      dueDate: finTransactions.dueDate,
      isPaid: finTransactions.isPaid,
      categoryName: finCategories.name,
      bankName: finBanks.name,
    })
    .from(finTransactions)
    .leftJoin(finCategories, eq(finTransactions.categoryId, finCategories.id))
    .leftJoin(finBanks, eq(finTransactions.bankId, finBanks.id))
    .where(
      and(
        gte(finTransactions.dueDate, filters.dateFrom),
        lte(finTransactions.dueDate, filters.dateTo)
      )
    )
    .orderBy(finTransactions.dueDate);

  const now = new Date();
  const dayNames = ["", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];

  // Inicializar os 5 dias da semana (1=Seg ... 5=Sex)
  const summaryMap = new Map<number, WeekdayPayableSummary>();
  for (let d = 1; d <= 5; d++) {
    summaryMap.set(d, {
      dayIndex: d,
      dayName: dayNames[d],
      pending: 0,
      paid: 0,
      overdue: 0,
      total: 0,
      count: 0,
      items: [],
    });
  }

  for (const row of rows) {
    const date = new Date(row.dueDate);
    // getDay(): 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab
    const jsDay = date.getDay();
    // Ignorar fins de semana
    if (jsDay === 0 || jsDay === 6) continue;

    const dayIndex = jsDay; // 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex
    const summary = summaryMap.get(dayIndex)!;
    const amount = Number(row.amount);
    const isOverdue = !row.isPaid && date < now;

    summary.count++;
    summary.total += amount;
    if (row.isPaid) {
      summary.paid += amount;
    } else if (isOverdue) {
      summary.overdue += amount;
    } else {
      summary.pending += amount;
    }

    summary.items.push({
      id: row.id,
      description: row.description,
      amount,
      dueDate: date,
      isPaid: row.isPaid,
      isOverdue,
      categoryName: row.categoryName ?? null,
      bankName: row.bankName ?? null,
    });
  }

  return Array.from(summaryMap.values());
}

// ─── Payables by Week of Month ────────────────────────────────────────────────
export interface WeekDayItem {
  id: number;
  description: string;
  amount: number;
  dueDate: Date;
  isPaid: boolean;
  isOverdue: boolean;
  categoryName: string | null;
  bankName: string | null;
}

export interface WeekDaySummary {
  dayIndex: number; // 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex
  dayName: string;
  dateLabel: string; // e.g. "07/04"
  pending: number;
  paid: number;
  overdue: number;
  total: number;
  count: number;
  items: WeekDayItem[];
}

export interface WeekSummary {
  weekIndex: number;
  weekLabel: string;
  dateRange: string;
  pending: number;
  paid: number;
  overdue: number;
  total: number;
  days: WeekDaySummary[];
}

export async function getPayablesByWeek(
  _userId: number,
  filters: { dateFrom: Date; dateTo: Date }
): Promise<WeekSummary[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: finTransactions.id,
      description: finTransactions.description,
      amount: finTransactions.amount,
      dueDate: finTransactions.dueDate,
      isPaid: finTransactions.isPaid,
      categoryName: finCategories.name,
      bankName: finBanks.name,
    })
    .from(finTransactions)
    .leftJoin(finCategories, eq(finTransactions.categoryId, finCategories.id))
    .leftJoin(finBanks, eq(finTransactions.bankId, finBanks.id))
    .where(
      and(
        gte(finTransactions.dueDate, filters.dateFrom),
        lte(finTransactions.dueDate, filters.dateTo)
      )
    )
    .orderBy(finTransactions.dueDate);

  const now = new Date();
  const dayNames = ["", "Segunda-feira", "Ter\u00e7a-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];

  const year = filters.dateFrom.getFullYear();
  const month = filters.dateFrom.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const weekRanges = [
    { start: 1, end: Math.min(7, lastDay) },
    { start: 8, end: Math.min(14, lastDay) },
    { start: 15, end: Math.min(21, lastDay) },
    { start: 22, end: lastDay },
  ];

  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  const weeks: WeekSummary[] = weekRanges.map((range, idx) => {
    const days: WeekDaySummary[] = [];
    for (let d = 1; d <= 5; d++) {
      days.push({ dayIndex: d, dayName: dayNames[d], dateLabel: "", pending: 0, paid: 0, overdue: 0, total: 0, count: 0, items: [] });
    }
    return {
      weekIndex: idx + 1,
      weekLabel: `${idx + 1}\u00aa Semana`,
      dateRange: `${fmt(new Date(year, month, range.start))} - ${fmt(new Date(year, month, range.end))}`,
      pending: 0, paid: 0, overdue: 0, total: 0,
      days,
    };
  });

  for (const row of rows) {
    const date = new Date(row.dueDate);
    const dayOfMonth = date.getDate();
    const jsDay = date.getDay();
    if (jsDay === 0 || jsDay === 6) continue;

    let weekIdx = 0;
    if (dayOfMonth <= 7) weekIdx = 0;
    else if (dayOfMonth <= 14) weekIdx = 1;
    else if (dayOfMonth <= 21) weekIdx = 2;
    else weekIdx = 3;

    const week = weeks[weekIdx];
    const daySummary = week.days.find((d) => d.dayIndex === jsDay)!;
    const amount = Number(row.amount);
    const isOverdue = !row.isPaid && date < now;

    // Atualiza o dateLabel com a data real do dia (dd/mm)
    if (!daySummary.dateLabel) {
      daySummary.dateLabel = fmt(date);
    }
    daySummary.count++;
    daySummary.total += amount;
    week.total += amount;

    if (row.isPaid) {
      daySummary.paid += amount;
      week.paid += amount;
    } else if (isOverdue) {
      daySummary.overdue += amount;
      week.overdue += amount;
    } else {
      daySummary.pending += amount;
      week.pending += amount;
    }

    daySummary.items.push({
      id: row.id, description: row.description, amount,
      dueDate: date, isPaid: row.isPaid, isOverdue,
      categoryName: row.categoryName ?? null,
      bankName: row.bankName ?? null,
    });
  }

  return weeks;
}
