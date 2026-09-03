import { describe, expect, it } from "vitest";
import { calculateDailyGoalProgress, getDailyGoalTone } from "../shared/daily-goal";

describe("Meta do Dia", () => {
  it("fica abaixo da meta e calcula quanto falta", () => {
    expect(calculateDailyGoalProgress(1500, 3000)).toEqual({
      actual: 1500,
      target: 3000,
      remaining: 1500,
      percent: 50,
      status: "below",
    });
  });

  it("fica atingida quando o realizado alcança ou supera a meta", () => {
    expect(calculateDailyGoalProgress(3200, 3000)).toEqual({
      actual: 3200,
      target: 3000,
      remaining: 0,
      percent: 106.66666666666667,
      status: "reached",
    });
  });

  it("não apresenta falsa meta quando o Forecast não possui valor para o dia", () => {
    expect(calculateDailyGoalProgress(850, 0)).toEqual({
      actual: 850,
      target: 0,
      remaining: 0,
      percent: 0,
      status: "not_configured",
    });
  });

  it("define vermelho antes da meta, verde após atingir e neutro sem meta", () => {
    expect(getDailyGoalTone("below")).toBe("danger");
    expect(getDailyGoalTone("reached")).toBe("success");
    expect(getDailyGoalTone("not_configured")).toBe("neutral");
  });
});
