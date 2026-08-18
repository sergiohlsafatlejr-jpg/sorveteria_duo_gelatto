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
  totalUnits: number;
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

/**
 * Extrai a quantidade de unidades por embalagem a partir da descrição do produto.
 * Ex: "CAJA 30 UND - FRUTA" → 30, "PACK 4 UND NAPOLITANO 1,5 LITROS" → 4
 */
export function extractUnitsPerPackage(description: string): number {
  // Padrões: "30 UND", "24 UND", "PACK 4 UND", "PACK 6 UND", "PACK 9 UND", "20 UND"
  const match = description.match(/\b(\d+)\s*UND/i);
  if (match) return Number(match[1]);
  // Padrão PACK N UND sem "UND" explícito mas com PACK
  const packMatch = description.match(/PACK\s*(\d+)/i);
  if (packMatch) return Number(packMatch[1]);
  return 1;
}

/**
 * Categoriza automaticamente itens de sorvete da Duo Gelatto.
 */
export function categorizeSorveteItem(description: string): string {
  const upper = description.toUpperCase();
  if (/PICOLE\s*ZERO/i.test(upper)) return "picoles_zero";
  if (/LINHA\s*ZERO/i.test(upper)) return "linha_zero";
  if (/LINHA\s*KIDS/i.test(upper)) return "linha_kids";
  if (/LINHA\s*ESPECIAL/i.test(upper)) return "linha_especial";
  if (/\bMEGA\b/i.test(upper) || /OURO\s*PRETO/i.test(upper)) return "mega";
  if (/\bDUOBLITO/i.test(upper)) return "duoblito";
  if (/PACK\s*4\s*UND.*1[,.]5\s*LITRO/i.test(upper)) return "potes_1_5l";
  if (/PACK\s*(6|9)\s*UND.*1\s*(LITRO|LT)/i.test(upper) || /PACK\s*(6|9)\s*UND.*500\s*ML/i.test(upper)) return "potes_1l_500ml";
  if (/CAIXA\s*5\s*LITRO/i.test(upper) || /5\s*LITROS/i.test(upper)) return "caixas_5l";
  if (/\b(FRUTA|CAJA)\b/i.test(upper) && /\d+\s*UND/i.test(upper)) return "picoles_fruta";
  if (/\b(CREME|COALHADA|MILHO|MORANGO|CUPUACU|COCO|TAMARINDO)\b/i.test(upper) && /\d+\s*UND/i.test(upper)) return "picoles_creme";
  if (/\d+\s*UND.*-\s*(SP|CLASSICOS)/i.test(upper) || /CLASSICOS/i.test(upper)) return "picoles_sp";
  if (/ACAI/i.test(upper)) return "acai";
  if (/\d+\s*UND/i.test(upper)) return "picoles_outros";
  return "outros";
}

export const SORVETE_CATEGORY_LABELS: Record<string, string> = {
  picoles_fruta: "Picolés Fruta",
  picoles_creme: "Picolés Creme",
  picoles_sp: "Picolés SP/Clássicos",
  picoles_zero: "Picolés Zero",
  picoles_outros: "Picolés Outros",
  mega: "Mega",
  duoblito: "Duoblito",
  linha_zero: "Linha Zero",
  linha_kids: "Linha Kids",
  linha_especial: "Linha Especial",
  potes_1_5l: "Potes 1,5L",
  potes_1l_500ml: "Potes 1L / 500ml",
  caixas_5l: "Caixas 5L",
  acai: "Açaí",
  outros: "Outros",
};

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
      const unitsPerPkg = extractUnitsPerPackage(item.description);
      const totalUnits = (existing?.totalUnits ?? 0) + (Number(item.totalQuantity || 0) * unitsPerPkg);
      // Auto-categorizar itens de sorvete quando filtro é duo_gelatto
      const itemCategory = filter === "duo_gelatto"
        ? categorizeSorveteItem(item.description)
        : (existing?.category ?? category.category);

      catalog.set(normalizedName, {
        key: `invoice-${normalizedName}`,
        operationalItemId: null,
        name: existing?.name ?? item.description,
        category: itemCategory,
        unit: existing?.unit ?? item.unit,
        currentStock: null,
        minStock: null,
        referencePrice: purchasedQuantity > 0 ? purchasedValue / purchasedQuantity : Number(item.averageUnitPrice || 0),
        purchasedQuantity,
        purchasedValue,
        invoiceCount: sourceInvoiceIds.size,
        sourceInvoiceIds: Array.from(sourceInvoiceIds),
        stockConfigured: false,
        totalUnits,
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
      totalUnits: existing?.totalUnits ?? 0,
    });
  }

  return Array.from(catalog.values()).sort((a, b) => {
    if (a.purchasedQuantity > 0 && b.purchasedQuantity === 0) return -1;
    if (a.purchasedQuantity === 0 && b.purchasedQuantity > 0) return 1;
    return a.category.localeCompare(b.category, "pt-BR") || a.name.localeCompare(b.name, "pt-BR");
  });
}
