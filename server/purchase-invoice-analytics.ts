export type BoxPurchaseHistoryRow = {
  id: number;
  invoiceId: number;
  linkedBoxId: number | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  description: string;
  quantity: string | number | null;
  unit: string;
  unitPrice: string | number | null;
  totalPrice: string | number | null;
};

export type PurchaseDashboardInvoiceRow = {
  id: number;
  supplierName: string | null;
  issueDate: string | null;
  totalAmount: string | number | null;
  status: string;
};

export type PurchaseDashboardItemRow = {
  invoiceId: number;
  description: string;
  category: string;
  quantity: string | number | null;
  totalPrice: string | number | null;
};

export type PurchaseItemsSummaryInvoiceRow = {
  id: number;
  supplierName: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  status: string;
};

export type PurchaseItemsSummaryItemRow = {
  id: number;
  invoiceId: number;
  description: string;
  category: string;
  quantity: string | number | null;
  unit: string;
  unitPrice: string | number | null;
  totalPrice: string | number | null;
};

const VALID_PURCHASE_INVOICE_STATUSES = new Set(["extracted", "review_required", "confirmed"]);
const PURCHASE_CATEGORY_ORDER = [
  "guloseimas",
  "caldas",
  "descartaveis",
  "limpeza",
  "embalagens",
  "manutencao",
  "insumos",
  "outros",
];

function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function averageIntervalDays(dates: Set<string>): number | null {
  const sorted = Array.from(dates).filter(Boolean).sort();
  if (sorted.length < 2) return null;
  const intervals = sorted.slice(1).map((date, index) => {
    const current = Date.parse(`${date}T12:00:00Z`);
    const previous = Date.parse(`${sorted[index]}T12:00:00Z`);
    return (current - previous) / 86_400_000;
  });
  return intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
}

