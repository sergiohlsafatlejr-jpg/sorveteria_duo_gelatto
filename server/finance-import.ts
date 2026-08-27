import { toOptionalPositiveId } from "../shared/optional-id";

export type ParsedPayableRow = {
  description: string;
  amount: number;
  dueDate: Date;
  isPaid: boolean;
  costIdCandidate?: number;
  costReference?: string;
};

export type FinancialCostReference = {
  id: number;
  name: string;
};

const COST_LABEL_ALIASES: Record<string, string[]> = {
  SORVETE: ["SORVETE", "SORVETES", "DUO GELATTO"],
  GULOSEIMA: ["GULOSEIMA", "GULOSEIMAS"],
  SEGURO: ["SEGURO", "SEGURO DA LOJA"],
  "CUSTO PESSOAL": ["CUSTO PESSOAL", "PESSOAL"],
};

export function normalizeFinancialLabel(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function findFinancialCostId(
  reference: unknown,
  costs: FinancialCostReference[],
): number | undefined {
  const normalizedReference = normalizeFinancialLabel(reference);
  if (!normalizedReference) return undefined;

  const direct = costs.find(cost => normalizeFinancialLabel(cost.name) === normalizedReference);
  if (direct) return toOptionalPositiveId(direct.id);

  const aliases = COST_LABEL_ALIASES[normalizedReference] ?? [normalizedReference];
  const matched = costs.find(cost => aliases.includes(normalizeFinancialLabel(cost.name)));
  return matched ? toOptionalPositiveId(matched.id) : undefined;
}

function normalizeHeader(value: string): string {
  return normalizeFinancialLabel(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseSpreadsheetMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let text = String(value ?? "").replace(/[^0-9,.-]/g, "");
  if (!text) return 0;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalMark = lastComma > lastDot ? "," : ".";
    const thousandsMark = decimalMark === "," ? "." : ",";
    text = text.split(thousandsMark).join("");
    if (decimalMark === ",") text = text.replace(",", ".");
  } else if (lastComma >= 0) {
    const decimals = text.length - lastComma - 1;
    text = decimals === 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decimals = text.length - lastDot - 1;
    if (decimals !== 2) text = text.replace(/\./g, "");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseSpreadsheetDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const utcDate = new Date(excelEpoch + Math.round(value) * 86_400_000);
    return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), 12, 0, 0);
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  let match = text.match(/^(\d{2})-(\d{2})-(\d{2}|\d{4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return new Date(year, Number(match[1]) - 1, Number(match[2]), 12, 0, 0);
  }

  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12, 0, 0);

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);

  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function parsePayableSpreadsheetRow(row: Record<string, unknown>): ParsedPayableRow | null {
  const get = (...keys: string[]): unknown => {
    const normalizedKeys = keys.map(normalizeHeader);
    const found = Object.keys(row).find((key) => normalizedKeys.includes(normalizeHeader(key)));
    return found ? row[found] : undefined;
  };

  const description = String(get("descricao", "description", "nome", "name", "historico") ?? "").trim();
  const amount = parseSpreadsheetMoney(get("valor", "amount", "value", "vlr", "vl"));
  const dueDate = parseSpreadsheetDate(get("vencimento", "duedate", "data", "date", "datadevencimento"));
  if (!description || amount <= 0 || !dueDate) return null;

  const paidLabel = normalizeFinancialLabel(get("pago", "paid", "status", "situacao"));
  const isPaid = ["SIM", "YES", "PAGO", "PAID", "PG", "1", "TRUE"].includes(paidLabel);
  const rawCost = get("custo", "costid", "cost");
  const costReference = String(rawCost ?? "").trim() || undefined;

  return {
    description,
    amount,
    dueDate,
    isPaid,
    costIdCandidate: toOptionalPositiveId(rawCost),
    costReference,
  };
}
