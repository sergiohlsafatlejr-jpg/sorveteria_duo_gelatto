import { describe, expect, it } from "vitest";
import {
  buildBoxPurchaseHistory,
  buildPurchaseDashboard,
  buildPurchaseItemsSummary,
  type BoxPurchaseHistoryRow,
} from "./purchase-invoice-analytics";

const rows: BoxPurchaseHistoryRow[] = [
  { id: 1, invoiceId: 10, linkedBoxId: 100, supplierName: "Duo Gelatto Indústria", invoiceNumber: "100", issueDate: "2026-07-01", description: "Chocolate 10 LT", quantity: "2", unit: "UN", unitPrice: "50", totalPrice: "100" },
  { id: 2, invoiceId: 11, linkedBoxId: 101, supplierName: "Duo Gelatto Indústria", invoiceNumber: "101", issueDate: "2026-07-15", description: "Morango 10 LT", quantity: "4", unit: "UN", unitPrice: "60", totalPrice: "240" },
  { id: 3, invoiceId: 12, linkedBoxId: 102, supplierName: "Duo Gelatto Sorvetes", invoiceNumber: "102", issueDate: "2026-07-20", description: "Baunilha 10 LT", quantity: "1", unit: "UN", unitPrice: "70", totalPrice: "70" },
  { id: 4, invoiceId: 13, linkedBoxId: null, supplierName: "Outro", invoiceNumber: "103", issueDate: "2026-07-21", description: "Item não vinculado", quantity: "9", unit: "UN", unitPrice: "1", totalPrice: "9" },
];

describe("histórico de caixas de 10 L", () => {
  it("calcula quantidade, gasto, preço ponderado e frequência por fornecedor", () => {
    const result = buildBoxPurchaseHistory(rows);
    expect(result.summary).toMatchObject({ totalQuantity: 7, totalSpent: 410, supplierCount: 2, invoiceCount: 3 });
    expect(result.summary.weightedAveragePrice).toBeCloseTo(58.5714, 4);
    expect(result.bySupplier[0]).toMatchObject({
      supplierName: "Duo Gelatto Indústria",
      totalQuantity: 6,
      totalSpent: 340,
      averagePrice: 340 / 6,
      invoiceCount: 2,
      averageIntervalDays: 14,
    });
  });

  it("filtra por descrição ou fornecedor sem incluir itens não vinculados", () => {
    expect(buildBoxPurchaseHistory(rows, "morango").rows.map((row) => row.id)).toEqual([2]);
    expect(buildBoxPurchaseHistory(rows, "sorvetes").rows.map((row) => row.id)).toEqual([3]);
  });
});

describe("dashboard mensal de compras", () => {
  const invoices = [
    { id: 1, supplierName: "Duo Gelatto", issueDate: "2026-07-01", totalAmount: "100", status: "confirmed" },
    { id: 2, supplierName: "Sorvefort", issueDate: "2026-07-10", totalAmount: "200", status: "extracted" },
    { id: 3, supplierName: "Duo Gelatto", issueDate: "2026-07-20", totalAmount: "300", status: "review_required" },
    { id: 4, supplierName: "Fornecedor com erro", issueDate: "2026-07-25", totalAmount: "999", status: "error" },
    { id: 5, supplierName: "Duo Gelatto", issueDate: "2026-08-01", totalAmount: "500", status: "confirmed" },
  ];
  const items = [
    { invoiceId: 1, description: "COLHER DESCARTÁVEL", category: "descartaveis", quantity: "2", totalPrice: "20" },
    { invoiceId: 2, description: "Colher descartavel", category: "descartaveis", quantity: "4", totalPrice: "40" },
    { invoiceId: 3, description: "Chocolate 10 LT", category: "insumos", quantity: "3", totalPrice: "300" },
    { invoiceId: 4, description: "Item inválido", category: "outros", quantity: "1", totalPrice: "999" },
    { invoiceId: 5, description: "Item de agosto", category: "outros", quantity: "1", totalPrice: "500" },
  ];

  it("calcula total, ticket médio e concentração somente para o mês e estados válidos", () => {
    const result = buildPurchaseDashboard(invoices, items, "2026-07");
    expect(result.summary).toMatchObject({
      totalSpent: 600,
      totalQuantity: 9,
      distinctProducts: 2,
      invoiceCount: 3,
      averageTicket: 200,
      supplierCount: 2,
      topSupplierName: "Duo Gelatto",
      recurringItemCount: 1,
    });
    expect(result.summary.topSupplierShare).toBeCloseTo(66.6667, 4);
    expect(result.suppliers[0]).toMatchObject({ supplierName: "Duo Gelatto", totalSpent: 400, invoiceCount: 2 });
  });

  it("agrupa itens recorrentes sem acentos e resume categorias e dias", () => {
    const result = buildPurchaseDashboard(invoices, items, "2026-07");
    expect(result.recurringItems[0]).toMatchObject({
      description: "COLHER DESCARTÁVEL",
      invoiceCount: 2,
      totalQuantity: 6,
      totalSpent: 60,
    });
    expect(result.categories).toEqual([
      { category: "insumos", totalSpent: 300, itemCount: 1 },
      { category: "descartaveis", totalSpent: 60, itemCount: 2 },
    ]);
    expect(result.daily).toHaveLength(3);
  });
});

