import { describe, expect, it } from "vitest";
import { estimatePaymentDate } from "./routers/rede";

describe("estimatePaymentDate", () => {
  it("deve liquidar no mesmo dia se for pix", () => {
    const saleDate = new Date("2026-04-01T12:00:00Z");
    const result = estimatePaymentDate(saleDate, "pix", "", false);
    expect(result.toISOString().split("T")[0]).toBe("2026-04-01");
  });

  it("deve liquidar no mesmo dia se prazo contiver mesmo dia", () => {
    const saleDate = new Date("2026-04-01T12:00:00Z");
    const result = estimatePaymentDate(saleDate, "crédito", "no mesmo dia", false);
    expect(result.toISOString().split("T")[0]).toBe("2026-04-01");
  });

  it("deve liquidar em D+1 se for débito", () => {
    const saleDate = new Date("2026-04-01T12:00:00Z");
    const result = estimatePaymentDate(saleDate, "débito", "D+1", false);
    expect(result.toISOString().split("T")[0]).toBe("2026-04-02");
  });

  it("deve liquidar em D+1 se for crédito com antecipação", () => {
    const saleDate = new Date("2026-04-01T12:00:00Z");
    const result = estimatePaymentDate(saleDate, "crédito", "D+30", true);
    expect(result.toISOString().split("T")[0]).toBe("2026-04-02");
  });

  it("deve liquidar em D+30 se for crédito normal sem antecipação", () => {
    const saleDate = new Date("2026-04-01T12:00:00Z");
    const result = estimatePaymentDate(saleDate, "crédito", "D+30", false);
    expect(result.toISOString().split("T")[0]).toBe("2026-05-01");
  });
});
