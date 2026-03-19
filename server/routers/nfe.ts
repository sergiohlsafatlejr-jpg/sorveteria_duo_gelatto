import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import * as db from "../db";
import { products, stockMovements } from "../../drizzle/schema";
import { eq, like, and } from "drizzle-orm";
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
  const match = xProd.match(/\b(\d+)\s+UND\b/i);
  if (match) return parseInt(match[1]);
  const match2 = xProd.match(/PACK\s+(\d+)\s+UND/i);
  if (match2) return parseInt(match2[1]);
  return 1;
}

// ─── Formata nome do produto para cadastro ────────────────────────────────────
function formatProductName(xProd: string): string {
  // Converte "LIMAO 30 UND - FRUTA" → "Limão 30 Und - Fruta"
  return xProd
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUnd\b/g, "und")
    .replace(/\bCx\b/g, "cx");
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const nfeRouter = router({
  // Parse do XML e retorna os itens com sugestão de vínculo (ou criação automática)
  parse: protectedProcedure
    .input(z.object({ xmlContent: z.string() }))
    .mutation(async ({ input }) => {
      const { info, items } = parseNfeXml(input.xmlContent);
      const dbInstance = await getDb();
      if (!dbInstance) {
        return {
          info,
          items: items.map((item) => ({
            ...item,
            matchedProductId: null,
            matchedProductName: null,
            isNew: true,
            stockUnit: "un",
            conversionFactor: extractConversionFromName(item.xProd),
            stockQty: item.qCom * extractConversionFromName(item.xProd),
          })),
        };
      }

      const enriched = await Promise.all(
        items.map(async (item) => {
          const suggestedFactor = extractConversionFromName(item.xProd);

          // 1. Busca por supplierCode
          const byCode = await dbInstance
            .select({ id: products.id, name: products.name, unit: products.unit, conversionFactor: products.conversionFactor })
            .from(products)
            .where(eq(products.supplierCode, item.cProd))
            .limit(1);

          if (byCode.length > 0) {
            const p = byCode[0];
            const factor = p.conversionFactor ?? suggestedFactor;
            return {
              ...item,
              matchedProductId: p.id,
              matchedProductName: p.name,
              isNew: false,
              stockUnit: p.unit,
              conversionFactor: factor,
              stockQty: Math.round(item.qCom * factor),
            };
          }

          // 2. Busca por nome similar
          const firstWord = item.xProd.split(" ")[0];
          const byName = await dbInstance
            .select({ id: products.id, name: products.name, unit: products.unit, conversionFactor: products.conversionFactor })
            .from(products)
            .where(like(products.name, `%${firstWord}%`))
            .limit(1);

          if (byName.length > 0) {
            const p = byName[0];
            const factor = p.conversionFactor > 1 ? p.conversionFactor : suggestedFactor;
            return {
              ...item,
              matchedProductId: p.id,
              matchedProductName: p.name,
              isNew: false,
              stockUnit: p.unit,
              conversionFactor: factor,
              stockQty: Math.round(item.qCom * factor),
            };
          }

          // 3. Não encontrado → será criado automaticamente
          return {
            ...item,
            matchedProductId: null,
            matchedProductName: null,
            isNew: true,
            stockUnit: "un",
            conversionFactor: suggestedFactor,
            stockQty: Math.round(item.qCom * suggestedFactor),
          };
        })
      );

      return { info, items: enriched };
    }),

  // Confirma a importação: cria produtos novos e dá entrada no estoque
  confirm: protectedProcedure
    .input(
      z.object({
        nfeDate: z.string(),
        supplier: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.number().nullable(),
            isNew: z.boolean(),
            qCom: z.number(),
            conversionFactor: z.number().int().min(1),
            stockQty: z.number().int().min(1),
            vUnCom: z.number(),
            xProd: z.string(),
            cProd: z.string().optional(),
            uCom: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new Error("DB não disponível");

      const purchaseDate = new Date(input.nfeDate);
      let imported = 0;
      let created = 0;

      for (const item of input.items) {
        let productId = item.productId;

        // ── Criar produto automaticamente se não existe ──
        if (item.isNew || !productId) {
          const costPerUnit = item.conversionFactor > 0 ? item.vUnCom / item.conversionFactor : item.vUnCom;
          const [insertResult] = await dbInstance.insert(products).values({
            name: formatProductName(item.xProd),
            description: item.xProd,
            costPrice: String(costPerUnit.toFixed(2)),
            salePrice: "0.00",
            currentStock: 0,
            minStock: 5,
            unit: "un",
            purchaseUnit: item.uCom ?? "CX",
            conversionFactor: item.conversionFactor,
            supplierCode: item.cProd ?? null,
            active: true,
          });
          productId = (insertResult as any).insertId;
          created++;
        }

        if (!productId) continue;

        const [productRow] = await dbInstance
          .select({ currentStock: products.currentStock })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);

        if (!productRow) continue;

        const previousStock = productRow.currentStock;
        const newStock = previousStock + item.stockQty;

        // Atualiza estoque
        await dbInstance
          .update(products)
          .set({ currentStock: newStock })
          .where(eq(products.id, productId));

        // Registra movimentação
        await dbInstance.insert(stockMovements).values({
          productId,
          type: "in",
          quantity: item.stockQty,
          previousStock,
          newStock,
          reason: `NF-e: ${item.xProd} (${item.qCom} ${item.qCom === 1 ? "cx" : "cxs"} × ${item.conversionFactor} un)`,
          purchaseDate,
          supplier: input.supplier ?? undefined,
          unitCost: item.vUnCom > 0 ? String((item.vUnCom / item.conversionFactor).toFixed(4)) : undefined,
          userId: ctx.user.id,
        });

        // Salva supplierCode e fator no produto existente (se não tinha)
        if (!item.isNew && item.cProd) {
          await dbInstance
            .update(products)
            .set({ supplierCode: item.cProd, conversionFactor: item.conversionFactor })
            .where(and(eq(products.id, productId), sql`(supplierCode IS NULL OR supplierCode = '')`));
        }

        imported++;
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "create",
        module: "nfe_import",
        targetId: 0,
        details: `NF-e importada: ${imported} produto(s) com entrada no estoque, ${created} produto(s) criado(s) automaticamente`,
      });

      return { imported, created };
    }),

  // Lista todos os produtos cadastrados para mapeamento manual
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
