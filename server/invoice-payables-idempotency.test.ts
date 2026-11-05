import { beforeEach, describe, expect, it, vi } from "vitest";
import { finTransactions, purchaseInvoices } from "../drizzle/schema";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
import { createPayablesFromPurchaseInvoice } from "./sorveteria-intelligence";

function setup() {
  const state: any = { invoice: { id: 20, status: "extracted", operationNature: "VENDA", reviewedBy: 42, reviewedAt: new Date(), totalAmount: "100.00", invoiceNumber: "900", supplierName: "Fixture apenas em memória" }, transactions: [], fail: false, locks: 0 };
  const query = (rows: any[]) => {
    const q: any = { where: () => q, limit: () => q, for: () => { state.locks++; return q; }, then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
    return q;
  };
  const tx: any = {
    select: () => ({ from: (table: any) => query(table === purchaseInvoices ? [state.invoice] : table === finTransactions ? state.transactions : []) }),
    insert: () => ({ values: (values: any[]) => ({ $returningId: async () => {
      for (const value of values) {
        state.transactions.push({ id: state.transactions.length + 1, ...value });
        if (state.fail) throw new Error("Falha no lote simulado");
      }
      return state.transactions.map((value: any) => ({ id: value.id }));
    } }) }),
  };
  let queue = Promise.resolve();
  const db: any = { transaction: vi.fn((work: any) => {
    const run = queue.then(async () => {
      const saved = structuredClone(state.transactions);
      try { return await work(tx); } catch (error) { state.transactions = saved; throw error; }
    });
    queue = run.then(() => undefined, () => undefined);
    return run;
  }) };
  mocks.getDb.mockResolvedValue(db);
  return { state, db };
}
const input = { invoiceId: 20, installments: 3, firstDueDate: "2026-11-05", intervalDays: 28 };
beforeEach(() => vi.resetAllMocks());

describe("boletos de NF-e — lote atômico idempotente", () => {
  it("divide os centavos sem perder o total e vincula cada parcela à nota", async () => {
    const { state, db } = setup();
    expect(await createPayablesFromPurchaseInvoice(42, input)).toMatchObject({ createdCount: 3, totalAmount: 100 });
    expect(state.transactions.map((row: any) => row.amount)).toEqual(["33.33", "33.33", "33.34"]);
    expect(state.transactions[0].notes).toContain("[NF-e invoiceID=20 parcel=1/3]");
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(state.locks).toBe(2);
  });
  it("recusa segunda geração mesmo com outro usuário e número diferente de parcelas", async () => {
    const { state } = setup();
    await createPayablesFromPurchaseInvoice(42, input);
    await expect(createPayablesFromPurchaseInvoice(1, { ...input, installments: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.transactions).toHaveLength(3);
  });
  it("serializa cliques concorrentes e cria um único lote", async () => {
    const { state } = setup();
    const results = await Promise.allSettled([createPayablesFromPurchaseInvoice(42, input), createPayablesFromPurchaseInvoice(42, input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(state.transactions).toHaveLength(3);
  });
  it("reverte lote parcial e permite nova tentativa sem duplicar", async () => {
    const { state } = setup();
    state.fail = true;
    await expect(createPayablesFromPurchaseInvoice(42, input)).rejects.toThrow("Falha no lote simulado");
    expect(state.transactions).toHaveLength(0);
    state.fail = false;
    await createPayablesFromPurchaseInvoice(42, input);
    expect(state.transactions).toHaveLength(3);
  });
  it.each(["sem revisão", "devolução", "processing"])("recusa %s sem títulos financeiros", async (scenario) => {
    const { state } = setup();
    if (scenario === "sem revisão") state.invoice.reviewedBy = null;
    if (scenario === "devolução") state.invoice.operationNature = "DEVOLUCAO";
    if (scenario === "processing") state.invoice.status = "processing";
    await expect(createPayablesFromPurchaseInvoice(42, input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.transactions).toHaveLength(0);
  });
});
