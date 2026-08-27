import { describe, expect, it } from "vitest";
import {
  calculateForecastDay,
  DEFAULT_FORECAST_SETTINGS,
  getNextSevenForecastDates,
  getWeatherEligibleDates,
} from "./forecast-calculation";

describe("forecast-calculation", () => {
  it("gera os sete dias seguintes no fuso de São Paulo, inclusive ao virar o mês", () => {
    expect(getNextSevenForecastDates(new Date("2026-08-27T15:00:00Z"))).toEqual([
      "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31",
      "2026-09-01", "2026-09-02", "2026-09-03",
    ]);
  });

  it("usa as mesmas médias e o mesmo fator climático do calendário de Forecast", () => {
    const rain = calculateForecastDay(
      "2026-08-28",
      DEFAULT_FORECAST_SETTINGS,
      null,
      { code: 61, tempMax: 24, precip: 10, precipProb: 80 },
      "2026-08-27",
    );
    expect(rain.dayType).toBe("weekday");
    expect(rain.baseAvg).toBe(2000);
    expect(rain.projectedAmount).toBe(1400);
    expect(rain.weather?.label).toBe("rain");
  });

  it("limita o clima do calendário à mesma janela válida usada nos próximos sete dias", () => {
    const month = Array.from({ length: 30 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`);
    expect(getWeatherEligibleDates(month, new Date("2026-08-27T15:00:00Z"))).toEqual(
      month.slice(0, 11),
    );
  });
});
