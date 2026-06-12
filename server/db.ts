import { and, desc, eq, gte, like, lte, or, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AuditLog,
  Customer,
  ExternalConnector,
  InsertCustomer,
  InsertExternalConnector,
  InsertPointsRule,
  InsertPointsTransaction,
  InsertProduct,
  InsertProductCategory,
  InsertSale,
  InsertSaleItem,
  InsertScheduledNotification,
  InsertStockMovement,
  InsertUser,
  PointsRule,
  PointsTransaction,
  Product,
  ProductCategory,
  Sale,
  SaleItem,
  ScheduledNotification,
  StockMovement,
  User,
  UserPermission,
  auditLogs,
  customers,
  externalConnectors,
  pointsRules,
  pointsTransactions,
  productCategories,
  products,
  saleItems,
  sales,
  scheduledNotifications,
  stockMovements,
  userPermissions,
  users,
  salesImports,
  salesImportItems,
  customerPurchases,
  InsertCustomerPurchase,
  CustomerPurchase,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: User["role"]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function toggleUserActive(userId: number, active: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ active }).where(eq(users.id, userId));
}

// ─── User Permissions ─────────────────────────────────────────────────────────
export async function getUserPermissions(userId: number): Promise<UserPermission[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
}

export async function upsertUserPermission(
  userId: number,
  module: string,
  perms: { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(userPermissions)
    .values({ userId, module, ...perms })
    .onDuplicateKeyUpdate({ set: perms });
}

export async function upsertAllUserPermissions(
  userId: number,
  modulePerms: Array<{ module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Remove todas as permissões existentes do usuário e reinsere
  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
  if (modulePerms.length > 0) {
    await db.insert(userPermissions).values(
      modulePerms.map(p => ({ userId, ...p }))
    );
  }
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export async function createAuditLog(
  data: Omit<AuditLog, "id" | "createdAt">
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({ ...data, createdAt: new Date() });
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ─── Customers ────────────────────────────────────────────────────────────────
export async function getTopCustomersByPoints(limit = 10): Promise<Customer[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(customers)
    .where(sql`${customers.totalPoints} > 0 AND ${customers.active} = 1`)
    .orderBy(desc(customers.totalPoints))
    .limit(limit);
}
export async function getCustomersWithPointsCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(customers)
    .where(sql`${customers.totalPoints} > 0 AND ${customers.active} = 1`);
  return result?.count ?? 0;
}
export async function getCustomers(search?: string): Promise<Customer[]> {
  const db = await getDb();
  if (!db) return [];
  if (search) {
    return db
      .select()
      .from(customers)
      .where(
        or(
          like(customers.fullName, `%${search}%`),
          like(customers.phone, `%${search}%`),
          like(customers.email, `%${search}%`)
        )
      )
      .orderBy(desc(customers.createdAt));
  }
  return db.select().from(customers).orderBy(desc(customers.createdAt));
}

export async function getCustomerById(id: number): Promise<Customer | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return result[0];
}

export async function createCustomer(data: InsertCustomer): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(customers).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(customers).set(data).where(eq(customers.id, id));
}

export async function deleteCustomer(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(customers).set({ active: false }).where(eq(customers.id, id));
}

export async function getBirthdayCustomers(): Promise<Customer[]> {
  const db = await getDb();
  if (!db) return [];
  const today = new Date();
  const month = today.getUTCMonth() + 1; // UTC para consistência com o banco
  const day = today.getUTCDate();
  return db
    .select()
    .from(customers)
    .where(
      and(
        eq(sql`MONTH(${customers.birthDate})`, month),
        eq(sql`DAY(${customers.birthDate})`, day),
        eq(customers.active, true)
      )
    );
}

// ─── Points Rules ─────────────────────────────────────────────────────────────
export async function getPointsRules(): Promise<PointsRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pointsRules).where(eq(pointsRules.active, true));
}
export async function getAllPointsRules(): Promise<PointsRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pointsRules).orderBy(desc(pointsRules.createdAt));
}
export async function deletePointsRule(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pointsRules).where(eq(pointsRules.id, id));
}
export async function togglePointsRuleActive(id: number, active: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(pointsRules).set({ active }).where(eq(pointsRules.id, id));
}

