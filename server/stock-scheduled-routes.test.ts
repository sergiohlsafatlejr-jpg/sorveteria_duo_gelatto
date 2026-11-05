import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, RequestHandler, Response } from "express";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { inoveConnectorConfig, stockScheduledJobs } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(), getUserInfoWithJwt: vi.fn(), authenticateRequest: vi.fn(),
  getDb: vi.fn(), getUserByOpenId: vi.fn(), upsertUser: vi.fn(),
  deductStockFromInoveSales: vi.fn(), detectBoxOpenings: vi.fn(), notifyOwner: vi.fn(),
}));
vi.mock("./_core/sdk", () => ({ sdk: {
  verifySession: mocks.verifySession,
  getUserInfoWithJwt: mocks.getUserInfoWithJwt,
  authenticateRequest: mocks.authenticateRequest,
} }));
vi.mock("./_core/env", () => ({ ENV: { appId: "project-test" } }));
vi.mock("./db", () => ({ getDb: mocks.getDb, getUserByOpenId: mocks.getUserByOpenId, upsertUser: mocks.upsertUser }));
vi.mock("./stock-auto-deduction", () => ({ deductStockFromInoveSales: mocks.deductStockFromInoveSales }));
vi.mock("./box-opening", () => ({ detectBoxOpenings: mocks.detectBoxOpenings }));
vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));
import { boxOpeningsHandler, stockDeductionHandler, stockScheduledRouter } from "./stock-scheduled-routes";

const dialect = new MySqlDialect();
const stockResult = { salesChecked: 1, itemsDeducted: 1, unmatchedItems: 0, message: "Baixa concluída" };
const boxResult = { checked: 1, suggestions: 0, message: "Nenhuma sugestão nova" };
const registry = {
  jobKey: "stock-deduction", scheduleCronTaskUid: "T_stock", enabled: true,
  createdAt: new Date("2026-11-05T12:00:00Z"), updatedAt: new Date("2026-11-05T12:00:00Z"),
};
let rows: Array<typeof registry>;
let connector: { active: boolean } | undefined;
let queries: Array<{ table: unknown; params: unknown[] }>;
let registryFailure: Error | undefined;

async function invoke(handler: RequestHandler, overrides: Partial<Request> = {}) {
  const req = {
    path: handler === stockDeductionHandler ? "/api/scheduled/stock-deduction" : "/api/scheduled/box-openings",
    headers: { cookie: "other=value; app_session_id=cron%2Ejwt" },
    body: { taskUid: "T_attacker", jobKey: "box-noite", hoursBack: 720 },
    ...overrides,
  } as Request;
  let status = 200;
  let body: any;
  const res = {
    status: (code: number) => { status = code; return res; },
    json: (value: unknown) => { body = value; return res; },
  } as Response;
  await handler(req, res, vi.fn());
  return { status, body };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  rows = [{ ...registry }];
  connector = { active: true };
  queries = [];
  registryFailure = undefined;
  mocks.verifySession.mockResolvedValue({ openId: "cron_owner", appId: "project-test", name: "Cron" });
  mocks.getUserInfoWithJwt.mockResolvedValue({ openId: "cron_owner", projectId: "project-test", taskUid: "T_stock" });
  mocks.deductStockFromInoveSales.mockResolvedValue(stockResult);
  mocks.detectBoxOpenings.mockResolvedValue(boxResult);
  mocks.notifyOwner.mockResolvedValue(true);
  mocks.getDb.mockResolvedValue({
    select: () => ({ from: (table: unknown) => {
      let params: unknown[] = [];
      const chain = {
        where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
          params = dialect.sqlToQuery(condition).params;
          return chain;
        },
        limit: async () => {
          queries.push({ table, params });
          if (table === stockScheduledJobs) {
            if (registryFailure) throw registryFailure;
            return rows.filter(row => row.scheduleCronTaskUid === params[0]);
          }
          if (table === inoveConnectorConfig) return connector ? [connector] : [];
          throw new Error("Unexpected table in mock");
        },
      };
      return chain;
    } }),
  });
});

