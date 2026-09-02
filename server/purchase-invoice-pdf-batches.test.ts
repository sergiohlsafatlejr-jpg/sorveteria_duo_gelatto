import { describe, expect, it } from "vitest";
import type { ValidatedInvoice } from "./purchase-invoice-extraction";
import { buildOverlappingPageRanges, mergeExtractedInvoiceBatches } from "./purchase-invoice-pdf-batches";

const invoice = (overrides: Partial<ValidatedInvoice> = {}): ValidatedInvoice => ({
  supplier_name: "DUO GELATTO SORVETES LTDA",
  supplier_cnpj: "44771401000110",
  invoice_number: "000.013.781",
  access_key: "52260844771401000110550010000137811085903488",
  operation_nature: "VENDA",
  issue_date: "2026-08-27",
  total_amount: 100,
  confidence: 0.99,
  items: [],
  itemSubtotal: 100,
  validationErrors: [],
  suggestedStatus: "extracted",
  ...overrides,
});

describe("buildOverlappingPageRanges", () => {
  it("divide 20 páginas em lotes de seis com uma página sobreposta", () => {
    expect(buildOverlappingPageRanges(20)).toEqual([
      { from: 1, to: 6 },
      { from: 6, to: 11 },
      { from: 11, to: 16 },
      { from: 16, to: 20 },
    ]);
  });
});

describe("mergeExtractedInvoiceBatches", () => {
  it("mantém a versão mais completa quando uma nota aparece na sobreposição", () => {
    const partial = invoice({ items: [
      { line_number: 1, supplier_code: "1", description: "Item", category: "outros", quantity: 1, unit: "UN", unit_price: 10, total_price: 10, confidence: 0.8 },
    ] });
    const complete = invoice({ items: [
      ...partial.items,
      { line_number: 2, supplier_code: "2", description: "Item 2", category: "outros", quantity: 1, unit: "UN", unit_price: 90, total_price: 90, confidence: 0.9 },
    ] });
    expect(mergeExtractedInvoiceBatches([[partial], [complete]])[0]?.items).toHaveLength(2);
  });
});