export async function createPointsRule(data: InsertPointsRule): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(pointsRules).values(data);
}

export async function updatePointsRule(id: number, data: Partial<InsertPointsRule>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(pointsRules).set(data).where(eq(pointsRules.id, id));
}

// ─── Points Transactions ──────────────────────────────────────────────────────
export async function getCustomerPointsHistory(customerId: number): Promise<PointsTransaction[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pointsTransactions)
    .where(eq(pointsTransactions.customerId, customerId))
    .orderBy(desc(pointsTransactions.createdAt));
}

export async function addPointsTransaction(data: InsertPointsTransaction): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(pointsTransactions).values(data);
  const delta = data.type === "redeemed" || data.type === "expired" ? -data.points : data.points;
  await db
    .update(customers)
    .set({ totalPoints: sql`totalPoints + ${delta}` })
    .where(eq(customers.id, data.customerId));
}

// ─── Product Categories ───────────────────────────────────────────────────────
export async function getProductCategories(): Promise<ProductCategory[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productCategories).where(eq(productCategories.active, true));
}

export async function createProductCategory(data: InsertProductCategory): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(productCategories).values(data);
}

export async function updateProductCategory(id: number, data: Partial<InsertProductCategory>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(productCategories).set(data).where(eq(productCategories.id, id));
}

export async function deleteProductCategory(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(productCategories).set({ active: false }).where(eq(productCategories.id, id));
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function getProducts(search?: string, categoryId?: number): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(products.active, true)];
  if (search) conditions.push(like(products.name, `%${search}%`));
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));
  return db.select().from(products).where(and(...conditions)).orderBy(products.name);
}

export async function getProductById(id: number): Promise<Product | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0];
}

export async function createProduct(data: InsertProduct): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(products).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateProduct(id: number, data: Partial<InsertProduct>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(products).set({ active: false }).where(eq(products.id, id));
}

export async function getLowStockProducts(): Promise<(Product & { avgSalesQty: number })[]> {
  const db = await getDb();
  if (!db) return [];

  // Busca produtos com estoque baixo, ordenados pela quantidade vendida nos últimos 6 meses.
  // NOTA: TiDB/MySQL não suporta subquery na cláusula ON do LEFT JOIN.
  // Solução: fazer JOIN direto com sales_import_items e filtrar via WHERE com OR IS NULL,
  // depois juntar com sales_imports para filtrar por status e referenceMonth.
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const fromMonth = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      categoryId: products.categoryId,
      unit: products.unit,
      purchaseUnit: products.purchaseUnit,
      conversionFactor: products.conversionFactor,
      costPrice: products.costPrice,
      salePrice: products.salePrice,
      currentStock: products.currentStock,
      minStock: products.minStock,
      active: products.active,
      supplierCode: products.supplierCode,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      avgSalesQty: sql<number>`COALESCE(SUM(
        CASE WHEN ${salesImportItems.id} IS NOT NULL
          AND ${salesImports.status} = 'confirmed'
          AND ${salesImports.referenceMonth} >= ${fromMonth}
        THEN CAST(${salesImportItems.quantity} AS DECIMAL(10,3))
        ELSE 0 END
      ), 0)`,
    })
    .from(products)
    .leftJoin(
      salesImportItems,
      and(
        eq(salesImportItems.productId, products.id),
        eq(salesImportItems.linkStatus, "linked")
      )
    )
    .leftJoin(
      salesImports,
      eq(salesImports.id, salesImportItems.importId)
    )
    .where(
      and(
        eq(products.active, true),
        sql`${products.currentStock} <= ${products.minStock}`
      )
    )
    .groupBy(products.id)
    .orderBy(sql`COALESCE(SUM(
      CASE WHEN ${salesImportItems.id} IS NOT NULL
        AND ${salesImports.status} = 'confirmed'
        AND ${salesImports.referenceMonth} >= ${fromMonth}
      THEN CAST(${salesImportItems.quantity} AS DECIMAL(10,3))
      ELSE 0 END
    ), 0) DESC`)
    .limit(50);

  return rows as (Product & { avgSalesQty: number })[];
}

