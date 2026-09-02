export function normalizeRedeHeader(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

export function parseRedeDecimal(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  if (!text || text === "-") return 0;

  const cleaned = text.replace(/R\$/gi, "").replace(/%/g, "").replace(/\s/g, "");
  if (!cleaned) return 0;
  const decimalSeparator = cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? "," : ".";
  const normalized = decimalSeparator === ","
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseRedeOptionalDecimal(value: unknown): number | undefined {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return undefined;
  return parseRedeDecimal(value);
}

export function parseRedeDate(value: unknown): Date {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === "number") return new Date(Math.round((value - 25569) * 86400000));
  const text = String(value ?? "").trim();
  const brazilian = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brazilian) return new Date(Date.UTC(Number(brazilian[3]), Number(brazilian[2]) - 1, Number(brazilian[1])));
  return new Date(text);
}

export function parseRedeTime(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "" || value === "-") return undefined;
  if (typeof value !== "number") return String(value).trim();
  const fraction = ((value % 1) + 1) % 1;
  const totalSeconds = Math.round(fraction * 86400) % 86400;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function isAcceptedRedeSale(status: unknown, canceled: unknown): boolean {
  const normalizedStatus = normalizeRedeHeader(status);
  const canceledText = normalizeRedeHeader(canceled);
  return ["aprovada", "aprovado", "pago", "paga"].includes(normalizedStatus)
    && !["sim", "true", "1"].includes(canceledText);
}

export function getRedeDateRange(dates: Date[]): { start: Date; end: Date } {
  const timestamps = dates.map((date) => date.getTime()).filter(Number.isFinite);
  if (timestamps.length === 0) throw new Error("Nenhuma data válida encontrada para conciliação.");
  return {
    start: new Date(Math.min(...timestamps)),
    end: new Date(Math.max(...timestamps)),
  };
}

export type RedePaymentFamily = "pix" | "debit" | "credit" | "voucher" | "other";

export function getRedePaymentFamily(value: unknown): RedePaymentFamily {
  const normalized = normalizeRedeHeader(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("pix")) return "pix";
  if (normalized.includes("deb")) return "debit";
  if (normalized.includes("cred")) return "credit";
  if (normalized.includes("voucher") || normalized.includes("vale") || normalized.includes("convenio") || normalized.includes("cortesia")) return "voucher";
  return "other";
}

export function areRedePaymentMethodsCompatible(redeMethod: unknown, inoveMethod: unknown): boolean {
  const redeFamily = getRedePaymentFamily(redeMethod);
  const inoveFamily = getRedePaymentFamily(inoveMethod);
  return redeFamily !== "other" && redeFamily === inoveFamily;
}
