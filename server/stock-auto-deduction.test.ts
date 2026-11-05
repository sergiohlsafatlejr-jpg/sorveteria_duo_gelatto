import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  boxStock,
  boxStockMovements,
  inoveConnectorConfig,
  inoveStockDeductionLog,
  operationalItems,
  operationalStockMovements,
  products,
  purchaseInvoiceItems,
  purchaseInvoices,
  stockMovements,
  stockScheduledJobs,
} from "../drizzle/schema";
import { MySqlDialect } from "drizzle-orm/mysql-core";

// Isola ambos os adaptadores para nunca abrir conexão real ou carregar o router.
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), createInovePool: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./routers/inove", () => ({ createInovePool: mocks.createInovePool }));

import {
  deductStockFromInoveSales,
  extractUnitsPerPackage,
  isBulkKgSaleItem,
  normalizeCoreFlavorName,
  normalizeStockName,
  syncInoveCatalogLinks,
} from "./stock-auto-deduction";
import { confirmPurchaseInvoiceStock } from "./purchase-invoice-confirmation";

// Usa só o compilador SQL do Drizzle para filtrar IDs no mock (sem driver/DB).
const dialect = new MySqlDialect();
function query(rows: any[], onRead?: () => Promise<void>) {
  let current = structuredClone(rows);
  const chain: any = {
    where: (condition: any) => {
      const compiled = condition ? dialect.sqlToQuery(condition) : { sql: "", params: [] };
      const params = compiled.params;
      const column = compiled.sql.includes("`inoveItemVendaId`") ? "inoveItemVendaId"
        : compiled.sql.includes("`invoiceId`") ? "invoiceId" : "id";
      if (compiled.sql.includes("`jobKey`")) {
        current = current.filter((row) => row.jobKey === params[0]);
      } else if (params.length && params.every((value: unknown) => typeof value === "number")) {
        current = current.filter((row) => params.includes(row[column]));
      }
      return chain;
    },
    limit: (n: number) => { current = current.slice(0, n); return chain; },
    for: () => chain,
    then: (resolve: any, reject: any) => (async () => { await onRead?.(); return current; })().then(resolve, reject),
  };
  return chain;
}

