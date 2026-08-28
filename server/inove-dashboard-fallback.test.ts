import { describe, expect, it } from "vitest";
import { buildCachedKpis, buildCachedSalesByDay, parseCachedProducts, parseSaleCount } from "./inove-dashboard-fallback";

describe("fallback do Dashboard INOVE", () => {
  const rows = [
    { revenueDate: "2026-08-26", realAmount: "3000.00", note: "Importado automaticamente do PDV INOVE (75 vendas)" },
    { revenueDate: "2026-08-27", realAmount: "3301.85", note: "Importado automaticamente do PDV INOVE (86 vendas)" },
    { revenueDate: "2026-07-31", realAmount: "1000.00", note: "Importado automaticamente do PDV INOVE (20 vendas)" },
  ];

  it("calcula faturamento, quantidade e ticket do mês usando o cache diário", () => {
    const result = buildCachedKpis(rows, "2026-08-28");
    expect(result.vendas_mes).toEqual({ qtd: 161, total: 6301.85 });
    expect(result.vendas_ontem).toEqual({ qtd: 86, total: 3301.85 });
    expect(result.ticket_medio).toBeCloseTo(39.14, 2);
    expect(result.source).toBe("cache");
  });

  it("extrai vendas das observações e monta a série diária", () => {
    expect(parseSaleCount(rows[1].note)).toBe(86);
    expect(buildCachedSalesByDay(rows, "2026-08-01")).toHaveLength(2);
  });

  it("aceita o cache ampliado e mantém compatibilidade com o top10 antigo", () => {
    const expanded = parseCachedProducts(JSON.stringify({ products: [{ nome: "POTE", qtd: 12, faturamento: 600 }] }), 10);
    const legacy = parseCachedProducts(JSON.stringify({ top10: [{ nome: "PICOLÉ", qtd: 20, faturamento: 200 }] }), 10);
    expect(expanded[0]).toEqual({ nome: "POTE", qtd: 12, total: 600 });
    expect(legacy[0]).toEqual({ nome: "PICOLÉ", qtd: 20, total: 200 });
  });
});
