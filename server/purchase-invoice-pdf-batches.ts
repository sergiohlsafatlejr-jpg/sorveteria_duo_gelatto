import { PDFDocument } from "pdf-lib";
import type { ValidatedInvoice } from "./purchase-invoice-extraction";

export const MODEL_MAX_PDF_BYTES = 50 * 1024 * 1024;
export const PDF_BATCH_PAGE_COUNT = 6;
export const PDF_BATCH_OVERLAP = 1;

export type PdfPageRange = { from: number; to: number };

export function buildOverlappingPageRanges(
  pageCount: number,
  pagesPerBatch = PDF_BATCH_PAGE_COUNT,
  overlap = PDF_BATCH_OVERLAP,
): PdfPageRange[] {
  if (pageCount <= 0) return [];
  if (pagesPerBatch <= overlap) throw new Error("O lote precisa ter mais páginas que a sobreposição.");
  const ranges: PdfPageRange[] = [];
  let from = 1;
  while (from <= pageCount) {
    const to = Math.min(pageCount, from + pagesPerBatch - 1);
    ranges.push({ from, to });
    if (to === pageCount) break;
    from = to - overlap + 1;
  }
  return ranges;
}

export async function splitPdfIntoBatches(buffer: Buffer): Promise<Array<PdfPageRange & { buffer: Buffer }>> {
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const ranges = buildOverlappingPageRanges(source.getPageCount());
  const batches: Array<PdfPageRange & { buffer: Buffer }> = [];
  for (const range of ranges) {
    const target = await PDFDocument.create();
    const indexes = Array.from({ length: range.to - range.from + 1 }, (_, index) => range.from - 1 + index);
    const pages = await target.copyPages(source, indexes);
    pages.forEach((page) => target.addPage(page));
    const bytes = await target.save({ useObjectStreams: true, addDefaultPage: false });
    batches.push({ ...range, buffer: Buffer.from(bytes) });
  }
  return batches;
}

function invoiceKey(invoice: ValidatedInvoice): string {
  const accessKey = invoice.access_key.replace(/\D/g, "");
  if (accessKey.length === 44) return `key:${accessKey}`;
  return `fallback:${invoice.supplier_cnpj}:${invoice.invoice_number}:${invoice.issue_date}:${invoice.operation_nature}`;
}

function completenessScore(invoice: ValidatedInvoice): number {
  return invoice.items.length * 100
    + (invoice.access_key.length === 44 ? 20 : 0)
    + (invoice.invoice_number ? 10 : 0)
    + (invoice.validationErrors.length === 0 ? 5 : 0)
    + invoice.confidence;
}

export function mergeExtractedInvoiceBatches(batches: ValidatedInvoice[][]): ValidatedInvoice[] {
  const merged = new Map<string, ValidatedInvoice>();
  for (const invoice of batches.flat()) {
    if (!invoice.invoice_number && invoice.access_key.length !== 44) continue;
    const key = invoiceKey(invoice);
    const current = merged.get(key);
    if (!current || completenessScore(invoice) > completenessScore(current)) merged.set(key, invoice);
  }
  return Array.from(merged.values()).sort((a, b) => {
    const date = a.issue_date.localeCompare(b.issue_date);
    if (date !== 0) return date;
    return a.invoice_number.localeCompare(b.invoice_number, "pt-BR", { numeric: true });
  });
}
