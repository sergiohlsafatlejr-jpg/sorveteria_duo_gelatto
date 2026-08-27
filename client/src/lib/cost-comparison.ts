import { financialCostNamesCorrespond } from "../../../shared/financial-labels";

export type FinancialTransactionForCostComparison = {
  costId?: number | string | null;
  financialCostName?: string | null;
  amount?: number | string | null;
};

export type FinancialNamesByCost = {
  names: string[];
  count: number;
  total: number;
};

export function buildFinancialNamesByCost(
  transactions: FinancialTransactionForCostComparison[],
): Map<number, FinancialNamesByCost> {
  const grouped = new Map<number, FinancialNamesByCost>();
  for (const transaction of transactions) {
    const costId = Number(transaction.costId);
    if (!Number.isInteger(costId) || costId <= 0) continue;
    const current = grouped.get(costId) ?? { names: [], count: 0, total: 0 };
    const financialName = String(transaction.financialCostName ?? "").trim();
    if (financialName && !current.names.includes(financialName)) current.names.push(financialName);
    current.count += 1;
    current.total += Number(transaction.amount ?? 0);
    grouped.set(costId, current);
  }
  return grouped;
}

export type CostNameComparisonStatus = "corresponds" | "divergent" | "unlinked";

export function getCostNameComparisonStatus(
  linkedCostName: string,
  financialNames?: FinancialNamesByCost,
): CostNameComparisonStatus {
  if (!financialNames?.names.length) return "unlinked";
  return financialNames.names.every(name => financialCostNamesCorrespond(name, linkedCostName))
    ? "corresponds"
    : "divergent";
}