// ─── Stock Movements ──────────────────────────────────────────────────────────
export async function createStockMovement(data: InsertStockMovement): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(stockMovements).values(data);
  if (data.type === "adjustment") {
    // Para ajuste, define o valor exato do estoque (newStock)
    await db
      .update(products)
      .set({ currentStock: data.newStock })
      .where(eq(products.id, data.productId));
  } else {
    const delta = data.type === "in" ? data.quantity : -data.quantity;
    await db
      .update(products)
      .set({ currentStock: sql`currentStock + ${delta}` })
      .where(eq(products.id, data.productId));
  }
}

export async function getStockMovements(productId?: number): Promise<StockMovement[]> {
  const db = await getDb();
  if (!db) return [];
  if (productId) {
    return db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(50);
  }
  return db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(100);
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export async function createSale(saleData: InsertSale, items: Omit<InsertSaleItem, 'saleId'>[]): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(sales).values(saleData);
  const saleId = Number((result as any)[0]?.insertId ?? 0);
  if (items.length > 0) {
    await db.insert(saleItems).values(items.map((i) => ({ ...i, saleId })));
  }
  return saleId;
}

export async function getSales(from?: Date, to?: Date, customerId?: number): Promise<Sale[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (from) conditions.push(gte(sales.createdAt, from));
  if (to) conditions.push(lte(sales.createdAt, to));
  if (customerId) conditions.push(eq(sales.customerId, customerId));
  if (conditions.length > 0) {
    return db.select().from(sales).where(and(...conditions)).orderBy(desc(sales.createdAt));
  }
  return db.select().from(sales).orderBy(desc(sales.createdAt)).limit(100);
}

export async function getSaleById(id: number): Promise<{ sale: Sale; items: SaleItem[] } | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const saleResult = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
  if (!saleResult[0]) return undefined;
  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, id));
  return { sale: saleResult[0], items };
}