export function buildBoxPurchaseHistory(rows: BoxPurchaseHistoryRow[], searchInput = "") {
  const search = normalizeSearch(searchInput);
  const filtered = rows.filter((row) => {
    if (!row.linkedBoxId) return false;
    if (!search) return true;
    return normalizeSearch(row.description).includes(search) || normalizeSearch(row.supplierName).includes(search);
  });

  const supplierMap = new Map<string, {
    supplierName: string;
    totalQuantity: number;
    totalSpent: number;
    invoiceIds: Set<number>;
    purchaseDates: Set<string>;
  }>();
  const invoiceIds = new Set<number>();
  let totalQuantity = 0;
  let totalSpent = 0;

  for (const row of filtered) {
    const quantity = Number(row.quantity ?? 0);
    const total = Number(row.totalPrice ?? 0);
    const supplierName = row.supplierName?.trim() || "Fornecedor não identificado";
    totalQuantity += quantity;
    totalSpent += total;
    invoiceIds.add(row.invoiceId);
    const current = supplierMap.get(supplierName) ?? {
      supplierName,
      totalQuantity: 0,
      totalSpent: 0,
      invoiceIds: new Set<number>(),
      purchaseDates: new Set<string>(),
    };
    current.totalQuantity += quantity;
    current.totalSpent += total;
    current.invoiceIds.add(row.invoiceId);
    if (row.issueDate) current.purchaseDates.add(row.issueDate);
    supplierMap.set(supplierName, current);
  }

  return {
    rows: filtered,
    summary: {
      totalQuantity,
      totalSpent,
      weightedAveragePrice: totalQuantity > 0 ? totalSpent / totalQuantity : 0,
      supplierCount: supplierMap.size,
      invoiceCount: invoiceIds.size,
    },
    bySupplier: Array.from(supplierMap.values())
      .map((supplier) => ({
        supplierName: supplier.supplierName,
        totalQuantity: supplier.totalQuantity,
        totalSpent: supplier.totalSpent,
        averagePrice: supplier.totalQuantity > 0 ? supplier.totalSpent / supplier.totalQuantity : 0,
        invoiceCount: supplier.invoiceIds.size,
        averageIntervalDays: averageIntervalDays(supplier.purchaseDates),
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent),
  };
}

export function buildPurchaseDashboard(
  invoiceRows: PurchaseDashboardInvoiceRow[],
  itemRows: PurchaseDashboardItemRow[],
  month: string,
) {
  const invoices = invoiceRows.filter(
    (invoice) => VALID_PURCHASE_INVOICE_STATUSES.has(invoice.status) && invoice.issueDate?.startsWith(month),
  );
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const items = itemRows.filter((item) => invoiceIds.has(item.invoiceId));
  const totalSpent = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount ?? 0), 0);
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const distinctProducts = new Set(
    items.map((item) => normalizeSearch(item.description)).filter(Boolean),
  ).size;

  const supplierMap = new Map<string, { supplierName: string; totalSpent: number; invoiceCount: number }>();
  const dailyMap = new Map<string, { date: string; totalSpent: number; invoiceCount: number }>();
  for (const invoice of invoices) {
    const supplierName = invoice.supplierName?.trim() || "Fornecedor não identificado";
    const amount = Number(invoice.totalAmount ?? 0);
    const supplier = supplierMap.get(supplierName) ?? { supplierName, totalSpent: 0, invoiceCount: 0 };
    supplier.totalSpent += amount;
    supplier.invoiceCount += 1;
    supplierMap.set(supplierName, supplier);

    if (invoice.issueDate) {
      const daily = dailyMap.get(invoice.issueDate) ?? { date: invoice.issueDate, totalSpent: 0, invoiceCount: 0 };
      daily.totalSpent += amount;
      daily.invoiceCount += 1;
      dailyMap.set(invoice.issueDate, daily);
    }
  }

  const itemMap = new Map<string, {
    description: string;
    invoiceIds: Set<number>;
    totalQuantity: number;
    totalSpent: number;
  }>();
  const categoryMap = new Map<string, { category: string; totalSpent: number; itemCount: number }>();
  for (const item of items) {
    const key = normalizeSearch(item.description) || `item-${item.invoiceId}-${itemMap.size}`;
    const current = itemMap.get(key) ?? {
      description: item.description,
      invoiceIds: new Set<number>(),
      totalQuantity: 0,
      totalSpent: 0,
    };
    current.invoiceIds.add(item.invoiceId);
    current.totalQuantity += Number(item.quantity ?? 0);
    current.totalSpent += Number(item.totalPrice ?? 0);
    itemMap.set(key, current);

    const category = item.category || "outros";
    const categoryCurrent = categoryMap.get(category) ?? { category, totalSpent: 0, itemCount: 0 };
    categoryCurrent.totalSpent += Number(item.totalPrice ?? 0);
    categoryCurrent.itemCount += 1;
    categoryMap.set(category, categoryCurrent);
  }

  const suppliers = Array.from(supplierMap.values())
    .map((supplier) => ({
      ...supplier,
      share: totalSpent > 0 ? (supplier.totalSpent / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent);
  const recurringItems = Array.from(itemMap.values())
    .filter((item) => item.invoiceIds.size >= 2)
    .map((item) => ({
      description: item.description,
      invoiceCount: item.invoiceIds.size,
      totalQuantity: item.totalQuantity,
      totalSpent: item.totalSpent,
    }))
    .sort((a, b) => b.invoiceCount - a.invoiceCount || b.totalSpent - a.totalSpent)
    .slice(0, 10);

  return {
    month,
    summary: {
      totalSpent,
      totalQuantity,
      distinctProducts,
      invoiceCount: invoices.length,
      averageTicket: invoices.length > 0 ? totalSpent / invoices.length : 0,
      supplierCount: suppliers.length,
      topSupplierName: suppliers[0]?.supplierName ?? null,
      topSupplierShare: suppliers[0]?.share ?? 0,
      recurringItemCount: recurringItems.length,
    },
    suppliers,
    recurringItems,
    categories: Array.from(categoryMap.values()).sort((a, b) => b.totalSpent - a.totalSpent),
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function buildPurchaseItemsSummary(
  invoiceRows: PurchaseItemsSummaryInvoiceRow[],
  itemRows: PurchaseItemsSummaryItemRow[],
  month: string,
) {
  const invoices = invoiceRows.filter(
    (invoice) => VALID_PURCHASE_INVOICE_STATUSES.has(invoice.status) && invoice.issueDate?.startsWith(month),
  );
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const items = itemRows.filter((item) => invoiceMap.has(item.invoiceId));

  type SourceSummary = {
    invoiceId: number;
    invoiceNumber: string | null;
    issueDate: string | null;
    supplierName: string;
    quantity: number;
    totalPrice: number;
  };
  type ProductSummary = {
    description: string;
    unit: string;
    totalQuantity: number;
    totalSpent: number;
    sources: Map<number, SourceSummary>;
  };
  type CategorySummary = {
    category: string;
    totalQuantity: number;
    totalSpent: number;
    invoiceIds: Set<number>;
    products: Map<string, ProductSummary>;
  };

  const categoryMap = new Map<string, CategorySummary>();
  const distinctProductKeys = new Set<string>();
  let totalQuantity = 0;
  let totalSpent = 0;

  for (const item of items) {
    const invoice = invoiceMap.get(item.invoiceId)!;
    const category = item.category || "outros";
    const descriptionKey = normalizeSearch(item.description) || `item-${item.id}`;
    const unit = item.unit?.trim() || "UN";
    const productKey = `${descriptionKey}::${normalizeSearch(unit)}`;
    const quantity = Number(item.quantity ?? 0);
    const lineTotal = Number(item.totalPrice ?? 0);
    distinctProductKeys.add(descriptionKey);
    totalQuantity += quantity;
    totalSpent += lineTotal;

    const categorySummary = categoryMap.get(category) ?? {
      category,
      totalQuantity: 0,
      totalSpent: 0,
      invoiceIds: new Set<number>(),
      products: new Map<string, ProductSummary>(),
    };
    categorySummary.totalQuantity += quantity;
    categorySummary.totalSpent += lineTotal;
    categorySummary.invoiceIds.add(item.invoiceId);

    const product = categorySummary.products.get(productKey) ?? {
      description: item.description,
      unit,
      totalQuantity: 0,
      totalSpent: 0,
      sources: new Map<number, SourceSummary>(),
    };
    product.totalQuantity += quantity;
    product.totalSpent += lineTotal;

    const source = product.sources.get(item.invoiceId) ?? {
      invoiceId: item.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      supplierName: invoice.supplierName?.trim() || "Fornecedor não identificado",
      quantity: 0,
      totalPrice: 0,
    };
    source.quantity += quantity;
    source.totalPrice += lineTotal;
    product.sources.set(item.invoiceId, source);
    categorySummary.products.set(productKey, product);
    categoryMap.set(category, categorySummary);
  }

  const categories = Array.from(categoryMap.values())
    .map((category) => {
      const products = Array.from(category.products.values())
        .map((product) => ({
          description: product.description,
          unit: product.unit,
          totalQuantity: product.totalQuantity,
          totalSpent: product.totalSpent,
          averageUnitPrice: product.totalQuantity > 0 ? product.totalSpent / product.totalQuantity : 0,
          invoiceCount: product.sources.size,
          sources: Array.from(product.sources.values()).sort((a, b) =>
            (b.issueDate ?? "").localeCompare(a.issueDate ?? "") || b.invoiceId - a.invoiceId,
          ),
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent || a.description.localeCompare(b.description, "pt-BR"));

      return {
        category: category.category,
        totalQuantity: category.totalQuantity,
        totalSpent: category.totalSpent,
        productCount: products.length,
        invoiceCount: category.invoiceIds.size,
        items: products,
      };
    })
    .sort((a, b) => {
      const aIndex = PURCHASE_CATEGORY_ORDER.indexOf(a.category);
      const bIndex = PURCHASE_CATEGORY_ORDER.indexOf(b.category);
      return (aIndex === -1 ? PURCHASE_CATEGORY_ORDER.length : aIndex)
        - (bIndex === -1 ? PURCHASE_CATEGORY_ORDER.length : bIndex)
        || b.totalSpent - a.totalSpent;
    });

  return {
    month,
    summary: {
      totalQuantity,
      distinctProducts: distinctProductKeys.size,
      invoiceCount: invoices.length,
      categoryCount: categories.length,
      itemLineCount: items.length,
      totalSpent,
    },
    categories,
  };
}
