import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  boxStock,
  boxStockMovements,
  operationalItems,
  purchaseInvoiceItems,
  purchaseInvoices,
} from "../drizzle/schema";
import { confirmPurchaseInvoiceStock } from "./purchase-invoice-confirmation";

function query(rows: unknown[]) {
  let current = rows;
  const chain: any = {
    where: () => chain,
    limit: (limit: number) => { current = current.slice(0, limit); return chain; },
    for: async () => current,
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(current).then(resolve, reject),
  };
  return chain;
}

function createFakeDatabase() {
  const state: any = {
    invoice: { id: 1, status: "extracted", invoiceNumber: "900", supplierName: "Duo Gelatto Indústria", operationalSupplierId: 7, reviewedBy: null, reviewedAt: null },
    items: [{ id: 10, invoiceId: 1, description: "SORVETE CHOCOLATE 10 LT", category: "insumos", quantity: "2.000", unit: "UN", unitPrice: "50.0000", boxStockId: null, operationalItemId: null, linkStatus: "unlinked" }],
    boxes: [] as any[],
    movements: [] as any[],
  };

  const tx: any = {
    select: () => ({
      from: (table: unknown) => {
        if (table === purchaseInvoices) return query([state.invoice]);
        if (table === purchaseInvoiceItems) return query(state.items);
        if (table === operationalItems) return query([]);
        if (table === boxStock) return query(state.boxes);
        return query([]);
      },
    }),
    insert: (table: unknown) => ({
      values: (values: any) => {
        let returningId: number | null = null;
        if (table === boxStock) {
          returningId = 100 + state.boxes.length;
          state.boxes.push({ id: returningId, ...values });
        }
        if (table === boxStockMovements) state.movements.push(values);
        const result: any = {
          $returningId: async () => returningId ? [{ id: returningId }] : [],
          then: (resolve: (value: undefined) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(undefined).then(resolve, reject),
        };
        return result;
      },
    }),
    update: (table: unknown) => ({
      set: (values: any) => ({
        where: async () => {
          if (table === boxStock) Object.assign(state.boxes[0], values);
          if (table === purchaseInvoiceItems) Object.assign(state.items[0], values);
          if (table === purchaseInvoices) Object.assign(state.invoice, values);
        },
      }),
    }),
  };
  const db: any = { transaction: (callback: (transaction: any) => unknown) => callback(tx) };
  return { db, state };
}

describe("confirmação de nota no estoque", () => {
  it("cria uma única entrada de caixa, vincula o item e bloqueia confirmação duplicada", async () => {
    const { db, state } = createFakeDatabase();
    const result = await confirmPurchaseInvoiceStock(db, 1, 42);
    expect(result).toEqual({ success: true, operationalEntries: 0, boxEntries: 1, totalItems: 1 });
    expect(state.boxes[0]).toMatchObject({ id: 100, currentStock: 2, costPrice: "50.00" });
    expect(state.movements).toHaveLength(1);
    expect(state.movements[0]).toMatchObject({ boxId: 100, type: "entrada", quantity: 2, previousStock: 0, newStock: 2, userId: 42 });
    expect(state.items[0]).toMatchObject({ boxStockId: 100, operationalItemId: null, linkStatus: "linked" });
    expect(state.invoice.status).toBe("confirmed");

    await expect(confirmPurchaseInvoiceStock(db, 1, 42)).rejects.toMatchObject<Partial<TRPCError>>({ code: "CONFLICT" });
    expect(state.movements).toHaveLength(1);
  });
});
