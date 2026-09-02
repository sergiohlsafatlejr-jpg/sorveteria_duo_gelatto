import { describe, expect, it } from "vitest";
import {
  areRedePaymentMethodsCompatible,
  isAcceptedRedeSale,
  getRedeDateRange,
  normalizeRedeHeader,
  parseRedeDate,
  parseRedeDecimal,
  parseRedeOptionalDecimal,
  parseRedeTime,
} from "./rede-excel-parsing";

describe("parser de planilhas Rede", () => {
  it("normaliza cabeçalhos sem perder acentos relevantes", () => {
    expect(normalizeRedeHeader(" Taxa MDR ")).toBe("taxa mdr");
    expect(normalizeRedeHeader("Número da Autorização (Auto)")).toBe("número da autorização (auto)");
  });

  it("interpreta moeda brasileira, moeda decimal e percentuais", () => {
    expect(parseRedeDecimal("R$ 1.234,56")).toBe(1234.56);
    expect(parseRedeDecimal("R$ 44.63")).toBe(44.63);
    expect(parseRedeDecimal("2.76%")).toBe(2.76);
    expect(parseRedeOptionalDecimal("-")).toBeUndefined();
  });

  it("interpreta datas brasileiras e horários Excel com parte de data", () => {
    expect(parseRedeDate("07/08/2026").toISOString()).toBe("2026-08-07T00:00:00.000Z");
    expect(parseRedeTime(25569.616967592592)).toBe("14:48:26");
  });

  it("aceita somente transações aprovadas ou pagas e não canceladas", () => {
    expect(isAcceptedRedeSale("aprovada", "não")).toBe(true);
    expect(isAcceptedRedeSale("pago", false)).toBe(true);
    expect(isAcceptedRedeSale("expirado", "não")).toBe(false);
    expect(isAcceptedRedeSale("negada", "não")).toBe(false);
    expect(isAcceptedRedeSale("aprovada", "sim")).toBe(false);
  });

  it("calcula o intervalo correto mesmo quando a planilha está em ordem decrescente", () => {
    const range = getRedeDateRange([
      new Date("2026-08-11T00:00:00.000Z"),
      new Date("2026-08-07T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    ]);
    expect(range.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-11T00:00:00.000Z");
  });

  it("impede correspondência entre modalidades diferentes", () => {
    expect(areRedePaymentMethodsCompatible("débito", "C. DEBITO")).toBe(true);
    expect(areRedePaymentMethodsCompatible("crédito", "C. CREDITO")).toBe(true);
    expect(areRedePaymentMethodsCompatible("pix", "PIX")).toBe(true);
    expect(areRedePaymentMethodsCompatible("voucher", "CONVENIO")).toBe(true);
    expect(areRedePaymentMethodsCompatible("pix", "C. DEBITO")).toBe(false);
  });
});