function fakeDatabase() {
  const state = {
    prod: [{ id: 1, name: "PICOLE CAJA", active: true, inoveProductId: 51, externalCode: null, unit: "un", currentStock: 10 }],
    op: [{ id: 2, name: "PICOLÉ CAJÁ - FRUTA 30 UND", active: true, inoveProductId: 51, unit: "un", unitsPerPackage: 30, currentStock: "10.00" }],
    boxes: [] as any[],
    jobs: [{ jobKey: "stock-deduction", enabled: false, createdAt: new Date("2026-11-05T11:00:00Z") }],
    invoices: [{ id: 20, status: "extracted", operationNature: "VENDA", invoiceNumber: "900", supplierName: "Duo Gelatto Indústria", operationalSupplierId: 7, reviewedBy: 42 as number | null, reviewedAt: new Date("2026-11-05T12:00:00Z") as Date | null, issueDate: "2026-11-05" }],
    items: [{ id: 21, invoiceId: 20, description: "PICOLÉ CAJÁ - FRUTA 30 UND", category: "insumos", quantity: "2.000", unit: "CX", unitPrice: "90.0000", linkStatus: "unlinked" }],
    logs: [] as any[],
    movements: [] as any[],
    opMovements: [] as any[],
    boxMovements: [] as any[],
  };
  const tables = new Map<unknown, any[]>([
    [products, state.prod], [operationalItems, state.op], [boxStock, state.boxes],
    [purchaseInvoices, state.invoices], [purchaseInvoiceItems, state.items],
    [inoveStockDeductionLog, state.logs], [stockMovements, state.movements],
    [operationalStockMovements, state.opMovements], [boxStockMovements, state.boxMovements],
    [inoveConnectorConfig, [{ active: true }]],
    [stockScheduledJobs, state.jobs],
  ]);
  let beforeLog: (() => Promise<void>) | undefined;
  let onOperationalRead: (() => Promise<void>) | undefined;
  let failOperationalUpdate = false;
  const adapter: any = {
    select: () => ({ from: (table: unknown) => {
      const rows = tables.get(table);
      if (!rows) throw new Error("SELECT inesperado no mock");
      return query(rows, table === operationalItems ? onOperationalRead : undefined);
    } }),
    insert: (table: unknown) => ({ values: (value: any) => {
      const insert = (async () => {
        if (table === inoveStockDeductionLog) {
          await beforeLog?.();
          if (state.logs.some((log) => log.inoveItemVendaId === value.inoveItemVendaId)) {
            throw Object.assign(new Error("Duplicate entry (índice único ITEM_VENDA simulado)"), { code: "ER_DUP_ENTRY" });
          }
        }
        const rows = tables.get(table);
        if (!rows) throw new Error("INSERT inesperado no mock");
        const id = 100 + rows.length;
        rows.push({ id, ...structuredClone(value) });
        return [{ id }];
      })();
      return {
        $returningId: () => insert,
        then: (resolve: any, reject: any) => insert.then(resolve, reject),
      };
    } }),
    update: (table: unknown) => ({ set: (value: any) => ({ where: async (condition: any) => {
      if (table === operationalItems && failOperationalUpdate) throw new Error("Falha simulada após claim");
      const params = dialect.sqlToQuery(condition).params;
      const row = tables.get(table)?.find((candidate) => candidate.id === params[0]);
      if (!row) throw new Error("UPDATE sem registro no mock");
      Object.assign(row, structuredClone(value));
    } }) }),
  };
  let queue = Promise.resolve();
  const db: any = {
    ...adapter,
    transaction: vi.fn((callback: any) => {
      const run = queue.then(async () => {
        const snapshots = [...tables].map(([table, rows]) => [table, structuredClone(rows)] as const);
        try { return await callback(adapter); }
        catch (error) {
          for (const [table, snapshot] of snapshots) {
            const rows = tables.get(table)!;
            rows.splice(0, rows.length, ...snapshot);
          }
          throw error;
        }
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    }),
  };
  mocks.getDb.mockResolvedValue(db);
  return {
    db, state,
    onLog: (callback: () => Promise<void>) => { beforeLog = callback; },
    onOperationalRead: (callback: () => Promise<void>) => { onOperationalRead = callback; },
    failOperationalUpdate: (fail: boolean) => { failOperationalUpdate = fail; },
  };
}

function sale(itemVendaId = 1, overrides: Record<string, unknown> = {}) {
  return { itemVendaId, vendaId: 80, inoveProductId: 51, productName: "PICOLE CAJA", unit: "UN", quantity: 1, soldAt: new Date("2026-11-05T12:00:00Z"), ...overrides };
}

function fakePool(rows: any[]) {
  const sqlQuery = vi.fn().mockResolvedValue({ recordset: rows });
  const close = vi.fn().mockResolvedValue(undefined);
  mocks.createInovePool.mockResolvedValue({ request: () => ({ query: sqlQuery }), close });
  return { sqlQuery, close };
}

beforeEach(() => { vi.resetAllMocks(); });

describe("stock-auto-deduction helpers", () => {
  it("extrai unidades por embalagem de descrições de NF-e", () => {
    expect(extractUnitsPerPackage("PICOLÉ CAJÁ - FRUTA 30 UND")).toBe(30);
    expect(extractUnitsPerPackage("POTE 1,8L FLOCOS PACK 4 UND")).toBe(4);
    expect(extractUnitsPerPackage("CX C/ 24 PICOLÉ CHOCOLATE")).toBe(24);
    expect(extractUnitsPerPackage("SORVETE CHOCOLATE 10 LT")).toBe(1);
    expect(extractUnitsPerPackage("GUARDANAPO")).toBe(1);
  });

  it("normaliza nomes de produtos entre NF-e e PDV INOVE", () => {
    expect(normalizeStockName("PICOLÉ CAJÁ - FRUTA 30 UND")).toBe("picolecajafruta30und");
    expect(normalizeCoreFlavorName("PICOLÉ CAJÁ - FRUTA 30 UND")).toBe("caja");
    expect(normalizeCoreFlavorName("PICOLE CAJA")).toBe("caja");
  });

  it("identifica itens vendidos por quilo ou caixas de 10L para não baixar como unidade", () => {
    expect(isBulkKgSaleItem("SORVETE KG", "KG")).toBe(true);
    expect(isBulkKgSaleItem("SELF SERVICE BUFFET", "UN")).toBe(true);
    expect(isBulkKgSaleItem("SORVETE CHOCOLATE 10 LT", "CX")).toBe(true);
    expect(isBulkKgSaleItem("PICOLE CAJA", "UN")).toBe(false);
    expect(isBulkKgSaleItem("POTE 2L MORANGO", "UN")).toBe(false);
  });
});

describe("baixa automática — regressões de implantação sem DB", () => {
  it("baixa ambos os saldos uma vez e ignora reexecução sequencial", async () => {
    const { state } = fakeDatabase();
    const { close, sqlQuery } = fakePool([sale()]);
    expect(await deductStockFromInoveSales()).toMatchObject({ itemsDeducted: 1 });
    expect(state.prod[0].currentStock).toBe(9);
    expect(state.op[0].currentStock).toBe("9.00");
    expect(await deductStockFromInoveSales()).toMatchObject({ itemsDeducted: 0 });
    expect(state.movements).toHaveLength(1);
    expect(state.opMovements).toHaveLength(1);
    expect(state.logs).toHaveLength(1);
    expect(sqlQuery.mock.calls[0][0]).toMatch(/VEN_ESTORNADO/);
    expect(sqlQuery.mock.calls[0][0]).toContain("v.VEN_DATA_FIM >= '2026-11-05 08:00:00.000'");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("não baixa itens por kg/10L nem grava log definitivo para item sem vínculo", async () => {
    const { state } = fakeDatabase();
    fakePool([sale(1, { unit: "KG" }), sale(2, { inoveProductId: 999, productName: "PRODUTO INEXISTENTE" })]);
    expect(await deductStockFromInoveSales()).toMatchObject({ itemsDeducted: 0, unmatchedItems: 1 });
    expect(state.prod[0].currentStock).toBe(10);
    expect(state.logs).toHaveLength(0);
  });

  it("falha fechada sem marco inicial e não consulta INOVE nem modifica estoque", async () => {
    const { state } = fakeDatabase();
    state.jobs.length = 0;
    fakePool([sale()]);
    await expect(deductStockFromInoveSales()).rejects.toThrow("PRECONDITION_FAILED");
    expect(mocks.createInovePool).not.toHaveBeenCalled();
    expect(state.logs).toHaveLength(0);
    expect(state.prod[0].currentStock).toBe(10);
  });

  it.each(["cx", "pct", "bld", "un legado"])("recusa saldo operacional não convertido (%s)", async (unit) => {
    const { state } = fakeDatabase();
    state.op[0].unit = unit === "un legado" ? "un" : unit;
    state.op[0].unitsPerPackage = 1;
    fakePool([sale()]);
    expect(await deductStockFromInoveSales()).toMatchObject({ itemsDeducted: 0, unmatchedItems: 1 });
    expect(state.prod[0].currentStock).toBe(10);
    expect(state.op[0].currentStock).toBe("10.00");
    expect(state.logs).toHaveLength(0);
  });

  it("não escolhe primeiro candidato quando core tem múltiplos vínculos possíveis", async () => {
    const { state } = fakeDatabase();
    state.prod[0].name = "PICOLÉ CAJÁ - FRUTA 30 UND";
    state.prod[0].inoveProductId = null as any;
    state.prod.push({ ...state.prod[0], id: 3, name: "PICOLÉ CAJÁ - CREME 20 UND" });
    state.op.length = 0;
    fakePool([sale()]);
    expect(await deductStockFromInoveSales()).toMatchObject({ itemsDeducted: 0, unmatchedItems: 1 });
    expect(state.logs).toHaveLength(0);
  });

  it("catálogo INOVE não transforma core ambíguo em vínculo explícito arbitrário", async () => {
    const { state } = fakeDatabase();
    state.prod[0].inoveProductId = null as any;
    state.op[0].inoveProductId = null as any;
    fakePool([
      { id: 51, codigo: "51", nome: "PICOLÉ CAJÁ - CREME", unidade: "UN", precoVenda: 4, precoCusto: 2 },
      { id: 52, codigo: "52", nome: "PICOLÉ CAJÁ - FRUTA", unidade: "UN", precoVenda: 5, precoCusto: 3 },
    ]);
    expect(await syncInoveCatalogLinks()).toMatchObject({ linkedProducts: 0, linkedOperational: 0 });
    expect(state.prod[0].inoveProductId).toBeNull();
    expect(state.op[0].inoveProductId).toBeNull();
  });

  it("erro após claim reverte log, ambos os saldos e movimentos, permitindo retry", async () => {
    const { state, failOperationalUpdate } = fakeDatabase();
    fakePool([sale()]);
    failOperationalUpdate(true);
    await expect(deductStockFromInoveSales()).rejects.toThrow("Falha simulada após claim");
    expect(state.logs).toHaveLength(0);
    expect(state.movements).toHaveLength(0);
    expect(state.opMovements).toHaveLength(0);
    expect(state.prod[0].currentStock).toBe(10);
    expect(state.op[0].currentStock).toBe("10.00");
    failOperationalUpdate(false);
    expect(await deductStockFromInoveSales()).toMatchObject({ itemsDeducted: 1 });
    expect(state.prod[0].currentStock).toBe(9);
    expect(state.op[0].currentStock).toBe("9.00");
    expect(state.logs).toHaveLength(1);
  });

  it("não repete baixa após falha no INSERT do log e retry", async () => {
    const { state, onLog } = fakeDatabase();
    let attempts = 0;
    onLog(async () => { if (++attempts === 1) throw new Error("Falha simulada ao gravar log"); });
    fakePool([sale()]);
    await expect(deductStockFromInoveSales()).rejects.toThrow("Falha simulada ao gravar log");
    await deductStockFromInoveSales();
    expect(state.prod[0].currentStock).toBe(9);
    expect(state.op[0].currentStock).toBe("9.00");
    expect(state.movements).toHaveLength(1);
  });

  it("índice único impede segunda baixa concorrente, não só o segundo log", async () => {
    const { state, onLog, onOperationalRead } = fakeDatabase();
    let release!: () => void;
    let reached!: () => void;
    const reachedFirstLog = new Promise<void>((resolve) => { reached = resolve; });
    const firstLogGate = new Promise<void>((resolve) => { release = resolve; });
    let secondRead!: () => void;
    const secondReady = new Promise<void>((resolve) => { secondRead = resolve; });
    let reads = 0;
    onOperationalRead(async () => { if (++reads === 2) secondRead(); });
    let calls = 0;
    onLog(async () => { if (++calls === 1) { reached(); await firstLogGate; } });
    fakePool([sale()]);
    const first = deductStockFromInoveSales().then(() => undefined, (error) => error);
    await reachedFirstLog;
    const second = deductStockFromInoveSales();
    await secondReady;
    release();
    await Promise.all([first, second]);
    expect(state.prod[0].currentStock).toBe(9);
    expect(state.op[0].currentStock).toBe("9.00");
    expect(state.movements).toHaveLength(1);
    expect(state.logs).toHaveLength(1);
  });

  it("preserva duas baixas distintas concorrentes sem lost update de saldo", async () => {
    const { state, onOperationalRead } = fakeDatabase();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let reads = 0;
    onOperationalRead(async () => { if (++reads === 2) release(); await gate; });
    let queries = 0;
    mocks.createInovePool.mockResolvedValue({
      request: () => ({ query: async () => ({ recordset: [sale(++queries)] }) }),
      close: vi.fn().mockResolvedValue(undefined),
    });
    await Promise.all([deductStockFromInoveSales(), deductStockFromInoveSales()]);
    expect(state.logs).toHaveLength(2);
    expect(state.prod[0].currentStock).toBe(8);
    expect(state.op[0].currentStock).toBe("8.00");
  });

  it("não produz movimento cuja quantidade difere da variação do saldo", async () => {
    const { state } = fakeDatabase();
    state.prod[0].currentStock = 1;
    state.op[0].currentStock = "1.00";
    fakePool([sale(1, { quantity: 3 })]);
    await deductStockFromInoveSales();
    for (const movement of state.movements) {
      expect(movement.previousStock - movement.newStock).toBe(movement.quantity);
    }
    for (const movement of state.opMovements) {
      expect(Number(movement.previousStock) - Number(movement.newStock)).toBe(Number(movement.quantity));
    }
  });

  it("recusa quantidade fracionária para produto em unidade em vez de arredondar silenciosamente", async () => {
    const { state } = fakeDatabase();
    fakePool([sale(1, { quantity: 0.2 })]);
    await deductStockFromInoveSales();
    expect(state.prod[0].currentStock).toBe(10);
    expect(state.op[0].currentStock).toBe("10.00");
    expect(state.logs).toHaveLength(0);
  });

  it("não vincula automaticamente picolé a sorvete só pelo sabor", async () => {
    const { state } = fakeDatabase();
    state.prod[0].name = "SORVETE CAJA";
    state.prod[0].inoveProductId = 999;
    state.op[0].name = "SORVETE CAJA";
    state.op[0].inoveProductId = 999;
    fakePool([sale()]);
    await deductStockFromInoveSales();
    expect(state.prod[0].currentStock).toBe(10);
    expect(state.logs).toHaveLength(0);
  });
});

describe("NF-e — regressões de implantação verificadas com mocks", () => {
  it("preserva conversão nominal de duas caixas para sessenta unidades após revisão", async () => {
    const { db, state } = fakeDatabase();
    const result = await confirmPurchaseInvoiceStock(db, 20, 42);
    expect(result).toMatchObject({ success: true, operationalEntries: 1 });
    expect(state.prod[0].currentStock).toBe(70);
    expect(state.op[0]).toMatchObject({ currentStock: "70.00", referencePrice: "3.00" });
    expect(state.movements[0]).toMatchObject({ quantity: 60, unitCost: "3.00" });
    await expect(confirmPurchaseInvoiceStock(db, 20, 42)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.movements).toHaveLength(1);
  });

  it("exige revisão humana explícita, não só status extracted vindo da IA", async () => {
    const { db, state } = fakeDatabase();
    state.invoices[0].reviewedBy = null;
    state.invoices[0].reviewedAt = null;
    await expect(confirmPurchaseInvoiceStock(db, 20, 42)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.movements).toHaveLength(0);
  });

  it("bloqueia review_required e documentos de devolução sem alterar saldo", async () => {
    const { db, state } = fakeDatabase();
    state.invoices[0].status = "review_required";
    await expect(confirmPurchaseInvoiceStock(db, 20, 42)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    state.invoices[0].status = "extracted";
    state.invoices[0].operationNature = "DEVOLUCAO";
    await expect(confirmPurchaseInvoiceStock(db, 20, 42)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.prod[0].currentStock).toBe(10);
    expect(state.movements).toHaveLength(0);
  });

  it("não multiplica novamente por 30 quando a NF-e já informa quantidade em UN", async () => {
    const { db, state } = fakeDatabase();
    state.items[0].quantity = "60.000";
    state.items[0].unit = "UN";
    state.items[0].unitPrice = "3.0000";
    (state.items[0] as any).rawData = { stockConversionFactor: 1 };
    await confirmPurchaseInvoiceStock(db, 20, 42);
    expect(state.prod[0].currentStock).toBe(70);
    expect(state.op[0].currentStock).toBe("70.00");
    expect(state.movements[0].unitCost).toBe("3.00");
  });

  it("recusa UN com embalagem na descrição enquanto o fator não for aprovado", async () => {
    const { db, state } = fakeDatabase();
    state.items[0].unit = "UN";
    (state.items[0] as any).rawData = {};
    await expect(confirmPurchaseInvoiceStock(db, 20, 42)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.prod[0].currentStock).toBe(10);
    expect(state.movements).toHaveLength(0);
  });

  it("não trata medida 0,5 UN da descrição como embalagem de 5 unidades", () => {
    expect(extractUnitsPerPackage("EMBALAGEM 0,5 UN")).toBe(1);
  });
});
