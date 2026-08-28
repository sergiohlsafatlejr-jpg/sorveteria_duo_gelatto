export type ProductGoalSelection = {
  id?: number;
  name: string;
};

export type ProductSale = {
  produtoId?: number;
  codPdv?: string | null;
  nome: string;
  qtd: number;
  total: number;
};

export type ProductGoalLike = {
  id: number;
  searchKeywords: string;
  targetQuantity: number;
};

export function normalizeProductName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function parseProductGoalSelection(value: string): ProductGoalSelection[] {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as Array<string | { id?: number; name?: string; nome?: string }>;
      return parsed
        .map((item) => {
          if (typeof item === "string") return { name: item.trim() };
          return {
            id: Number.isFinite(Number(item.id)) ? Number(item.id) : undefined,
            name: String(item.name ?? item.nome ?? "").trim(),
          };
        })
        .filter((item) => item.name.length > 0);
    } catch {
      // Continua para o formato legado abaixo.
    }
  }

  const separator = trimmed.includes("|") ? "|" : ",";
  return trimmed
    .split(separator)
    .map((name) => ({ name: name.trim() }))
    .filter((item) => item.name.length > 0);
}

export function serializeProductGoalSelection(selection: ProductGoalSelection[]): string {
  return JSON.stringify(
    selection
      .map((item) => ({
        ...(Number.isFinite(Number(item.id)) ? { id: Number(item.id) } : {}),
        name: item.name.trim(),
      }))
      .filter((item) => item.name.length > 0),
  );
}

export function calculateProductGoalProgress<T extends ProductGoalLike>(goal: T, products: ProductSale[]) {
  const selection = parseProductGoalSelection(goal.searchKeywords);
  const selectedIds = new Set(selection.flatMap((item) => item.id === undefined ? [] : [Number(item.id)]));
  const selectedNames = new Set(selection.map((item) => normalizeProductName(item.name)));

  const matchedProducts = products.filter((product) => {
    if (product.produtoId !== undefined && selectedIds.has(Number(product.produtoId))) return true;
    return selectedNames.has(normalizeProductName(product.nome));
  });

  const matchedIds = new Set(matchedProducts.flatMap((product) => product.produtoId === undefined ? [] : [Number(product.produtoId)]));
  const matchedNames = new Set(matchedProducts.map((product) => normalizeProductName(product.nome)));
  const missingProducts = selection.filter((item) => {
    if (item.id !== undefined && matchedIds.has(Number(item.id))) return false;
    return !matchedNames.has(normalizeProductName(item.name));
  });

  const realQty = matchedProducts.reduce((sum, product) => sum + Number(product.qtd || 0), 0);
  const realRevenue = matchedProducts.reduce((sum, product) => sum + Number(product.total || 0), 0);
  const percentQty = goal.targetQuantity > 0 ? (realQty / goal.targetQuantity) * 100 : 0;

  return {
    ...goal,
    selectedProducts: selection,
    matchedProducts,
    missingProducts,
    realQty,
    realRevenue,
    percentQty,
  };
}

export function normalizeEpochTimestamp(value: number | string | null | undefined): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  return new Date(milliseconds).toISOString();
}
