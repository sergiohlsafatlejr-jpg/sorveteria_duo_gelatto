export const FINANCIAL_COST_LABEL_ALIASES: Record<string, string[]> = {
  SORVETE: ["SORVETE", "SORVETES", "DUO GELATTO"],
  GULOSEIMA: ["GULOSEIMA", "GULOSEIMAS"],
  SEGURO: ["SEGURO", "SEGURO DA LOJA"],
  "CUSTO PESSOAL": ["CUSTO PESSOAL", "PESSOAL", "SALARIOS"],
  SANEAGO: ["SANEAGO", "AGUA"],
};

export function normalizeFinancialLabel(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function canonicalFinancialCostName(value: unknown): string {
  const normalized = normalizeFinancialLabel(value);
  if (!normalized) return "";
  const group = Object.entries(FINANCIAL_COST_LABEL_ALIASES).find(([canonical, aliases]) =>
    [canonical, ...aliases].map(normalizeFinancialLabel).includes(normalized),
  );
  return group?.[0] ?? normalized;
}

export function financialCostNamesCorrespond(financialName: unknown, linkedCostName: unknown): boolean {
  const financialCanonical = canonicalFinancialCostName(financialName);
  const linkedCanonical = canonicalFinancialCostName(linkedCostName);
  return Boolean(financialCanonical && linkedCanonical && financialCanonical === linkedCanonical);
}
