import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  boxStock,
  boxStockMovements,
  operationalItems,
  operationalStockMovements,
  products,
  purchaseInvoiceItems,
  purchaseInvoices,
  stockMovements,
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
    invoice: { id: 1, status: "extracted", invoiceNumber: "900", supplierName: "Duo Gelatto Indústria", operationalSupplierId: 7, reviewedBy: 42, reviewedAt: new Date("2026-11-05T12:00:00Z") },
    items: [{ id: 10, invoiceId: 1, description: "SORVETE CHOCOLATE 10 LT", category: "insumos", quantity: "2.000", unit: "UN", unitPrice: "50.0000", boxStockId: null, operationalItemId: null, linkStatus: "unlinked" }],
    boxes: [] as any[],
    movements: [] as any[],
    operational: [] as any[],
  };

  const tx: any = {
    select: () => ({
      from: (table: unknown) => {
        if (table === purchaseInvoices) return query([state.invoice]);
        if (table === purchaseInvoiceItems) return query(state.items);
        if (table === operationalItems) return query(state.operational);
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

  it.each(["DEVOLUÇÃO", "TROCA"])("bloqueia natureza %s sem entrada de estoque", async (nature) => {
    const { db, state } = createFakeDatabase();
    state.invoice.operationNature = nature;
    await expect(confirmPurchaseInvoiceStock(db, 1, 42)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.movements).toHaveLength(0);
    expect(state.boxes).toHaveLength(0);
  });

  it("não mistura saldo legado em caixas com entrada convertida em unidades", async () => {
    const { db, state } = createFakeDatabase();
    state.items[0] = { ...state.items[0], description: "PICOLÉ CAJÁ 30 UND", unit: "CX" };
    state.operational = [{ id: 200, name: "PICOLÉ CAJÁ 30 UND", currentStock: "2.00", unit: "cx", unitsPerPackage: 1 }];
    await expect(confirmPurchaseInvoiceStock(db, 1, 42)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.operational[0].currentStock).toBe("2.00");
    expect(state.invoice.status).toBe("extracted");
  });

  it("recusa embalagem cuja quantidade resulte em fração de unidade", async () => {
    const { db, state } = createFakeDatabase();
    state.items[0] = { ...state.items[0], description: "PICOLÉ CAJÁ 30 UND", unit: "CX", quantity: "0.015" };
    await expect(confirmPurchaseInvoiceStock(db, 1, 42)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.invoice.status).toBe("extracted");
  });

  it("converte pacotes/caixas de picolés em unidades individuais no almoxarifado e em produtos", async () => {
    const state: any = {
      invoice: { id: 2, status: "extracted", invoiceNumber: "901", supplierName: "Duo Gelatto Indústria", operationalSupplierId: 7, reviewedBy: 42, reviewedAt: new Date("2026-11-05T12:00:00Z") },
      items: [{ id: 11, invoiceId: 2, description: "PICOLÉ CAJÁ - FRUTA 30 UND", category: "insumos", quantity: "2.000", unit: "CX", unitPrice: "90.0000", boxStockId: null, operationalItemId: null, linkStatus: "unlinked" }],
      opItems: [] as any[],
      opMovements: [] as any[],
      prodItems: [] as any[],
      prodMovements: [] as any[],
    };

    const tx: any = {
      select: () => ({
        from: (table: unknown) => {
          if (table === purchaseInvoices) return query([state.invoice]);
          if (table === purchaseInvoiceItems) return query(state.items);
          if (table === operationalItems) return query(state.opItems);
          if (table === products) return query(state.prodItems);
          return query([]);
        },
      }),
      insert: (table: unknown) => ({
        values: (values: any) => {
          let returningId: number | null = null;
          if (table === operationalItems) {
            returningId = 200 + state.opItems.length;
            state.opItems.push({ id: returningId, ...values });
          }
          if (table === operationalStockMovements) state.opMovements.push(values);
          if (table === products) {
            returningId = 300 + state.prodItems.length;
            state.prodItems.push({ id: returningId, ...values });
          }
          if (table === stockMovements) state.prodMovements.push(values);
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
            if (table === operationalItems && state.opItems[0]) Object.assign(state.opItems[0], values);
            if (table === products && state.prodItems[0]) Object.assign(state.prodItems[0], values);
            if (table === purchaseInvoiceItems) Object.assign(state.items[0], values);
            if (table === purchaseInvoices) Object.assign(state.invoice, values);
          },
        }),
      }),
    };
    const db: any = { transaction: (callback: (transaction: any) => unknown) => callback(tx) };

    const result = await confirmPurchaseInvoiceStock(db, 2, 42);
    expect(result).toEqual({ success: true, operationalEntries: 1, boxEntries: 0, totalItems: 1 });
    // 2 caixas x 30 unidades = 60 unidades a R$ 3,00/un
    expect(state.opItems[0]).toMatchObject({
      id: 200,
      unit: "un",
      unitsPerPackage: 30,
      currentStock: "60.00",
      referencePrice: "3.00",
    });
    expect(state.opMovements[0]).toMatchObject({
      itemId: 200,
      type: "in",
      quantity: "60.00",
      unitCost: "3.00",
    });
    expect(state.prodItems[0]).toMatchObject({
      id: 300,
      unit: "un",
      currentStock: 60,
      costPrice: "3.00",
    });
    expect(state.prodMovements[0]).toMatchObject({
      productId: 300,
      type: "in",
      quantity: 60,
      previousStock: 0,
      newStock: 60,
    });
  });
});
