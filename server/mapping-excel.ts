/**
 * mapping-excel.ts
 * Exportação e importação de mapeamento PDV→Estoque via Excel
 * Usa exceljs (TypeScript puro, sem dependência de Python)
 */
import ExcelJS from "exceljs";

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

// ─── Importar XLSX ────────────────────────────────────────────────────────────
export async function importMappingFromBuffer(
  buffer: Buffer
): Promise<{ mappings: ImportedMapping[]; total: number; toLink: number; toUnlink: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Planilha não encontrada no arquivo Excel.");

  const mappings: ImportedMapping[] = [];
  let toLink = 0;
  let toUnlink = 0;

  // Dados começam na linha 5 (1=título, 2=instrução, 3=vazia, 4=cabeçalho)
  ws.eachRow((row, rowNum) => {
    if (rowNum < 5) return;

    const productId = Number(row.getCell(1).value);
    if (!productId || isNaN(productId)) return;

    const rawCode = row.getCell(5).value;
    let externalCode: string | null = null;
    if (rawCode !== null && rawCode !== undefined && String(rawCode).trim() !== "") {
      externalCode = String(rawCode).trim();
    }

    mappings.push({ productId, externalCode });
    if (externalCode) toLink++;
    else toUnlink++;
  });

  return { mappings, total: mappings.length, toLink, toUnlink };
}
