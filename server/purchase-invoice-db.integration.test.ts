import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  boxStock,
  boxStockMovements,
  operationalItems,
  operationalStockMovements,
  purchaseInvoiceItems,
  purchaseInvoices,
  type User,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { getDb, getUserByOpenId, upsertUser } from "./db";
import { appRouter } from "./routers";

const runIntegration = process.env.RUN_PURCHASE_DB_INTEGRATION === "1";
const integration = runIntegration ? describe : describe.skip;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

let db: Database;
let owner: User;
const createdInvoiceIds: number[] = [];
const createdBoxIds: number[] = [];
const createdOperationalItemIds: number[] = [];

function contextFor(user: User): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

function uniqueFixture(prefix: string) {
  const token = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    token,
    hash: createHash("sha256").update(token).digest("hex"),
    invoiceNumber: token.slice(0, 30),
  };
}

async function createInvoiceFixture(description: string, category: string, quantity: string, unitPrice: string) {
  const fixture = uniqueFixture("IT-NF");
  const totalPrice = (Number(quantity) * Number(unitPrice)).toFixed(2);
  const insertedInvoice = await db.insert(purchaseInvoices).values({
    source: "pdf",
    fileName: `${fixture.token}.pdf`,
    fileKey: `integration-tests/${fixture.hash}.pdf`,
    fileUrl: `https://example.invalid/${fixture.hash}.pdf`,
    fileHash: fixture.hash,
    documentHash: fixture.hash,
    documentIndex: 1,
    fileSize: 1,
    status: "extracted",
    supplierName: "Duo Gelatto Indústria de Sorvetes Ltda",
    invoiceNumber: fixture.invoiceNumber,
    issueDate: "2026-08-10",
    totalAmount: totalPrice,
    itemSubtotal: totalPrice,
    totalItems: 1,
    confidence: "1.0000",
    model: "integration-test",
    uploadedBy: owner.id,
    reviewedBy: owner.id,
    reviewedAt: new Date(),
    processedAt: new Date(),
  }).$returningId();
  const invoiceId = insertedInvoice[0]?.id;
  if (!invoiceId) throw new Error("Não foi possível criar a nota do teste de integração.");
  createdInvoiceIds.push(invoiceId);

  await db.insert(purchaseInvoiceItems).values({
    invoiceId,
    lineNumber: 1,
    description,
    category,
    quantity,
    unit: "UN",
    unitPrice,
    totalPrice,
    confidence: "1.0000",
    linkStatus: "pending",
  });
  return { ...fixture, invoiceId };
}

beforeAll(async () => {
  const database = await getDb();
  if (!database) throw new Error("DATABASE_URL indisponível para o teste de integração.");
  db = database;
  if (!ENV.ownerOpenId) throw new Error("OWNER_OPEN_ID indisponível para o teste de integração.");
  await upsertUser({
    openId: ENV.ownerOpenId,
    name: process.env.OWNER_NAME ?? "Proprietário Duo Gelatto",
    loginMethod: "manus",
    role: "admin",
    lastSignedIn: new Date(),
  });
  const user = await getUserByOpenId(ENV.ownerOpenId);
  if (!user) throw new Error("Usuário proprietário não localizado.");
  owner = user;
});

afterAll(async () => {
  for (const invoiceId of createdInvoiceIds.reverse()) {
    await db.delete(purchaseInvoiceItems).where(eq(purchaseInvoiceItems.invoiceId, invoiceId));
    await db.delete(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId));
  }
  for (const boxId of createdBoxIds.reverse()) {
    await db.delete(boxStockMovements).where(eq(boxStockMovements.boxId, boxId));
    await db.delete(boxStock).where(eq(boxStock.id, boxId));
  }
  for (const itemId of createdOperationalItemIds.reverse()) {
    await db.delete(operationalStockMovements).where(eq(operationalStockMovements.itemId, itemId));
    await db.delete(operationalItems).where(eq(operationalItems.id, itemId));
  }
});

integration("confirmação real de notas no estoque", () => {
  it("confirma caixa de 10 L pela rota, cria um movimento e bloqueia duplicidade", async () => {
    const fixture = await createInvoiceFixture(
      `SORVETE TESTE ${Date.now()} 10 LT`,
      "insumos",
      "2.000",
      "50.0000",
    );
    const caller = appRouter.createCaller(contextFor(owner));
    const result = await caller.purchaseInvoices.confirm({ invoiceId: fixture.invoiceId });
    expect(result).toMatchObject({ success: true, boxEntries: 1, operationalEntries: 0, totalItems: 1 });

    const [linkedItem] = await db.select().from(purchaseInvoiceItems)
      .where(eq(purchaseInvoiceItems.invoiceId, fixture.invoiceId)).limit(1);
    expect(linkedItem?.linkStatus).toBe("linked");
    expect(linkedItem?.boxStockId).toBeTruthy();
    const boxId = linkedItem!.boxStockId!;
    createdBoxIds.push(boxId);

    const [box] = await db.select().from(boxStock).where(eq(boxStock.id, boxId)).limit(1);
    const movements = await db.select().from(boxStockMovements).where(eq(boxStockMovements.boxId, boxId));
    expect(box?.currentStock).toBe(2);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "entrada", quantity: 2, previousStock: 0, newStock: 2 });

    await expect(caller.purchaseInvoices.confirm({ invoiceId: fixture.invoiceId }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    const movementsAfterRetry = await db.select().from(boxStockMovements).where(eq(boxStockMovements.boxId, boxId));
    expect(movementsAfterRetry).toHaveLength(1);
  });

  it("confirma item não-10 L e cria vínculo operacional com categoria e movimento", async () => {
    const fixture = await createInvoiceFixture(
      `DETERGENTE TESTE ${Date.now()}`,
      "limpeza",
      "3.000",
      "7.5000",
    );
    const caller = appRouter.createCaller(contextFor(owner));
    const result = await caller.purchaseInvoices.confirm({ invoiceId: fixture.invoiceId });
    expect(result).toMatchObject({ success: true, boxEntries: 0, operationalEntries: 1, totalItems: 1 });

    const [linkedItem] = await db.select().from(purchaseInvoiceItems)
      .where(eq(purchaseInvoiceItems.invoiceId, fixture.invoiceId)).limit(1);
    expect(linkedItem?.linkStatus).toBe("linked");
    expect(linkedItem?.operationalItemId).toBeTruthy();
    const operationalItemId = linkedItem!.operationalItemId!;
    createdOperationalItemIds.push(operationalItemId);

    const [item] = await db.select().from(operationalItems)
      .where(eq(operationalItems.id, operationalItemId)).limit(1);
    const movements = await db.select().from(operationalStockMovements)
      .where(eq(operationalStockMovements.itemId, operationalItemId));
    expect(item).toMatchObject({ category: "limpeza", currentStock: "3.00", referencePrice: "7.50" });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "in", quantity: "3.00", previousStock: "0.00", newStock: "3.00" });
  });
});
