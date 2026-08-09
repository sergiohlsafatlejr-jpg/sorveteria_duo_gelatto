import { eq, desc, and, sql, gte, lte, like, or } from "drizzle-orm";
import { getDb } from "./db";
import {
  operationalSuppliers, operationalItems, operationalStockMovements,
  purchaseOrders, purchaseOrderItems, purchaseTemplates,
  InsertOperationalSupplier, InsertOperationalItem, InsertOperationalStockMovement,
  InsertPurchaseOrder, InsertPurchaseOrderItem, InsertPurchaseTemplate,
  OperationalSupplier, OperationalItem, OperationalStockMovement,
  PurchaseOrder, PurchaseOrderItem, PurchaseTemplate,
} from "../drizzle/schema";

// ─── Suppliers ──────────────────────────────────────────────────────────

export async function getSuppliers(search?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let conditions = eq(operationalSuppliers.active, true);
  if (search) {
    conditions = and(conditions, like(operationalSuppliers.name, `%${search}%`)) as any;
  }
  return db.select().from(operationalSuppliers).where(conditions).orderBy(operationalSuppliers.name);
}

export async function getSupplierById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [supplier] = await db.select().from(operationalSuppliers).where(eq(operationalSuppliers.id, id));
  return supplier;
}

export async function createSupplier(data: InsertOperationalSupplier) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(operationalSuppliers).values(data).$returningId();
  return result.id;
}

export async function updateSupplier(id: number, data: Partial<InsertOperationalSupplier>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(operationalSuppliers).set({ ...data, updatedAt: new Date() }).where(eq(operationalSuppliers.id, id));
}

export async function deleteSupplier(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(operationalSuppliers).set({ active: false, updatedAt: new Date() }).where(eq(operationalSuppliers.id, id));
}

// ─── Items (Almoxarifado) ────────────────────────────────────────────────

export async function getOperationalItems(search?: string, category?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let conditions: any = eq(operationalItems.active, true);
  if (search) {
    conditions = and(conditions, like(operationalItems.name, `%${search}%`));
  }
  if (category) {
    conditions = and(conditions, eq(operationalItems.category, category as any));
  }
  return db.select().from(operationalItems).where(conditions).orderBy(operationalItems.name);
}

export async function getOperationalItemById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [item] = await db.select().from(operationalItems).where(eq(operationalItems.id, id));
  return item;
}

export async function getLowStockOperationalItems() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(operationalItems).where(
    and(
      eq(operationalItems.active, true),
      lte(operationalItems.currentStock, operationalItems.minStock),
      gte(operationalItems.minStock, "0.01") // string representation of decimal > 0
    )
  );
}

export async function createOperationalItem(data: InsertOperationalItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(operationalItems).values(data).$returningId();
  return result.id;
}

export async function updateOperationalItem(id: number, data: Partial<InsertOperationalItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(operationalItems).set({ ...data, updatedAt: new Date() }).where(eq(operationalItems.id, id));
}

export async function deleteOperationalItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(operationalItems).set({ active: false, updatedAt: new Date() }).where(eq(operationalItems.id, id));
}

// ─── Stock Movements ──────────────────────────────────────────────────────

export async function getStockMovements(itemId?: number, type?: string, limit: number = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let conditions: any = undefined;
  if (itemId) {
    conditions = eq(operationalStockMovements.itemId, itemId);
  }
  if (type) {
    conditions = conditions ? and(conditions, eq(operationalStockMovements.type, type as any)) : eq(operationalStockMovements.type, type as any);
  }
  return db.select().from(operationalStockMovements).where(conditions).orderBy(desc(operationalStockMovements.createdAt)).limit(limit);
}

