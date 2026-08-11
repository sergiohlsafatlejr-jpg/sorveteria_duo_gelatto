import { describe, expect, it } from "vitest";
import { UNAUTHED_ERR_MSG } from "../shared/const";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeContext(authenticated: boolean): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: authenticated
      ? ({
          id: 990_001,
          openId: "purchase-permission-test",
          name: "Usuário de teste",
          email: "purchase-permission@example.com",
          loginMethod: "test",
          role: "user",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        } as NonNullable<TrpcContext["user"]>)
      : null,
  };
}

describe("permissões das rotas de notas fiscais de compra", () => {
  it("nega histórico, itens, dashboard, upload, revisão e confirmação sem autenticação", async () => {
    const caller = appRouter.createCaller(makeContext(false));
    const calls = [
      caller.purchaseInvoices.list({ status: "all", search: "", limit: 1 }),
      caller.purchaseInvoices.getById({ invoiceId: 1 }),
      caller.purchaseInvoices.itemsBySupplier({
        supplier: "sorvefort",
        search: "",
        dateFrom: null,
        dateTo: null,
        category: "all",
        limit: 1,
      }),
      caller.purchaseInvoices.dashboard({ month: "2026-07" }),
      caller.purchaseInvoices.uploadAndExtract({
        fileName: "teste.pdf",
        mimeType: "application/pdf",
        base64: "JVBERi0xLjQK",
      }),
      caller.purchaseInvoices.saveReview({
        invoiceId: 1,
        supplierName: "Fornecedor teste",
        supplierCnpj: null,
        invoiceNumber: "1",
        issueDate: "2026-07-01",
        totalAmount: 10,
        items: [
          {
            id: 1,
            supplierCode: null,
            description: "Item teste",
            category: "outros",
            quantity: 1,
            unit: "UN",
            unitPrice: 10,
            totalPrice: 10,
          },
        ],
      }),
      caller.purchaseInvoices.confirm({ invoiceId: 1 }),
    ];

    const results = await Promise.allSettled(calls);
    expect(results).toHaveLength(7);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toMatchObject({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      }
    }
  });

  it("permite consultas do módulo para usuário autenticado", async () => {
    const caller = appRouter.createCaller(makeContext(true));
    const [invoices, items, dashboard, missingInvoice] = await Promise.all([
      caller.purchaseInvoices.list({ status: "all", search: "", limit: 1 }),
      caller.purchaseInvoices.itemsBySupplier({
        supplier: "sorvefort",
        search: "",
        dateFrom: null,
        dateTo: null,
        category: "all",
        limit: 1,
      }),
      caller.purchaseInvoices.dashboard({ month: "2026-07" }),
      caller.purchaseInvoices.getById({ invoiceId: 2_147_483_647 }),
    ]);

    expect(Array.isArray(invoices)).toBe(true);
    expect(Array.isArray(items)).toBe(true);
    expect(dashboard.month).toBe("2026-07");
    expect(missingInvoice).toBeNull();
  });
});
