import { z } from "zod";
import { invokeLLM } from "./_core/llm";

export const PURCHASE_INVOICE_MODEL = "gemini-3-flash-preview";

const allowedCategories = [
  "limpeza",
  "guloseimas",
  "caldas",
  "descartaveis",
  "embalagens",
  "manutencao",
  "insumos",
  "outros",
] as const;

const extractedItemSchema = z.object({
  line_number: z.number().int().positive(),
  supplier_code: z.string(),
  description: z.string().min(1),
  category: z.enum(allowedCategories),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  unit_price: z.number().nonnegative(),
  total_price: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
});

const extractedInvoiceSchema = z.object({
  supplier_name: z.string(),
  supplier_cnpj: z.string(),
  invoice_number: z.string(),
  access_key: z.string(),
  issue_date: z.string(),
  total_amount: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  items: z.array(extractedItemSchema).min(1),
});

const extractedDocumentSchema = z.object({
  invoices: z.array(extractedInvoiceSchema).min(1),
});

export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;

export type ValidatedInvoice = ExtractedInvoice & {
  itemSubtotal: number;
  validationErrors: string[];
  suggestedStatus: "extracted" | "review_required";
};

const responseSchema = {
  name: "purchase_invoice_document_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      invoices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            supplier_name: { type: "string" },
            supplier_cnpj: { type: "string" },
            invoice_number: { type: "string" },
            access_key: { type: "string" },
            issue_date: { type: "string", description: "Data no formato YYYY-MM-DD; vazio se ilegível" },
            total_amount: { type: "number" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  line_number: { type: "integer", minimum: 1 },
                  supplier_code: { type: "string" },
                  description: { type: "string" },
                  category: { type: "string", enum: allowedCategories },
                  quantity: { type: "number", minimum: 0 },
                  unit: { type: "string" },
                  unit_price: { type: "number", minimum: 0 },
                  total_price: { type: "number", minimum: 0 },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
                required: [
                  "line_number", "supplier_code", "description", "category", "quantity",
                  "unit", "unit_price", "total_price", "confidence",
                ],
                additionalProperties: false,
              },
            },
          },
          required: [
            "supplier_name", "supplier_cnpj", "invoice_number", "access_key",
            "issue_date", "total_amount", "confidence", "items",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["invoices"],
    additionalProperties: false,
  },
};

function money(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const br = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : "";
}

export function validateExtractedInvoice(input: ExtractedInvoice): ValidatedInvoice {
  const inoveWasReadAsSupplier = isInoveSystemName(input.supplier_name);
  const invoice: ExtractedInvoice = {
    ...input,
    supplier_name: inoveWasReadAsSupplier ? "" : input.supplier_name.trim(),
    supplier_cnpj: input.supplier_cnpj.replace(/\D/g, "").slice(0, 14),
    invoice_number: input.invoice_number.trim(),
    access_key: input.access_key.replace(/\D/g, "").slice(0, 44),
    issue_date: normalizeDate(input.issue_date),
    total_amount: money(input.total_amount),
    items: input.items.map((item, index) => ({
      ...item,
      line_number: index + 1,
      supplier_code: item.supplier_code.trim(),
      description: item.description.replace(/\s+/g, " ").trim(),
      unit: item.unit.trim().toUpperCase() || "UN",
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      total_price: money(item.total_price),
    })),
  };

  const errors: string[] = [];
  if (inoveWasReadAsSupplier) errors.push("INOVE é o sistema de PDV/estoque e não pode ser tratado como fornecedor.");
  if (!invoice.supplier_name) errors.push("Fornecedor não identificado.");
  if (!invoice.invoice_number) errors.push("Número da nota não identificado.");
  if (!invoice.issue_date) errors.push("Data de emissão ausente ou inválida.");
  if (invoice.total_amount <= 0) errors.push("Valor total da nota ausente ou inválido.");
  if (invoice.confidence < 0.7) errors.push("Confiança geral da extração abaixo de 70%.");

  for (const item of invoice.items) {
    const calculated = money(item.quantity * item.unit_price);
    const tolerance = Math.max(0.05, item.total_price * 0.01);
    if (Math.abs(calculated - item.total_price) > tolerance) {
      errors.push(`Linha ${item.line_number}: quantidade × preço não fecha com o total do item.`);
    }
    if (item.confidence < 0.6) {
      errors.push(`Linha ${item.line_number}: confiança abaixo de 60%.`);
    }
  }

  const itemSubtotal = money(invoice.items.reduce((sum, item) => sum + item.total_price, 0));
  const invoiceTolerance = Math.max(2, invoice.total_amount * 0.02);
  if (Math.abs(itemSubtotal - invoice.total_amount) > invoiceTolerance) {
    errors.push("A soma dos itens diverge mais de 2% (ou R$ 2,00) do total da nota.");
  }

  return {
    ...invoice,
    itemSubtotal,
    validationErrors: errors,
    suggestedStatus: errors.length === 0 ? "extracted" : "review_required",
  };
}

