import { describe, expect, it } from "vitest";
import {
  calculateProductGoalProgress,
  mergeProductCatalogWithSales,
  normalizeEpochTimestamp,
  parseProductGoalSelection,
  serializeProductGoalSelection,
} from "./product-goal-progress";

describe("product goal progress", () => {
  it("preserva vírgula decimal de nomes no formato legado separado por pipe", () => {
    expect(parseProductGoalSelection("ACAI PREMIUM 1,5L|SORVETE FLOCOS 1,5L"))
      .toEqual([{ name: "ACAI PREMIUM 1,5L" }, { name: "SORVETE FLOCOS 1,5L" }]);
  });

  it("soma somente produtos selecionados por id ou nome exato normalizado", () => {
    const selection = serializeProductGoalSelection([
      { id: 35, name: "PICOLE AÇAÍ" },
      { id: 74, name: "ACAI PREMIUM 1,5L" },
    ]);
    const result = calculateProductGoalProgress(
      { id: 1, searchKeywords: selection, targetQuantity: 100 },
      [
        { produtoId: 35, nome: "PICOLE ACAI", qtd: 20, total: 80 },
        { produtoId: 6967, nome: "PICOLE ACAI C/LEITINHO ZERO", qtd: 50, total: 400 },
        { produtoId: 74, nome: "  ACAI   PREMIUM 1,5L ", qtd: 30, total: 1_200 },
      ],
    );

    expect(result.realQty).toBe(50);
    expect(result.realRevenue).toBe(1_280);
    expect(result.percentQty).toBe(50);
    expect(result.matchedProducts.map((product) => product.produtoId)).toEqual([35, 74]);
    expect(result.missingProducts).toEqual([]);
  });

  it("converte corretamente timestamps do cache armazenados em segundos", () => {
    expect(normalizeEpochTimestamp(1_756_311_442)).toBe("2025-08-27T16:17:22.000Z");
  });

  it("mantém no catálogo produtos ativos mesmo sem venda no mês", () => {
    const result = mergeProductCatalogWithSales([
      { produtoId: 91, nome: "ACAI COM BANANA 1,5L" },
      { produtoId: 92, nome: "ACAI COM LEITINHO 1,5L" },
    ], [
      { produtoId: 91, nome: "ACAI COM BANANA 1,5L", qtd: 3, total: 120 },
    ]);

    expect(result).toHaveLength(2);
    expect(result.find((item) => item.produtoId === 91)?.qtd).toBe(3);
    expect(result.find((item) => item.produtoId === 92)?.qtd).toBe(0);
  });
});
