import { beforeEach, describe, expect, it, vi } from "vitest";
import { boxStock, boxStockMovements, operationalItems, operationalStockMovements } from "../drizzle/schema";
import {
  buildPurchaseWarehouseCatalog,
  categorizeSorveteItem,
  getPurchaseWarehouseInoveProductId,
  isTenLiterPurchaseItem,
} from "../client/src/lib/purchase-warehouse";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./routers/inove", () => ({ createInovePool: vi.fn() }));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: (column: unknown, value: unknown) => ({ column, value }) };
});
import { initializeBatchWarehouseStock, upsertWarehouseItemStock } from "./db.purchases";
import { boxStockRouter } from "./routers/boxStock";

type Row = Record<string, any>;
type Predicate = { column: { name: string }; value: unknown };

function setup(boxes: Row[] = [], items: Row[] = []) {
  const state = { boxes: structuredClone(boxes), items: structuredClone(items), boxMovements: [] as Row[], itemMovements: [] as Row[], nextId: 100 };
  const events: string[] = [];
  const faults = { movement: false, movementAfter: Infinity, deadlocks: 0 };
  const matches = (row: Row, condition?: Predicate) => !condition || row[condition.column.name] === condition.value;
  const rowsFor = (table: unknown) => {
    if (table === boxStock) return state.boxes;
    if (table === operationalItems) return state.items;
    if (table === boxStockMovements) return state.boxMovements;
    if (table === operationalStockMovements) return state.itemMovements;
    throw new Error("Tabela inesperada no mock");
  };
  const tableName = (table: unknown) => table === boxStock ? "box" : table === operationalItems ? "item" : "movement";
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        let condition: Predicate | undefined;
        const query: any = {
          where: (value: Predicate) => { condition = value; return query; },
          limit: () => query,
          for: (mode: string) => { expect(mode).toBe("update"); events.push(`lock:${tableName(table)}`); return query; },
          then: (resolve: any, reject: any) => Promise.resolve(rowsFor(table).filter((row) => matches(row, condition)).map((row) => ({ ...row }))).then(resolve, reject),
        };
        return query;
      },
    }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: async (condition: Predicate) => {
          events.push(`update:${tableName(table)}`);
          rowsFor(table).filter((row) => matches(row, condition)).forEach((row) => Object.assign(row, values));
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Row) => {
        const insert = async () => {
          events.push(`insert:${tableName(table)}`);
          if (faults.deadlocks > 0) {
            faults.deadlocks--;
            throw new Error("Query falhou", { cause: Object.assign(new Error("Deadlock simulado"), { code: "ER_LOCK_DEADLOCK", errno: 1213 }) });
          }
          if ((faults.movement || state.boxMovements.length + state.itemMovements.length >= faults.movementAfter)
            && (table === boxStockMovements || table === operationalStockMovements)) {
            throw new Error("Falha simulada no movimento");
          }
          const row = { id: state.nextId++, ...values };
          rowsFor(table).push(row);
          return [{ id: row.id }];
        };
        return { $returningId: insert, then: (resolve: any, reject: any) => insert().then(resolve, reject) };
      },
    }),
  };
  let queue = Promise.resolve();
  const db = {
    transaction: vi.fn((work: (connection: typeof tx) => Promise<unknown>, _config?: unknown) => {
      const run = queue.then(async () => {
        const snapshot = structuredClone(state);
        events.push("begin");
        try {
          const result = await work(tx);
          events.push("commit");
          return result;
        } catch (error) {
          Object.assign(state, snapshot);
          events.push("rollback");
          throw error;
        }
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    }),
    select: vi.fn(() => { throw new Error("Leitura fora de transação"); }),
    update: vi.fn(() => { throw new Error("Atualização fora de transação"); }),
    insert: vi.fn(() => { throw new Error("Inserção fora de transação"); }),
  };
  mocks.getDb.mockResolvedValue(db);
  return { state, db, tx, events, faults };
}

const existingBox = { id: 1, name: "Chocolate", currentStock: 3, minStock: 2, costPrice: "90.00", inoveProductId: 77, active: true };
const boxInput = { name: "CAIXA 10 Litros - Chocolate", category: "caixas_10l", quantity: 5 };
const existingItem = { id: 2, name: "Calda Morango", currentStock: "0.00", minStock: "4.00", referencePrice: "8.00", inoveProductId: 88, active: true };

beforeEach(() => vi.resetAllMocks());

describe("formulário de compras — vínculo INOVE", () => {
  it("campo ausente envia undefined e preserva vínculo cadastrado", async () => {
    const { state, db } = setup([existingBox]);
    const fd = new FormData();
    fd.set("qty", "5");
    const inoveProductId = getPurchaseWarehouseInoveProductId(fd, existingBox.inoveProductId);
    expect(inoveProductId).toBeUndefined();
    await upsertWarehouseItemStock({ ...boxInput, inoveProductId });
    expect(state.boxes[0]).toMatchObject({ currentStock: 5, inoveProductId: 77 });
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it("campo presente mas não editado também preserva alterações concorrentes de vínculo", () => {
    const fd = new FormData();
    fd.set("inoveProductId", " 77 ");
    expect(getPurchaseWarehouseInoveProductId(fd, 77)).toBeUndefined();
    fd.set("inoveProductId", "");
    expect(getPurchaseWarehouseInoveProductId(fd, null)).toBeUndefined();
  });

  it("permite remover ou trocar vínculo explicitamente", async () => {
    const { state } = setup([existingBox]);
    const fd = new FormData();
    fd.set("inoveProductId", "");
    expect(getPurchaseWarehouseInoveProductId(fd, 77)).toBeNull();
    await upsertWarehouseItemStock({ ...boxInput, inoveProductId: getPurchaseWarehouseInoveProductId(fd, 77) });
    expect(state.boxes[0].inoveProductId).toBeNull();
    fd.set("inoveProductId", "99");
    await upsertWarehouseItemStock({ ...boxInput, inoveProductId: getPurchaseWarehouseInoveProductId(fd, null) });
    expect(state.boxes[0].inoveProductId).toBe(99);
  });
});

describe("saldo de caixas — transação e bloqueio", () => {
  it("bloqueia antes de alterar e grava movimento com saldo anterior correto", async () => {
    const { state, db, events } = setup([existingBox]);
    expect(await upsertWarehouseItemStock(boxInput)).toMatchObject({ target: "box_stock", id: 1, newStock: 5 });
    expect(state.boxMovements[0]).toMatchObject({ boxId: 1, previousStock: 3, newStock: 5, quantity: 2 });
    expect(events).toEqual(["begin", "lock:box", "update:box", "insert:movement", "commit"]);
    expect(db.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "repeatable read" });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("reverte atualização do saldo quando movimento falha", async () => {
    const { state, db, events, faults } = setup([existingBox]);
    faults.movement = true;
    await expect(upsertWarehouseItemStock(boxInput)).rejects.toThrow("Falha simulada no movimento");
    expect(state.boxes).toEqual([existingBox]);
    expect(state.boxMovements).toHaveLength(0);
    expect(events.at(-1)).toBe("rollback");
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it("reverte criação de caixa quando movimento inicial falha", async () => {
    const { state, faults } = setup();
    faults.movement = true;
    await expect(upsertWarehouseItemStock(boxInput)).rejects.toThrow("Falha simulada no movimento");
    expect(state.boxes).toHaveLength(0);
    expect(state.boxMovements).toHaveLength(0);
  });

  it("ajustes concorrentes leem o saldo serializado para cada movimento", async () => {
    const { state, events } = setup([existingBox]);
    await Promise.all([
      upsertWarehouseItemStock({ ...boxInput, quantity: 5 }),
      upsertWarehouseItemStock({ ...boxInput, quantity: 7 }),
    ]);
    expect(state.boxes[0].currentStock).toBe(7);
    expect(state.boxMovements).toMatchObject([
      { previousStock: 3, newStock: 5, quantity: 2 },
      { previousStock: 5, newStock: 7, quantity: 2 },
    ]);
    expect(events.filter((event) => event === "lock:box")).toHaveLength(2);
  });

  it("entrada do router de caixas concorre usando o mesmo saldo bloqueado", async () => {
    const { state, db } = setup([existingBox]);
    const ctx = { user: { id: 42, role: "admin", active: true }, req: {}, res: {} } as unknown as TrpcContext;
    const caller = boxStockRouter.createCaller(ctx);
    await Promise.all([
      upsertWarehouseItemStock({ ...boxInput, quantity: 5 }),
      caller.addEntry({ boxId: 1, quantity: 2 }),
    ]);
    expect(state.boxes[0].currentStock).toBe(7);
    expect(state.boxMovements).toMatchObject([
      { previousStock: 3, newStock: 5, quantity: 2 },
      { previousStock: 5, newStock: 7, quantity: 2 },
    ]);
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("inicialização em lote — servidor não sobrescreve configurados", () => {
  it("pula caixa e item existentes, inclusive saldo zero, sem mudar mínimo, preço ou INOVE", async () => {
    const zeroBox = { ...existingBox, currentStock: 0 };
    const { state, events } = setup([zeroBox], [existingItem]);
    expect(await initializeBatchWarehouseStock([
      { ...boxInput, quantity: 200, minStock: 20, referencePrice: 1 },
      { name: "CALDA MORANGO", quantity: 150, minStock: 30, referencePrice: 2 },
    ])).toEqual({ initialized: 0 });
    expect(state.boxes).toEqual([zeroBox]);
    expect(state.items).toEqual([existingItem]);
    expect(state.boxMovements).toHaveLength(0);
    expect(state.itemMovements).toHaveLength(0);
    expect(events.slice(0, 3)).toEqual(["begin", "lock:item", "lock:box"]);
    expect(events.some((event) => event.startsWith("update:") || event.startsWith("insert:"))).toBe(false);
  });

  it("inicializa somente novos e retries não substituem o saldo atual", async () => {
    const { state } = setup([existingBox], [existingItem]);
    const batch = [
      boxInput,
      { name: "CAIXA 10LT - Morango", quantity: 4 },
      { name: "Calda morango", quantity: 10 },
      { name: "PICOLE CAJA 30 UND", quantity: 60 },
    ];
    expect(await initializeBatchWarehouseStock(batch, 42)).toEqual({ initialized: 2 });
    expect(state.boxes).toHaveLength(2);
    expect(state.items).toHaveLength(2);
    expect(state.boxMovements).toHaveLength(1);
    expect(state.itemMovements).toHaveLength(1);
    expect(state.items[1]).toMatchObject({ currentStock: "60", unitsPerPackage: 30 });
    expect(state.boxMovements[0]).toMatchObject({ userId: 42, previousStock: 0, newStock: 4 });
    state.boxes[1].currentStock = 1;
    state.items[1].currentStock = "0.00";
    expect(await initializeBatchWarehouseStock(batch.map((item) => ({ ...item, quantity: 999 })))).toEqual({ initialized: 0 });
    expect(state.boxes[1].currentStock).toBe(1);
    expect(state.items[1].currentStock).toBe("0.00");
    expect(state.boxMovements).toHaveLength(1);
    expect(state.itemMovements).toHaveLength(1);
  });

  it("nomes equivalentes repetidos no próprio lote criam um único cadastro", async () => {
    const { state } = setup();
    expect(await initializeBatchWarehouseStock([
      { name: "CAIXA 10 Litros - Chocolate", quantity: 2 },
      { name: "CAIXA 10LT: Chocolate", quantity: 999 },
      { name: "CAIXA 10L — Chocolate", quantity: 888 },
      { name: "Calda Morango", quantity: 3 },
      { name: "CALDA MORANGO", quantity: 100 },
    ])).toEqual({ initialized: 2 });
    expect(state.boxes).toHaveLength(1);
    expect(state.boxes[0].currentStock).toBe(2);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].currentStock).toBe("3");
  });

  it("serializa duas inicializações com catálogo vazio, sem schema ou duplicação", async () => {
    const { state, db, events } = setup();
    const batch = [boxInput, { name: "Calda Morango", quantity: 3 }];
    const results = await Promise.all([initializeBatchWarehouseStock(batch), initializeBatchWarehouseStock(batch)]);
    expect(results).toEqual([{ initialized: 2 }, { initialized: 0 }]);
    expect(state.boxes).toHaveLength(1);
    expect(state.items).toHaveLength(1);
    expect(state.boxMovements).toHaveLength(1);
    expect(state.itemMovements).toHaveLength(1);
    for (const [, config] of db.transaction.mock.calls) expect(config).toEqual({ isolationLevel: "repeatable read" });
    expect(events.filter((event) => event === "lock:item")).toHaveLength(2);
    expect(events.filter((event) => event === "lock:box")).toHaveLength(4);
  });

  it("rollback reverte todo o lote se um movimento falhar", async () => {
    const { state, faults } = setup();
    faults.movementAfter = 1;
    await expect(initializeBatchWarehouseStock([{ name: "Calda Morango", quantity: 4 }, boxInput])).rejects.toThrow("Falha simulada no movimento");
    expect(state.boxes).toHaveLength(0);
    expect(state.items).toHaveLength(0);
    expect(state.boxMovements).toHaveLength(0);
    expect(state.itemMovements).toHaveLength(0);
  });

  it("repete a transação inteira após deadlock de criação concorrente", async () => {
    const { state, db, events, faults } = setup();
    faults.deadlocks = 1;
    expect(await initializeBatchWarehouseStock([boxInput])).toEqual({ initialized: 1 });
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(events).toContain("rollback");
    expect(state.boxes).toHaveLength(1);
    expect(state.boxMovements).toHaveLength(1);
  });

  it("limita repetição de deadlock e não deixa saldo parcial", async () => {
    const { state, db, faults } = setup();
    faults.deadlocks = 3;
    await expect(initializeBatchWarehouseStock([boxInput])).rejects.toThrow("Query falhou");
    expect(db.transaction).toHaveBeenCalledTimes(3);
    expect(state.boxes).toHaveLength(0);
    expect(state.boxMovements).toHaveLength(0);
  });
});

describe("nomes de caixas 10 Litros / 10LT / 10L", () => {
  it.each(["10 Litros", "10 Litro", "10LT", "10L"])("servidor encontra sabor existente para %s sem criar caixa duplicada", async (size) => {
    const { state } = setup([existingBox]);
    await upsertWarehouseItemStock({ name: `CAIXA ${size} - Chocolate`, quantity: 6 });
    expect(state.boxes).toHaveLength(1);
    expect(state.boxes[0]).toMatchObject({ id: 1, currentStock: 6, inoveProductId: 77 });
  });

  it.each(["10 Litros", "10 Litro", "10LT", "10L"])("catálogo client vincula %s ao sabor e saldo existentes", (size) => {
    const description = `CAIXA ${size} - Chocolate`;
    expect(isTenLiterPurchaseItem(description)).toBe(true);
    expect(categorizeSorveteItem(description)).toBe("caixas_10l");
    const result = buildPurchaseWarehouseCatalog([{
      category: "insumos",
      items: [{ description, unit: "CX", totalQuantity: 10, totalSpent: 900, averageUnitPrice: 90, invoiceCount: 1, sources: [{ invoiceId: 1, supplierName: "DUO GELATTO" }] }],
    }], [], "duo_gelatto", [existingBox]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ boxStockId: 1, currentStock: 3, stockConfigured: true, inoveProductId: 77 });
  });

  it("preserva o restante do sabor, incluindo sabor com início L ou LT", async () => {
    const { state } = setup([{ ...existingBox, name: "Leite" }]);
    await upsertWarehouseItemStock({ name: "CAIXA 10 Litros - Leite", quantity: 8 });
    expect(state.boxes).toHaveLength(1);
    expect(state.boxes[0].name).toBe("Leite");
    expect(isTenLiterPurchaseItem("CAIXA 10Laranja")).toBe(false);
  });
});