export async function registerStockMovement(data: { itemId: number, type: 'in' | 'consumption' | 'loss' | 'adjustment', quantity: number, reason?: string, purchaseOrderId?: number, unitCost?: number, userId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [item] = await db.select().from(operationalItems).where(eq(operationalItems.id, data.itemId));
  if (!item) throw new Error("Item not found");

  const currentStock = parseFloat(item.currentStock || "0");
  const quantity = data.quantity;
  let newStock = currentStock;

  if (data.type === 'in') {
    newStock += quantity;
  } else if (data.type === 'consumption' || data.type === 'loss') {
    newStock -= quantity;
  } else if (data.type === 'adjustment') {
    newStock += quantity;
  }

  const [movement] = await db.insert(operationalStockMovements).values({
    itemId: data.itemId,
    type: data.type,
    quantity: String(data.quantity),
    previousStock: String(currentStock),
    newStock: String(newStock),
    reason: data.reason,
    purchaseOrderId: data.purchaseOrderId,
    unitCost: data.unitCost !== undefined ? String(data.unitCost) : undefined,
    userId: data.userId
  }).$returningId();

  const itemUpdate: any = { currentStock: String(newStock), updatedAt: new Date() };
  if (data.type === 'in' && data.unitCost !== undefined) {
    itemUpdate.referencePrice = String(data.unitCost);
  }

  await db.update(operationalItems).set(itemUpdate).where(eq(operationalItems.id, data.itemId));
  
  const [insertedMovement] = await db.select().from(operationalStockMovements).where(eq(operationalStockMovements.id, movement.id));
  return insertedMovement;
}

// ─── Purchase Orders ──────────────────────────────────────────────────────

export async function getPurchaseOrders(status?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const query = db.select({
    order: purchaseOrders,
    itemCount: sql<number>`count(${purchaseOrderItems.id})`
  })
  .from(purchaseOrders)
  .leftJoin(purchaseOrderItems, eq(purchaseOrders.id, purchaseOrderItems.orderId));
  
  if (status) {
    query.where(eq(purchaseOrders.status, status as any));
  }
  
  const results = await query.groupBy(purchaseOrders.id).orderBy(desc(purchaseOrders.createdAt));
  
  return results.map(r => ({
    ...r.order,
    itemCount: Number(r.itemCount)
  }));
}

export async function getPurchaseOrderById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!order) return null;

  const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, id));
  return { ...order, items };
}

export async function getNextOrderCode() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const year = new Date().getFullYear();
  const prefix = `PC-${year}-`;
  
  const [latestOrder] = await db.select()
    .from(purchaseOrders)
    .where(like(purchaseOrders.code, `${prefix}%`))
    .orderBy(desc(purchaseOrders.id))
    .limit(1);
    
  let nextSeq = 1;
  if (latestOrder && latestOrder.code) {
    const parts = latestOrder.code.split('-');
    if (parts.length === 3) {
      nextSeq = parseInt(parts[2], 10) + 1;
    }
  }
  
  return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
}

export async function createPurchaseOrder(data: Omit<InsertPurchaseOrder, 'code'>, items: { itemId: number, quantity: number, unit: string, estimatedUnitPrice?: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const code = await getNextOrderCode();
  let totalEstimated = 0;
  
  const orderItemsData = await Promise.all(items.map(async (i) => {
    const [itemRec] = await db.select().from(operationalItems).where(eq(operationalItems.id, i.itemId));
    const price = i.estimatedUnitPrice ?? parseFloat(itemRec.referencePrice || "0");
    const estimatedTotal = price * i.quantity;
    totalEstimated += estimatedTotal;
    
    return {
      itemId: i.itemId,
      itemName: itemRec.name,
      quantity: String(i.quantity),
      unit: i.unit,
      estimatedUnitPrice: String(price),
      estimatedTotal: String(estimatedTotal)
    };
  }));
  
  const [order] = await db.insert(purchaseOrders).values({
    ...data,
    code,
    totalEstimated: String(totalEstimated)
  }).$returningId();
  
  if (orderItemsData.length > 0) {
    const itemsToInsert = orderItemsData.map(i => ({ ...i, orderId: order.id }));
    await db.insert(purchaseOrderItems).values(itemsToInsert);
  }
  
  return order.id;
}

export async function updatePurchaseOrderStatus(id: number, status: string, data?: { approvedBy?: number, rejectionReason?: string, totalActual?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { status, updatedAt: new Date() };
  
  if (status === 'requested') {
    updateData.requestedAt = new Date();
  } else if (status === 'approved') {
    updateData.approvedAt = new Date();
    if (data?.approvedBy) updateData.approvedBy = data.approvedBy;
  } else if (status === 'rejected') {
    if (data?.rejectionReason) updateData.rejectionReason = data.rejectionReason;
  } else if (status === 'purchased') {
    updateData.purchasedAt = new Date();
  }
  
  if (data?.totalActual !== undefined) {
    updateData.totalActual = String(data.totalActual);
  }
  
  await db.update(purchaseOrders).set(updateData).where(eq(purchaseOrders.id, id));
}

export async function updatePurchaseOrderItems(orderId: number, items: { id?: number, itemId: number, quantity: number, unit: string, actualUnitPrice?: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const item of items) {
    if (item.id) {
      const updateData: any = { quantity: String(item.quantity) };
      if (item.actualUnitPrice !== undefined) {
        updateData.actualUnitPrice = String(item.actualUnitPrice);
        updateData.actualTotal = String(item.quantity * item.actualUnitPrice);
      }
      await db.update(purchaseOrderItems).set(updateData).where(eq(purchaseOrderItems.id, item.id));
    }
  }
}

export async function deliverPurchaseOrder(orderId: number, items: { id: number, actualUnitPrice: number, actualQuantity: number }[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let totalActual = 0;
  
  for (const item of items) {
    const actualTotal = item.actualQuantity * item.actualUnitPrice;
    totalActual += actualTotal;
    
    await db.update(purchaseOrderItems).set({
      actualUnitPrice: String(item.actualUnitPrice),
      actualTotal: String(actualTotal),
      quantity: String(item.actualQuantity)
    }).where(eq(purchaseOrderItems.id, item.id));
    
    const [orderItem] = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.id, item.id));
    if (orderItem && orderItem.itemId) {
      await registerStockMovement({
        itemId: orderItem.itemId,
        type: 'in',
        quantity: item.actualQuantity,
        reason: `Recebimento de Pedido ${orderId}`,
        purchaseOrderId: orderId,
        unitCost: item.actualUnitPrice,
        userId: userId
      });
    }
  }
  
  await db.update(purchaseOrders).set({
    status: 'delivered',
    deliveredAt: new Date(),
    totalActual: String(totalActual),
    updatedAt: new Date()
  }).where(eq(purchaseOrders.id, orderId));
}

// ─── Templates ────────────────────────────────────────────────────────────

export async function getPurchaseTemplates() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(purchaseTemplates).where(eq(purchaseTemplates.active, true)).orderBy(purchaseTemplates.name);
}

