import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserted: {} as Record<string, unknown>,
  updated: {} as Record<string, unknown>,
}));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    insert: () => ({ values: async (data: Record<string, unknown>) => {
      state.inserted = data;
      return [{ insertId: 42 }];
    } }),
    select: () => ({ from: () => ({ where: () => ({
      limit: async () => [{ id: 42, ...state.inserted }],
    }) }) }),
    update: () => ({ set: (data: Record<string, unknown>) => {
      state.updated = data;
      return { where: async () => undefined };
    } }),
  })),
}));

import { createFinTransaction, updateFinTransaction } from "./db.fin";

describe("IDs financeiros opcionais — regressão isolada", () => {
  beforeEach(() => { state.inserted = {}; state.updated = {}; });

  it("converte IDs inválidos para NULL na inserção sem banco real", async () => {
    const result = await createFinTransaction({
      userId: 1, description: "fixture apenas em memória", amount: "1.00",
      dueDate: new Date("2026-08-27T12:00:00Z"), isPaid: false,
      categoryId: Number.NaN, typeId: "none" as unknown as number,
      costId: "" as unknown as number, bankId: "NaN" as unknown as number,
    });
    expect(result).toMatchObject({
      id: 42, categoryId: null, typeId: null, costId: null, bankId: null,
    });
    expect(state.inserted.amount).toBe("1.00");
  });

  it("preserva IDs válidos e valores originais", async () => {
    await createFinTransaction({
      userId: 1, description: "fixture apenas em memória", amount: "2430.86",
      dueDate: new Date("2026-08-27T12:00:00Z"), isPaid: false,
      categoryId: 2, typeId: 3, costId: 4, bankId: 5,
    });
    expect(state.inserted).toMatchObject({ categoryId: 2, typeId: 3, costId: 4, bankId: 5, amount: "2430.86" });
  });

  it("sanitiza também atualizações diretas sem alterar campos ausentes", async () => {
    await updateFinTransaction(42, 1, { costId: Number.NaN, bankId: null });
    expect(state.updated).toMatchObject({ costId: null, bankId: null });
    expect(state.updated).not.toHaveProperty("categoryId");
    expect(state.updated.updatedAt).toBeInstanceOf(Date);
  });
});
