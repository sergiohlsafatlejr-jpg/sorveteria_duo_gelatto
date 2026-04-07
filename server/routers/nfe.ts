import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import * as db from "../db";
import { products, stockMovements, nfeImports } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
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
  chNFe: string;   // Chave de acesso de 44 dígitos
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

  // Extrai chave de acesso (44 dígitos) do atributo Id da tag infNFe
  const chNFeMatch = xmlContent.match(/Id="NFe(\d{44})"/i) ||
                     xmlContent.match(/<chNFe>(\d{44})<\/chNFe>/i) ||
                     xmlContent.match(/chNFe="(\d{44})"/i);
  const chNFe = chNFeMatch ? chNFeMatch[1] : "";

  const info: NfeInfo = {
    nNF: getTag(ideXml, "nNF"),
    dhEmi: getTag(ideXml, "dhEmi"),
    chNFe,
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

      // ── Verificar se a NF-e já foi importada (por chave de acesso ou nNF+CNPJ) ──
      let isDuplicate = false;
      let duplicateInfo: { id: number; createdAt: Date } | null = null;

      if (info.chNFe) {
        const existing = await dbInstance
          .select({ id: nfeImports.id, createdAt: nfeImports.createdAt })
          .from(nfeImports)
          .where(eq(nfeImports.chNFe, info.chNFe))
          .limit(1);
        if (existing.length > 0) {
          isDuplicate = true;
          duplicateInfo = existing[0];
        }
      } else if (info.nNF && info.emitCnpj) {
        // Fallback: verificar por número + CNPJ emitente
        const existing = await dbInstance
          .select({ id: nfeImports.id, createdAt: nfeImports.createdAt })
          .from(nfeImports)
          .where(and(eq(nfeImports.nNF, info.nNF), eq(nfeImports.emitCnpj, info.emitCnpj)))
          .limit(1);
        if (existing.length > 0) {
          isDuplicate = true;
          duplicateInfo = existing[0];
        }
      }

      const enriched = await Promise.all(
        items.map(async (item) => {
          const suggestedFactor = extractConversionFromName(item.xProd);

          // Busca APENAS por supplierCode exato — nunca por nome parcial
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

          // Não encontrado por código → será criado automaticamente
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

      return { info, items: enriched, isDuplicate, duplicateInfo };
    }),

  // Confirma a importação: cria produtos novos e dá entrada no estoque
  confirm: protectedProcedure
    .input(
      z.object({
        nfeDate: z.string(),
        supplier: z.string().optional(),
        // Dados da NF-e para controle de duplicatas
        chNFe: z.string().optional(),
        nNF: z.string().optional(),
        emitCnpj: z.string().optional(),
        emitNome: z.string().optional(),
        dhEmi: z.string().optional(),
        vNF: z.number().optional(),
        forceImport: z.boolean().optional().default(false), // Permite reimportar mesmo duplicada
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

      // ── Bloquear duplicata (a menos que forceImport=true) ──
      if (!input.forceImport && (input.chNFe || (input.nNF && input.emitCnpj))) {
        let existing: any[] = [];
        if (input.chNFe) {
          existing = await dbInstance
            .select({ id: nfeImports.id, createdAt: nfeImports.createdAt })
            .from(nfeImports)
            .where(eq(nfeImports.chNFe, input.chNFe))
            .limit(1);
        } else {
          existing = await dbInstance
            .select({ id: nfeImports.id, createdAt: nfeImports.createdAt })
            .from(nfeImports)
            .where(and(eq(nfeImports.nNF, input.nNF!), eq(nfeImports.emitCnpj, input.emitCnpj!)))
            .limit(1);
        }
        if (existing.length > 0) {
          const importedAt = existing[0].createdAt;
          throw new TRPCError({
            code: "CONFLICT",
            message: `Esta NF-e já foi importada em ${new Date(importedAt).toLocaleDateString("pt-BR")}. Use forceImport=true para reimportar mesmo assim.`,
          });
        }
      }

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

      // ── Registrar NF-e na tabela de controle para evitar futuras duplicatas ──
      if (input.nNF && input.emitCnpj) {
        try {
          await dbInstance.insert(nfeImports).values({
            chNFe: input.chNFe || null,
            nNF: input.nNF,
            emitCnpj: input.emitCnpj,
            emitNome: input.emitNome || null,
            dhEmi: input.dhEmi || null,
            vNF: String(input.vNF ?? 0),
            totalItems: imported,
            userId: ctx.user.id,
          });
        } catch (e: any) {
          // Ignora erro de unique constraint (pode acontecer em forceImport)
          if (!e.message?.includes("Duplicate entry")) throw e;
        }
      }

      await db.createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "create",
        module: "nfe_import",
        targetId: 0,
        details: `NF-e importada: ${imported} produto(s) com entrada no estoque, ${created} produto(s) criado(s) automaticamente${input.chNFe ? ` | chNFe: ${input.chNFe.substring(0, 10)}...` : ""}`,
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
