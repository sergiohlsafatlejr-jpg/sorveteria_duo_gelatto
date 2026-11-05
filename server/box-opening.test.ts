import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boxOpenTracking, boxStock, boxStockMovements, inoveConnectorConfig } from "../drizzle/schema";

// Nenhum módulo de conexão real é carregado nestes testes.
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), createInovePool: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./routers/inove", () => ({ createInovePool: mocks.createInovePool }));

import { confirmBoxOpening, detectBoxOpenings } from "./box-opening";

function query(rows: any[]) {
  let current = structuredClone(rows);
  const chain: any = {
    where: () => chain,
    orderBy: () => chain,
    limit: (n: number) => { current = current.slice(0, n); return chain; },
    for: () => chain,
    then: (resolve: any, reject: any) => Promise.resolve(current).then(resolve, reject),
  };
  return chain;
}

function fakeDatabase() {
  const state = {
    boxes: [{ id: 1, name: "SORVETE CHOCOLATE 10 LT", active: true, inoveProductId: 51, rendimentoKg: "5.80", currentStock: 3 }],
    tracking: [{ boxId: 1, accumulatedKg: "12.500", suggestionPending: true, lastOpeningAt: new Date("2026-11-01T12:00:00Z"), lastComputedAt: new Date("2026-11-05T12:00:00Z") }],
    movements: [] as any[],
  };
  let failTrackingUpdate = false;
  const adapter: any = {
    select: () => ({ from: (table: unknown) => {
      if (table === boxStock) return query(state.boxes);
      if (table === boxOpenTracking) return query(state.tracking);
      if (table === boxStockMovements) return query(state.movements);
      if (table === inoveConnectorConfig) return query([{ active: true }]);
      throw new Error("Tabela inesperada no mock");
    } }),
    insert: (table: unknown) => ({ values: async (value: any) => {
      if (table === boxStockMovements) state.movements.push(structuredClone(value));
      else if (table === boxOpenTracking) state.tracking.push(structuredClone(value));
      else throw new Error("INSERT inesperado no mock");
    } }),
    update: (table: unknown) => ({ set: (value: any) => ({ where: async () => {
      if (table === boxStock) Object.assign(state.boxes[0], value);
      else if (table === boxOpenTracking) {
        if (failTrackingUpdate) throw new Error("Falha simulada no tracking");
        Object.assign(state.tracking[0], value);
      } else throw new Error("UPDATE inesperado no mock");
    } }) }),
  };
  // Serializa transações como os locks FOR UPDATE e simula rollback real.
  let queue = Promise.resolve();
  const db: any = {
    ...adapter,
    transaction: vi.fn((callback: any) => {
      const run = queue.then(async () => {
        const snapshot = structuredClone(state);
        try { return await callback(adapter); }
        catch (error) { Object.assign(state, snapshot); throw error; }
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    }),
  };
  mocks.getDb.mockResolvedValue(db);
  return { db, state, failTracking: () => { failTrackingUpdate = true; } };
}

function fakePool(queryFn: (sql: string) => Promise<any>) {
  const sqlQuery = vi.fn(queryFn);
  const close = vi.fn().mockResolvedValue(undefined);
  mocks.createInovePool.mockResolvedValue({ request: () => ({ query: sqlQuery }), close });
  return { sqlQuery, close };
}

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

describe("abertura de caixas — regressões de implantação sem DB", () => {
  it("baixa uma caixa e preserva excedente que ainda exige segunda abertura", async () => {
    const { db, state } = fakeDatabase();
    const result = await confirmBoxOpening(1, 42);
    expect(result).toEqual({ success: true, newStock: 2, carryoverKg: 6.7, stillPending: true });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(state.movements).toEqual([expect.objectContaining({ boxId: 1, quantity: 1, previousStock: 3, newStock: 2, userId: 42 })]);
    expect(state.tracking[0]).toMatchObject({ accumulatedKg: "6.700", suggestionPending: true });
  });

  it("desfaz saída e saldo se atualizar o tracking falhar na transação", async () => {
    const { state, failTracking } = fakeDatabase();
    failTracking();
    await expect(confirmBoxOpening(1, 42)).rejects.toThrow("Falha simulada no tracking");
    expect(state.boxes[0].currentStock).toBe(3);
    expect(state.movements).toHaveLength(0);
  });

  it("não confirma duas vezes uma única sugestão mesmo com duas chamadas concorrentes", async () => {
    const { state } = fakeDatabase();
    state.tracking[0].accumulatedKg = "5.800";
    const results = await Promise.allSettled([confirmBoxOpening(1, 42), confirmBoxOpening(1, 42)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(state.movements).toHaveLength(1);
    expect(state.boxes[0].currentStock).toBe(2);
  });

  it.each(["sem sugestão", "sem estoque", "inativa", "sem rendimento", "sem tracking"])(
    "recusa abertura %s sem produzir saída fictícia", async (scenario) => {
      const { state } = fakeDatabase();
      if (scenario === "sem sugestão") state.tracking[0].suggestionPending = false;
      if (scenario === "sem estoque") state.boxes[0].currentStock = 0;
      if (scenario === "inativa") state.boxes[0].active = false;
      if (scenario === "sem rendimento") state.boxes[0].rendimentoKg = "0";
      if (scenario === "sem tracking") state.tracking = [];
      await expect(confirmBoxOpening(1, 42)).rejects.toBeInstanceOf(Error);
      expect(state.movements).toHaveLength(0);
    },
  );

  it("exclui vendas estornadas da soma de kg", async () => {
    const { state } = fakeDatabase();
    state.tracking[0].accumulatedKg = "0.000";
    state.tracking[0].suggestionPending = false;
    // Fixture: 2 kg válidos e 4 kg de venda VEN_ESTORNADO=S.
    // O mock respeita a presença do predicado, não consulta SQL Server.
    fakePool(async (sql) => ({ recordset: [{ kg: /VEN_ESTORNADO/.test(sql) ? 2 : 6 }] }));
    await detectBoxOpenings();
    expect(state.tracking[0]).toMatchObject({ accumulatedKg: "2.000", suggestionPending: false });
  });

  it("não soma novamente venda exatamente no cursor em reexecução no mesmo segundo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T13:00:00.000Z"));
    const { state } = fakeDatabase();
    state.tracking[0].accumulatedKg = "0.000";
    state.tracking[0].suggestionPending = false;
    state.tracking[0].lastComputedAt = new Date("2026-11-05T12:00:00Z");
    const soldAt = "2026-11-05 10:00:00.000";
    const { sqlQuery } = fakePool(async (sql) => {
      const lower = sql.match(/VEN_DATA_FIM\s*(>=|>)\s*'([^']+)'/);
      if (!lower) throw new Error("Mock esperava limite inferior de VEN_DATA_FIM");
      const matchesLower = lower[1] === ">=" ? soldAt >= lower[2] : soldAt > lower[2];
      const upper = sql.match(/VEN_DATA_FIM\s*(<=|<)\s*'([^']+)'/);
      const matchesUpper = !upper || (upper[1] === "<=" ? soldAt <= upper[2] : soldAt < upper[2]);
      return { recordset: [{ kg: matchesLower && matchesUpper ? 2 : 0 }] };
    });
    await detectBoxOpenings();
    await detectBoxOpenings();
    expect(sqlQuery.mock.calls[0][0]).toMatch(/VEN_DATA_FIM > '2026-11-05 09:00:00\.000'/);
    expect(sqlQuery.mock.calls[0][0]).toMatch(/VEN_DATA_FIM <= '2026-11-05 10:00:00\.000'/);
    expect(state.tracking[0].accumulatedKg).toBe("2.000");
  });

  it("não deixa a detecção sobrescrever carryover após confirmação concorrente", async () => {
    const { state } = fakeDatabase();
    state.tracking[0].accumulatedKg = "5.800";
    let release!: (result: any) => void;
    let started!: () => void;
    const queryStarted = new Promise<void>((resolve) => { started = resolve; });
    fakePool(() => new Promise((resolve) => { release = resolve; started(); }));
    const detection = detectBoxOpenings();
    await queryStarted;
    const confirmation = confirmBoxOpening(1, 42);
    release({ recordset: [{ kg: 1 }] });
    await Promise.all([detection, confirmation]);
    expect(state.tracking[0]).toMatchObject({ accumulatedKg: "1.000", suggestionPending: false });
    expect(state.movements).toHaveLength(1);
  });
});
