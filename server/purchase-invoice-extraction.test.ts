import { describe, expect, it } from "vitest";
import {
  isInoveSystemName,
  isSorvefortSupplier,
  isTenLiterItem,
  matchesPurchaseItemFilters,
  validateExtractedInvoice,
  type ExtractedInvoice,
} from "./purchase-invoice-extraction";

const baseInvoice: ExtractedInvoice = {
  supplier_name: "SORVEFORT LTDA",
  supplier_cnpj: "12.345.678/0001-90",
  invoice_number: "1234",
  access_key: "",
  issue_date: "15/07/2026",
  total_amount: 150,
  confidence: 0.96,
  items: [
    {
      line_number: 7,
      supplier_code: "ABC",
      description: "Cobertura chocolate",
      category: "caldas",
      quantity: 3,
      unit: "un",
      unit_price: 50,
      total_price: 150,
      confidence: 0.95,
    },
  ],
};

describe("validateExtractedInvoice", () => {
  it("normaliza campos e aprova uma nota conciliada", () => {
    const result = validateExtractedInvoice(baseInvoice);
    expect(result.issue_date).toBe("2026-07-15");
    expect(result.supplier_cnpj).toBe("12345678000190");
    expect(result.items[0]?.line_number).toBe(1);
    expect(result.items[0]?.unit).toBe("UN");
    expect(result.itemSubtotal).toBe(150);
    expect(result.suggestedStatus).toBe("extracted");
    expect(result.validationErrors).toEqual([]);
  });

  it("exige revisão quando a soma dos itens diverge do total", () => {
    const result = validateExtractedInvoice({ ...baseInvoice, total_amount: 300 });
    expect(result.suggestedStatus).toBe("review_required");
    expect(result.validationErrors.join(" ")).toContain("soma dos itens");
  });

  it("exige revisão quando quantidade e preço não fecham o item", () => {
    const result = validateExtractedInvoice({
      ...baseInvoice,
      total_amount: 140,
      items: [{ ...baseInvoice.items[0], total_price: 140 }],
    });
    expect(result.suggestedStatus).toBe("review_required");
    expect(result.validationErrors.join(" ")).toContain("quantidade × preço");
  });

  it("remove INOVE do campo fornecedor e exige revisão", () => {
    const result = validateExtractedInvoice({ ...baseInvoice, supplier_name: "INOVE PDV" });
    expect(result.supplier_name).toBe("");
    expect(result.suggestedStatus).toBe("review_required");
    expect(result.validationErrors.join(" ")).toContain("sistema de PDV/estoque");
  });
});

describe("classificadores auxiliares", () => {
  it("identifica Sorvefort sem depender de caixa ou acento", () => {
    expect(isSorvefortSupplier("Sorvefort Ltda")).toBe(true);
    expect(isSorvefortSupplier("Outro fornecedor")).toBe(false);
  });

  it("distingue o sistema INOVE de fornecedores reais", () => {
    expect(isInoveSystemName("INOVE PDV")).toBe(true);
    expect(isInoveSystemName("Duo Gelatto Indústria de Sorvetes Ltda")).toBe(false);
  });

  it("identifica descrições de caixas de 10 litros", () => {
    expect(isTenLiterItem("Sorvete Morango 10 LT")).toBe(true);
    expect(isTenLiterItem("Pote 2 litros")).toBe(false);
  });

  it("filtra itens reais da Sorvefort por produto, data e status", () => {
    const row = {
      supplierName: "SORVEFORT LTDA",
      description: "CASQUINHA BISCOITO DOCE",
      supplierCode: "7012",
      issueDate: "2026-07-15",
      category: "guloseimas",
      status: "extracted",
    };
    expect(matchesPurchaseItemFilters(row, {
      supplier: "sorvefort",
      search: "casquinha",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      category: "guloseimas",
    })).toBe(true);
    expect(matchesPurchaseItemFilters(row, {
      supplier: "sorvefort",
      search: "cobertura",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      category: "guloseimas",
    })).toBe(false);
  });

  it("não exibe linhas pendentes ou fora do intervalo solicitado", () => {
    const baseRow = {
      supplierName: "SORVEFORT LTDA",
      description: "EMBALAGEM PARA SORVETE",
      supplierCode: null,
      issueDate: "2026-06-30",
      category: "embalagens",
      status: "pending",
    };
    const filters = {
      supplier: "sorvefort" as const,
      search: "",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      category: "all",
    };
    expect(matchesPurchaseItemFilters(baseRow, filters)).toBe(false);
    expect(matchesPurchaseItemFilters({ ...baseRow, status: "confirmed", issueDate: "2026-07-10" }, filters)).toBe(true);
  });
});
