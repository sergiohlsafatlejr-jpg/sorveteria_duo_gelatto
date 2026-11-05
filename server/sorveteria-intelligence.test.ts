import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import {
  finBanks, finGoalExtraCosts, finGoals,
  finReceivables, finTransactions, purchaseInvoices, redeSalesImport,
} from "../drizzle/schema";

// Nenhum teste carrega a implementação de getDb ou abre conexão real.
const mocks = vi.hoisted(() => ({
  getDb: vi.fn<() => Promise<any>>(),
  settings: vi.fn<() => Promise<any>>(),
  revenues: vi.fn<() => Promise<any[]>>(),
  createTransaction: vi.fn(),
  forecastDays: vi.fn(),
  forecastMonth: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./db.fin", async (importOriginal) => ({
  ...await importOriginal<typeof import("./db.fin")>(),
  getForecastSettings: mocks.settings,
  getDailyRevenues: mocks.revenues,
  createFinTransaction: mocks.createTransaction,
}));
vi.mock("./forecast-calculation", async (importOriginal) => ({
  ...await importOriginal<typeof import("./forecast-calculation")>(),
  buildForecastDays: mocks.forecastDays,
  buildForecastMonth: mocks.forecastMonth,
}));

import {
  createPayablesFromPurchaseInvoice, getReceivablesForecastAndLiquidity, getWeatherSalesIntelligence,
  getWeeklyPayablesBreakEven, getWeeklyTeamGoalsPlan,
} from "./sorveteria-intelligence";
import { finRouter } from "./routers/fin";
import {
  calculateForecastDay, calculateThermalMultiplier, DEFAULT_FORECAST_SETTINGS,
} from "./forecast-calculation";
const actualForecast = await vi.importActual<typeof import("./forecast-calculation")>("./forecast-calculation");

// Regressões corrigidas: todas expressam o resultado correto e usam somente
// fixtures em memória, sem banco, API ou navegador reais.
const originalTz = process.env.TZ;
let rows: Map<object, any[]>;
let select: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

function dateAtNoon(date: string) { return new Date(`${date}T12:00:00Z`); }
function forecastDay(date: string, amount = 1000, weather: any = null) {
  return { ...calculateForecastDay(date, DEFAULT_FORECAST_SETTINGS, null, null, "2026-11-05"),
    projectedAmount: amount, thermalAdjustedAmount: amount, weather };
}
function monthFixture(year: number, month: number, amount = 100) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    forecastDay(`${prefix}-${String(i + 1).padStart(2, "0")}`, amount));
  return { year, month, daysInMonth, days, summary: {
    totalProjected: days.reduce((sum, d) => sum + d.projectedAmount, 0),
    totalThermalProjected: days.reduce((sum, d) => sum + d.thermalAdjustedAmount, 0),
  } };
}
function liquidityDay(result: Awaited<ReturnType<typeof getReceivablesForecastAndLiquidity>>, date: string) {
  const day = result.days.find(d => d.date === date);
  expect(day, `dia ${date} deve existir`).toBeDefined();
  return day!;
}
function context(role: string | null): TrpcContext {
  return { user: role ? { id: 1, role } : null, req: {}, res: {} } as TrpcContext;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.TZ = "UTC";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T15:00:00Z"));
  rows = new Map();
  // Fluent query mock: table rows are fixtures already selected for the period.
  select = vi.fn(() => ({ from: (table: object) => {
    const q: any = {};
    q.where = vi.fn(() => q);
    q.leftJoin = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.then = (resolve: any, reject: any) => Promise.resolve(rows.get(table) ?? []).then(resolve, reject);
    return q;
  } }));
  mocks.getDb.mockResolvedValue({ select });
  mocks.settings.mockResolvedValue(null);
  mocks.revenues.mockResolvedValue([]);
  mocks.forecastDays.mockImplementation(async (dates: string[]) => dates.map(date => forecastDay(date)));
  mocks.forecastMonth.mockImplementation(async (year: number, month: number) => monthFixture(year, month));
  fetchMock = vi.fn(async () => { throw new Error("Rede externa proibida neste teste"); });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
afterAll(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz; });

