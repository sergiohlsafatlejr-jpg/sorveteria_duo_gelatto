/**
 * Utilitários de data/hora para o fuso horário de Brasília (America/Sao_Paulo, UTC-3)
 *
 * PROBLEMA: O SQL Server INOVE armazena datas no horário local do Brasil (UTC-3).
 * Quando o JavaScript recebe uma string como "2026-04-28 12:30:02" (sem timezone),
 * ele a interpreta como UTC, exibindo 09:30 em vez de 12:30.
 *
 * SOLUÇÃO: Tratar strings de data do INOVE como horário de Brasília explicitamente.
 */

const TZ = "America/Sao_Paulo";

/**
 * Converte uma string de data do INOVE (sem timezone) para Date no horário de Brasília.
 * Ex: "2026-04-28 12:30:02" → Date representando 12:30 BRT
 */
export function parseBRT(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  // Substitui espaço por T e adiciona offset -03:00 para forçar interpretação como BRT
  const normalized = dateStr.replace(" ", "T") + "-03:00";
  return new Date(normalized);
}

/**
 * Formata uma string de data do INOVE para exibição em pt-BR com horário de Brasília.
 * Ex: "2026-04-28 12:30:02" → "28/04/2026 12:30"
 */
export function formatDateTimeBRT(dateStr: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return "—";
  const date = parseBRT(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

/**
 * Formata apenas a data (sem hora) de uma string do INOVE.
 * Ex: "2026-04-28 12:30:02" → "28/04/2026"
 */
export function formatDateBRT(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = parseBRT(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formata apenas a hora de uma string do INOVE.
 * Ex: "2026-04-28 12:30:02" → "12:30"
 */
export function formatTimeBRT(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = parseBRT(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formata um timestamp Unix (ms) para data/hora em Brasília.
 * Ex: 1714305002000 → "28/04/2026 12:30"
 */
export function formatTimestampBRT(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Retorna a data atual no horário de Brasília no formato YYYY-MM-DD.
 * Útil para filtros de "hoje" no frontend.
 */
export function todayBRT(): string {
  return new Date().toLocaleDateString("pt-BR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).split("/").reverse().join("-"); // dd/mm/yyyy → yyyy-mm-dd
}

/**
 * Retorna a hora atual no horário de Brasília (0-23).
 */
export function currentHourBRT(): number {
  return parseInt(
    new Date().toLocaleString("pt-BR", { timeZone: TZ, hour: "2-digit", hour12: false }),
    10
  );
}

/**
 * Formata uma string de data "YYYY-MM-DD" para exibição "DD/MM/YYYY".
 */
export function formatDateISO(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}
