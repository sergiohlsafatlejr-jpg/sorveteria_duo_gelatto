import { afterEach, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { finTransactions } from "../drizzle/schema";
import { getDb } from "./db";
import {
  createFinTransaction,
  deleteFinTransaction,
  updateFinTransaction,
} from "./db.fin";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const TEST_PREFIX = "__TEST_FIN_OPTIONAL_IDS__";

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "d7B36tZDo7LGydRzH3TcTH",
      name: "Sergio Safatle",
      email: "sergiohlsafatlejr@gmail.com",
      loginMethod: "google",
      role: "admin",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (db) {
    await db.delete(finTransactions).where(like(finTransactions.description, `${TEST_PREFIX}%`));
  }
});

describe("fin.transactions optional IDs", () => {
  it("persiste IDs inválidos como NULL sem gerar NaN no MySQL", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const created = await caller.fin.transactions.create({
      description: `${TEST_PREFIX}_${Date.now()}`,
      amount: 0.01,
      dueDate: new Date("2026-08-27T12:00:00.000Z"),
      categoryId: "" as unknown as number,
      typeId: "none" as unknown as number,
      costId: Number.NaN,
      bankId: "NaN" as unknown as number,
      isPaid: false,
    });

    expect(created).not.toBeNull();
    expect(created?.categoryId).toBeNull();
    expect(created?.typeId).toBeNull();
    expect(created?.costId).toBeNull();
    expect(created?.bankId).toBeNull();
  });

  it("aceita NULL na atualização e mantém os vínculos opcionais vazios", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const created = await caller.fin.transactions.create({
      description: `${TEST_PREFIX}_UPDATE_${Date.now()}`,
      amount: 0.01,
      dueDate: new Date("2026-08-27T12:00:00.000Z"),
      isPaid: false,
    });
    expect(created).not.toBeNull();

    await caller.fin.transactions.update({
      id: created!.id,
      categoryId: null,
      typeId: null,
      costId: null,
      bankId: null,
    });

    const rows = await caller.fin.transactions.list();
    const updated = rows.find((row) => row.id === created!.id);
    expect(updated?.categoryId).toBeNull();
    expect(updated?.typeId).toBeNull();
    expect(updated?.costId).toBeNull();
    expect(updated?.bankId).toBeNull();
  });

  it("sanitiza NaN e sentinelas em chamadas diretas da camada db.fin", async () => {
    const created = await createFinTransaction({
      userId: 1,
      description: `${TEST_PREFIX}_DB_${Date.now()}`,
      amount: "0.01",
      dueDate: new Date("2026-08-27T12:00:00.000Z"),
      categoryId: Number.NaN,
      typeId: "none" as unknown as number,
      costId: Number.NaN,
      bankId: "NaN" as unknown as number,
      isPaid: false,
    });

    expect(created).not.toBeNull();
    expect(created?.categoryId).toBeNull();
    expect(created?.typeId).toBeNull();
    expect(created?.costId).toBeNull();
    expect(created?.bankId).toBeNull();

    await updateFinTransaction(created!.id, 1, {
      categoryId: Number.NaN,
      typeId: "" as unknown as number,
      costId: "none" as unknown as number,
      bankId: Number.NaN,
    });

    const db = await getDb();
    const rows = db
      ? await db.select().from(finTransactions).where(like(finTransactions.description, created!.description))
      : [];
    expect(rows[0]?.categoryId).toBeNull();
    expect(rows[0]?.typeId).toBeNull();
    expect(rows[0]?.costId).toBeNull();
    expect(rows[0]?.bankId).toBeNull();

    await deleteFinTransaction(created!.id, 1);
  });
});
