import { describe, expect, it } from "vitest";
import { buildPurchaseWarehouseCatalog } from "../client/src/lib/purchase-warehouse";

describe("buildPurchaseWarehouseCatalog", () => {
  it("exibe itens das notas, agrega documentos e exclui caixas de 10 L", () => {
    const result = buildPurchaseWarehouseCatalog([
      {
        category: "guloseimas",
        items: [
          {
            description: "Bala de goma",
            unit: "UN",
            totalQuantity: 12,
            totalSpent: 24,
            averageUnitPrice: 2,
            invoiceCount: 1,
            sources: [{ invoiceId: 1 }],
          },
          {
            description: "SORVETE CHOCOLATE 10 L",
            unit: "CX",
            totalQuantity: 2,
            totalSpent: 180,
            averageUnitPrice: 90,
            invoiceCount: 1,
            sources: [{ invoiceId: 1 }],
          },
        ],
      },
      {
        category: "guloseimas",
        items: [
          {
            description: "BALA DE GOMA",
            unit: "UN",
            totalQuantity: 8,
            totalSpent: 20,
            averageUnitPrice: 2.5,
            invoiceCount: 1,
            sources: [{ invoiceId: 2 }],
          },
        ],
      },
    ], []);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Bala de goma",
      purchasedQuantity: 20,
      purchasedValue: 44,
      invoiceCount: 2,
      currentStock: null,
      stockConfigured: false,
    });
  });

  it("mantém o saldo físico separado quando encontra um item operacional correspondente", () => {
    const result = buildPurchaseWarehouseCatalog([
      {
        category: "caldas",
        items: [{
          description: "Calda morango",
          unit: "UN",
          totalQuantity: 6,
          totalSpent: 30,
          averageUnitPrice: 5,
          invoiceCount: 1,
          sources: [{ invoiceId: 10 }],
        }],
      },
    ], [{
      id: 7,
      name: "CALDA MORANGO",
      category: "caldas",
      unit: "un",
      currentStock: "2.00",
      minStock: "1.00",
      referencePrice: "5.50",
    }]);

    expect(result[0]).toMatchObject({
      operationalItemId: 7,
      purchasedQuantity: 6,
      purchasedValue: 30,
      currentStock: 2,
      minStock: 1,
      referencePrice: 5.5,
      stockConfigured: true,
    });
  });

  it("preserva itens operacionais ainda não encontrados nas notas do período", () => {
    const result = buildPurchaseWarehouseCatalog([], [{
      id: 9,
      name: "Detergente",
      category: "limpeza",
      unit: "un",
      currentStock: "4.00",
      minStock: "2.00",
      referencePrice: null,
    }]);

    expect(result[0]).toMatchObject({
      operationalItemId: 9,
      purchasedQuantity: 0,
      currentStock: 4,
      stockConfigured: true,
    });
  });
});