// ─── Dashboard Metrics ────────────────────────────────────────────────────────
export async function getDashboardMetrics() {
  const db = await getDb();
  if (!db) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [totalCustomers] = await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(eq(customers.active, true));
  const [totalProducts] = await db.select({ count: sql<number>`COUNT(*)` }).from(products).where(eq(products.active, true));
  const [lowStock] = await db.select({ count: sql<number>`COUNT(*)` }).from(products).where(and(eq(products.active, true), sql`${products.currentStock} <= ${products.minStock}`));
  const [todaySales] = await db.select({ total: sql<string>`COALESCE(SUM(${sales.finalTotal}), 0)`, count: sql<number>`COUNT(*)` }).from(sales).where(and(gte(sales.createdAt, today), eq(sales.status, "completed")));
  const [monthSales] = await db.select({ total: sql<string>`COALESCE(SUM(${sales.finalTotal}), 0)`, count: sql<number>`COUNT(*)` }).from(sales).where(and(gte(sales.createdAt, monthStart), eq(sales.status, "completed")));

  // Vendas importadas (PDV) confirmadas
  const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`; // YYYY-MM

  // Importações mensais confirmadas do mês atual (excluindo arquivadas)
  const [importMonthSales] = await db
    .select({ total: sql<string>`COALESCE(SUM(${salesImports.totalRevenue}), 0)`, count: sql<number>`COUNT(*)` })
    .from(salesImports)
    .where(and(
      eq(salesImports.status, "confirmed"),
      eq(salesImports.referenceMonth, monthStr),
      eq(salesImports.archived, false),
    ));

  // Importações diárias confirmadas de hoje
  const [importTodaySales] = await db
    .select({ total: sql<string>`COALESCE(SUM(${salesImports.totalRevenue}), 0)`, count: sql<number>`COUNT(*)` })
    .from(salesImports)
    .where(and(
      eq(salesImports.status, "confirmed"),
      eq(salesImports.importMode, "daily"),
      sql`DATE(${salesImports.saleDate}) = ${todayStr}`,
    ));

  const importMonthTotal = parseFloat(importMonthSales?.total ?? "0");
  const importMonthCount = importMonthSales?.count ?? 0;
  const importTodayTotal = parseFloat(importTodaySales?.total ?? "0");
  const importTodayCount = importTodaySales?.count ?? 0;

  return {
    totalCustomers: totalCustomers?.count ?? 0,
    totalProducts: totalProducts?.count ?? 0,
    lowStockCount: lowStock?.count ?? 0,
    todaySalesTotal: parseFloat(todaySales?.total ?? "0") + importTodayTotal,
    todaySalesCount: (todaySales?.count ?? 0) + importTodayCount,
    monthSalesTotal: parseFloat(monthSales?.total ?? "0") + importMonthTotal,
    monthSalesCount: (monthSales?.count ?? 0) + importMonthCount,
    // dados separados para o frontend mostrar a origem
    importMonthTotal,
    importMonthCount,
    importTodayTotal,
    importTodayCount,
  };
}

export async function getSalesChartData(days = 30) {
  const db = await getDb();
  if (!db) return [];
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);

  // Vendas manuais do sistema
  const manualSales = await db
    .select({
      date: sql<string>`DATE(MIN(${sales.createdAt}))`,
      total: sql<string>`COALESCE(SUM(${sales.finalTotal}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(sales)
    .where(and(gte(sales.createdAt, from), eq(sales.status, "completed")))
    .groupBy(sql`DATE(${sales.createdAt})`)
    .orderBy(sql`DATE(${sales.createdAt})`);

  // Importações diárias confirmadas (modo daily)
  const importDailySales = await db
    .select({
      date: sql<string>`DATE(MIN(${salesImports.saleDate}))`,
      total: sql<string>`COALESCE(SUM(${salesImports.totalRevenue}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(salesImports)
    .where(and(
      eq(salesImports.status, "confirmed"),
      eq(salesImports.importMode, "daily"),
      sql`DATE(${salesImports.saleDate}) >= ${fromStr}`,
    ))
    .groupBy(sql`DATE(${salesImports.saleDate})`);

  // Importações mensais confirmadas NÃO arquivadas — distribuir pelos dias do mês que estejam no intervalo
  const importMonthlySales = await db
    .select({
      referenceMonth: salesImports.referenceMonth,
      total: sql<string>`COALESCE(SUM(${salesImports.totalRevenue}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(salesImports)
    .where(and(
      eq(salesImports.status, "confirmed"),
      eq(salesImports.importMode, "monthly"),
      eq(salesImports.archived, false),
    ))
    .groupBy(salesImports.referenceMonth);

  // Combinar: usar data como chave
  const map = new Map<string, { total: number; count: number }>();

  for (const row of manualSales) {
    const key = row.date;
    const prev = map.get(key) ?? { total: 0, count: 0 };
    map.set(key, { total: prev.total + parseFloat(row.total), count: prev.count + row.count });
  }

  for (const row of importDailySales) {
    const key = row.date;
    if (!key) continue;
    const prev = map.get(key) ?? { total: 0, count: 0 };
    map.set(key, { total: prev.total + parseFloat(row.total), count: prev.count + row.count });
  }

  // Para importações mensais: distribuir o total igualmente pelos dias úteis do mês que estejam no intervalo
  const today = new Date();
  for (const row of importMonthlySales) {
    const [y, m] = row.referenceMonth.split("-").map(Number);
    // Gerar todos os dias do mês até hoje
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthDays: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dateStr >= fromStr && dateStr <= today.toISOString().slice(0, 10)) {
        monthDays.push(dateStr);
      }
    }
    if (monthDays.length === 0) continue;
    // Distribuir o total igualmente pelos dias do mês no intervalo
    const dailyTotal = parseFloat(row.total) / monthDays.length;
    for (const dateStr of monthDays) {
      const prev = map.get(dateStr) ?? { total: 0, count: 0 };
      map.set(dateStr, { total: prev.total + dailyTotal, count: prev.count });
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, count }]) => ({ date, total: String(total.toFixed(2)), count }));
}

export async function getTopProducts(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      productName: saleItems.productName,
      totalQty: sql<number>`SUM(${saleItems.quantity})`,
      totalRevenue: sql<string>`SUM(${saleItems.subtotal})`,
    })
    .from(saleItems)
    .groupBy(saleItems.productName)
    .orderBy(desc(sql`SUM(${saleItems.quantity})`))
    .limit(limit);
}

