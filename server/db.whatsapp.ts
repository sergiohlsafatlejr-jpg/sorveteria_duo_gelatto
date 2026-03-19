import { desc, eq, and, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  whatsappConfig,
  whatsappCampaigns,
  whatsappLogs,
  customers,
  type WhatsappConfig,
  type WhatsappCampaign,
  type WhatsappLog,
  type InsertWhatsappLog,
} from "../drizzle/schema";

// ─── Config ──────────────────────────────────────────────────────────────────

export async function getWhatsappConfig(): Promise<WhatsappConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const [config] = await db.select().from(whatsappConfig).limit(1);
  return config ?? null;
}

export async function upsertWhatsappConfig(data: Partial<WhatsappConfig>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getWhatsappConfig();
  if (existing) {
    await db.update(whatsappConfig).set(data).where(eq(whatsappConfig.id, existing.id));
  } else {
    await db.insert(whatsappConfig).values({
      instanceId: data.instanceId ?? "",
      token: data.token ?? "",
      active: data.active ?? false,
      notifyOnPoints: data.notifyOnPoints ?? true,
      notifyOnGoalNear: data.notifyOnGoalNear ?? true,
      notifyOnGoalReached: data.notifyOnGoalReached ?? true,
      msgPointsEarned: data.msgPointsEarned ?? null,
      msgGoalNear: data.msgGoalNear ?? null,
      msgGoalReached: data.msgGoalReached ?? null,
      msgPromotion: data.msgPromotion ?? null,
    });
  }
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export async function getWhatsappCampaigns(): Promise<WhatsappCampaign[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(whatsappCampaigns).orderBy(desc(whatsappCampaigns.createdAt));
}

export async function getWhatsappCampaign(id: number): Promise<WhatsappCampaign | null> {
  const db = await getDb();
  if (!db) return null;
  const [campaign] = await db.select().from(whatsappCampaigns).where(eq(whatsappCampaigns.id, id)).limit(1);
  return campaign ?? null;
}

export async function createWhatsappCampaign(data: {
  name: string;
  message: string;
  segment: string;
  scheduledAt?: Date | null;
  createdBy: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.insert(whatsappCampaigns).values({
    name: data.name,
    message: data.message,
    segment: data.segment,
    status: "draft",
    scheduledAt: data.scheduledAt ?? null,
    createdBy: data.createdBy,
    totalRecipients: 0,
    totalSent: 0,
    totalFailed: 0,
  });
  return (result as { insertId: number }).insertId;
}

export async function updateCampaignStatus(
  id: number,
  status: string,
  stats?: { totalRecipients?: number; totalSent?: number; totalFailed?: number; sentAt?: Date }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(whatsappCampaigns).set({
    status,
    ...(stats?.totalRecipients !== undefined ? { totalRecipients: stats.totalRecipients } : {}),
    ...(stats?.totalSent !== undefined ? { totalSent: stats.totalSent } : {}),
    ...(stats?.totalFailed !== undefined ? { totalFailed: stats.totalFailed } : {}),
    ...(stats?.sentAt ? { sentAt: stats.sentAt } : {}),
  }).where(eq(whatsappCampaigns.id, id));
}

export async function deleteWhatsappCampaign(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(whatsappCampaigns).where(eq(whatsappCampaigns.id, id));
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function createWhatsappLog(data: InsertWhatsappLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(whatsappLogs).values(data);
}

export async function getWhatsappLogs(limit = 100): Promise<WhatsappLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(whatsappLogs).orderBy(desc(whatsappLogs.createdAt)).limit(limit);
}

export async function getWhatsappLogsByCampaign(campaignId: number): Promise<WhatsappLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(whatsappLogs)
    .where(eq(whatsappLogs.campaignId, campaignId))
    .orderBy(desc(whatsappLogs.createdAt));
}

// ─── Customer Segmentation ────────────────────────────────────────────────────

export async function getCustomersBySegment(segment: string) {
  const db = await getDb();
  if (!db) return [];

  let whereClause;
  switch (segment) {
    case "with_points":
      whereClause = sql`${customers.active} = 1 AND ${customers.totalPoints} > 0`;
      break;
    case "no_points":
      whereClause = sql`${customers.active} = 1 AND ${customers.totalPoints} = 0`;
      break;
    case "near_goal":
      whereClause = sql`${customers.active} = 1 AND ${customers.totalPoints} > 0`;
      break;
    default:
      whereClause = sql`${customers.active} = 1`;
  }

  return db.select({
    id: customers.id,
    fullName: customers.fullName,
    phone: customers.phone,
    totalPoints: customers.totalPoints,
  }).from(customers).where(whereClause);
}

export async function countCustomersBySegment(segment: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  let whereClause;
  switch (segment) {
    case "with_points":
      whereClause = sql`${customers.active} = 1 AND ${customers.totalPoints} > 0`;
      break;
    case "no_points":
      whereClause = sql`${customers.active} = 1 AND ${customers.totalPoints} = 0`;
      break;
    case "near_goal":
      whereClause = sql`${customers.active} = 1 AND ${customers.totalPoints} > 0`;
      break;
    default:
      whereClause = sql`${customers.active} = 1`;
  }

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(customers)
    .where(whereClause);
  return result?.count ?? 0;
}
