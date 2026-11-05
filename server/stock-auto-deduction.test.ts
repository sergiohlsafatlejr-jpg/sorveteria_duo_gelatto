import { describe, expect, it } from "vitest";
import {
  extractUnitsPerPackage,
  isBulkKgSaleItem,
  normalizeCoreFlavorName,
  normalizeStockName,
} from "./stock-auto-deduction";

describe("stock-auto-deduction helpers", () => {
  it("extrai unidades por embalagem de descrições de NF-e", () => {
    expect(extractUnitsPerPackage("PICOLÉ CAJÁ - FRUTA 30 UND")).toBe(30);
    expect(extractUnitsPerPackage("POTE 1,8L FLOCOS PACK 4 UND")).toBe(4);
    expect(extractUnitsPerPackage("CX C/ 24 PICOLÉ CHOCOLATE")).toBe(24);
    expect(extractUnitsPerPackage("SORVETE CHOCOLATE 10 LT")).toBe(1);
    expect(extractUnitsPerPackage("GUARDANAPO")).toBe(1);
  });

  it("normaliza nomes de produtos entre NF-e e PDV INOVE", () => {
    expect(normalizeStockName("PICOLÉ CAJÁ - FRUTA 30 UND")).toBe("picolecajafruta30und");
    expect(normalizeCoreFlavorName("PICOLÉ CAJÁ - FRUTA 30 UND")).toBe("caja");
    expect(normalizeCoreFlavorName("PICOLE CAJA")).toBe("caja");
  });

  it("identifica itens vendidos por quilo ou caixas de 10L para não baixar como unidade", () => {
    expect(isBulkKgSaleItem("SORVETE KG", "KG")).toBe(true);
    expect(isBulkKgSaleItem("SELF SERVICE BUFFET", "UN")).toBe(true);
    expect(isBulkKgSaleItem("SORVETE CHOCOLATE 10 LT", "CX")).toBe(true);
    expect(isBulkKgSaleItem("PICOLE CAJA", "UN")).toBe(false);
    expect(isBulkKgSaleItem("POTE 2L MORANGO", "UN")).toBe(false);
  });
});