describe("resumo mensal de itens por categoria", () => {
  const invoices = [
    { id: 1, supplierName: "Sorvefort", invoiceNumber: "101", issueDate: "2026-07-01", status: "confirmed" },
    { id: 2, supplierName: "Sorvefort", invoiceNumber: "102", issueDate: "2026-07-10", status: "extracted" },
    { id: 3, supplierName: "Duo Gelatto", invoiceNumber: "103", issueDate: "2026-07-20", status: "review_required" },
    { id: 4, supplierName: "Fornecedor com erro", invoiceNumber: "104", issueDate: "2026-07-25", status: "error" },
    { id: 5, supplierName: "Sorvefort", invoiceNumber: "105", issueDate: "2026-08-01", status: "confirmed" },
  ];
  const items = [
    { id: 1, invoiceId: 1, description: "COLHER DESCARTÁVEL", category: "descartaveis", quantity: "2", unit: "UN", unitPrice: "10", totalPrice: "20" },
    { id: 2, invoiceId: 2, description: "Colher descartavel", category: "descartaveis", quantity: "4", unit: "UN", unitPrice: "10", totalPrice: "40" },
    { id: 3, invoiceId: 3, description: "Calda de chocolate", category: "caldas", quantity: "3", unit: "UN", unitPrice: "100", totalPrice: "300" },
    { id: 4, invoiceId: 4, description: "Item inválido", category: "outros", quantity: "1", unit: "UN", unitPrice: "999", totalPrice: "999" },
    { id: 5, invoiceId: 5, description: "Item de agosto", category: "outros", quantity: "1", unit: "UN", unitPrice: "500", totalPrice: "500" },
  ];

  it("calcula os indicadores apenas com notas válidas do mês selecionado", () => {
    const result = buildPurchaseItemsSummary(invoices, items, "2026-07");
    expect(result.summary).toEqual({
      totalQuantity: 9,
      distinctProducts: 2,
      invoiceCount: 3,
      categoryCount: 2,
      itemLineCount: 3,
      totalSpent: 360,
    });
  });

  it("agrupa produtos equivalentes, preserva as notas de origem e ordena categorias", () => {
    const result = buildPurchaseItemsSummary(invoices, items, "2026-07");
    expect(result.categories.map((category) => category.category)).toEqual(["caldas", "descartaveis"]);
    expect(result.categories[1]).toMatchObject({
      category: "descartaveis",
      totalQuantity: 6,
      totalSpent: 60,
      productCount: 1,
      invoiceCount: 2,
    });
    expect(result.categories[1].items[0]).toMatchObject({
      description: "COLHER DESCARTÁVEL",
      unit: "UN",
      totalQuantity: 6,
      totalSpent: 60,
      averageUnitPrice: 10,
      invoiceCount: 2,
    });
    expect(result.categories[1].items[0].sources).toEqual([
      expect.objectContaining({ invoiceNumber: "102", quantity: 4, totalPrice: 40 }),
      expect.objectContaining({ invoiceNumber: "101", quantity: 2, totalPrice: 20 }),
    ]);
  });
});
