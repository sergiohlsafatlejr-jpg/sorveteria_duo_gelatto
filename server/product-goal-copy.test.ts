import { describe, expect, it } from "vitest";
import { buildCopiedProductGoal, getPreviousMonthKey, normalizeProductGoalName } from "./product-goal-copy";

describe("product goal monthly copy", () => {
  it("calcula agosto como mês anterior de setembro sem depender de fuso horário", () => {
    expect(getPreviousMonthKey("2026-09")).toBe("2026-08");
    expect(getPreviousMonthKey("2027-01")).toBe("2026-12");
  });

  it("preserva integralmente os produtos selecionados", () => {
    const copied = buildCopiedProductGoal({
      productName: "Açai Potes ",
      searchKeywords: "ACAI PREMIUM 1,5L|ACAI COM BANANA 1,5L|ACAI COM LEITINHO 1,5L",
      targetQuantity: 190,
      targetRevenue: "0.00",
      icon: "🎯",
    }, "2026-09");

    expect(copied.searchKeywords).toContain("ACAI COM BANANA 1,5L");
    expect(copied.searchKeywords).toContain("ACAI COM LEITINHO 1,5L");
    expect(copied.month).toBe("2026-09");
  });

  it("normaliza espaços para impedir metas duplicadas com o mesmo nome", () => {
    expect(normalizeProductGoalName("  Açai   Potes ")).toBe(normalizeProductGoalName("Açai Potes"));
  });
});
