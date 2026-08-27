import { describe, expect, it } from "vitest";
import {
  findDefaultFinancialBankId,
  findFinancialCategoryId,
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

  it("associa categoria por nome ou alias e usa banco padrão somente quando existe um único banco", () => {
    const categories = [
      { id: 1, name: "Sorvetes" },
      { id: 2, name: "Guloseima" },
      { id: 3, name: "Pessoal" },
      { id: 4, name: "Agua" },
    ];

    expect(findFinancialCategoryId("SORVETE", categories)).toBe(1);
    expect(findFinancialCategoryId("DUO GELATTO", categories)).toBe(1);
    expect(findFinancialCategoryId("GULOSEIMA", categories)).toBe(2);
    expect(findFinancialCategoryId("GULOSEIMAS", categories)).toBe(2);
    expect(findFinancialCategoryId("CUSTO PESSOAL", categories)).toBe(3);
    expect(findFinancialCategoryId("SALARIOS", categories)).toBe(3);
    expect(findFinancialCategoryId("SANEAGO", categories)).toBe(4);
    expect(findFinancialCategoryId("SEGURANCA", categories)).toBeUndefined();
    expect(findDefaultFinancialBankId([{ id: 1, name: "Itau" }])).toBe(1);
    expect(findDefaultFinancialBankId([{ id: 1, name: "Itau" }, { id: 2, name: "Sicoob" }])).toBeUndefined();
  });

  it("não escolhe automaticamente quando o nome da categoria está duplicado", () => {
    expect(findFinancialCategoryId("INTERNET", [
      { id: 1, name: "Internet" },
      { id: 2, name: "Internet" },
    ])).toBeUndefined();
  });
});
