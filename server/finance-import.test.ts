import { describe, expect, it } from "vitest";
import {
  findFinancialCostId,
  normalizeFinancialLabel,
  parsePayableSpreadsheetRow,
  parseSpreadsheetDate,
  parseSpreadsheetMoney,
} from "./finance-import";

describe("finance-import", () => {
  it("interpreta moeda brasileira e moeda com milhar americano", () => {
    expect(parseSpreadsheetMoney("R$ 2,430.86")).toBe(2430.86);
    expect(parseSpreadsheetMoney("R$ 2.430,86")).toBe(2430.86);
    expect(parseSpreadsheetMoney(2430.86)).toBe(2430.86);
  });

  it("interpreta as datas reais do PagamentoDuo.xlsx", () => {
    expect(parseSpreadsheetDate("08-27-26")?.getFullYear()).toBe(2026);
    expect(parseSpreadsheetDate("08-27-26")?.getMonth()).toBe(7);
    expect(parseSpreadsheetDate("08-27-26")?.getDate()).toBe(27);
  });

  it("mapeia PG como pago e preserva custo textual sem gerar NaN", () => {
    const parsed = parsePayableSpreadsheetRow({
      Descricao: "DUO GELATTO",
      Valor: "R$ 2,430.86",
      Vencimento: "08-27-26",
      Pago: "PG",
      Custo: "SORVETE",
    });

    expect(parsed).toMatchObject({
      description: "DUO GELATTO",
      amount: 2430.86,
      isPaid: true,
      costIdCandidate: undefined,
      costReference: "SORVETE",
    });
  });

  it("normaliza rótulos financeiros para associação por nome", () => {
    expect(normalizeFinancialLabel(" Cartão de Crédito ")).toBe("CARTAO DE CREDITO");
  });

  it("associa os rótulos reais aos custos cadastrados pelo usuário", () => {
    const costs = [
      { id: 2, name: "Duo gelatto" },
      { id: 3, name: "Guloseimas" },
      { id: 5, name: "Seguro da Loja" },
      { id: 6, name: "Energia" },
      { id: 7, name: "Pessoal" },
    ];

    expect(findFinancialCostId("SORVETE", costs)).toBe(2);
    expect(findFinancialCostId("GULOSEIMA", costs)).toBe(3);
    expect(findFinancialCostId("SEGURO", costs)).toBe(5);
    expect(findFinancialCostId("ENERGIA", costs)).toBe(6);
    expect(findFinancialCostId("CUSTO PESSOAL", costs)).toBe(7);
    expect(findFinancialCostId("INTERNET", costs)).toBeUndefined();
  });
});
