import {
  boolean,
  date,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
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
  externalCode: varchar("externalCode", { length: 100 }), // Código do PDV externo (para vinculação com importação de vendas)
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
  establishmentId: varchar("establishmentId", { length: 50 }).notNull().default("default"),
  revenueDate: varchar("revenueDate", { length: 10 }).notNull(), // YYYY-MM-DD
  realAmount: decimal("realAmount", { precision: 12, scale: 2 }).notNull(),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uniqueDate: uniqueIndex("fin_daily_revenue_date_idx").on(table.revenueDate),
}));
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
  msgWelcome: text("msgWelcome"),            // Mensagem de boas-vindas ao cadastrar
  msgBirthday: text("msgBirthday"),          // Mensagem de feliz aniversário
  // Notification toggles
  notifyOnPoints: boolean("notifyOnPoints").default(true).notNull(),
  notifyOnGoalNear: boolean("notifyOnGoalNear").default(true).notNull(),
  notifyOnGoalReached: boolean("notifyOnGoalReached").default(true).notNull(),
  notifyOnWelcome: boolean("notifyOnWelcome").default(true).notNull(),
  notifyOnBirthday: boolean("notifyOnBirthday").default(true).notNull(),
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

// ─── Forecast Settings ──────────────────────────────────────────────────────
export const forecastSettings = mysqlTable("forecast_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  avgWeekday: int("avgWeekday").default(2000).notNull(),
  avgSaturday: int("avgSaturday").default(5300).notNull(),
  avgSundayHoliday: int("avgSundayHoliday").default(8300).notNull(),
  rainFactor: varchar("rainFactor", { length: 10 }).default("0.7").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ForecastSettings = typeof forecastSettings.$inferSelect;
export type InsertForecastSettings = typeof forecastSettings.$inferInsert;

// ─── Financial Goals (Meta de Gerência) ─────────────────────────────────────
export const finGoals = mysqlTable("fin_goals", {
  id: int("id").autoincrement().primaryKey(),
  month: varchar("month", { length: 7 }).notNull(), // "2025-04"
  label: varchar("label", { length: 100 }).notNull(), // e.g. "Cenário 1"
  targetRevenue: decimal("targetRevenue", { precision: 12, scale: 2 }).notNull().default("0"),
  salary: decimal("salary", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinGoal = typeof finGoals.$inferSelect;
export type InsertFinGoal = typeof finGoals.$inferInsert;

// ─── Financial Goals Extra Costs (custos extras manuais por mês) ─────────────
export const finGoalExtraCosts = mysqlTable("fin_goal_extra_costs", {
  id: int("id").autoincrement().primaryKey(),
  month: varchar("month", { length: 7 }).notNull(), // "2025-04"
  description: varchar("description", { length: 200 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinGoalExtraCost = typeof finGoalExtraCosts.$inferSelect;
export type InsertFinGoalExtraCost = typeof finGoalExtraCosts.$inferInsert;

// ─── NF-e Imports (Controle de NF-e importadas para evitar duplicatas) ───────────
export const nfeImports = mysqlTable("nfe_imports", {
  id: int("id").autoincrement().primaryKey(),
  chNFe: varchar("chNFe", { length: 44 }).unique(), // Chave de acesso de 44 dígitos (única)
  nNF: varchar("nNF", { length: 20 }).notNull(),    // Número da nota
  emitCnpj: varchar("emitCnpj", { length: 14 }).notNull(), // CNPJ do emitente
  emitNome: varchar("emitNome", { length: 255 }),
  dhEmi: varchar("dhEmi", { length: 30 }),           // Data de emissão
  vNF: decimal("vNF", { precision: 12, scale: 2 }).notNull().default("0"),
  totalItems: int("totalItems").default(0).notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type NfeImport = typeof nfeImports.$inferSelect;
export type InsertNfeImport = typeof nfeImports.$inferInsert;

// ─── Sales Imports (Importação de Vendas via XLS) ──────────────────────────────
export const salesImports = mysqlTable("sales_imports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  referenceMonth: varchar("referenceMonth", { length: 7 }).notNull(), // "2026-03"
  importMode: mysqlEnum("importMode", ["monthly", "daily"]).default("monthly").notNull(), // mensal ou diário
  saleDate: date("saleDate"), // data específica para modo diário (ex: 2026-04-09)
  status: mysqlEnum("status", ["pending", "confirmed", "cancelled"]).default("pending").notNull(),
  totalRevenue: decimal("totalRevenue", { precision: 12, scale: 2 }).default("0").notNull(),
  totalItems: int("totalItems").default(0).notNull(),
  totalTransactions: int("totalTransactions").default(0).notNull(),
  linkedItems: int("linkedItems").default(0).notNull(),
  pendingItems: int("pendingItems").default(0).notNull(),
  notes: text("notes"),
  caixaDailySummary: json("caixaDailySummary"), // Resumo diário do caixa (array de {date, total, payments})
  confirmedAt: timestamp("confirmedAt"),
  archived: boolean("archived").default(false).notNull(), // true = arquivada (oculta da lista principal)
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SalesImport = typeof salesImports.$inferSelect;
export type InsertSalesImport = typeof salesImports.$inferInsert;

// ─── Sales Import Items (Itens de cada importação) ─────────────────────────────
export const salesImportItems = mysqlTable("sales_import_items", {
  id: int("id").autoincrement().primaryKey(),
  importId: int("importId").notNull(),
  externalCode: varchar("externalCode", { length: 100 }).notNull(), // Código do PDV
  externalName: varchar("externalName", { length: 255 }).notNull(), // Nome no PDV
  unit: varchar("unit", { length: 20 }).default("UND").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("totalPrice", { precision: 12, scale: 2 }).notNull(),
  productId: int("productId"), // NULL = não vinculado ainda
  linkStatus: mysqlEnum("linkStatus", ["linked", "pending", "ignored"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SalesImportItem = typeof salesImportItems.$inferSelect;
export type InsertSalesImportItem = typeof salesImportItems.$inferInsert;

// ─── Sales Import Payments (Formas de pagamento da importação) ────────────────
export const salesImportPayments = mysqlTable("sales_import_payments", {
  id: int("id").autoincrement().primaryKey(),
  importId: int("importId").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 50 }).notNull(), // "C. DEBITO", "PIX", etc.
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  transactionCount: int("transactionCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SalesImportPayment = typeof salesImportPayments.$inferSelect;
export type InsertSalesImportPayment = typeof salesImportPayments.$inferInsert;

// ─── Customer Purchases ───────────────────────────────────────────────────────
export const customerPurchases = mysqlTable("customer_purchases", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "credit_card", "debit_card", "pix", "other"]).notNull(),
  pointsEarned: int("pointsEarned").default(0).notNull(),
  notes: text("notes"),
  userId: int("userId"), // atendente que registrou
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CustomerPurchase = typeof customerPurchases.$inferSelect;
export type InsertCustomerPurchase = typeof customerPurchases.$inferInsert;

// ─── Instagram Cache (dados sincronizados via MCP pelo agente Manus) ─────────
// O manus-mcp-cli só pode ser chamado pelo agente Manus, não pelo servidor web.
// Solução: agente sincroniza dados periodicamente e salva aqui; servidor lê do banco.
export const instagramCache = mysqlTable("instagram_cache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 100 }).notNull().unique(), // ex: "account_info", "recent_posts", "performance_summary"
  data: json("data").notNull(),                                       // dados em JSON
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),             // última sincronização
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InstagramCache = typeof instagramCache.$inferSelect;
export type InsertInstagramCache = typeof instagramCache.$inferInsert;

// ─── Meta Ads Cache (dados sincronizados via MCP pelo agente Manus) ──────────
export const metaAdsCache = mysqlTable("meta_ads_cache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 100 }).notNull().unique(), // ex: "campaigns_last_30d", "ads_last_30d"
  data: json("data").notNull(),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MetaAdsCache = typeof metaAdsCache.$inferSelect;
export type InsertMetaAdsCache = typeof metaAdsCache.$inferInsert;

// ─── Customer Loyalty Token (link público de consulta de pontos) ──────────────
// Cada cliente recebe um token único para consultar seu saldo sem precisar de login
export const customerLoyaltyTokens = mysqlTable("customer_loyalty_tokens", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull().unique(), // 1 token por cliente
  token: varchar("token", { length: 64 }).notNull().unique(), // UUID ou hash único
  lastAccessedAt: timestamp("lastAccessedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CustomerLoyaltyToken = typeof customerLoyaltyTokens.$inferSelect;
export type InsertCustomerLoyaltyToken = typeof customerLoyaltyTokens.$inferInsert;

// ─── INOVE Connector Config (configuração do banco de dados do PDV INOVE) ─────
// Armazena as credenciais do banco MySQL do INOVE para sincronização automática
export const inoveConnectorConfig = mysqlTable("inove_connector_config", {
  id: int("id").autoincrement().primaryKey(),
  host: varchar("host", { length: 255 }).notNull(),       // IP ou hostname do servidor INOVE
  port: int("port").default(3306).notNull(),               // porta MySQL (padrão 3306)
  database: varchar("database", { length: 100 }).notNull(), // nome do banco de dados
  username: varchar("username", { length: 100 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(), // armazenado criptografado
  active: boolean("active").default(false).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  lastSyncStatus: mysqlEnum("lastSyncStatus", ["success", "error", "pending"]).default("pending"),
  lastSyncMessage: text("lastSyncMessage"),
  syncIntervalMinutes: int("syncIntervalMinutes").default(5).notNull(), // polling a cada N minutos
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InoveConnectorConfig = typeof inoveConnectorConfig.$inferSelect;
export type InsertInoveConnectorConfig = typeof inoveConnectorConfig.$inferInsert;

// ─── INOVE Sync Log (histórico de sincronizações com o INOVE) ─────────────────
export const inoveSyncLog = mysqlTable("inove_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["success", "error"]).notNull(),
  salesFound: int("salesFound").default(0).notNull(),     // vendas encontradas no INOVE
  salesProcessed: int("salesProcessed").default(0).notNull(), // vendas processadas (pontos lançados)
  customersLinked: int("customersLinked").default(0).notNull(), // clientes vinculados automaticamente
  errorMessage: text("errorMessage"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
});
export type InoveSyncLog = typeof inoveSyncLog.$inferSelect;
export type InsertInoveSyncLog = typeof inoveSyncLog.$inferInsert;

// ─── Cron Job Log (histórico de execuções de tarefas agendadas) ───────────────
export const cronJobLog = mysqlTable("cron_job_log", {
  id: int("id").autoincrement().primaryKey(),
  jobName: varchar("jobName", { length: 100 }).notNull(),   // ex: "sync-daily-revenue"
  status: mysqlEnum("status", ["success", "error", "skipped"]).notNull(),
  message: text("message"),                                  // resumo do resultado
  executedAt: timestamp("executedAt").defaultNow().notNull(),
  durationMs: int("durationMs"),                             // tempo de execução em ms
});
export type CronJobLog = typeof cronJobLog.$inferSelect;
export type InsertCronJobLog = typeof cronJobLog.$inferInsert;

// ── Cache de Vendas por Produto INOVE ─────────────────────────────────────────
export const inoveSalesCache = mysqlTable("inove_sales_cache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 50 }).notNull().unique(), // ex: "2026-04", "2026-03"
  data: text("data").notNull(), // JSON com array de produtos e vendas
  updatedAt: int("updatedAt").notNull(),
});

export type InoveSalesCache = typeof inoveSalesCache.$inferSelect;
export type InsertInoveSalesCache = typeof inoveSalesCache.$inferInsert;

// ── Configuração de Produtos para Planejamento de Compras ─────────────────────
export const purchaseProductConfig = mysqlTable("purchase_product_config", {
  id: int("id").autoincrement().primaryKey(),
  produtoId: int("produtoId").notNull().unique(), // ID do produto no INOVE (PRO_CODIGO)
  nomeProduto: varchar("nomeProduto", { length: 200 }).notNull(),
  ignorar: boolean("ignorar").default(false).notNull(), // true = ignorar no planejamento (ex: sorvete kg, milkshake)
  motivoIgnorar: varchar("motivoIgnorar", { length: 200 }), // ex: "vendido em kg, comprado em litros"
  unidadeCompra: varchar("unidadeCompra", { length: 50 }), // ex: "caixa", "litro", "kg", "unidade"
  fatorConversao: decimal("fatorConversao", { precision: 10, scale: 4 }), // ex: 1 caixa = 5 litros
  qtdMinimaEstoque: decimal("qtdMinimaEstoque", { precision: 10, scale: 2 }), // estoque mínimo desejado
  qtdLoteCompra: decimal("qtdLoteCompra", { precision: 10, scale: 2 }), // múltiplo de compra (ex: comprar em caixas de 12)
  observacao: text("observacao"),
  purchaseCategory: varchar("purchaseCategory", { length: 50 }).default("sorvete"), // "sorvete" | "guloseimas" | "outros"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type PurchaseProductConfig = typeof purchaseProductConfig.$inferSelect;
export type InsertPurchaseProductConfig = typeof purchaseProductConfig.$inferInsert;

// ── Importação de Vendas Rede (Adquirente) ────────────────────────────────────
export const redeSalesImport = mysqlTable("rede_sales_import", {
  id: int("id").autoincrement().primaryKey(),
  
  // Dados da venda
  dataDaVenda: date("dataDaVenda").notNull(),
  horaDaVenda: varchar("horaDaVenda", { length: 20 }),
  statusDaVenda: varchar("statusDaVenda", { length: 50 }).notNull(), // "pago", "aprovada", "cancelada"
  
  // Valores
  valorDaVendaOriginal: decimal("valorDaVendaOriginal", { precision: 10, scale: 2 }).notNull(),
  valorDaVendaAtualizado: decimal("valorDaVendaAtualizado", { precision: 10, scale: 2 }),
  
  // Forma de pagamento
  modalidade: varchar("modalidade", { length: 50 }).notNull(), // "pix", "débito", "crédito"
  tipo: varchar("tipo", { length: 100 }), // "pix não parcelado", "à vista", "parcelado"
  bandeira: varchar("bandeira", { length: 50 }), // "Mastercard", "Visa", "Elo", "Amex"
  numeroDeParcelas: int("numeroDeParcelas"),
  
  // Taxas
  taxaMDR: decimal("taxaMDR", { precision: 5, scale: 2 }),
  valorMDR: decimal("valorMDR", { precision: 10, scale: 2 }),
  taxaRecebimentoAutomatico: decimal("taxaRecebimentoAutomatico", { precision: 5, scale: 2 }),
  valorTaxaRecebimentoAutomatico: decimal("valorTaxaRecebimentoAutomatico", { precision: 10, scale: 2 }),
  valorTotalTaxas: decimal("valorTotalTaxas", { precision: 10, scale: 2 }),
  valorLiquido: decimal("valorLiquido", { precision: 10, scale: 2 }),
  
  // Identificadores
  nsuCV: varchar("nsuCV", { length: 50 }).notNull(), // NSU/CV único
  idTransacao: varchar("idTransacao", { length: 100 }),
  numeroAutorizacao: varchar("numeroAutorizacao", { length: 50 }),
  
  // Recebimento
  prazoDeRecebimento: varchar("prazoDeRecebimento", { length: 50 }), // "no mesmo dia", "disponível em D+1", "disponível em D+30"
  
  // Estabelecimento
  numeroDoEstabelecimento: varchar("numeroDoEstabelecimento", { length: 50 }).notNull(),
  nomeDoEstabelecimento: varchar("nomeDoEstabelecimento", { length: 200 }),
  cnpj: varchar("cnpj", { length: 20 }),
  
  // Cartão
  numeroDoCartao: varchar("numeroDoCartao", { length: 50 }),
  
  // Maquininha
  codigoDaMaquininha: varchar("codigoDaMaquininha", { length: 50 }),
  tipoDeMaquininha: varchar("tipoDeMaquininha", { length: 50 }),
  
  // Cancelamento
  canceladaPeloEstabelecimento: boolean("canceladaPeloEstabelecimento").default(false),
  dataDoCancelamento: date("dataDoCancelamento"),
  valorCancelado: decimal("valorCancelado", { precision: 10, scale: 2 }),
  
  // Chargeback
  emDisputaDeChargeback: boolean("emDisputaDeChargeback").default(false),
  dataQueEntrouEmDisputaDeChargeback: date("dataQueEntrouEmDisputaDeChargeback"),
  resolucaoDoChargeback: varchar("resolucaoDoChargeback", { length: 100 }),
  
  // Metadata
  importFileId: int("importFileId"), // referência ao arquivo importado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RedeSalesImport = typeof redeSalesImport.$inferSelect;
export type InsertRedeSalesImport = typeof redeSalesImport.$inferInsert;

// ── Arquivo de Importação Rede ────────────────────────────────────────────────
export const redeImportFiles = mysqlTable("rede_import_files", {
  id: int("id").autoincrement().primaryKey(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(), // URL do arquivo no S3
  periodStart: date("periodStart").notNull(),
  periodEnd: date("periodEnd").notNull(),
  totalRecords: int("totalRecords").notNull(),
  totalValue: decimal("totalValue", { precision: 15, scale: 2 }).notNull(),
  importedBy: int("importedBy").notNull(), // userId
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RedeImportFile = typeof redeImportFiles.$inferSelect;
export type InsertRedeImportFile = typeof redeImportFiles.$inferInsert;

// ── Conciliação Rede x INOVE ──────────────────────────────────────────────────
export const redeInoveReconciliation = mysqlTable("rede_inove_reconciliation", {
  id: int("id").autoincrement().primaryKey(),
  
  // Venda Rede
  redeSaleId: int("redeSaleId").notNull(),
  redeDate: date("redeDate").notNull(),
  redeValue: decimal("redeValue", { precision: 10, scale: 2 }).notNull(),
  redeModalidade: varchar("redeModalidade", { length: 50 }),
  redeBandeira: varchar("redeBandeira", { length: 50 }),
  
  // Venda INOVE
  inoveSaleId: int("inoveSaleId"),
  inoveDate: date("inoveDate"),
  inoveValue: decimal("inoveValue", { precision: 10, scale: 2 }),
  
  // Status da conciliação
  status: mysqlEnum("status", ["matched", "unmatched_rede", "unmatched_inove", "divergent"]).notNull(),
  divergenceReason: varchar("divergenceReason", { length: 255 }), // ex: "valor diferente", "data diferente"
  divergenceAmount: decimal("divergenceAmount", { precision: 10, scale: 2 }), // diferença de valor
  
  // Crédito bancário
  bankStatementId: int("bankStatementId"),
  bankCreditDate: date("bankCreditDate"),
  bankCreditValue: decimal("bankCreditValue", { precision: 10, scale: 2 }),
  
  // Metadata
  reconciliationDate: date("reconciliationDate").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RedeInoveReconciliation = typeof redeInoveReconciliation.$inferSelect;
export type InsertRedeInoveReconciliation = typeof redeInoveReconciliation.$inferInsert;


// ─── Módulo de Compras Internas & Estoque Operacional ─────────────────────────

// ── Fornecedores Operacionais ─────────────────────────────────────────────────
export const operationalSuppliers = mysqlTable("operational_suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  whatsapp: varchar("whatsapp", { length: 20 }),
  email: varchar("email", { length: 320 }),
  cnpj: varchar("cnpj", { length: 20 }),
  categories: json("categories"), // ["limpeza", "descartaveis", ...]
  deliveryDays: int("deliveryDays"), // prazo médio em dias
  paymentTerms: varchar("paymentTerms", { length: 100 }), // "à vista", "30 dias", etc.
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OperationalSupplier = typeof operationalSuppliers.$inferSelect;
export type InsertOperationalSupplier = typeof operationalSuppliers.$inferInsert;

// ── Itens Operacionais (Almoxarifado) ─────────────────────────────────────────
export const operationalItems = mysqlTable("operational_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", [
    "limpeza", "guloseimas", "caldas", "descartaveis",
    "embalagens", "manutencao", "insumos",
  ]).notNull(),
  unit: varchar("unit", { length: 20 }).default("un").notNull(), // un, kg, litro, cx, pct
  currentStock: decimal("currentStock", { precision: 10, scale: 2 }).default("0").notNull(),
  minStock: decimal("minStock", { precision: 10, scale: 2 }).default("0").notNull(),
  referencePrice: decimal("referencePrice", { precision: 10, scale: 2 }), // último preço pago
  preferredSupplierId: int("preferredSupplierId"), // FK → operational_suppliers
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OperationalItem = typeof operationalItems.$inferSelect;
export type InsertOperationalItem = typeof operationalItems.$inferInsert;

// ── Movimentações do Almoxarifado (Entradas, Consumo, Perdas, Ajustes) ───────
export const operationalStockMovements = mysqlTable("operational_stock_movements", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(), // FK → operational_items
  type: mysqlEnum("type", ["in", "consumption", "loss", "adjustment"]).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(), // positivo=entrada, negativo=saída
  previousStock: decimal("previousStock", { precision: 10, scale: 2 }).notNull(),
  newStock: decimal("newStock", { precision: 10, scale: 2 }).notNull(),
  reason: varchar("reason", { length: 255 }), // "Compra PC-2026-042", "Uso diário limpeza"
  purchaseOrderId: int("purchaseOrderId"), // FK → purchase_orders (se entrada via compra)
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }), // custo unitário (se entrada)
  userId: int("userId"), // quem registrou
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OperationalStockMovement = typeof operationalStockMovements.$inferSelect;
export type InsertOperationalStockMovement = typeof operationalStockMovements.$inferInsert;

// ── Pedidos de Compra ─────────────────────────────────────────────────────────
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(), // "PC-2026-0042"
  status: mysqlEnum("status", [
    "draft", "requested", "approved", "rejected", "purchased", "delivered",
  ]).default("draft").notNull(),
  requestedBy: int("requestedBy"), // userId do solicitante
  approvedBy: int("approvedBy"),   // userId do aprovador
  supplierId: int("supplierId"),   // FK → operational_suppliers
  totalEstimated: decimal("totalEstimated", { precision: 12, scale: 2 }).default("0"),
  totalActual: decimal("totalActual", { precision: 12, scale: 2 }),
  notes: text("notes"),
  rejectionReason: text("rejectionReason"),
  requestedAt: timestamp("requestedAt"),
  approvedAt: timestamp("approvedAt"),
  purchasedAt: timestamp("purchasedAt"),
  deliveredAt: timestamp("deliveredAt"),
  templateId: int("templateId"), // se gerado a partir de template
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

// ── Itens de cada Pedido de Compra ────────────────────────────────────────────
export const purchaseOrderItems = mysqlTable("purchase_order_items_op", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(), // FK → purchase_orders
  itemId: int("itemId").notNull(),   // FK → operational_items
  itemName: varchar("itemName", { length: 255 }).notNull(), // snapshot do nome
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  estimatedUnitPrice: decimal("estimatedUnitPrice", { precision: 10, scale: 2 }),
  actualUnitPrice: decimal("actualUnitPrice", { precision: 10, scale: 2 }),
  estimatedTotal: decimal("estimatedTotal", { precision: 12, scale: 2 }),
  actualTotal: decimal("actualTotal", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;

// ── Templates de Compras Recorrentes ──────────────────────────────────────────
export const purchaseTemplates = mysqlTable("purchase_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }), // "semanal_limpeza", "mensal_descartaveis"
  items: json("items"), // [{itemId, quantity, unit}]
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PurchaseTemplate = typeof purchaseTemplates.$inferSelect;
export type InsertPurchaseTemplate = typeof purchaseTemplates.$inferInsert;

// ─── Product Goals (Metas de Produtos — Açaí 1,5L, Pote Sorvete, etc) ────────
export const productGoals = mysqlTable("product_goals", {
  id: int("id").autoincrement().primaryKey(),
  productName: varchar("productName", { length: 200 }).notNull(), // Nome do produto (ex: "Açaí 1,5L")
  searchKeywords: text("searchKeywords").notNull(), // Palavras-chave para buscar no INOVE (ex: "ACAI,AÇAÍ,AÇAI")
  targetQuantity: int("targetQuantity").notNull().default(0), // Meta de unidades/mês
  targetRevenue: decimal("targetRevenue", { precision: 12, scale: 2 }).default("0"), // Meta de faturamento/mês (opcional)
  month: varchar("month", { length: 7 }).notNull(), // "2026-08" (mês de referência)
  active: boolean("active").notNull().default(true),
  icon: varchar("icon", { length: 10 }).default("🎯"), // Emoji para exibição
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProductGoal = typeof productGoals.$inferSelect;
export type InsertProductGoal = typeof productGoals.$inferInsert;

