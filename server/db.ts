import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
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
  const month = today.getMonth() + 1;
  const day = today.getDate();
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

export async function getLowStockProducts(): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.active, true),
        sql`${products.currentStock} <= ${products.minStock}`
      )
    );
}

// ─── Stock Movements ──────────────────────────────────────────────────────────
export async function createStockMovement(data: InsertStockMovement): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(stockMovements).values(data);
  const delta = data.type === "in" || data.type === "adjustment" ? data.quantity : -data.quantity;
  await db
    .update(products)
    .set({ currentStock: sql`currentStock + ${delta}` })
    .where(eq(products.id, data.productId));
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

  return {
    totalCustomers: totalCustomers?.count ?? 0,
    totalProducts: totalProducts?.count ?? 0,
    lowStockCount: lowStock?.count ?? 0,
    todaySalesTotal: parseFloat(todaySales?.total ?? "0"),
    todaySalesCount: todaySales?.count ?? 0,
    monthSalesTotal: parseFloat(monthSales?.total ?? "0"),
    monthSalesCount: monthSales?.count ?? 0,
  };
}

export async function getSalesChartData(days = 30) {
  const db = await getDb();
  if (!db) return [];
  const from = new Date();
  from.setDate(from.getDate() - days);
  // Use MIN(createdAt) to satisfy only_full_group_by; group by the date expression
  return db
    .select({
      date: sql<string>`DATE(MIN(${sales.createdAt}))`,
      total: sql<string>`COALESCE(SUM(${sales.finalTotal}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(sales)
    .where(and(gte(sales.createdAt, from), eq(sales.status, "completed")))
    .groupBy(sql`DATE(${sales.createdAt})`)
    .orderBy(sql`DATE(${sales.createdAt})`);
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
