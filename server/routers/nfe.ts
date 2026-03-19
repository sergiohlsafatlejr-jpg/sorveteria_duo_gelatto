import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import * as db from "../db";
import { products, stockMovements } from "../../drizzle/schema";
import { eq, or, like, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type NfeItem = {
  nItem: number;
  cProd: string;
  xProd: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  ncm: string;
  cfop: string;
};

export type NfeInfo = {
  nNF: string;
  dhEmi: string;
  emitCnpj: string;
  emitNome: string;
  destCnpj: string;
  destNome: string;
  vNF: number;
};

// ─── Parser de NF-e XML ───────────────────────────────────────────────────────
function parseNfeXml(xmlContent: string): { info: NfeInfo; items: NfeItem[] } {
  // Remove namespace prefixes for easier parsing
  const clean = xmlContent.replace(/<\/?nfe:/g, "<").replace(/xmlns[^"]*"[^"]*"/g, "");

  function getTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
    return match ? match[1].trim() : "";
  }

  function getAllTags(xml: string, tag: string): string[] {
    const results: string[] = [];
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "g");
    let m;
    while ((m = regex.exec(xml)) !== null) {
      results.push(m[1]);
    }
    return results;
  }

  // Info da NF
  const ideMatch = clean.match(/<ide>([\s\S]*?)<\/ide>/);
  const ideXml = ideMatch ? ideMatch[1] : "";
  const emitMatch = clean.match(/<emit>([\s\S]*?)<\/emit>/);
  const emitXml = emitMatch ? emitMatch[1] : "";
  const destMatch = clean.match(/<dest>([\s\S]*?)<\/dest>/);
  const destXml = destMatch ? destMatch[1] : "";
  const totalMatch = clean.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/);
  const totalXml = totalMatch ? totalMatch[1] : "";

  const info: NfeInfo = {
    nNF: getTag(ideXml, "nNF"),
    dhEmi: getTag(ideXml, "dhEmi"),
    emitCnpj: getTag(emitXml, "CNPJ"),
    emitNome: getTag(emitXml, "xNome"),
    destCnpj: getTag(destXml, "CNPJ"),
    destNome: getTag(destXml, "xNome"),
    vNF: parseFloat(getTag(totalXml, "vNF") || "0"),
  };

  // Itens
  const detBlocks = getAllTags(clean, "det");
  const items: NfeItem[] = detBlocks.map((det, i) => {
    const prodMatch = det.match(/<prod>([\s\S]*?)<\/prod>/);
    const prodXml = prodMatch ? prodMatch[1] : "";
    return {
      nItem: i + 1,
      cProd: getTag(prodXml, "cProd"),
      xProd: getTag(prodXml, "xProd"),
      uCom: getTag(prodXml, "uCom"),
      qCom: parseFloat(getTag(prodXml, "qCom") || "0"),
      vUnCom: parseFloat(getTag(prodXml, "vUnCom") || "0"),
      vProd: parseFloat(getTag(prodXml, "vProd") || "0"),
      ncm: getTag(prodXml, "NCM"),
      cfop: getTag(prodXml, "CFOP"),
    };
  });

  return { info, items };
}

