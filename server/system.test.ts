import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ──────────────────────────────────────────────────────────────────
type AuthUser = NonNullable<TrpcContext["user"]>;

function makeCtx(role: "admin" | "manager" | "attendant" | "user" = "user"): TrpcContext {
  const user: AuthUser = {
    id: 1,
    openId: "test-user",
    email: "test@duogelatto.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const clearedCookies: string[] = [];
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string) => clearedCookies.push(name),
    } as TrpcContext["res"],
  };
}

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
    const ctx: TrpcContext = {
      user: makeCtx().user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });

  it("auth.me returns null for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.me returns user for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.role).toBe("admin");
  });
});

// ─── Role Hierarchy Tests ─────────────────────────────────────────────────────
describe("role-based access control", () => {
  it("admin can access users.list", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    // Should not throw FORBIDDEN
    await expect(caller.users.list()).resolves.toBeDefined();
  });

  it("regular user cannot access users.list", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.users.list()).rejects.toThrow();
  });

  it("attendant cannot change user roles", async () => {
    const caller = appRouter.createCaller(makeCtx("attendant"));
    await expect(
      caller.users.updateRole({ userId: 2, role: "manager" })
    ).rejects.toThrow();
  });
});

// ─── Points Rules Tests ───────────────────────────────────────────────────────
describe("points.rules", () => {
  it("can list points rules without error", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const rules = await caller.points.getRules();
    expect(Array.isArray(rules)).toBe(true);
  });

  it("manager can create a points rule", async () => {
    const caller = appRouter.createCaller(makeCtx("manager"));
    // Should not throw FORBIDDEN
    await expect(
      caller.points.createRule({
        name: "Regra Teste",
        description: "Teste de criação",
        purchaseAmount: 10,
        pointsEarned: 1,
        rewardThreshold: 100,
        rewardValue: 10,
      })
    ).resolves.not.toThrow();
  });

  it("attendant cannot create a points rule", async () => {
    const caller = appRouter.createCaller(makeCtx("attendant"));
    await expect(
      caller.points.createRule({
        name: "Regra Não Autorizada",
        description: "",
        purchaseAmount: "10.00",
        pointsEarned: 1,
        rewardThreshold: 100,
        rewardValue: "10.00",
      })
    ).rejects.toThrow();
  });
});

// ─── Products Tests ───────────────────────────────────────────────────────────
describe("products", () => {
  it("can list products", async () => {
    const caller = appRouter.createCaller(makeCtx("attendant"));
    const products = await caller.products.list();
    expect(Array.isArray(products)).toBe(true);
  });

  it("attendant cannot delete a product", async () => {
    const caller = appRouter.createCaller(makeCtx("attendant"));
    await expect(caller.products.delete({ id: 9999 })).rejects.toThrow();
  });
});

// ─── Customers Tests ──────────────────────────────────────────────────────────
describe("customers", () => {
  it("can list customers", async () => {
    const caller = appRouter.createCaller(makeCtx("attendant"));
    const customers = await caller.customers.list({});
    expect(Array.isArray(customers)).toBe(true);
  });

  it("can list customers with search filter", async () => {
    const caller = appRouter.createCaller(makeCtx("attendant"));
    const customers = await caller.customers.list({ search: "João" });
    expect(Array.isArray(customers)).toBe(true);
  });
});

// ─── Dashboard Tests ──────────────────────────────────────────────────────────
describe("dashboard", () => {
  it("can get dashboard metrics", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const metrics = await caller.dashboard.metrics();
    // metrics can be null if DB is empty
    expect(metrics === null || typeof metrics === "object").toBe(true);
  });

  it("can get chart data for 30 days", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const data = await caller.dashboard.chartData({ days: 30 });
    expect(Array.isArray(data)).toBe(true);
  });

  it("can get top products", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const data = await caller.dashboard.topProducts({ limit: 5 });
    expect(Array.isArray(data)).toBe(true);
  });
});

// ─── Notifications Tests ──────────────────────────────────────────────────────
describe("notifications", () => {
  it("can get notification templates", async () => {
    const caller = appRouter.createCaller(makeCtx("attendant"));
    const templates = await caller.notifications.getTemplates();
    expect(Array.isArray(templates)).toBe(true);
  });

  it("can get notification logs", async () => {
    const caller = appRouter.createCaller(makeCtx("attendant"));
    const logs = await caller.notifications.getLogs({});
    expect(Array.isArray(logs)).toBe(true);
  });

  it("attendant cannot create a template", async () => {
    const caller = appRouter.createCaller(makeCtx("attendant"));
    await expect(
      caller.notifications.createTemplate({
        name: "Teste",
        type: "birthday",
        channel: "whatsapp",
        message: "Mensagem teste",
      })
    ).rejects.toThrow();
  });

  it("manager can create a template", async () => {
    const caller = appRouter.createCaller(makeCtx("manager"));
    // createNotificationTemplate returns void (undefined), so we just check it doesn't throw
    await expect(
      caller.notifications.createTemplate({
        name: "Aniversário Manager",
        type: "birthday",
        channel: "whatsapp",
        message: "Parabéns {{nome}}! Você tem {{pontos}} pontos!",
      })
    ).resolves.not.toThrow();
  });
});

// ─── Connector Tests ──────────────────────────────────────────────────────────
describe("connector", () => {
  it("non-admin cannot list connectors", async () => {
    const caller = appRouter.createCaller(makeCtx("manager"));
    await expect(caller.connector.list()).rejects.toThrow();
  });

  it("admin can list connectors", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const connectors = await caller.connector.list();
    expect(Array.isArray(connectors)).toBe(true);
  });
});