export async function getPurchaseTemplateById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [template] = await db.select().from(purchaseTemplates).where(eq(purchaseTemplates.id, id));
  return template;
}

export async function createPurchaseTemplate(data: InsertPurchaseTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(purchaseTemplates).values(data).$returningId();
  return result.id;
}

export async function updatePurchaseTemplate(id: number, data: Partial<InsertPurchaseTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(purchaseTemplates).set({ ...data, updatedAt: new Date() }).where(eq(purchaseTemplates.id, id));
}

export async function deletePurchaseTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(purchaseTemplates).set({ active: false, updatedAt: new Date() }).where(eq(purchaseTemplates.id, id));
}

export async function generateOrderFromTemplate(templateId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [template] = await db.select().from(purchaseTemplates).where(eq(purchaseTemplates.id, templateId));
  if (!template || !template.items) throw new Error("Template not found");
  
  const itemsList = template.items as { itemId: number, quantity: number, unit: string }[];
  
  return createPurchaseOrder({
    status: 'draft',
    requestedBy: userId,
    notes: `Pedido gerado do template: ${template.name}`
  }, itemsList);
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────

export async function getPurchasesDashboard() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [lowStockResult] = await db.select({ count: sql<number>`count(*)` })
    .from(operationalItems)
    .where(
      and(
        eq(operationalItems.active, true),
        lte(operationalItems.currentStock, operationalItems.minStock),
        gte(operationalItems.minStock, "0.01")
      )
    );
    
  const [pendingOrdersResult] = await db.select({ count: sql<number>`count(*)` })
    .from(purchaseOrders)
    .where(or(eq(purchaseOrders.status, 'requested'), eq(purchaseOrders.status, 'approved')));
    
  const date = new Date();
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  
  const monthlySpendQuery = await db.select({
    category: operationalItems.category,
    total: sql<number>`sum(${purchaseOrderItems.actualTotal})`
  })
  .from(purchaseOrderItems)
  .innerJoin(purchaseOrders, eq(purchaseOrderItems.orderId, purchaseOrders.id))
  .innerJoin(operationalItems, eq(purchaseOrderItems.itemId, operationalItems.id))
  .where(
    and(
      eq(purchaseOrders.status, 'delivered'),
      gte(purchaseOrders.deliveredAt, firstDay)
    )
  )
  .groupBy(operationalItems.category);

  const recentMovements = await db.select().from(operationalStockMovements).orderBy(desc(operationalStockMovements.createdAt)).limit(10);
  
  return {
    lowStockItems: Number(lowStockResult?.count || 0),
    pendingOrders: Number(pendingOrdersResult?.count || 0),
    monthlySpend: monthlySpendQuery.map(row => ({ category: row.category || 'Outros', total: Number(row.total || 0) })),
    recentMovements
  };
}
