import {
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "manager", "attendant", "user"]).default("user").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── User Permissions ─────────────────────────────────────────────────────────
export const userPermissions = mysqlTable("user_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  canView: boolean("canView").default(false).notNull(),
  canCreate: boolean("canCreate").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPermission = typeof userPermissions.$inferSelect;

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  targetId: int("targetId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  birthDate: timestamp("birthDate"),
  cep: varchar("cep", { length: 10 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  totalPoints: int("totalPoints").default(0).notNull(),
  totalPurchases: decimal("totalPurchases", { precision: 10, scale: 2 }).default("0.00").notNull(),
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// ─── Points Rules ─────────────────────────────────────────────────────────────
export const pointsRules = mysqlTable("points_rules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  purchaseAmount: decimal("purchaseAmount", { precision: 10, scale: 2 }).notNull(),
  pointsEarned: int("pointsEarned").notNull(),
  rewardThreshold: int("rewardThreshold").notNull(),
  rewardValue: decimal("rewardValue", { precision: 10, scale: 2 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PointsRule = typeof pointsRules.$inferSelect;
export type InsertPointsRule = typeof pointsRules.$inferInsert;

// ─── Points Transactions ──────────────────────────────────────────────────────
export const pointsTransactions = mysqlTable("points_transactions", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  type: mysqlEnum("type", ["earned", "redeemed", "expired", "manual"]).notNull(),
  points: int("points").notNull(),
  purchaseAmount: decimal("purchaseAmount", { precision: 10, scale: 2 }),
  description: varchar("description", { length: 500 }),
  userId: int("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PointsTransaction = typeof pointsTransactions.$inferSelect;
export type InsertPointsTransaction = typeof pointsTransactions.$inferInsert;

// ─── Product Categories ───────────────────────────────────────────────────────
export const productCategories = mysqlTable("product_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProductCategory = typeof productCategories.$inferSelect;
export type InsertProductCategory = typeof productCategories.$inferInsert;

// ─── Products ─────────────────────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  categoryId: int("categoryId"),
  sku: varchar("sku", { length: 100 }),
  barcode: varchar("barcode", { length: 100 }),
  costPrice: decimal("costPrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
  salePrice: decimal("salePrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
  currentStock: int("currentStock").default(0).notNull(),
  minStock: int("minStock").default(5).notNull(),
  unit: varchar("unit", { length: 20 }).default("un").notNull(),
  purchaseUnit: varchar("purchaseUnit", { length: 20 }).default("un").notNull(),
  conversionFactor: int("conversionFactor").default(1).notNull(),
  supplierCode: varchar("supplierCode", { length: 100 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Stock Movements ──────────────────────────────────────────────────────────
export const stockMovements = mysqlTable("stock_movements", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  type: mysqlEnum("type", ["in", "out", "adjustment", "sale"]).notNull(),
  quantity: int("quantity").notNull(),
  previousStock: int("previousStock").notNull(),
  newStock: int("newStock").notNull(),
  reason: varchar("reason", { length: 255 }),
  purchaseDate: timestamp("purchaseDate"),
  supplier: varchar("supplier", { length: 255 }),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }),
  userId: int("userId"),
  saleId: int("saleId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = typeof stockMovements.$inferInsert;

// ─── Sales ────────────────────────────────────────────────────────────────────
export const sales = mysqlTable("sales", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId"),
  userId: int("userId"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  finalTotal: decimal("finalTotal", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "credit_card", "debit_card", "pix", "other"]).notNull(),
  pointsEarned: int("pointsEarned").default(0).notNull(),
  pointsRedeemed: int("pointsRedeemed").default(0).notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["completed", "cancelled", "refunded"]).default("completed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sale = typeof sales.$inferSelect;
export type InsertSale = typeof sales.$inferInsert;

// ─── Sale Items ───────────────────────────────────────────────────────────────
export const saleItems = mysqlTable("sale_items", {
  id: int("id").autoincrement().primaryKey(),
  saleId: int("saleId").notNull(),
  productId: int("productId").notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SaleItem = typeof saleItems.$inferSelect;
export type InsertSaleItem = typeof saleItems.$inferInsert;

// ─── External Connectors ──────────────────────────────────────────────────────
export const externalConnectors = mysqlTable("external_connectors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").default(3306).notNull(),
  database: varchar("database", { length: 100 }).notNull(),
  username: varchar("username", { length: 100 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  lastSync: timestamp("lastSync"),
  syncStatus: varchar("syncStatus", { length: 50 }).default("never"),
  syncConfig: json("syncConfig"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExternalConnector = typeof externalConnectors.$inferSelect;
export type InsertExternalConnector = typeof externalConnectors.$inferInsert;

// ─── Notification Templates ──────────────────────────────────────────────────
export const notificationTemplates = mysqlTable("notification_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["birthday", "points_milestone", "promotion", "custom"]).notNull(),
  channel: mysqlEnum("channel", ["whatsapp", "instagram", "meta", "email"]).notNull(),
  subject: varchar("subject", { length: 255 }),
  message: text("message").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
export type InsertNotificationTemplate = typeof notificationTemplates.$inferInsert;

// ─── Notification Logs ────────────────────────────────────────────────────────
export const notificationLogs = mysqlTable("notification_logs", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId"),
  customerId: int("customerId"),
  customerName: varchar("customerName", { length: 255 }),
  channel: mysqlEnum("channel", ["whatsapp", "instagram", "meta", "email"]).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = typeof notificationLogs.$inferInsert;

// ─── Scheduled Notifications ──────────────────────────────────────────────────
export const scheduledNotifications = mysqlTable("scheduled_notifications", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["birthday", "points", "promotion", "custom"]).notNull(),
  customerId: int("customerId"),
  phone: varchar("phone", { length: 20 }),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed", "cancelled"]).default("pending").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScheduledNotification = typeof scheduledNotifications.$inferSelect;
export type InsertScheduledNotification = typeof scheduledNotifications.$inferInsert;

// ─── Financial Module (finance-buddy-70) ──────────────────────────────────────

export const finCategories = mysqlTable("fin_categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["income", "expense"]).default("expense").notNull(),
  color: varchar("color", { length: 32 }).default("#6b7280").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinCategory = typeof finCategories.$inferSelect;
export type InsertFinCategory = typeof finCategories.$inferInsert;

export const finBanks = mysqlTable("fin_banks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 32 }).default("#6366f1").notNull(),
  initialBalance: decimal("initialBalance", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinBank = typeof finBanks.$inferSelect;
export type InsertFinBank = typeof finBanks.$inferInsert;

export const finPaymentTypes = mysqlTable("fin_payment_types", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  categoryId: int("categoryId"),
  costId: int("costId"),
  description: varchar("description", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinPaymentType = typeof finPaymentTypes.$inferSelect;
export type InsertFinPaymentType = typeof finPaymentTypes.$inferInsert;

export const finReceivableTypes = mysqlTable("fin_receivable_types", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinReceivableType = typeof finReceivableTypes.$inferSelect;
export type InsertFinReceivableType = typeof finReceivableTypes.$inferInsert;

export const finCosts = mysqlTable("fin_costs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  categoryId: int("categoryId"),
  name: varchar("name", { length: 255 }).notNull().default(""),
  description: varchar("description", { length: 255 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).default("0").notNull(),
  value: decimal("value", { precision: 12, scale: 2 }).notNull().default("0"),
  type: mysqlEnum("type", ["fixed", "variable"]).default("fixed").notNull(),
  costCategory: mysqlEnum("costCategory", ["administrative", "operational", "commercial", "financial", "other"]).default("operational"),
  recurrence: mysqlEnum("recurrence", ["monthly", "weekly", "yearly", "once"]).default("monthly"),
  dueDay: int("dueDay").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinCost = typeof finCosts.$inferSelect;
export type InsertFinCost = typeof finCosts.$inferInsert;

export const finTransactions = mysqlTable("fin_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  categoryId: int("categoryId"),
  typeId: int("typeId"),
  costId: int("costId"),
  bankId: int("bankId"),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: timestamp("dueDate").notNull(),
  paymentDate: timestamp("paymentDate"),
  isPaid: boolean("isPaid").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinTransaction = typeof finTransactions.$inferSelect;
export type InsertFinTransaction = typeof finTransactions.$inferInsert;

export const finReceivables = mysqlTable("fin_receivables", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: int("clientId"),
  typeId: int("typeId"),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: timestamp("dueDate").notNull(),
  receivedDate: timestamp("receivedDate"),
  isReceived: boolean("isReceived").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinReceivable = typeof finReceivables.$inferSelect;
export type InsertFinReceivable = typeof finReceivables.$inferInsert;

export const finBankStatements = mysqlTable("fin_bank_statements", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  bankId: int("bankId"),
  categoryId: int("categoryId"),
  transactionId: int("transactionId"),
  receivableId: int("receivableId"),
  date: timestamp("date").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["credit", "debit"]).notNull(),
  reconciled: boolean("reconciled").default(false).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["pix", "cartao", "ted", "doc", "boleto", "dinheiro", "cheque", "outros"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinBankStatement = typeof finBankStatements.$inferSelect;
export type InsertFinBankStatement = typeof finBankStatements.$inferInsert;

export const finRevenueForecasts = mysqlTable("fin_revenue_forecasts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  forecastDate: varchar("forecastDate", { length: 10 }).notNull(), // YYYY-MM-DD
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  actualAmount: decimal("actualAmount", { precision: 12, scale: 2 }),
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinRevenueForecast = typeof finRevenueForecasts.$inferSelect;
export type InsertFinRevenueForecast = typeof finRevenueForecasts.$inferInsert;

// Faturamento real diário (lançado manualmente no calendário)
export const finDailyRevenue = mysqlTable("fin_daily_revenue", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  revenueDate: varchar("revenueDate", { length: 10 }).notNull(), // YYYY-MM-DD
  realAmount: decimal("realAmount", { precision: 12, scale: 2 }).notNull(),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinDailyRevenue = typeof finDailyRevenue.$inferSelect;
export type InsertFinDailyRevenue = typeof finDailyRevenue.$inferInsert;

// ─── WhatsApp Integration ─────────────────────────────────────────────────────
export const whatsappConfig = mysqlTable("whatsapp_config", {
  id: int("id").autoincrement().primaryKey(),
  instanceId: varchar("instanceId", { length: 255 }).notNull(),
  token: varchar("token", { length: 500 }).notNull(),
  active: boolean("active").default(false).notNull(),
  // Message templates
  msgPointsEarned: text("msgPointsEarned"), // Mensagem ao pontuar
  msgGoalNear: text("msgGoalNear"),         // Mensagem quando próximo da meta (80%)
  msgGoalReached: text("msgGoalReached"),   // Mensagem ao atingir a meta
  msgPromotion: text("msgPromotion"),       // Mensagem de promoção genérica
  // Notification toggles
  notifyOnPoints: boolean("notifyOnPoints").default(true).notNull(),
  notifyOnGoalNear: boolean("notifyOnGoalNear").default(true).notNull(),
  notifyOnGoalReached: boolean("notifyOnGoalReached").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappConfig = typeof whatsappConfig.$inferSelect;
export type InsertWhatsappConfig = typeof whatsappConfig.$inferInsert;

export const whatsappCampaigns = mysqlTable("whatsapp_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  message: text("message").notNull(),
  // Segmentation: 'all' | 'with_points' | 'near_goal' | 'no_points'
  segment: varchar("segment", { length: 50 }).default("all").notNull(),
  // Status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  totalRecipients: int("totalRecipients").default(0).notNull(),
  totalSent: int("totalSent").default(0).notNull(),
  totalFailed: int("totalFailed").default(0).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappCampaign = typeof whatsappCampaigns.$inferSelect;
export type InsertWhatsappCampaign = typeof whatsappCampaigns.$inferInsert;

export const whatsappLogs = mysqlTable("whatsapp_logs", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId"),
  phone: varchar("phone", { length: 20 }).notNull(),
  // Type: 'points_earned' | 'goal_near' | 'goal_reached' | 'campaign' | 'test'
  type: varchar("type", { length: 30 }).notNull(),
  message: text("message").notNull(),
  // Status: 'sent' | 'failed' | 'pending'
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  campaignId: int("campaignId"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WhatsappLog = typeof whatsappLogs.$inferSelect;
export type InsertWhatsappLog = typeof whatsappLogs.$inferInsert;

// ─── Instagram ──────────────────────────────────────────────────────────────
export const instagramPosts = mysqlTable("instagram_posts", {
  id: int("id").autoincrement().primaryKey(),
  // Type: 'post' | 'story' | 'reels'
  type: varchar("type", { length: 20 }).default("post").notNull(),
  caption: text("caption"),
  imageUrl: text("imageUrl"),
  // Status: 'draft' | 'published' | 'failed'
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  instagramPostId: varchar("instagramPostId", { length: 100 }),
  // Metrics (updated after publish)
  likes: int("likes").default(0),
  reach: int("reach").default(0),
  impressions: int("impressions").default(0),
  comments: int("comments").default(0),
  promotionTitle: varchar("promotionTitle", { length: 200 }),
  aiPrompt: text("aiPrompt"),
  scheduledAt: timestamp("scheduledAt"),
  errorMessage: text("errorMessage"),
  publishedAt: timestamp("publishedAt"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InstagramPost = typeof instagramPosts.$inferSelect;
export type InsertInstagramPost = typeof instagramPosts.$inferInsert;