afterEach(() => {
  expect(mocks.authenticateRequest).not.toHaveBeenCalled();
  expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
  expect(mocks.upsertUser).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("callbacks persistentes de estoque", () => {
  it("registra somente POST nos dois caminhos /api/scheduled", () => {
    const routes = stockScheduledRouter.stack.map(layer => ({ path: layer.route.path, methods: layer.route.methods }));
    expect(routes).toEqual([
      { path: "/api/scheduled/stock-deduction", methods: { post: true } },
      { path: "/api/scheduled/box-openings", methods: { post: true } },
    ]);
  });

  it.each([undefined, "app_session_id=invalid"])("rejeita cookie ausente/inválido (%s) com 401 antes de acessar DB", async cookie => {
    mocks.verifySession.mockResolvedValue(null);
    const result = await invoke(stockDeductionHandler, { headers: { cookie } });
    expect(result.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.getUserInfoWithJwt).not.toHaveBeenCalled();
  });

  it.each(["user", "admin"])("rejeita usuário normal mesmo %s", async role => {
    mocks.verifySession.mockResolvedValue({ openId: "real_user", appId: "project-test", name: role, role });
    expect((await invoke(stockDeductionHandler)).status).toBe(403);
    expect(mocks.getUserInfoWithJwt).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejeita appId de outro projeto antes da confirmação remota", async () => {
    mocks.verifySession.mockResolvedValue({ openId: "cron_owner", appId: "another-project", name: "Cron" });
    expect((await invoke(stockDeductionHandler)).status).toBe(403);
    expect(mocks.getUserInfoWithJwt).not.toHaveBeenCalled();
  });

  it.each([
    { openId: "cron_owner", projectId: "other", taskUid: "T_stock" },
    { openId: "cron_other", projectId: "project-test", taskUid: "T_stock" },
    { openId: "admin", projectId: "project-test", taskUid: "T_stock" },
  ])("rejeita resposta remota com identidade/projeto incompatível", async userInfo => {
    mocks.getUserInfoWithJwt.mockResolvedValue(userInfo);
    expect((await invoke(stockDeductionHandler)).status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", " ", " T_stock", 42, "T".repeat(66)])("rejeita taskUid ausente/inválido (%s)", async taskUid => {
    mocks.getUserInfoWithJwt.mockResolvedValue({ openId: "cron_owner", projectId: "project-test", taskUid });
    expect((await invoke(stockDeductionHandler)).status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("usa token decodificado e UID autenticado, ignora payload e fixa janela de 24h", async () => {
    const result = await invoke(stockDeductionHandler);
    expect(result).toEqual({ status: 200, body: { ok: true, taskUid: "T_stock", jobKey: "stock-deduction", result: stockResult } });
    expect(mocks.verifySession).toHaveBeenCalledWith("cron.jwt");
    expect(mocks.getUserInfoWithJwt).toHaveBeenCalledWith("cron.jwt");
    expect(queries[0]).toEqual({ table: stockScheduledJobs, params: ["T_stock"] });
    expect(mocks.deductStockFromInoveSales).toHaveBeenCalledTimes(1);
    expect(mocks.deductStockFromInoveSales).toHaveBeenCalledWith({ hoursBack: 24 });
  });

  it("retorna 2xx orphan sem executar ou consultar conector quando não há registro", async () => {
    rows = [];
    expect(await invoke(stockDeductionHandler)).toEqual({ status: 200, body: { ok: true, skipped: "orphan", taskUid: "T_stock" } });
    expect(queries).toHaveLength(1);
    expect(mocks.deductStockFromInoveSales).not.toHaveBeenCalled();
  });

  it("linha global ainda sem UID não autoriza callback", async () => {
    rows = [{ ...registry, scheduleCronTaskUid: null as unknown as string, enabled: false }];
    expect((await invoke(stockDeductionHandler)).body.skipped).toBe("orphan");
    expect(mocks.deductStockFromInoveSales).not.toHaveBeenCalled();
  });

  it("rejeita registro desabilitado", async () => {
    rows[0].enabled = false;
    const result = await invoke(stockDeductionHandler);
    expect(result.status).toBe(403);
    expect(result.body.error).toBe("job-disabled");
    expect(mocks.deductStockFromInoveSales).not.toHaveBeenCalled();
  });

  it("rejeita UID de box no endpoint de baixa", async () => {
    rows[0].jobKey = "box-dia";
    expect((await invoke(stockDeductionHandler)).status).toBe(403);
    expect(mocks.deductStockFromInoveSales).not.toHaveBeenCalled();
  });

  it("rejeita UID de baixa no endpoint de caixas", async () => {
    expect((await invoke(boxOpeningsHandler)).status).toBe(403);
    expect(mocks.detectBoxOpenings).not.toHaveBeenCalled();
  });

  it.each(["box-dia", "box-noite"])("aceita %s no endpoint de caixas e repassa notificação", async key => {
    rows[0].jobKey = key;
    expect((await invoke(boxOpeningsHandler)).status).toBe(200);
    const opts = mocks.detectBoxOpenings.mock.calls[0][0];
    await opts.notify("Título", "Conteúdo");
    expect(mocks.notifyOwner).toHaveBeenCalledWith({ title: "Título", content: "Conteúdo" });
    expect(mocks.deductStockFromInoveSales).not.toHaveBeenCalled();
  });

  it.each([401, 403])("preserva rejeição OAuth HTTP %s sem falso sucesso", async status => {
    mocks.getUserInfoWithJwt.mockRejectedValue({ isAxiosError: true, response: { status } });
    expect((await invoke(stockDeductionHandler)).status).toBe(status);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("retorna 500 JSON/contexto para indisponibilidade OAuth", async () => {
    mocks.getUserInfoWithJwt.mockRejectedValue(new Error("OAuth timeout"));
    const result = await invoke(stockDeductionHandler);
    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ ok: false, error: "OAuth timeout", context: { phase: "auth", taskUid: null } });
    expect(result.body.stack).toContain("OAuth timeout");
    expect(result.body.timestamp).toEqual(expect.any(String));
  });

  it("retorna 500 quando DB está ausente", async () => {
    mocks.getDb.mockResolvedValue(null);
    const result = await invoke(stockDeductionHandler);
    expect(result.status).toBe(500);
    expect(result.body.context).toMatchObject({ phase: "registry", taskUid: "T_stock" });
    expect(mocks.deductStockFromInoveSales).not.toHaveBeenCalled();
  });

  it("retorna 500 e não orphan se consulta registry falha", async () => {
    registryFailure = new Error("DB query failed");
    const result = await invoke(stockDeductionHandler);
    expect(result.status).toBe(500);
    expect(result.body.error).toBe("DB query failed");
    expect(result.body.skipped).toBeUndefined();
  });

  it.each([undefined, { active: false }])("retorna 500 para conector ausente/inativo", async config => {
    connector = config;
    const result = await invoke(stockDeductionHandler);
    expect(result.status).toBe(500);
    expect(result.body.context.phase).toBe("connector");
    expect(mocks.deductStockFromInoveSales).not.toHaveBeenCalled();
  });

  it.each(["Banco indisponível", "INOVE não conectado"])("converte falso sucesso de baixa (%s) em 500", async message => {
    mocks.deductStockFromInoveSales.mockResolvedValue({ ...stockResult, message });
    expect((await invoke(stockDeductionHandler)).status).toBe(500);
  });

  it.each(["Banco indisponível", "INOVE não conectado"])("converte falso sucesso de caixas (%s) em 500", async message => {
    rows[0].jobKey = "box-dia";
    mocks.detectBoxOpenings.mockResolvedValue({ ...boxResult, message });
    expect((await invoke(boxOpeningsHandler)).status).toBe(500);
  });

  it.each(["SQL Server timeout", "DB write failed"])("propaga falha de baixa (%s) para retry", async message => {
    mocks.deductStockFromInoveSales.mockRejectedValue(new Error(message));
    const result = await invoke(stockDeductionHandler);
    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ error: message, context: { phase: "execute", taskUid: "T_stock", jobKey: "stock-deduction" } });
  });

  it("propaga falha de detecção/notificação de caixas para retry", async () => {
    rows[0].jobKey = "box-noite";
    mocks.detectBoxOpenings.mockRejectedValue(new Error("INOVE query failed"));
    const result = await invoke(boxOpeningsHandler);
    expect(result.status).toBe(500);
    expect(result.body.context).toMatchObject({ phase: "execute", jobKey: "box-noite" });
  });

  it("aceita ausência real de vendas e de caixas configuradas como 2xx", async () => {
    mocks.deductStockFromInoveSales.mockResolvedValue({ ...stockResult, itemsDeducted: 0, message: "Nenhum item vendido no período consultado" });
    expect((await invoke(stockDeductionHandler)).status).toBe(200);
    rows[0].jobKey = "box-dia";
    mocks.detectBoxOpenings.mockResolvedValue({ checked: 0, suggestions: 0, message: "Nenhuma caixa com inoveProductId e rendimentoKg configurados" });
    expect((await invoke(boxOpeningsHandler)).status).toBe(200);
  });
});
