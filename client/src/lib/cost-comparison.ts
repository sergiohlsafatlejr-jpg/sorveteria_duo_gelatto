import { financialCostNamesCorrespond } from "../../../shared/financial-labels";

export type FinancialTransactionForCostComparison = {
  costId?: number | string | null;
  financialCostName?: string | null;
  amount?: number | string | null;
  dueDate?: Date | string | number | null;
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

export function filterTransactionsByReferenceMonth(
  transactions: FinancialTransactionForCostComparison[],
  referenceMonth: string,
): FinancialTransactionForCostComparison[] {
  return transactions.filter(transaction => {
    if (!transaction.dueDate) return false;
    if (typeof transaction.dueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(transaction.dueDate)) {
      return transaction.dueDate.slice(0, 7) === referenceMonth;
    }
    const date = transaction.dueDate instanceof Date
      ? transaction.dueDate
      : new Date(transaction.dueDate);
    if (Number.isNaN(date.getTime())) return false;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return month === referenceMonth;
  });
}

export function getMonthlyCostValues(
  registeredAmount: number | string | null | undefined,
  financialNames?: FinancialNamesByCost,
) {
  const planned = Number(registeredAmount ?? 0);
  const actual = financialNames?.total ?? 0;
  return { planned, actual, variance: actual - planned };
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
