import { beforeEach, describe, expect, it, vi } from "vitest";
import { operationalSuppliers, purchaseInvoiceItems, purchaseInvoices } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), storageGet: vi.fn(), extract: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./storage", () => ({ storageGet: mocks.storageGet, storagePut: vi.fn() }));
vi.mock("./purchase-invoice-extraction", async (original) => ({
  ...await original<typeof import("./purchase-invoice-extraction")>(), extractPurchaseInvoicePdf: mocks.extract,
}));
import { purchaseInvoicesRouter } from "./routers/purchase-invoices";

function fixture() {
  const state: any = {
    invoice: { id: 1, fileKey: "fixture.pdf", fileHash: "fixture-hash", documentHash: "fixture-hash", documentIndex: 1, status: "extracted", operationNature: "VENDA", reviewedAt: null, reviewedBy: null },
    items: [{ id: 10, invoiceId: 1, rawData: { original: "preservado" } }],
    writes: 0, locks: 0,
  };
  function chain(rows: any[]) {
    const q: any = { where: () => q, limit: () => q, orderBy: () => q,
      for: () => { state.locks++; return q; },
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
    return q;
  }
  const tx: any = {
    select: () => ({ from: (table: any) => chain(table === purchaseInvoices ? [state.invoice] : table === purchaseInvoiceItems ? state.items : table === operationalSuppliers ? [] : []) }),
    update: (table: any) => ({ set: (values: any) => ({ where: async () => {
      state.writes++;
      Object.assign(table === purchaseInvoices ? state.invoice : state.items[0], values);
    } }) }),
  };
  const db: any = { ...tx, transaction: vi.fn(async (work: any) => {
    const saved = structuredClone(state);
    try { return await work(tx); } catch (error) { Object.assign(state, saved); throw error; }
  }) };
  mocks.getDb.mockResolvedValue(db);
  const ctx = { user: { id: 42, role: "admin", active: true }, req: { headers: {}, protocol: "https" }, res: {} } as unknown as TrpcContext;
  return { state, db, caller: purchaseInvoicesRouter.createCaller(ctx) };
}
const review = {
  invoiceId: 1, supplierName: "Fixture apenas em memória", supplierCnpj: null,
  invoiceNumber: "900", issueDate: "2026-11-05", totalAmount: 180,
  items: [{ id: 10, supplierCode: null, description: "PICOLE CAJA 30 UND", category: "insumos" as const,
    quantity: 2, unit: "CX", unitPrice: 90, totalPrice: 180, stockConversionFactor: 30 }],
};
beforeEach(() => vi.resetAllMocks());

describe("revisão NF-e — transação e conversão explícita", () => {
  it("salva revisão e fator, preserva dados brutos e bloqueia a nota dentro da transação", async () => {
    const { caller, db, state } = fixture();
    expect(await caller.saveReview(review)).toMatchObject({ status: "extracted" });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(state.locks).toBe(1);
    expect(state.invoice.reviewedBy).toBe(42);
    expect(state.items[0].rawData).toEqual({ original: "preservado", stockConversionFactor: 30 });
  });
  it("mantém em revisão se quantidade UN com embalagem não tiver fator aprovado", async () => {
    const { caller, state } = fixture();
    const result = await caller.saveReview({ ...review, items: [{ ...review.items[0], unit: "UN", stockConversionFactor: null }] });
    expect(result.status).toBe("review_required");
    expect(result.validationErrors.join(" ")).toContain("confirme");
    expect(state.invoice.status).toBe("review_required");
  });
  it.each(["confirmed", "processing"])("não reabre nota %s por revisão concorrente", async (status) => {
    const { caller, state } = fixture();
    state.invoice.status = status;
    await expect(caller.saveReview(review)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.writes).toBe(0);
    expect(state.invoice.status).toBe(status);
  });
  it("não aceita duplicar item ou omitir linhas existentes", async () => {
    const { caller, state } = fixture();
    state.items.push({ id: 11, invoiceId: 1, rawData: {} });
    await expect(caller.saveReview(review)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.writes).toBe(0);
  });
  it("reprocessamento de nota confirmada nunca inicia extração", async () => {
    const { caller, state } = fixture();
    state.invoice.status = "confirmed";
    await expect(caller.reprocess({ invoiceId: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.storageGet).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(state.writes).toBe(0);
  });
});