// ─── Extrai fator de conversão do nome do produto ─────────────────────────────
function extractConversionFromName(xProd: string): number {
  // Ex: "LIMAO 30 UND - FRUTA" → 30
  // Ex: "ACAI 24 UND - SP" → 24
  // Ex: "DUOBLITO 26 UND - PREMIUM" → 26
  const match = xProd.match(/\b(\d+)\s+UND\b/i);
  if (match) return parseInt(match[1]);
  // Ex: "PACK 4 UND." → 4
  const match2 = xProd.match(/PACK\s+(\d+)\s+UND/i);
  if (match2) return parseInt(match2[1]);
  return 1;
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const nfeRouter = router({
  // Parse do XML e retorna os itens com sugestão de vínculo com produtos cadastrados
  parse: protectedProcedure
    .input(z.object({ xmlContent: z.string() }))
    .mutation(async ({ input }) => {
      const { info, items } = parseNfeXml(input.xmlContent);
      const dbInstance = await getDb();
      if (!dbInstance) return { info, items: items.map((item) => ({ ...item, matchedProductId: null, matchedProductName: null, stockUnit: "un", conversionFactor: 1, stockQty: item.qCom })) };

      // Para cada item, tenta encontrar produto cadastrado por supplierCode ou nome similar
      const enriched = await Promise.all(
        items.map(async (item) => {
          // Busca por supplierCode primeiro
          const byCode = await dbInstance
            .select({ id: products.id, name: products.name, unit: products.unit, purchaseUnit: products.purchaseUnit, conversionFactor: products.conversionFactor })
            .from(products)
            .where(eq(products.supplierCode, item.cProd))
            .limit(1);

          if (byCode.length > 0) {
            const p = byCode[0];
            const factor = p.conversionFactor ?? 1;
            return {
              ...item,
              matchedProductId: p.id,
              matchedProductName: p.name,
              stockUnit: p.unit,
              conversionFactor: factor,
              stockQty: item.qCom * factor,
            };
          }

          // Busca por nome similar (primeiras palavras)
          const firstWord = item.xProd.split(" ")[0];
          const byName = await dbInstance
            .select({ id: products.id, name: products.name, unit: products.unit, purchaseUnit: products.purchaseUnit, conversionFactor: products.conversionFactor })
            .from(products)
            .where(like(products.name, `%${firstWord}%`))
            .limit(1);

          const suggestedFactor = extractConversionFromName(item.xProd);

          if (byName.length > 0) {
            const p = byName[0];
            const factor = p.conversionFactor > 1 ? p.conversionFactor : suggestedFactor;
            return {
              ...item,
              matchedProductId: p.id,
              matchedProductName: p.name,
              stockUnit: p.unit,
              conversionFactor: factor,
              stockQty: item.qCom * factor,
            };
          }

          return {
            ...item,
            matchedProductId: null,
            matchedProductName: null,
            stockUnit: "un",
            conversionFactor: suggestedFactor,
            stockQty: item.qCom * suggestedFactor,
          };
        })
      );

      return { info, items: enriched };
    }),

  // Confirma a importação: dá entrada no estoque para cada item vinculado
  confirm: protectedProcedure
    .input(
      z.object({
        nfeDate: z.string(),
        supplier: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.number(),
            qCom: z.number(),
            conversionFactor: z.number().int().min(1),
            stockQty: z.number().int().min(1),
            vUnCom: z.number(),
            xProd: z.string(),
            cProd: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new Error("DB não disponível");

      const purchaseDate = new Date(input.nfeDate);
      let imported = 0;

      for (const item of input.items) {
        const [productRow] = await dbInstance
          .select({ currentStock: products.currentStock })
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);

        if (!productRow) continue;

        const previousStock = productRow.currentStock;
        const newStock = previousStock + item.stockQty;

        // Atualiza estoque
        await dbInstance
          .update(products)
          .set({ currentStock: newStock })
          .where(eq(products.id, item.productId));

        // Registra movimentação
        await dbInstance.insert(stockMovements).values({
          productId: item.productId,
          type: "in",
          quantity: item.stockQty,
          previousStock,
          newStock,
          reason: `NF-e: ${item.xProd} (${item.qCom} ${item.qCom === 1 ? "cx" : "cxs"} × ${item.conversionFactor} un)`,
          purchaseDate,
          supplier: input.supplier ?? undefined,
          unitCost: item.vUnCom > 0 ? String(item.vUnCom / item.conversionFactor) : undefined,
          userId: ctx.user.id,
        });

        // Atualiza supplierCode no produto se não tiver
        if (item.cProd) {
          await dbInstance
            .update(products)
            .set({ supplierCode: item.cProd, conversionFactor: item.conversionFactor })
            .where(and(eq(products.id, item.productId), sql`(supplierCode IS NULL OR supplierCode = '')`));
        }

        imported++;
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "create",
        module: "nfe_import",
        targetId: 0,
        details: `NF-e importada: ${imported} produto(s) com entrada no estoque`,
      });

      return { imported };
    }),

  // Lista todos os produtos cadastrados para o mapeamento manual
  productsList: protectedProcedure.query(async () => {
    const dbInstance = await getDb();
    if (!dbInstance) return [];
    return dbInstance
      .select({ id: products.id, name: products.name, unit: products.unit, purchaseUnit: products.purchaseUnit, conversionFactor: products.conversionFactor, supplierCode: products.supplierCode })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(products.name);
  }),
});
