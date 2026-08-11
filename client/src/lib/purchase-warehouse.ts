export type PurchaseWarehouseSource = {
  invoiceId: number;
  supplierName?: string;
};

export type PurchaseWarehouseInvoiceItem = {
  description: string;
  unit: string;
  totalQuantity: number;
  totalSpent: number;
  averageUnitPrice: number;
  invoiceCount: number;
  sources: PurchaseWarehouseSource[];
};

export type PurchaseWarehouseCategory = {
  category: string;
  items: PurchaseWarehouseInvoiceItem[];
};

export type PurchaseWarehouseOperationalItem = {
  id: number;
  name: string;
  category: string;
  unit: string;
  currentStock: string | number;
  minStock: string | number;
  referencePrice: string | number | null;
};

export type PurchaseWarehouseItem = {
  key: string;
  operationalItemId: number | null;
  name: string;
  category: string;
  unit: string;
  currentStock: number | null;
  minStock: number | null;
  referencePrice: number;
  purchasedQuantity: number;
  purchasedValue: number;
  invoiceCount: number;
  sourceInvoiceIds: number[];
  stockConfigured: boolean;
};

export function normalizePurchaseWarehouseName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function isTenLiterPurchaseItem(description: string): boolean {
  return /\b10\s*(L|LT|LITRO|LITROS)\b/i.test(description);
}

export function buildPurchaseWarehouseCatalog(
  categories: PurchaseWarehouseCategory[],
  operationalItems: PurchaseWarehouseOperationalItem[],
  supplierFilter?: "all" | "duo_gelatto" | "almoxarifado",
): PurchaseWarehouseItem[] {
  const filter = supplierFilter ?? "all";
  const catalog = new Map<string, PurchaseWarehouseItem>();

  for (const category of categories) {
    for (const item of category.items) {
      if (isTenLiterPurchaseItem(item.description)) continue;
      // Filtrar por fornecedor
      if (filter !== "all" && item.sources.length > 0) {
        const isDuo = item.sources.some((s: any) => ((s as any).supplierName ?? "").toUpperCase().includes("DUO GELATTO"));
        if (filter === "duo_gelatto" && !isDuo) continue;
        if (filter === "almoxarifado" && isDuo) continue;
      }
      const normalizedName = normalizePurchaseWarehouseName(item.description);
      if (!normalizedName) continue;
      const existing = catalog.get(normalizedName);
      const sourceInvoiceIds = new Set(existing?.sourceInvoiceIds ?? []);
      item.sources.forEach((source) => sourceInvoiceIds.add(source.invoiceId));
      const purchasedQuantity = (existing?.purchasedQuantity ?? 0) + Number(item.totalQuantity || 0);
      const purchasedValue = (existing?.purchasedValue ?? 0) + Number(item.totalSpent || 0);

      catalog.set(normalizedName, {
        key: `invoice-${normalizedName}`,
        operationalItemId: null,
        name: existing?.name ?? item.description,
        category: existing?.category ?? category.category,
        unit: existing?.unit ?? item.unit,
        currentStock: null,
        minStock: null,
        referencePrice: purchasedQuantity > 0 ? purchasedValue / purchasedQuantity : Number(item.averageUnitPrice || 0),
        purchasedQuantity,
        purchasedValue,
        invoiceCount: sourceInvoiceIds.size,
        sourceInvoiceIds: Array.from(sourceInvoiceIds),
        stockConfigured: false,
      });
    }
  }

  for (const operationalItem of operationalItems) {
    const normalizedName = normalizePurchaseWarehouseName(operationalItem.name);
    if (!normalizedName) continue;
    const existing = catalog.get(normalizedName);
    catalog.set(normalizedName, {
      key: `operational-${operationalItem.id}`,
      operationalItemId: operationalItem.id,
      name: operationalItem.name,
      category: operationalItem.category,
      unit: operationalItem.unit,
      currentStock: Number(operationalItem.currentStock ?? 0),
      minStock: Number(operationalItem.minStock ?? 0),
      referencePrice: Number(operationalItem.referencePrice ?? existing?.referencePrice ?? 0),
      purchasedQuantity: existing?.purchasedQuantity ?? 0,
      purchasedValue: existing?.purchasedValue ?? 0,
      invoiceCount: existing?.invoiceCount ?? 0,
      sourceInvoiceIds: existing?.sourceInvoiceIds ?? [],
      stockConfigured: true,
    });
  }

  return Array.from(catalog.values()).sort((a, b) => {
    if (a.purchasedQuantity > 0 && b.purchasedQuantity === 0) return -1;
    if (a.purchasedQuantity === 0 && b.purchasedQuantity > 0) return 1;
    return a.category.localeCompare(b.category, "pt-BR") || a.name.localeCompare(b.name, "pt-BR");
  });
}