export async function extractPurchaseInvoicePdf(pdfUrl: string): Promise<{
  invoices: ValidatedInvoice[];
  model: string;
  promptTokens: number;
  completionTokens: number;
}> {
  const result = await invokeLLM({
    model: PURCHASE_INVOICE_MODEL,
    maxTokens: 32768,
    messages: [
      {
        role: "system",
        content:
          "Você extrai documentos fiscais brasileiros com precisão. Um PDF pode conter uma ou várias notas. " +
          "Separe cada NF-e/DANFE em um elemento distinto do array invoices e nunca misture itens de notas diferentes. " +
          "Transcreva todos os itens visíveis, " +
          "não invente campos ilegíveis e classifique cada item em uma das categorias permitidas. " +
          "Use valores numéricos sem símbolo de moeda. Em caso de dúvida, reduza a confiança.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Identifique todas as notas existentes no PDF. Para cada nota, extraia fornecedor, CNPJ, número, chave, data, valor total e cada linha de produto. " +
              "Material de limpeza deve usar categoria limpeza; doces e guloseimas, guloseimas; " +
              "quando nenhuma categoria específica couber, use outros.",
          },
          { type: "file_url", file_url: { url: pdfUrl, mime_type: "application/pdf" } },
        ],
      },
    ],
    responseFormat: { type: "json_schema", json_schema: responseSchema },
  });

  const content = result.choices[0]?.message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("O modelo não retornou uma extração estruturada.");
  }

  // Limpar possíveis caracteres de controle que quebram JSON.parse
  let cleanContent = content.trim();
  // Remover markdown code fences se presentes
  if (cleanContent.startsWith("```")) {
    cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  // Remover caracteres de controle invisíveis (exceto \n, \r, \t)
  cleanContent = cleanContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  
  let jsonObj: unknown;
  try {
    jsonObj = JSON.parse(cleanContent);
  } catch (parseErr: any) {
    // Tentar truncar no último } válido se o JSON está cortado
    const lastBrace = cleanContent.lastIndexOf("}");
    if (lastBrace > 0) {
      try {
        jsonObj = JSON.parse(cleanContent.slice(0, lastBrace + 1));
      } catch {
        throw new Error(`Erro ao interpretar resposta do modelo (JSON inválido na posição ${parseErr.message?.match(/position (\d+)/)?.[1] ?? "?"}). Tente importar novamente ou com menos páginas.`);
      }
    } else {
      throw new Error(`Erro ao interpretar resposta do modelo: ${parseErr.message}`);
    }
  }

  const parsed = extractedDocumentSchema.parse(jsonObj);
  return {
    invoices: parsed.invoices.map(validateExtractedInvoice),
    model: result.model || PURCHASE_INVOICE_MODEL,
    promptTokens: result.usage?.prompt_tokens ?? 0,
    completionTokens: result.usage?.completion_tokens ?? 0,
  };
}

export function isSorvefortSupplier(name: string | null | undefined): boolean {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .includes("SORVEFORT");
}

export function isInoveSystemName(name: string | null | undefined): boolean {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .includes("INOVE");
}

export function isTenLiterItem(description: string): boolean {
  return /\b10\s*(L|LT|LITRO|LITROS)\b/i.test(description);
}

export type PurchaseItemFilterInput = {
  supplier: "all" | "sorvefort" | "duo_gelatto" | "outros";
  search: string;
  dateFrom: string | null;
  dateTo: string | null;
  category: string;
};

export type PurchaseItemFilterRow = {
  supplierName: string | null;
  description: string;
  supplierCode: string | null;
  issueDate: string | null;
  category: string;
  status: string;
};

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesPurchaseItemFilters(
  row: PurchaseItemFilterRow,
  filters: PurchaseItemFilterInput,
): boolean {
  if (!["extracted", "review_required", "confirmed"].includes(row.status)) return false;
  if (filters.supplier === "sorvefort" && !isSorvefortSupplier(row.supplierName)) return false;
  if (filters.category !== "all" && row.category !== filters.category) return false;
  if (filters.dateFrom && (!row.issueDate || row.issueDate < filters.dateFrom)) return false;
  if (filters.dateTo && (!row.issueDate || row.issueDate > filters.dateTo)) return false;

  const search = normalizeSearch(filters.search);
  if (!search) return true;
  const haystack = normalizeSearch(`${row.description} ${row.supplierCode ?? ""}`);
  return haystack.includes(search);
}
