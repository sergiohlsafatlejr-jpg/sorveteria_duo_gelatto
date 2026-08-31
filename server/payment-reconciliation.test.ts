import { describe, expect, it } from "vitest";
import { calculateNetPaymentAmount, calculatePaymentTotals, calculateSalesReconciliation } from "./payment-reconciliation";

describe("payment reconciliation", () => {
  it("desconta PAG_DEVOLUCAO apenas de pagamentos em Dinheiro", () => {
    expect(calculateNetPaymentAmount("DINHEIRO", 30, 2.49)).toBeCloseTo(27.51, 2);
    expect(calculateNetPaymentAmount("C. CREDITO", 30, 2.49)).toBe(30);
  });

  it("reproduz o fechamento real do INOVE de 01/08/2026 a 30/08/2026", () => {
    const result = calculatePaymentTotals([
      { forma: "C. CREDITO", valorBruto: 48_745.89 },
      { forma: "C. DEBITO", valorBruto: 46_411.27 },
      { forma: "PIX", valorBruto: 33_198.69 },
      { forma: "DINHEIRO", valorBruto: 15_727.66, devolucao: 4_249.26 },
      { forma: "CORTESIA", valorBruto: 1_924.68 },
      { forma: "CONVENIO", valorBruto: 796.94 },
    ]);

    const dinheiro = result.methods.find((row) => row.forma === "DINHEIRO");
    expect(dinheiro?.valorLiquido).toBeCloseTo(11_478.40, 2);
    expect(result.totalDevolucao).toBeCloseTo(4_249.26, 2);
    expect(result.totalLiquido).toBeCloseTo(142_555.87, 2);
  });

  it("reconcilia faturamento bruto menos descontos com os recebimentos líquidos", () => {
    const result = calculateSalesReconciliation(142_985.61, 429.74, 142_555.87);
    expect(result.netSales).toBeCloseTo(142_555.87, 2);
    expect(result.netReceived).toBeCloseTo(142_555.87, 2);
    expect(result.difference).toBeCloseTo(0, 2);
  });
});
