/**
 * Converte valores de formulários e APIs em um identificador inteiro positivo.
 * Valores vazios, sentinelas e números inválidos são tratados como não informados.
 */
export function toOptionalPositiveId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "" || value === "none") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}
