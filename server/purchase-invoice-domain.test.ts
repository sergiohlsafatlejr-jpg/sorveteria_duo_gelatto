import { describe, expect, it } from "vitest";
import {
  buildHistoricalBoxCatalogValues,
  findOperationalSupplierId,
  HISTORICAL_IMPORT_STOCK_POLICY,
} from "./purchase-invoice-domain";
import { toOperationalCategory } from "./purchase-invoice-confirmation";

describe("domínio de notas fiscais", () => {
  it("reutiliza operational_suppliers por CNPJ e por nome normalizado", () => {
    const suppliers = [
      { id: 7, name: "Duo Gelatto Indústria de Sorvetes Ltda", cnpj: "53.711.533/0001-48" },
      { id: 8, name: "Sorvefort Ltda", cnpj: "12.000.000/0001-00" },
    ];
    expect(findOperationalSupplierId(suppliers, "Nome divergente", "53711533000148")).toBe(7);
    expect(findOperationalSupplierId(suppliers, "DUO GELATTO INDUSTRIA DE SORVETES LTDA", "")).toBe(7);
    expect(findOperationalSupplierId(suppliers, "Fornecedor novo", "99.999.999/0001-99")).toBeNull();
  });

  it("preserva toda a taxonomia operacional e converte outros para insumos", () => {
    const supported = ["limpeza", "guloseimas", "caldas", "descartaveis", "embalagens", "manutencao", "insumos"];
    for (const category of supported) expect(toOperationalCategory(category)).toBe(category);
    expect(toOperationalCategory("outros")).toBe("insumos");
  });

  it("cria catálogo histórico com saldo zero e sem movimento retroativo", () => {
    expect(buildHistoricalBoxCatalogValues("SORVETE CHOCOLATE 10 LT", 71.25)).toMatchObject({
      currentStock: 0,
      minStock: 0,
      costPrice: "71.25",
    });
    expect(HISTORICAL_IMPORT_STOCK_POLICY).toEqual({ currentStockDelta: 0, createsStockMovement: false });
  });
});
