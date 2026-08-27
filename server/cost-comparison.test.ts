import { describe, expect, it } from "vitest";
import {
  buildFinancialNamesByCost,
  filterTransactionsByReferenceMonth,
  getCostNameComparisonStatus,
  getMonthlyCostValues,
} from "../client/src/lib/cost-comparison";

describe("buildFinancialNamesByCost", () => {
  it("agrupa nomes financeiros, quantidade e valor pelo custo vinculado", () => {
    const result = buildFinancialNamesByCost([
      { costId: 2, financialCostName: "SORVETE", amount: "2430.86" },
      { costId: 2, financialCostName: "SORVETE", amount: "5590.71" },
      { costId: 2, financialCostName: "OUTRO CUSTO", amount: "100.00" },
      { costId: null, financialCostName: "SEM VINCULO", amount: "50.00" },
    ]);

    expect(result.get(2)).toEqual({
      names: ["SORVETE", "OUTRO CUSTO"],
      count: 3,
      total: 8121.57,
    });
    expect(result.has(0)).toBe(false);
  });

  it("compara o custo original pelos aliases e detecta divergência real", () => {
    expect(getCostNameComparisonStatus("Duo Gelatto", { names: ["SORVETE"], count: 1, total: 100 })).toBe("corresponds");
    expect(getCostNameComparisonStatus("Agua", { names: ["SANEAGO"], count: 1, total: 100 })).toBe("corresponds");
    expect(getCostNameComparisonStatus("Duo Gelatto", { names: ["ALUGUEL"], count: 1, total: 100 })).toBe("divergent");
    expect(getCostNameComparisonStatus("Duo Gelatto")).toBe("unlinked");
  });

  it("filtra pelo mês de vencimento e calcula realizado menos previsto", () => {
    const september = filterTransactionsByReferenceMonth([
      { costId: 2, financialCostName: "SORVETE", amount: "2430.86", dueDate: "2026-09-01" },
      { costId: 2, financialCostName: "SORVETE", amount: "5590.71", dueDate: new Date(2026, 8, 15) },
      { costId: 2, financialCostName: "SORVETE", amount: "100.00", dueDate: "2026-08-31" },
    ], "2026-09");
    const grouped = buildFinancialNamesByCost(september);
    expect(september).toHaveLength(2);
    expect(getMonthlyCostValues("45000.00", grouped.get(2))).toEqual({
      planned: 45000,
      actual: 8021.57,
      variance: -36978.43,
    });
  });
});