// ─── External Connectors ──────────────────────────────────────────────────────
export async function getExternalConnectors(): Promise<ExternalConnector[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(externalConnectors).orderBy(desc(externalConnectors.createdAt));
}

export async function createExternalConnector(data: InsertExternalConnector): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(externalConnectors).values(data);
}

export async function updateExternalConnector(id: number, data: Partial<InsertExternalConnector>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(externalConnectors).set(data).where(eq(externalConnectors.id, id));
}

export async function deleteExternalConnector(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(externalConnectors).where(eq(externalConnectors.id, id));
}

// ─── Scheduled Notifications ──────────────────────────────────────────────────
export async function getScheduledNotifications(): Promise<ScheduledNotification[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scheduledNotifications).orderBy(desc(scheduledNotifications.createdAt)).limit(100);
}

export async function createScheduledNotification(data: InsertScheduledNotification): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(scheduledNotifications).values(data);
}

export async function updateNotificationStatus(
  id: number,
  status: ScheduledNotification["status"],
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(scheduledNotifications)
    .set({ status, sentAt: status === "sent" ? new Date() : undefined, errorMessage })
    .where(eq(scheduledNotifications.id, id));
}

// ─── Notification Templates ───────────────────────────────────────────────────
import {
  InsertNotificationLog,
  InsertNotificationTemplate,
  NotificationLog,
  NotificationTemplate,
  notificationLogs,
  notificationTemplates,
} from "../drizzle/schema";

export async function getNotificationTemplates(): Promise<NotificationTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notificationTemplates).where(eq(notificationTemplates.active, true)).orderBy(desc(notificationTemplates.createdAt));
}

export async function createNotificationTemplate(data: InsertNotificationTemplate): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(notificationTemplates).values(data);
}

export async function updateNotificationTemplate(id: number, data: Partial<InsertNotificationTemplate>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(notificationTemplates).set(data).where(eq(notificationTemplates.id, id));
}

export async function deleteNotificationTemplate(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(notificationTemplates).set({ active: false }).where(eq(notificationTemplates.id, id));
}

// ─── Notification Logs ────────────────────────────────────────────────────────
export async function getNotificationLogs(limit = 50): Promise<NotificationLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notificationLogs).orderBy(desc(notificationLogs.createdAt)).limit(limit);
}

export async function createNotificationLog(data: InsertNotificationLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(notificationLogs).values(data);
}

// ─── Customer Purchase Stats ──────────────────────────────────────────────────
export async function getCustomerPurchaseStats(customerId: number): Promise<{
  lastPurchases: { date: Date; total: string; paymentMethod: string }[];
  avgPurchase: number;
  visitCount: number;
  lastVisitDate: Date | null;
}> {
  const db = await getDb();
  if (!db) return { lastPurchases: [], avgPurchase: 0, visitCount: 0, lastVisitDate: null };

  const recentSales = await db
    .select({
      date: sales.createdAt,
      total: sales.finalTotal,
      paymentMethod: sales.paymentMethod,
    })
    .from(sales)
    .where(and(eq(sales.customerId, customerId), eq(sales.status, "completed")))
    .orderBy(desc(sales.createdAt))
    .limit(5);

  const allSales = await db
    .select({ total: sales.finalTotal })
    .from(sales)
    .where(and(eq(sales.customerId, customerId), eq(sales.status, "completed")));

  const visitCount = allSales.length;
  const avgPurchase =
    visitCount > 0
      ? allSales.reduce((sum, s) => sum + parseFloat(String(s.total)), 0) / visitCount
      : 0;
  const lastVisitDate = recentSales.length > 0 ? recentSales[0].date : null;

  return {
    lastPurchases: recentSales.map((s) => ({
      date: s.date,
      total: String(s.total),
      paymentMethod: s.paymentMethod,
    })),
    avgPurchase,
    visitCount,
    lastVisitDate,
  };
}

