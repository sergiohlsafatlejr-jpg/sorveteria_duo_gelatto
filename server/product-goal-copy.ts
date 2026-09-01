export type ProductGoalCopySource = {
  productName: string;
  searchKeywords: string | null;
  targetQuantity: number;
  targetRevenue: string | null;
  icon: string | null;
};

export function getPreviousMonthKey(targetMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(targetMonth);
  if (!match) throw new Error("Mês de destino inválido");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Mês de destino inválido");

  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
}

export function normalizeProductGoalName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

export function buildCopiedProductGoal(source: ProductGoalCopySource, targetMonth: string) {
  return {
    productName: source.productName,
    searchKeywords: source.searchKeywords ?? "",
    targetQuantity: source.targetQuantity,
    targetRevenue: source.targetRevenue ?? "0",
    month: targetMonth,
    icon: source.icon ?? "🎯",
    active: true as const,
  };
}
