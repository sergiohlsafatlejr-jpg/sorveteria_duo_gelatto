/**
 * mapping-excel.ts
 * Exportação e importação de mapeamento PDV→Estoque via Excel
 * Exportação: exceljs (formatação profissional)
 * Importação: SheetJS/xlsx (suporta .xls e .xlsx)
 */
import ExcelJS from "exceljs";
import XLSXModule from "xlsx";
const XLSX = XLSXModule;

export interface MappingRow {
  productId: number;
  productName: string;
  currentStock: number;
  unit: string;
  externalCode: string | null;
  externalName: string | null;
}

export interface ImportedMapping {
  productId: number;
  externalCode: string | null;
}

// ─── Exportar XLSX ────────────────────────────────────────────────────────────
export async function exportMappingToBuffer(mappings: MappingRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Duo Gelatto";
  wb.created = new Date();

  const ws = wb.addWorksheet("Mapeamento PDV");

  // Título
  ws.mergeCells("A1:G1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "Mapeamento PDV → Estoque — Duo Gelatto";
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 30;

  // Instrução
  ws.mergeCells("A2:G2");
  const instrCell = ws.getCell("A2");
  instrCell.value =
    "Preencha as colunas VERDES (Código PDV e Nome PDV) para vincular cada produto. Deixe em branco para remover o vínculo.";
  instrCell.font = { italic: true, size: 10, color: { argb: "FF555555" } };
  instrCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } };
  instrCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(2).height = 22;

  // Linha vazia
  ws.addRow([]);

  // Cabeçalho
  const headerRow = ws.addRow([
    "ID Produto",
    "Nome no Estoque",
    "Estoque Atual",
    "Unidade",
    "Código PDV ✏️",
    "Nome no PDV ✏️",
    "Status Atual",
  ]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E4057" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF1E3A5F" } },
    };
  });
  ws.getRow(4).height = 22;

  // Dados
  for (const m of mappings) {
    const isMapped = !!m.externalCode;
    const row = ws.addRow([
      m.productId,
      m.productName,
      m.currentStock,
      m.unit,
      m.externalCode ?? "",
      m.externalName ?? "",
      isMapped ? "✅ Mapeado" : "⚠️ Sem vínculo",
    ]);

    // Colunas editáveis (E e F) em verde claro
    ["E", "F"].forEach((col) => {
      const cell = row.getCell(col);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFA5D6A7" } },
        bottom: { style: "thin", color: { argb: "FFA5D6A7" } },
        left: { style: "thin", color: { argb: "FFA5D6A7" } },
        right: { style: "thin", color: { argb: "FFA5D6A7" } },
      };
    });

    // Status colorido
    const statusCell = row.getCell("G");
    statusCell.font = {
      color: { argb: isMapped ? "FF2E7D32" : "FFE65100" },
      bold: isMapped,
    };

    // Zebra
    if (row.number % 2 === 0) {
      ["A", "B", "C", "D", "G"].forEach((col) => {
        const cell = row.getCell(col);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      });
    }
  }

  // Larguras das colunas
  ws.columns = [
    { key: "A", width: 12 },
    { key: "B", width: 42 },
    { key: "C", width: 14 },
    { key: "D", width: 10 },
    { key: "E", width: 16 },
    { key: "F", width: 36 },
    { key: "G", width: 16 },
  ];

  // Congelar cabeçalho
  ws.views = [{ state: "frozen", ySplit: 4, xSplit: 0, activeCell: "E5" }];

  // Auto-filtro
  ws.autoFilter = { from: "A4", to: "G4" };

  return (wb.xlsx.writeBuffer() as unknown) as Promise<Buffer>;
}

// ─── Importar XLS/XLSX (SheetJS — suporta .xls legado e .xlsx) ───────────────────────
export async function importMappingFromBuffer(
  buffer: Buffer
): Promise<{ mappings: ImportedMapping[]; total: number; toLink: number; toUnlink: number }> {
  // SheetJS suporta tanto .xls (BIFF8) quanto .xlsx (OOXML)
  const wb = XLSX.read(buffer, { type: "buffer" });

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error("Nenhuma planilha encontrada no arquivo Excel.");
  }

  // Usar a primeira aba disponível
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Converter para array de arrays
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: false, // valores como string para facilitar trim
  });

  const mappings: ImportedMapping[] = [];
  let toLink = 0;
  let toUnlink = 0;

  // Detectar se é o arquivo exportado pelo sistema (tem cabeçalho na linha 4)
  // ou outro formato. Procurar a linha de cabeçalho com "ID Produto"
  let dataStartRow = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (row && String(row[0] ?? "").includes("ID Produto")) {
      dataStartRow = i + 1; // dados começam na próxima linha
      break;
    }
  }

  if (dataStartRow === 0) {
    throw new Error(
      'Formato de arquivo não reconhecido. Use o arquivo exportado pelo sistema (botão "Exportar Excel") e preencha as colunas verdes.'
    );
  }

  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Coluna A (índice 0) = ID Produto
    const productId = Number(row[0]);
    if (!productId || isNaN(productId)) continue;

    // Coluna E (índice 4) = Código PDV
    const rawCode = row[4];
    let externalCode: string | null = null;
    if (rawCode !== null && rawCode !== undefined && String(rawCode).trim() !== "") {
      externalCode = String(rawCode).trim();
    }

    mappings.push({ productId, externalCode });
    if (externalCode) toLink++;
    else toUnlink++;
  }

  return { mappings, total: mappings.length, toLink, toUnlink };
}