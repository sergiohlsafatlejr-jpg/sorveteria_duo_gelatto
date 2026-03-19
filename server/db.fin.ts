import { and, desc, eq, gte, lte } from "drizzle-orm";
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
} from "../drizzle/schema";
import { getDb } from "./db";

// ─── Fin Categories ───────────────────────────────────────────────────────────
export async function getFinCategories(userId: number): Promise<FinCategory[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finCategories).where(eq(finCategories.userId, userId)).orderBy(finCategories.name);
}
export async function createFinCategory(data: InsertFinCategory): Promise<FinCategory[]> {
  const db = await getDb();
  if (!db) return [];
  await db.insert(finCategories).values(data);
  return db.select().from(finCategories).where(eq(finCategories.userId, data.userId)).orderBy(finCategories.name);
}
export async function updateFinCategory(id: number, userId: number, name: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(finCategories).set({ name }).where(and(eq(finCategories.id, id), eq(finCategories.userId, userId)));
}
export async function deleteFinCategory(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(finCategories).where(and(eq(finCategories.id, id), eq(finCategories.userId, userId)));
}

// ─── Fin Banks ────────────────────────────────────────────────────────────────
export async function getFinBanks(userId: number): Promise<FinBank[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finBanks).where(eq(finBanks.userId, userId)).orderBy(finBanks.name);
}
export async function createFinBank(data: InsertFinBank): Promise<FinBank[]> {
  const db = await getDb();
  if (!db) return [];
  await db.insert(finBanks).values(data);
  return db.select().from(finBanks).where(eq(finBanks.userId, data.userId)).orderBy(finBanks.name);
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
export async function getFinPaymentTypes(userId: number): Promise<FinPaymentType[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finPaymentTypes).where(eq(finPaymentTypes.userId, userId)).orderBy(finPaymentTypes.description);
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
export async function getFinReceivableTypes(userId: number): Promise<FinReceivableType[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finReceivableTypes).where(eq(finReceivableTypes.userId, userId)).orderBy(finReceivableTypes.description);
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
export async function getFinCosts(userId: number): Promise<FinCost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finCosts).where(eq(finCosts.userId, userId)).orderBy(finCosts.description);
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
export async function getFinTransactions(userId: number, filters?: {
  categoryId?: number; bankId?: number; isPaid?: boolean;
  dateFrom?: Date; dateTo?: Date;
}): Promise<FinTransaction[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [eq(finTransactions.userId, userId)];
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

// ─── Fin Receivables ──────────────────────────────────────────────────────────
export async function getFinReceivables(userId: number, filters?: {
  typeId?: number; isReceived?: boolean; dateFrom?: Date; dateTo?: Date;
}): Promise<FinReceivable[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [eq(finReceivables.userId, userId)];
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
export async function getFinBankStatements(userId: number, filters?: {
  bankId?: number; categoryId?: number; dateFrom?: Date; dateTo?: Date;
}): Promise<FinBankStatement[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [eq(finBankStatements.userId, userId)];
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
export async function getFinRevenueForecasts(userId: number, monthStart: string, monthEnd: string): Promise<FinRevenueForecast[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finRevenueForecasts)
    .where(and(
      eq(finRevenueForecasts.userId, userId),
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
export async function getFinDashboardKPIs(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const next7 = new Date(today); next7.setDate(today.getDate() + 7);

  const [allTransactions, allReceivables, allBanks] = await Promise.all([
    db.select().from(finTransactions).where(eq(finTransactions.userId, userId)),
    db.select().from(finReceivables).where(eq(finReceivables.userId, userId)),
    db.select().from(finBanks).where(eq(finBanks.userId, userId)),
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
