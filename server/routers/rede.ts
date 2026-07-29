import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { 
  redeSalesImport, 
  redeImportFiles, 
  redeInoveReconciliation,
  salesImports,
} from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { storagePut } from "../storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse do arquivo Excel da Rede
 */
async function parseRedeExcel(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["vendas"];
  if (!sheet) throw new Error("Aba 'vendas' não encontrada");

  // Encontrar a linha de cabeçalho (procura por "data da venda")
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    if (data[i]?.some((cell: any) => String(cell).toLowerCase().includes("data da venda"))) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) throw new Error("Cabeçalho não encontrado");

  const headers = data[headerRowIdx] as string[];
  const rows = data.slice(headerRowIdx + 1);

  // Mapear colunas
  const colMap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    if (h) colMap[h.toLowerCase().trim()] = idx;
  });

  // Extrair vendas
  const sales = rows
    .filter((row: any[]) => row[colMap["data da venda"]])
    .map((row: any[]) => ({
      dataDaVenda: new Date(row[colMap["data da venda"]]),
      horaDaVenda: row[colMap["hora da venda"]] ? String(row[colMap["hora da venda"]]) : undefined,
      statusDaVenda: String(row[colMap["status da venda"]] || "").trim(),
      valorDaVendaOriginal: parseFloat(row[colMap["valor da venda original"]] || 0),
      valorDaVendaAtualizado: parseFloat(row[colMap["valor da venda atualizado"]] || 0),
      modalidade: String(row[colMap["modalidade"]] || "").trim(),
      tipo: row[colMap["tipo"]] ? String(row[colMap["tipo"]]).trim() : undefined,
      bandeira: row[colMap["bandeira"]] ? String(row[colMap["bandeira"]]).trim() : undefined,
      numeroDeParcelas: row[colMap["número de parcelas"]] ? parseInt(row[colMap["número de parcelas"]]) : undefined,
      taxaMDR: row[colMap["taxa MDR"]] ? parseFloat(row[colMap["taxa MDR"]]) : undefined,
      valorMDR: parseFloat(row[colMap["valor MDR"]] || 0),
      taxaRecebimentoAutomatico: row[colMap["taxa de recebimento automático"]] ? parseFloat(row[colMap["taxa de recebimento automático"]]) : undefined,
      valorTaxaRecebimentoAutomatico: parseFloat(row[colMap["valor taxa de recebimento automático"]] || 0),
      valorTotalTaxas: parseFloat(row[colMap["valor total das taxas descontadas (MDR+recebimento automático)"]] || 0),
      valorLiquido: row[colMap["valor líquido"]] ? parseFloat(row[colMap["valor líquido"]]) : undefined,
      nsuCV: String(row[colMap["NSU/CV"]] || "").trim(),
      idTransacao: row[colMap["ID Transação"]] ? String(row[colMap["ID Transação"]]).trim() : undefined,
      numeroAutorizacao: row[colMap["número da autorização (Auto)"]] ? String(row[colMap["número da autorização (Auto)"]]).trim() : undefined,
      prazoDeRecebimento: row[colMap["Prazo de recebimento"]] ? String(row[colMap["Prazo de recebimento"]]).trim() : undefined,
      numeroDoEstabelecimento: String(row[colMap["número do estabelecimento"]] || "").trim(),
      nomeDoEstabelecimento: row[colMap["nome do estabelecimento"]] ? String(row[colMap["nome do estabelecimento"]]).trim() : undefined,
      cnpj: row[colMap["CNPJ"]] ? String(row[colMap["CNPJ"]]).trim() : undefined,
      numeroDoCartao: row[colMap["número do cartão"]] ? String(row[colMap["número do cartão"]]).trim() : undefined,
      codigoDaMaquininha: row[colMap["código da maquininha"]] ? String(row[colMap["código da maquininha"]]).trim() : undefined,
      tipoDeMaquininha: row[colMap["tipo de maquininha"]] ? String(row[colMap["tipo de maquininha"]]).trim() : undefined,
      canceladaPeloEstabelecimento: String(row[colMap["cancelada pelo estabelecimento"]] || "").toLowerCase() === "sim",
      dataDoCancelamento: row[colMap["data do cancelamento"]] ? new Date(row[colMap["data do cancelamento"]]) : undefined,
      valorCancelado: row[colMap["valor cancelado"]] ? parseFloat(row[colMap["valor cancelado"]]) : undefined,
      emDisputaDeChargeback: String(row[colMap["em disputa de chargeback"]] || "").toLowerCase() === "sim",
      dataQueEntrouEmDisputaDeChargeback: row[colMap["data que entrou em disputa de chargeback"]] ? new Date(row[colMap["data que entrou em disputa de chargeback"]]) : undefined,
      resolucaoDoChargeback: row[colMap["resolução do chargeback"]] ? String(row[colMap["resolução do chargeback"]]).trim() : undefined,
    }))
    .filter((sale) => sale.nsuCV && sale.valorDaVendaOriginal > 0);

  return sales;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const redeRouter = router({
  // Importar arquivo Excel da Rede
  importFile: protectedProcedure
    .input(
      z.object({
        fileBuffer: z.instanceof(Buffer),
        fileName: z.string(),
        periodStart: z.date(),
        periodEnd: z.date(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        // Parse do arquivo
        const sales = await parseRedeExcel(input.fileBuffer);
        if (sales.length === 0) throw new Error("Nenhuma venda encontrada no arquivo");

        // Upload do arquivo para S3
        const fileKey = `rede-imports/${ctx.user.id}/${Date.now()}-${input.fileName}`;
        const { url: fileUrl } = await storagePut(fileKey, input.fileBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        // Calcular totais
        const totalValue = sales.reduce((sum, s) => sum + s.valorDaVendaOriginal, 0);

        // Inserir arquivo de importação
        const [importFile] = await db
          .insert(redeImportFiles)
          .values({
            fileName: input.fileName,
            fileUrl,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            totalRecords: sales.length,
            totalValue: String(totalValue),
            importedBy: ctx.user.id,
          })
          .$returningId();

        // Inserir vendas
        const insertValues = sales.map((sale) => ({
          ...sale,
          importFileId: importFile.id,
          valorDaVendaOriginal: String(sale.valorDaVendaOriginal),
          valorDaVendaAtualizado: String(sale.valorDaVendaAtualizado),
          taxaMDR: sale.taxaMDR ? String(sale.taxaMDR) : null,
          valorMDR: String(sale.valorMDR),
          taxaRecebimentoAutomatico: sale.taxaRecebimentoAutomatico ? String(sale.taxaRecebimentoAutomatico) : null,
          valorTaxaRecebimentoAutomatico: String(sale.valorTaxaRecebimentoAutomatico),
          valorTotalTaxas: String(sale.valorTotalTaxas),
          valorLiquido: String(sale.valorLiquido),
          valorCancelado: sale.valorCancelado ? String(sale.valorCancelado) : undefined,
        }));

        await db.insert(redeSalesImport).values(insertValues);

        return {
          success: true,
          importFileId: importFile.id,
          totalRecords: sales.length,
          totalValue,
        };
      } catch (error) {
        throw new Error(`Erro ao importar arquivo Rede: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),

  // Listar importações
  listImports: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(redeImportFiles)
        .orderBy(desc(redeImportFiles.createdAt))
        .limit(input?.limit ?? 20)
        .offset(input?.offset ?? 0);
    }),

  // Listar vendas de uma importação
  getSalesByImport: protectedProcedure
    .input(z.object({ importFileId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(redeSalesImport)
        .where(eq(redeSalesImport.importFileId, input.importFileId))
        .orderBy(desc(redeSalesImport.dataDaVenda));
    }),

  // Fazer conciliação Rede x INOVE
  reconcile: protectedProcedure
    .input(
      z.object({
        importFileId: z.number(),
        toleranceAmount: z.number().min(0).default(0.01),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        // Buscar vendas Rede
        const redeSales = await db
          .select()
          .from(redeSalesImport)
          .where(eq(redeSalesImport.importFileId, input.importFileId));

        if (redeSales.length === 0) throw new Error("Nenhuma venda encontrada para conciliação");

        // Buscar vendas INOVE no período
        const periodStart = redeSales[0].dataDaVenda;
        const periodEnd = redeSales[redeSales.length - 1].dataDaVenda;

        const inoveImports = await db
          .select()
          .from(salesImports)
          .where(
            and(
              gte(salesImports.saleDate, periodStart),
              lte(salesImports.saleDate, periodEnd),
              eq(salesImports.status, "confirmed")
            )
          );

        // Mapear vendas INOVE por data e valor
        const inoveByDateValue = new Map<string, any[]>();
        for (const imp of inoveImports) {
          if (!imp.saleDate) continue;
          const totalAmount = parseFloat(imp.totalRevenue);
          const key = `${imp.saleDate.toISOString().split("T")[0]}_${totalAmount}`;
          if (!inoveByDateValue.has(key)) {
            inoveByDateValue.set(key, []);
          }
          inoveByDateValue.get(key)!.push(imp);
        }

        // Fazer conciliação
        const reconciliations: any[] = [];
        const matchedInoveIds = new Set<number>();

        for (const redeSale of redeSales) {
          const saleDate = redeSale.dataDaVenda.toISOString().split("T")[0];
          const amount = parseFloat(redeSale.valorDaVendaOriginal);

          // Procurar match exato
          let matched = false;
          const key = `${saleDate}_${amount}`;
          const candidates = inoveByDateValue.get(key) || [];

          for (const inove of candidates) {
            if (!matchedInoveIds.has(inove.id)) {
              matchedInoveIds.add(inove.id);
              reconciliations.push({
                redeSaleId: redeSale.id,
                redeDate: redeSale.dataDaVenda,
                redeValue: String(amount),
                redeModalidade: redeSale.modalidade,
                redeBandeira: redeSale.bandeira,
                inoveSaleId: inove.id,
                inoveDate: inove.saleDate || new Date(),
                inoveValue: String(parseFloat(inove.totalRevenue)),
                status: "matched" as const,
                reconciliationDate: new Date(),
              });
              matched = true;
              break;
            }
          }

          if (!matched) {
            reconciliations.push({
              redeSaleId: redeSale.id,
              redeDate: redeSale.dataDaVenda,
              redeValue: String(amount),
              redeModalidade: redeSale.modalidade,
              redeBandeira: redeSale.bandeira,
              inoveSaleId: null,
              inoveDate: null,
              inoveValue: null,
              status: "unmatched_rede" as const,
              divergenceReason: "Venda não encontrada no INOVE",
              reconciliationDate: new Date(),
            });
          }
        }

        // Inserir reconciliações
        await db.insert(redeInoveReconciliation).values(reconciliations);

        // Contar matches
        const matchedCount = reconciliations.filter((r) => r.status === "matched").length;
        const unmatchedCount = reconciliations.filter((r) => r.status === "unmatched_rede").length;

        return {
          success: true,
          totalRecords: reconciliations.length,
          matchedCount,
          unmatchedCount,
          matchPercentage: ((matchedCount / reconciliations.length) * 100).toFixed(2),
        };
      } catch (error) {
        throw new Error(`Erro ao fazer conciliação: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),

  // Listar conciliações
  listReconciliations: protectedProcedure
    .input(
      z.object({
        importFileId: z.number().optional(),
        status: z.enum(["matched", "unmatched_rede", "unmatched_inove", "divergent"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input?.status) {
        conditions.push(eq(redeInoveReconciliation.status, input.status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      return db
        .select()
        .from(redeInoveReconciliation)
        .where(whereClause)
        .orderBy(desc(redeInoveReconciliation.reconciliationDate))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);
    }),

  // Estatísticas de conciliação
  getStats: protectedProcedure
    .input(z.object({ importFileId: z.number() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const allReconciliations = await db
        .select()
        .from(redeInoveReconciliation);

      const stats = {
        matched: { count: 0, totalValue: 0 },
        unmatchedRede: { count: 0, totalValue: 0 },
        unmatchedInove: { count: 0, totalValue: 0 },
        divergent: { count: 0, totalValue: 0 },
      };

      for (const rec of allReconciliations) {
        const value = parseFloat(rec.redeValue || "0");
        if (rec.status === "matched") {
          stats.matched.count++;
          stats.matched.totalValue += value;
        } else if (rec.status === "unmatched_rede") {
          stats.unmatchedRede.count++;
          stats.unmatchedRede.totalValue += value;
        } else if (rec.status === "unmatched_inove") {
          stats.unmatchedInove.count++;
          stats.unmatchedInove.totalValue += value;
        } else if (rec.status === "divergent") {
          stats.divergent.count++;
          stats.divergent.totalValue += value;
        }
      }

      return stats;
    }),
});
