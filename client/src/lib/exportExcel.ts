import * as XLSX from "xlsx";

/**
 * Exporta um array de objetos para um arquivo .xlsx
 * @param data Array de objetos (cada objeto é uma linha)
 * @param filename Nome do arquivo sem extensão
 * @param sheetName Nome da aba (padrão: "Dados")
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = "Dados"
) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Exporta múltiplas abas para um único arquivo .xlsx
 * @param sheets Array de { name, data }
 * @param filename Nome do arquivo sem extensão
 */
export function exportToExcelMultiSheet(
  sheets: { name: string; data: Record<string, unknown>[] }[],
  filename: string
) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Formata moeda para string legível no Excel */
export function fmtMoeda(v: number | string | null | undefined): string {
  if (v == null) return "R$ 0,00";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}