describe("admin-only nos cinco endpoints de inteligência", () => {
  const endpoints = [
    ["weeklyBreakEven", (c: ReturnType<typeof finRouter.createCaller>) => c.intelligence.weeklyBreakEven({ year: 2026, month: 11 })],
    ["receivablesLiquidityForecast", (c: ReturnType<typeof finRouter.createCaller>) => c.intelligence.receivablesLiquidityForecast({ horizonDays: 7 })],
    ["weatherSalesIntelligence", (c: ReturnType<typeof finRouter.createCaller>) => c.intelligence.weatherSalesIntelligence({ year: 2026, month: 11 })],
    ["weeklyTeamGoals", (c: ReturnType<typeof finRouter.createCaller>) => c.intelligence.weeklyTeamGoals({ month: "2026-11" })],
    ["createPayablesFromInvoice", (c: ReturnType<typeof finRouter.createCaller>) => c.intelligence.createPayablesFromInvoice({ invoiceId: 1, installments: 1, firstDueDate: "2026-11-05", intervalDays: 28 })],
  ] as const;
  it.each(endpoints)("nega %s para todos os perfis não administrativos antes de consultar dados", async (_name, call) => {
    for (const role of ["manager", "attendant", "user", "unknown", null]) {
      await expect(call(finRouter.createCaller(context(role)))).rejects.toMatchObject({
        code: role === null ? "UNAUTHORIZED" : "FORBIDDEN",
      });
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.createTransaction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("permite consulta de liquidez ao administrador com dados fictícios", async () => {
    const result = await finRouter.createCaller(context("admin")).intelligence.receivablesLiquidityForecast({ horizonDays: 7 });
    expect(result.days).toHaveLength(7);
    expect(mocks.getDb).toHaveBeenCalledOnce();
  });
});

describe("liquidez D+0 / D+1 útil / D+30", () => {
  it("aplica mix e taxas sem antecipar débito e crédito", async () => {
    const result = await getReceivablesForecastAndLiquidity(1, { horizonDays: 45 });
    const today = liquidityDay(result, "2026-11-05");
    expect(today.projectedPixCashD0).toBe(420);
    expect(today.projectedDebitD1).toBe(0);
    expect(today.projectedCreditD30).toBe(0);
    expect(liquidityDay(result, "2026-11-06").projectedDebitD1).toBe(325.41);
    expect(liquidityDay(result, "2026-12-04").projectedCreditD30).toBe(0);
    expect(liquidityDay(result, "2026-12-05").projectedCreditD30)
      .toBe(Math.round(1000 * 0.25 * (1 - 3.19 / 100) * 100) / 100);
  });
  it("liquida débitos de sexta, sábado e domingo na segunda-feira", async () => {
    const result = await getReceivablesForecastAndLiquidity(1, { horizonDays: 7 });
    expect(liquidityDay(result, "2026-11-07").projectedDebitD1).toBe(0);
    expect(liquidityDay(result, "2026-11-08").projectedDebitD1).toBe(0);
    expect(liquidityDay(result, "2026-11-09").projectedDebitD1)
      .toBe(Math.round(3 * 1000 * 0.33 * (1 - 1.39 / 100) * 100) / 100);
  });
  it("liquida Rede passada pelo valor líquido, excluindo Pix e cancelamento explícito", async () => {
    rows.set(redeSalesImport, [
      { dataDaVenda: dateAtNoon("2026-11-04"), modalidade: "DÉBITO", valorLiquido: "98.61" },
      { dataDaVenda: dateAtNoon("2026-10-06"), modalidade: "CRÉDITO", valorLiquido: "96.81" },
      { dataDaVenda: dateAtNoon("2026-11-04"), modalidade: "PIX", valorLiquido: "999" },
      { dataDaVenda: dateAtNoon("2026-11-04"), modalidade: "DÉBITO", valorLiquido: "999", canceladaPeloEstabelecimento: true },
    ]);
    const result = await getReceivablesForecastAndLiquidity(1, { horizonDays: 7 });
    expect(liquidityDay(result, "2026-11-05").pastCardSettlements).toBe(195.42);
  });
  it("combina títulos pendentes e saídas, sem contar títulos já recebidos/pagos", async () => {
    rows.set(finBanks, [{ initialBalance: "100" }]);
    rows.set(finReceivables, [
      { dueDate: dateAtNoon("2026-11-05"), amount: "50", isReceived: false },
      { dueDate: dateAtNoon("2026-11-05"), amount: "999", isReceived: true },
    ]);
    rows.set(finTransactions, [
      { dueDate: dateAtNoon("2026-11-05"), amount: "600", isPaid: false },
      { dueDate: dateAtNoon("2026-11-05"), amount: "999", isPaid: true },
    ]);
    const result = await getReceivablesForecastAndLiquidity(1, { horizonDays: 7 });
    expect(liquidityDay(result, "2026-11-05")).toMatchObject({
      manualReceivables: 50, totalInflow: 470, payablesOutflow: 600,
      netFlow: -130, cumulativeBalance: -30, isCashGapAlert: true,
    });
    expect(result.summary.totalPayablesOutflow).toBe(600);
    expect(result.summary.negativeDaysCount).toBe(1);
  });
  it("REGRESSÃO: crédito Rede com prazo contratado D+1 não deve ser tratado como D+30", async () => {
    rows.set(redeSalesImport, [{ dataDaVenda: dateAtNoon("2026-11-04"), modalidade: "CRÉDITO",
      prazoDeRecebimento: "disponível em D+1", valorLiquido: "96.81", statusDaVenda: "aprovada" }]);
    const result = await getReceivablesForecastAndLiquidity(1, { horizonDays: 7 });
    expect(liquidityDay(result, "2026-11-05").pastCardSettlements).toBe(96.81);
  });
  it("REGRESSÃO: status Rede cancelada não pode gerar recebimento se o booleano estiver ausente", async () => {
    rows.set(redeSalesImport, [{ dataDaVenda: dateAtNoon("2026-11-04"), modalidade: "DÉBITO",
      statusDaVenda: "cancelada", canceladaPeloEstabelecimento: false, valorLiquido: "100" }]);
    const result = await getReceivablesForecastAndLiquidity(1, { horizonDays: 7 });
    expect(liquidityDay(result, "2026-11-05").pastCardSettlements).toBe(0);
  });
  it("REGRESSÃO: API deve rejeitar mix de pagamentos cuja soma é 300%", async () => {
    const caller = finRouter.createCaller(context("admin"));
    await expect(caller.intelligence.receivablesLiquidityForecast({ horizonDays: 45,
      pixCashSharePct: 100, debitSharePct: 100, creditSharePct: 100,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("REGRESSÃO: vendas reais de hoje não devem somar liquidação à previsão integral do mesmo dia", async () => {
    rows.set(redeSalesImport, [{ dataDaVenda: dateAtNoon("2026-11-05"), modalidade: "DÉBITO", valorLiquido: "325.41" }]);
    const result = await getReceivablesForecastAndLiquidity(1, { horizonDays: 7 });
    const tomorrow = liquidityDay(result, "2026-11-06");
    expect(tomorrow.pastCardSettlements + tomorrow.projectedDebitD1).toBe(325.41);
  });
  it("REGRESSÃO: início da liquidez deve usar a data comercial São Paulo na virada UTC", async () => {
    vi.setSystemTime(new Date("2026-11-06T01:00:00Z"));
    const result = await getReceivablesForecastAndLiquidity(1, { horizonDays: 7 });
    expect(result.days[0].date).toBe("2026-11-05");
  });
});

describe("break-even semanal", () => {
  it("divide saídas pela margem e converte em tickets, kg e picolés", async () => {
    rows.set(finTransactions, [{ dueDate: dateAtNoon("2026-11-02"), amount: "620", isPaid: false, categoryName: "Aluguel" }]);
    const result = await getWeeklyPayablesBreakEven(1, { year: 2026, month: 11,
      contributionMarginPct: 62, avgTicket: 25, avgSorveteKgPrice: 50, avgPicolePrice: 5 });
    expect(result.totalBreakEvenRevenue).toBe(1000);
    expect(result.weeks[0]).toMatchObject({ payablesTotal: 620, pendingTotal: 620,
      breakEvenRevenue: 1000, dailyBreakEven: 143, requiredTickets: 40,
      requiredSorveteKg: 20, requiredPicoles: 200, monWedSharePct: 100, hasCashCrunchAlert: true });
  });
  it("rateia extras igualmente entre quatro faixas e mantém última faixa até o fim do mês", async () => {
    rows.set(finGoalExtraCosts, [{ amount: "400" }]);
    const result = await getWeeklyPayablesBreakEven(1, { year: 2026, month: 11 });
    expect(result.weeks.map(w => w.payablesTotal)).toEqual([100, 100, 100, 100]);
    expect(result.weeks[3].endDate).toBe("2026-11-30");
    expect(result.totalPayables).toBe(400);
  });
  it("usa receita realizada zero no lugar da previsão quando o dia foi registrado", async () => {
    mocks.revenues.mockResolvedValue([{ revenueDate: "2026-11-01", realAmount: "0" }]);
    const result = await getWeeklyPayablesBreakEven(1, { year: 2026, month: 11 });
    expect(result.weeks[0].projectedRevenue).toBe(700);
    expect(result.weeks[0].effectiveRevenue).toBe(600);
    expect(result.weeks[0].coveragePct).toBe(100);
  });
});

describe("metas semanais e resumo WhatsApp", () => {
  it("usa maior cenário salvo e permite override explícito", async () => {
    rows.set(finGoals, [{ targetRevenue: "3000" }, { targetRevenue: "4500" }]);
    expect((await getWeeklyTeamGoalsPlan(1, { month: "2026-12" })).targetMonthlyRevenue).toBe(4500);
    expect((await getWeeklyTeamGoalsPlan(1, { month: "2026-12", targetMonthlyRevenue: 6000 })).targetMonthlyRevenue).toBe(6000);
  });
  it("desdobra mês futuro sem perder valor e inclui metas táticas no texto copiado", async () => {
    const result = await getWeeklyTeamGoalsPlan(1, { month: "2026-12", targetMonthlyRevenue: 3100, targetTicket: 25 });
    expect(result.weeks.reduce((sum, w) => sum + w.recoveryGoal, 0)).toBe(3100);
    expect(result.weeks[0]).toMatchObject({ originalGoal: 700, recoveryGoal: 700,
      targetTicketsCount: 28, takeHomeShareTargetPct: 18, takeHomeRevenueTarget: 126, takeHomePotesTarget: 3 });
    expect(result.weeks[0].whatsappSummaryText).toContain("META DA SEMANA — DUO GELATTO");
    expect(result.weeks[0].whatsappSummaryText).toContain("Meta de Ticket Médio");
    expect(result.weeks[0].whatsappSummaryText).toContain("Leve para Casa");
    expect(result.weeks[0].whatsappSummaryText).toContain("700,00");
  });
  it("aumenta foco Leve para Casa quando há dois dias chuvosos/nublados na semana", async () => {
    const fixture = monthFixture(2026, 12);
    fixture.days[0].weather = { label: "rain", tempMax: 28 };
    fixture.days[1].weather = { label: "cloud", tempMax: 28 };
    mocks.forecastMonth.mockResolvedValue(fixture);
    const result = await getWeeklyTeamGoalsPlan(1, { month: "2026-12", targetMonthlyRevenue: 3100 });
    expect(result.weeks[0].takeHomeShareTargetPct).toBe(28);
    expect(result.weeks[0].tacticalFocus).toContain("Potes 1,5L/2L");
    expect(result.weeks[1].takeHomeShareTargetPct).toBe(18);
  });
  it("REGRESSÃO: metas recuperadas mais realizado não podem cobrar novamente déficit de dias concluídos", async () => {
    mocks.revenues.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({
      revenueDate: `2026-11-0${i + 1}`, realAmount: "50",
    })));
    const result = await getWeeklyTeamGoalsPlan(1, { month: "2026-11", targetMonthlyRevenue: 3000 });
    const sumOfWeeklyGoals = result.weeks.reduce((sum, w) => sum + w.recoveryGoal, 0);
    const maxDailyRoundingError = result.weeks.flatMap(w => w.days).length / 2;
    expect(Math.abs(sumOfWeeklyGoals - 3000)).toBeLessThanOrEqual(maxDailyRoundingError);
  });
  it("REGRESSÃO: primeira venda de hoje não significa dia concluído para recuperação", async () => {
    mocks.revenues.mockResolvedValue([{ revenueDate: "2026-11-05", realAmount: "10" }]);
    const result = await getWeeklyTeamGoalsPlan(1, { month: "2026-11", targetMonthlyRevenue: 3000 });
    const today = result.weeks.flatMap(w => w.days).find(d => d.date === "2026-11-05")!;
    expect(today.isCompletedDay).toBe(false);
  });
});

describe("clima e consistência das regras", () => {
  it.each([[23.9, 0.82], [24, 0.92], [26.9, 0.92], [27, 1], [30, 1], [34, 1.12], [36, 1.18], [50, 1.18], [NaN, 1]])(
    "elasticidade térmica %s°C = %s", (temperature, multiplier) => {
      expect(calculateThermalMultiplier(temperature)).toBe(multiplier);
    },
  );
  it("chuva intensa no pico reduz receita antes de aplicar temperatura", () => {
    const day = calculateForecastDay("2026-11-05", DEFAULT_FORECAST_SETTINGS, null,
      { code: 61, tempMax: 34, precip: 10, precipProb: 80, peakHoursRainProb: 80, peakHoursPrecip: 8 }, "2026-11-05");
    expect(day.projectedAmount).toBe(1400);
    expect(day.thermalAdjustedAmount).toBe(1568);
    expect(day.weather?.tacticalRecommendation).toContain("Leve para Casa");
  });
  it("relatório agrupa faturamento por calor e compara com previsão térmica", async () => {
    mocks.revenues.mockResolvedValue([{ revenueDate: "2026-11-05", realAmount: "2240" }]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ daily: {
      time: ["2026-11-05"], weathercode: [0], temperature_2m_max: [34],
      precipitation_sum: [0], precipitation_probability_max: [0],
    } }) });
    const result = await getWeatherSalesIntelligence(1, { year: 2026, month: 11 });
    expect(result.days[4]).toMatchObject({ weatherExpected: 2240, operationalEfficiencyPct: 100, diagnosis: "on_track" });
    expect(result.thermalCurve[0]).toMatchObject({ days: 1, avgRealRevenue: 2240, efficiencyPct: 100 });
  });
  it("REGRESSÃO: sem clima disponível não deve emitir diagnóstico operacional atribuído ao clima", async () => {
    mocks.revenues.mockResolvedValue([{ revenueDate: "2026-11-05", realAmount: "500" }]);
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    const result = await getWeatherSalesIntelligence(1, { year: 2026, month: 11 });
    expect(result.days[4].diagnosis).toBe("pending");
  });
  it("REGRESSÃO: relatório e forecast devem concordar sobre chuva fora do pico", async () => {
    fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () =>
      url.includes("brasilapi") ? [] : ({ daily: {
        time: ["2026-11-05"], weathercode: [61], temperature_2m_max: [28],
        precipitation_sum: [10], precipitation_probability_max: [80],
      }, hourly: { time: ["2026-11-05T02:00", "2026-11-05T13:00", "2026-11-05T20:00"],
        precipitation_probability: [80, 10, 10], precipitation: [10, 0, 0] } }),
    }));
    const forecast = await actualForecast.buildForecastDays(["2026-11-05"], DEFAULT_FORECAST_SETTINGS);
    const intel = await getWeatherSalesIntelligence(1, { year: 2026, month: 11 });
    expect(intel.days[4].weatherExpected).toBe(forecast[0].thermalAdjustedAmount);
  });
  it("REGRESSÃO: rainFactor zero salvo não pode virar o default 0,7", async () => {
    mocks.settings.mockResolvedValue({ ...DEFAULT_FORECAST_SETTINGS, rainFactor: "0" });
    await getReceivablesForecastAndLiquidity(1, { horizonDays: 7 });
    expect(mocks.forecastDays.mock.calls[0][1].rainFactor).toBe(0);
  });
});
