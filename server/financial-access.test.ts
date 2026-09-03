import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { financeProcedure, router } from "./_core/trpc";
import { appRouter } from "./routers";
import {
  canAccessFinancialModule,
  isFinancialModuleKey,
  isFinancialPath,
  removeFinancialPermissions,
} from "../shared/financial-access";

const testRouter = router({
  financialData: financeProcedure.query(() => ({ ok: true })),
});

function createContext(role: "admin" | "manager" | "attendant" | "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: `financial-access-${role}`,
      email: `${role}@example.com`,
      name: role,
      loginMethod: "manus",
      role,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("restrição do módulo Financeiro", () => {
  it.each(["manager", "attendant", "user"] as const)(
    "bloqueia o backend para o perfil %s",
    async (role) => {
      const caller = testRouter.createCaller(createContext(role));
      await expect(caller.financialData()).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Acesso ao módulo Financeiro restrito ao Administrador.",
      });
    }
  );

  it("preserva o acesso do administrador", async () => {
    const caller = testRouter.createCaller(createContext("admin"));
    await expect(caller.financialData()).resolves.toEqual({ ok: true });
  });

  it.each([
    ["fin.dashboard", (caller: ReturnType<typeof appRouter.createCaller>) => caller.fin.dashboard()],
    ["finance.summary", (caller: ReturnType<typeof appRouter.createCaller>) => caller.finance.summary()],
    ["productGoals.list", (caller: ReturnType<typeof appRouter.createCaller>) => caller.productGoals.list()],
    ["inove.getProductGoalsProgress", (caller: ReturnType<typeof appRouter.createCaller>) => caller.inove.getProductGoalsProgress({ month: "2026-09", includeInactive: false })],
    ["rede.listImports", (caller: ReturnType<typeof appRouter.createCaller>) => caller.rede.listImports()],
    ["reports.dre", (caller: ReturnType<typeof appRouter.createCaller>) => caller.reports.dre({ referenceMonth: "2026-09" })],
    ["reports.dreByChannel", (caller: ReturnType<typeof appRouter.createCaller>) => caller.reports.dreByChannel({ referenceMonth: "2026-09" })],
    ["reports.analiseOtimizacao", (caller: ReturnType<typeof appRouter.createCaller>) => caller.reports.analiseOtimizacao({ month: "2026-09" })],
  ] as const)("protege o endpoint real %s", async (_name, callEndpoint) => {
    const caller = appRouter.createCaller(createContext("manager"));
    await expect(callEndpoint(caller)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reconhece todas as URLs financeiras, inclusive a rota legada", () => {
    expect(isFinancialPath("/fin/dashboard")).toBe(true);
    expect(isFinancialPath("/fin/product-goals")).toBe(true);
    expect(isFinancialPath("/fin/bank-reconciliation")).toBe(true);
    expect(isFinancialPath("/finance")).toBe(true);
    expect(isFinancialPath("/sales")).toBe(false);
  });

  it("remove qualquer ação financeira ao salvar permissões de não administradores", () => {
    const permissions = removeFinancialPermissions([
      { module: "sales", canView: true, canCreate: true, canEdit: true, canDelete: false },
      { module: "fin-payables", canView: true, canCreate: true, canEdit: true, canDelete: true },
      { module: "fin-product-goals", canView: true, canCreate: false, canEdit: true, canDelete: false },
    ]);

    expect(permissions[0]).toMatchObject({ module: "sales", canView: true, canCreate: true, canEdit: true });
    expect(permissions.slice(1)).toEqual([
      { module: "fin-payables", canView: false, canCreate: false, canEdit: false, canDelete: false },
      { module: "fin-product-goals", canView: false, canCreate: false, canEdit: false, canDelete: false },
    ]);
    expect(canAccessFinancialModule("admin")).toBe(true);
    expect(canAccessFinancialModule("manager")).toBe(false);
    expect(isFinancialModuleKey("fin-banks")).toBe(true);
    expect(isFinancialModuleKey("finance")).toBe(true);
  });
});