// ─── Monthly Purchase Report ──────────────────────────────────────────────────
export async function getMonthlyPurchaseReport(
  year: number,
  month: number
): Promise<{
  productId: number;
  productName: string;
  purchaseCount: number;
  totalQuantity: number;
  totalCost: number;
  lastPurchaseDate: Date | null;
  purchases: { date: Date | null; quantity: number; unitCost: number | null; supplier: string | null; reason: string | null }[];
}[]> {
  const db = await getDb();
  if (!db) return [];

  // Busca todas as entradas (type = 'in') do mês/ano com purchaseDate ou createdAt no período
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const movements = await db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      supplier: stockMovements.supplier,
      reason: stockMovements.reason,
      purchaseDate: stockMovements.purchaseDate,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.type, "in"),
        sql`COALESCE(${stockMovements.purchaseDate}, ${stockMovements.createdAt}) BETWEEN ${startDate} AND ${endDate}`
      )
    )
    .orderBy(desc(stockMovements.createdAt));

  // Busca os produtos relacionados
  const productIds = Array.from(new Set(movements.map((m) => m.productId)));
  if (productIds.length === 0) return [];

  const productList = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(sql`${products.id} IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})`);

  const productMap = new Map(productList.map((p) => [p.id, p.name]));

  // Agrupa por produto
  const grouped = new Map<number, typeof movements>();
  for (const m of movements) {
    if (!grouped.has(m.productId)) grouped.set(m.productId, []);
    grouped.get(m.productId)!.push(m);
  }

  return Array.from(grouped.entries()).map(([productId, items]) => {
    const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
    const totalCost = items.reduce((s, i) => {
      const cost = i.unitCost ? parseFloat(String(i.unitCost)) * i.quantity : 0;
      return s + cost;
    }, 0);
    const sortedDates = items
      .map((i) => i.purchaseDate ?? i.createdAt)
      .sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0));
    return {
      productId,
      productName: productMap.get(productId) ?? `Produto #${productId}`,
      purchaseCount: items.length,
      totalQuantity,
      totalCost,
      lastPurchaseDate: sortedDates[0] ?? null,
      purchases: items.map((i) => ({
        date: i.purchaseDate ?? i.createdAt,
        quantity: i.quantity,
        unitCost: i.unitCost ? parseFloat(String(i.unitCost)) : null,
        supplier: i.supplier ?? null,
        reason: i.reason ?? null,
      })),
    };
  }).sort((a, b) => b.purchaseCount - a.purchaseCount);
}

// ─── Register Customer Purchase (manual, sem PDV) ─────────────────────────────
export async function registerCustomerPurchase(data: {
  customerId: number;
  amount: number;
  paymentMethod: "cash" | "credit_card" | "debit_card" | "pix" | "other";
  notes?: string;
  userId?: number;
}): Promise<{ saleId: number; pointsEarned: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");

  // Calcular pontos com base na regra ativa
  const activeRules = await db
    .select()
    .from(pointsRules)
    .where(eq(pointsRules.active, true))
    .limit(1);

  const rule = activeRules[0];
  let pointsEarned = 0;
  if (rule) {
    const purchaseAmt = parseFloat(String(rule.purchaseAmount));
    if (purchaseAmt > 0) {
      pointsEarned = Math.floor(data.amount / purchaseAmt) * rule.pointsEarned;
    }
  }

  // Criar venda
  const [insertResult] = await db.insert(sales).values({
    customerId: data.customerId,
    userId: data.userId,
    total: String(data.amount.toFixed(2)),
    discount: "0.00",
    finalTotal: String(data.amount.toFixed(2)),
    paymentMethod: data.paymentMethod,
    pointsEarned,
    pointsRedeemed: 0,
    notes: data.notes ?? null,
    status: "completed",
  });
  const saleId = (insertResult as any).insertId;

  // Atualizar totalPurchases do cliente
  await db
    .update(customers)
    .set({ totalPurchases: sql`totalPurchases + ${data.amount}` })
    .where(eq(customers.id, data.customerId));

  // Registrar pontos se ganhou
  if (pointsEarned > 0) {
    await addPointsTransaction({
      customerId: data.customerId,
      type: "earned",
      points: pointsEarned,
      purchaseAmount: String(data.amount.toFixed(2)),
      description: `Compra registrada manualmente — R$ ${data.amount.toFixed(2)}`,
      userId: data.userId,
    });
  }

  return { saleId, pointsEarned };
}

// ─── Customer Purchase History (tabela customer_purchases) ────────────────────
export async function getCustomerPurchaseHistory(
  customerId: number,
  limit = 20
): Promise<{
  id: number;
  amount: string;
  paymentMethod: string;
  pointsEarned: number;
  notes: string | null;
  createdAt: Date;
}[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: customerPurchases.id,
      amount: customerPurchases.amount,
      paymentMethod: customerPurchases.paymentMethod,
      pointsEarned: customerPurchases.pointsEarned,
      notes: customerPurchases.notes,
      createdAt: customerPurchases.createdAt,
    })
    .from(customerPurchases)
    .where(eq(customerPurchases.customerId, customerId))
    .orderBy(desc(customerPurchases.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    amount: String(r.amount),
    paymentMethod: r.paymentMethod,
    pointsEarned: r.pointsEarned,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
  }));
}

// ─── Customer Purchase Stats (tabela customer_purchases) ─────────────────────
export async function getCustomerPurchaseStatsFromTable(customerId: number): Promise<{
  visitCount: number;
  totalSpent: number;
  avgPurchase: number;
  lastVisitDate: Date | null;
}> {
  const db = await getDb();
  if (!db) return { visitCount: 0, totalSpent: 0, avgPurchase: 0, lastVisitDate: null };

  const rows = await db
    .select({
      amount: customerPurchases.amount,
      createdAt: customerPurchases.createdAt,
    })
    .from(customerPurchases)
    .where(eq(customerPurchases.customerId, customerId))
    .orderBy(desc(customerPurchases.createdAt));

  const visitCount = rows.length;
  const totalSpent = rows.reduce((s, r) => s + parseFloat(String(r.amount)), 0);
  const avgPurchase = visitCount > 0 ? totalSpent / visitCount : 0;
  const lastVisitDate = rows.length > 0 ? rows[0].createdAt : null;

  return { visitCount, totalSpent, avgPurchase, lastVisitDate };
}

// ─── Register Customer Purchase (tabela customer_purchases) ───────────────────
export async function registerCustomerPurchaseInTable(data: {
  customerId: number;
  amount: number;
  paymentMethod: "cash" | "credit_card" | "debit_card" | "pix" | "other";
  notes?: string;
  userId?: number;
}): Promise<{ purchaseId: number; pointsEarned: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");

  // Calcular pontos com base na regra ativa
  const activeRules = await db
    .select()
    .from(pointsRules)
    .where(eq(pointsRules.active, true))
    .limit(1);

  const rule = activeRules[0];
  let pointsEarned = 0;
  if (rule) {
    const purchaseAmt = parseFloat(String(rule.purchaseAmount));
    if (purchaseAmt > 0) {
      pointsEarned = Math.floor(data.amount / purchaseAmt) * rule.pointsEarned;
    }
  }

  // Inserir na tabela customer_purchases
  const [insertResult] = await db.insert(customerPurchases).values({
    customerId: data.customerId,
    amount: String(data.amount.toFixed(2)),
    paymentMethod: data.paymentMethod,
    pointsEarned,
    notes: data.notes ?? null,
    userId: data.userId,
  });
  const purchaseId = (insertResult as any).insertId;

  // Atualizar totalPurchases e totalPoints do cliente
  await db
    .update(customers)
    .set({
      totalPurchases: sql`totalPurchases + ${data.amount}`,
      totalPoints: pointsEarned > 0 ? sql`totalPoints + ${pointsEarned}` : undefined,
    })
    .where(eq(customers.id, data.customerId));

  // Registrar transação de pontos se ganhou
  if (pointsEarned > 0) {
    await addPointsTransaction({
      customerId: data.customerId,
      type: "earned",
      points: pointsEarned,
      purchaseAmount: String(data.amount.toFixed(2)),
      description: `Compra registrada — R$ ${data.amount.toFixed(2)}`,
      userId: data.userId,
    });
  }

  return { purchaseId, pointsEarned };
}
