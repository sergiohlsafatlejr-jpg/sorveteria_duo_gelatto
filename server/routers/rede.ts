import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { 
  redeSalesImport, 
  redeImportFiles, 
  redeInoveReconciliation,
  salesImports,
  finBankStatements,
  sales,
  inoveConnectorConfig,
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
      dataDaVenda: (() => { const v = row[colMap["data da venda"]]; if (typeof v === "number") return new Date((v - 25569) * 86400000); return new Date(v); })(),
      horaDaVenda: (() => { const v = row[colMap["hora da venda"]]; if (typeof v === "number" && v < 1) { const totalSec = Math.round(v * 86400); const h = Math.floor(totalSec / 3600); const m = Math.floor((totalSec % 3600) / 60); return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`; } return v ? String(v) : undefined; })(),
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
      nsuCV: String(row[colMap["nsu/cv"]] || "").trim(),
      idTransacao: row[colMap["id transação"]] ? String(row[colMap["id transação"]]).trim() : undefined,
      numeroAutorizacao: row[colMap["número da autorização (Auto)"]] ? String(row[colMap["número da autorização (Auto)"]]).trim() : undefined,
      prazoDeRecebimento: row[colMap["prazo de recebimento"]] ? String(row[colMap["prazo de recebimento"]]).trim() : undefined,
      numeroDoEstabelecimento: String(row[colMap["número do estabelecimento"]] || "").trim(),
      nomeDoEstabelecimento: row[colMap["nome do estabelecimento"]] ? String(row[colMap["nome do estabelecimento"]]).trim() : undefined,
      cnpj: row[colMap["cnpj"]] ? String(row[colMap["cnpj"]]).trim() : undefined,
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

/**
 * Estima a data de pagamento do lançamento no banco
 */
export function estimatePaymentDate(saleDate: Date, modalidade: string, prazo: string | null, isAnticipated: boolean): Date {
  const date = new Date(saleDate);
  const m = modalidade.toLowerCase();
  const p = (prazo || "").toLowerCase();

  // Pix é na hora/mesmo dia
  if (m.includes("pix") || p.includes("mesmo dia")) {
    return date;
  }

  // Débito ou Crédito Antecipado liquida em D+1
  if (m.includes("deb") || m.includes("dêb") || p.includes("d+1") || isAnticipated) {
    date.setDate(date.getDate() + 1);
    return date;
  }

  // Crédito convencional liquida em D+30
  if (m.includes("cred") || m.includes("créd") || p.includes("d+30")) {
    date.setDate(date.getDate() + 30);
    return date;
  }

  // Padrão D+1
  date.setDate(date.getDate() + 1);
  return date;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const redeRouter = router({
  // Importar arquivo Excel da Rede
  importFile: protectedProcedure
    .input(
      z.object({
        fileBuffer: z.any(),
        fileName: z.string(),
        periodStart: z.date(),
        periodEnd: z.date(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      try {
        let buffer: Buffer;
        if (Buffer.isBuffer(input.fileBuffer)) {
          buffer = input.fileBuffer;
        } else if (typeof input.fileBuffer === "string") {
          buffer = Buffer.from(input.fileBuffer, "base64");
        } else {
          buffer = Buffer.from(input.fileBuffer);
        }

        // Parse do arquivo
        const sales = await parseRedeExcel(buffer);
        if (sales.length === 0) throw new Error("Nenhuma venda encontrada no arquivo");

        // Upload do arquivo para S3
        const fileKey = `rede-imports/${ctx.user.id}/${Date.now()}-${input.fileName}`;
        const { url: fileUrl } = await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

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
        const periodStartStr = periodStart.toISOString().split("T")[0];
        const periodEndStr = periodEnd.toISOString().split("T")[0];

        // Tentar obter vendas individuais de cartão do banco de dados INOVE (SQL Server)
        let inovePayments: Array<{ vendaId: number; dataHoraVenda: string; valor: number; formaPagamento: string }> = [];
        const connConfig = await db.select().from(inoveConnectorConfig).limit(1);

        if (connConfig.length > 0 && connConfig[0].active) {
          try {
            const { createInovePool } = await import("./inove");
            const pool = await createInovePool(connConfig[0]);

            const queryResult = await pool.request().query(`
              SELECT 
                v.VENDA as vendaId, 
                CONVERT(varchar(19), v.VEN_DATA_FIM, 120) as dataHoraVenda,
                CAST(pv.PAG_VALOR as float) as valor,
                fp.PAG_NOME as formaPagamento
              FROM PAGAMENTOS_VENDAS pv
              JOIN FORMAS_PAGAMENTOS fp ON fp.FORMA_PAGAMENTO = pv.FORMA_PAGAMENTO
              JOIN VENDAS v ON v.VENDA = pv.VENDA
              WHERE v.VEN_SITUACAO = 2
                AND v.VEN_DATA_FIM >= '${periodStartStr} 00:00:00'
                AND v.VEN_DATA_FIM <= '${periodEndStr} 23:59:59'
                AND (fp.PAG_NOME LIKE '%CART%' OR fp.PAG_NOME LIKE '%CRED%' OR fp.PAG_NOME LIKE '%DEB%' OR fp.PAG_NOME LIKE '%REDE%')
            `);

            await pool.close();

            inovePayments = (queryResult.recordset as any[]).map(row => ({
              vendaId: Number(row.vendaId),
              dataHoraVenda: row.dataHoraVenda,
              valor: Number(row.valor),
              formaPagamento: String(row.formaPagamento),
            }));
          } catch (err) {
            console.error("Erro ao buscar pagamentos do INOVE, usando fallback local:", err);
          }
        }

        if (inovePayments.length === 0) {
          // Fallback: buscar vendas locais de cartão
          const localSales = await db
            .select()
            .from(sales)
            .where(
              and(
                gte(sales.createdAt, new Date(periodStartStr + "T00:00:00")),
                lte(sales.createdAt, new Date(periodEndStr + "T23:59:59")),
                eq(sales.status, "completed")
              )
            );

          inovePayments = localSales
            .filter(s => s.paymentMethod === "credit_card" || s.paymentMethod === "debit_card")
            .map(s => ({
              vendaId: s.id,
              dataHoraVenda: s.createdAt.toISOString().replace("T", " ").slice(0, 19),
              valor: parseFloat(s.finalTotal),
              formaPagamento: s.paymentMethod === "credit_card" ? "Crédito" : "Débito",
            }));
        }

        // ═══ CONCILIAÇÃO EM 3 NÍVEIS ═══
        const reconciliations: any[] = [];
        const matchedInoveIds = new Set<number>();
        const matchedRedeIds = new Set<number>();

        // --- NÍVEL 1: Match por valor + hora (±10 minutos) ---
        for (const redeSale of redeSales) {
          if (matchedRedeIds.has(redeSale.id)) continue;
          const redeDate = redeSale.dataDaVenda;
          const redeHora = redeSale.horaDaVenda; // "HH:MM" ou undefined
          const amount = parseFloat(redeSale.valorDaVendaOriginal);
          if (!redeHora || isNaN(amount)) continue;

          const [rH, rM] = redeHora.split(":").map(Number);
          const redeMinutes = rH * 60 + rM;
          const redeDateStr = redeDate.toISOString().split("T")[0];

          let bestMatch: typeof inovePayments[0] | null = null;
          let bestDiffMin = 999;

          for (const cand of inovePayments) {
            if (matchedInoveIds.has(cand.vendaId)) continue;
            const candVal = cand.valor;
            if (Math.abs(candVal - amount) > 0.02) continue; // tolerância de 2 centavos

            const candDateStr = cand.dataHoraVenda.split(" ")[0];
            if (candDateStr !== redeDateStr) continue; // mesmo dia

            const candTime = cand.dataHoraVenda.split(" ")[1]; // "HH:MM:SS"
            if (!candTime) continue;
            const [cH, cM] = candTime.split(":").map(Number);
            const candMinutes = cH * 60 + cM;
            const diffMin = Math.abs(candMinutes - redeMinutes);

            if (diffMin <= 10 && diffMin < bestDiffMin) {
              bestDiffMin = diffMin;
              bestMatch = cand;
            }
          }

          if (bestMatch) {
            matchedInoveIds.add(bestMatch.vendaId);
            matchedRedeIds.add(redeSale.id);
            reconciliations.push({
              redeSaleId: redeSale.id,
              redeDate: redeSale.dataDaVenda,
              redeValue: String(amount),
              redeModalidade: redeSale.modalidade,
              redeBandeira: redeSale.bandeira,
              inoveSaleId: bestMatch.vendaId,
              inoveDate: new Date(bestMatch.dataHoraVenda),
              inoveValue: String(bestMatch.valor),
              status: "matched" as const,
              matchLevel: "hora",
              reconciliationDate: new Date(),
            });
          }
        }

        // --- NÍVEL 2: Match por valor + mesmo dia (sem hora) ---
        for (const redeSale of redeSales) {
          if (matchedRedeIds.has(redeSale.id)) continue;
          const amount = parseFloat(redeSale.valorDaVendaOriginal);
          if (isNaN(amount)) continue;
          const redeDateStr = redeSale.dataDaVenda.toISOString().split("T")[0];

          let bestMatch: typeof inovePayments[0] | null = null;

          for (const cand of inovePayments) {
            if (matchedInoveIds.has(cand.vendaId)) continue;
            if (Math.abs(cand.valor - amount) > 0.02) continue;

            const candDateStr = cand.dataHoraVenda.split(" ")[0];
            if (candDateStr === redeDateStr) {
              bestMatch = cand;
              break; // primeiro match do dia serve
            }
          }

          if (bestMatch) {
            matchedInoveIds.add(bestMatch.vendaId);
            matchedRedeIds.add(redeSale.id);
            reconciliations.push({
              redeSaleId: redeSale.id,
              redeDate: redeSale.dataDaVenda,
              redeValue: String(amount),
              redeModalidade: redeSale.modalidade,
              redeBandeira: redeSale.bandeira,
              inoveSaleId: bestMatch.vendaId,
              inoveDate: new Date(bestMatch.dataHoraVenda),
              inoveValue: String(bestMatch.valor),
              status: "matched" as const,
              matchLevel: "dia",
              reconciliationDate: new Date(),
            });
          }
        }

        // --- NÍVEL 3: Totalização diária (soma do dia Rede vs soma do dia INOVE) ---
        // Agrupar vendas Rede não conciliadas por dia
        const unmatchedRedeByDay = new Map<string, typeof redeSales>();
        for (const redeSale of redeSales) {
          if (matchedRedeIds.has(redeSale.id)) continue;
          const day = redeSale.dataDaVenda.toISOString().split("T")[0];
          if (!unmatchedRedeByDay.has(day)) unmatchedRedeByDay.set(day, []);
          unmatchedRedeByDay.get(day)!.push(redeSale);
        }

        // Agrupar pagamentos INOVE não conciliados por dia
        const unmatchedInoveByDay = new Map<string, typeof inovePayments>();
        for (const cand of inovePayments) {
          if (matchedInoveIds.has(cand.vendaId)) continue;
          const day = cand.dataHoraVenda.split(" ")[0];
          if (!unmatchedInoveByDay.has(day)) unmatchedInoveByDay.set(day, []);
          unmatchedInoveByDay.get(day)!.push(cand);
        }

        // Para cada dia com vendas Rede não conciliadas, verificar se o total bate
        for (const [day, dayRedeSales] of Array.from(unmatchedRedeByDay.entries())) {
          const dayInove = unmatchedInoveByDay.get(day) || [];
          const totalRede = dayRedeSales.reduce((s: number, r: any) => s + parseFloat(r.valorDaVendaOriginal), 0);
          const totalInove = dayInove.reduce((s: number, i: any) => s + i.valor, 0);
          const diff = Math.abs(totalRede - totalInove);
          const tolerance = totalRede * 0.02; // 2% de tolerância

          if (diff <= tolerance && dayInove.length > 0) {
            // Totalização bateu — marcar todas como "matched_total"
            for (const redeSale of dayRedeSales) {
              matchedRedeIds.add(redeSale.id);
              reconciliations.push({
                redeSaleId: redeSale.id,
                redeDate: redeSale.dataDaVenda,
                redeValue: String(parseFloat(redeSale.valorDaVendaOriginal)),
                redeModalidade: redeSale.modalidade,
                redeBandeira: redeSale.bandeira,
                inoveSaleId: null,
                inoveDate: null,
                inoveValue: String(totalInove),
                status: "matched" as const,
                matchLevel: "total_dia",
                divergenceReason: `Totalização diária: Rede R$${totalRede.toFixed(2)} vs INOVE R$${totalInove.toFixed(2)}`,
                reconciliationDate: new Date(),
              });
            }
          } else {
            // Não bateu — marcar como unmatched
            for (const redeSale of dayRedeSales) {
              matchedRedeIds.add(redeSale.id);
              reconciliations.push({
                redeSaleId: redeSale.id,
                redeDate: redeSale.dataDaVenda,
                redeValue: String(parseFloat(redeSale.valorDaVendaOriginal)),
                redeModalidade: redeSale.modalidade,
                redeBandeira: redeSale.bandeira,
                inoveSaleId: null,
                inoveDate: null,
                inoveValue: dayInove.length > 0 ? String(totalInove) : null,
                status: "unmatched_rede" as const,
                divergenceReason: dayInove.length > 0
                  ? `Divergência diária: Rede R$${totalRede.toFixed(2)} vs INOVE R$${totalInove.toFixed(2)} (diff R$${diff.toFixed(2)})`
                  : "Nenhuma venda de cartão encontrada no INOVE para este dia",
                reconciliationDate: new Date(),
              });
            }
          }
        }

        // Remover reconciliações antigas deste arquivo para não duplicar
        const oldRecs = await db
          .select({ id: redeInoveReconciliation.id })
          .from(redeInoveReconciliation)
          .innerJoin(redeSalesImport, eq(redeInoveReconciliation.redeSaleId, redeSalesImport.id))
          .where(eq(redeSalesImport.importFileId, input.importFileId));

        if (oldRecs.length > 0) {
          const ids = oldRecs.map(r => r.id);
          for (const id of ids) {
            await db.delete(redeInoveReconciliation).where(eq(redeInoveReconciliation.id, id));
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

  // Fazer conciliação bancária Rede x Extrato Bancário
  reconcileWithBank: protectedProcedure
    .input(
      z.object({
        importFileId: z.number(),
        tolerancePercent: z.number().min(0).max(100).default(5),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        // 1. Buscar vendas Rede importadas
        const redeSales = await db
          .select()
          .from(redeSalesImport)
          .where(eq(redeSalesImport.importFileId, input.importFileId));

        if (redeSales.length === 0) throw new Error("Nenhuma venda encontrada para conciliação");

        // 2. Estimar datas de pagamento e agrupar valores líquidos por data
        const expectedPaymentsByDay = new Map<string, { total: number; ids: number[] }>();
        for (const sale of redeSales) {
          const isAnticipated = parseFloat(sale.valorTaxaRecebimentoAutomatico || "0") > 0;
          const estDate = estimatePaymentDate(sale.dataDaVenda, sale.modalidade, sale.prazoDeRecebimento, isAnticipated);
          const dateKey = estDate.toISOString().split("T")[0];
          
          if (!expectedPaymentsByDay.has(dateKey)) {
            expectedPaymentsByDay.set(dateKey, { total: 0, ids: [] });
          }
          const dayData = expectedPaymentsByDay.get(dateKey)!;
          dayData.total += parseFloat(sale.valorLiquido || "0");
          dayData.ids.push(sale.id);
        }

        // 3. Buscar lançamentos bancários correspondentes ao período
        const dates = Array.from(expectedPaymentsByDay.keys()).sort();
        const minDate = new Date(dates[0]);
        const maxDate = new Date(dates[dates.length - 1]);
        
        const bankEntries = await db
          .select()
          .from(finBankStatements)
          .where(
            and(
              eq(finBankStatements.userId, ctx.user.id),
              gte(finBankStatements.date, minDate),
              lte(finBankStatements.date, maxDate)
            )
          );

        // Agrupar créditos bancários da Rede por dia
        const bankCreditsByDay = new Map<string, { total: number; entries: any[] }>();
        for (const entry of bankEntries) {
          if (entry.type !== "credit") continue;
          
          const descStr = entry.description.toUpperCase();
          const isRede = descStr.includes("REDE") || descStr.includes("RD CARD") || descStr.includes("REDECENTRAL");
          if (!isRede) continue;

          const dateKey = entry.date.toISOString().split("T")[0];
          if (!bankCreditsByDay.has(dateKey)) {
            bankCreditsByDay.set(dateKey, { total: 0, entries: [] });
          }
          const data = bankCreditsByDay.get(dateKey)!;
          data.total += parseFloat(entry.amount);
          data.entries.push(entry);
        }

        // 4. Cruzar dados por dia e atualizar banco
        const results: any[] = [];
        let matchedCount = 0;
        let divergentCount = 0;
        let unmatchedCount = 0;

        for (const [dateKey, data] of Array.from(expectedPaymentsByDay.entries())) {
          const bankData = bankCreditsByDay.get(dateKey);
          const bankTotal = bankData ? bankData.total : 0;
          
          let status: "matched" | "divergent" | "unmatched_rede";
          const diff = bankTotal - data.total;
          const absDiff = Math.abs(diff);
          
          const toleranceAmount = data.total * (input.tolerancePercent / 100);

          if (bankTotal === 0) {
            status = "unmatched_rede";
            unmatchedCount++;
          } else if (absDiff <= Math.max(toleranceAmount, 0.05)) {
            status = "matched";
            matchedCount++;
          } else {
            status = "divergent";
            divergentCount++;
          }

          // Atualizar registros de conciliação associados a estas vendas da Rede
          for (const saleId of data.ids) {
            const existing = await db
              .select({ id: redeInoveReconciliation.id })
              .from(redeInoveReconciliation)
              .where(eq(redeInoveReconciliation.redeSaleId, saleId))
              .limit(1);

            const bankFields = bankData && bankData.entries[0] ? {
              bankStatementId: bankData.entries[0].id,
              bankCreditDate: bankData.entries[0].date,
              bankCreditValue: String(bankTotal),
            } : {};

            if (existing.length > 0) {
              await db
                .update(redeInoveReconciliation)
                .set({
                  status: status,
                  divergenceReason: status === "divergent" ? "Divergência de valor no extrato" : null,
                  divergenceAmount: status === "divergent" ? String(diff) : null,
                  ...bankFields,
                  reconciliationDate: new Date(),
                })
                .where(eq(redeInoveReconciliation.id, existing[0].id));
            } else {
              // Buscar dados da venda Rede para inserir
              const [sale] = await db.select().from(redeSalesImport).where(eq(redeSalesImport.id, saleId)).limit(1);
              if (sale) {
                await db.insert(redeInoveReconciliation).values({
                  redeSaleId: saleId,
                  redeDate: sale.dataDaVenda,
                  redeValue: sale.valorLiquido || "0",
                  redeModalidade: sale.modalidade,
                  redeBandeira: sale.bandeira,
                  status: status,
                  divergenceReason: status === "divergent" ? "Divergência de valor no extrato" : null,
                  divergenceAmount: status === "divergent" ? String(diff) : null,
                  ...bankFields,
                  reconciliationDate: new Date(),
                });
              }
            }
          }

          results.push({
            date: dateKey,
            expectedTotal: data.total,
            bankTotal,
            diff,
            status,
            bankDescription: bankData && bankData.entries[0] ? bankData.entries[0].description : null,
          });
        }

        return {
          success: true,
          results: results.sort((a, b) => b.date.localeCompare(a.date)),
          summary: {
            matchedCount,
            divergentCount,
            unmatchedCount,
            totalCount: results.length,
          }
        };
      } catch (error) {
        throw new Error(`Erro ao fazer conciliação bancária: ${error instanceof Error ? error.message : String(error)}`);
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

      let query = db.select({
        id: redeInoveReconciliation.id,
        redeSaleId: redeInoveReconciliation.redeSaleId,
        redeDate: redeInoveReconciliation.redeDate,
        redeValue: redeInoveReconciliation.redeValue,
        redeModalidade: redeInoveReconciliation.redeModalidade,
        redeBandeira: redeInoveReconciliation.redeBandeira,
        inoveSaleId: redeInoveReconciliation.inoveSaleId,
        inoveDate: redeInoveReconciliation.inoveDate,
        inoveValue: redeInoveReconciliation.inoveValue,
        bankStatementId: redeInoveReconciliation.bankStatementId,
        bankCreditDate: redeInoveReconciliation.bankCreditDate,
        bankCreditValue: redeInoveReconciliation.bankCreditValue,
        status: redeInoveReconciliation.status,
        divergenceReason: redeInoveReconciliation.divergenceReason,
        divergenceAmount: redeInoveReconciliation.divergenceAmount,
        reconciliationDate: redeInoveReconciliation.reconciliationDate,
      }).from(redeInoveReconciliation);

      const conditions: any[] = [];
      if (input?.status) {
        conditions.push(eq(redeInoveReconciliation.status, input.status));
      }
      if (input?.importFileId) {
        query = query.innerJoin(
          redeSalesImport,
          eq(redeInoveReconciliation.redeSaleId, redeSalesImport.id)
        ) as any;
        conditions.push(eq(redeSalesImport.importFileId, input.importFileId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      return query
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

      let query = db.select({
        id: redeInoveReconciliation.id,
        redeValue: redeInoveReconciliation.redeValue,
        status: redeInoveReconciliation.status,
      }).from(redeInoveReconciliation);

      if (input?.importFileId) {
        query = query.innerJoin(
          redeSalesImport,
          eq(redeInoveReconciliation.redeSaleId, redeSalesImport.id)
        ).where(eq(redeSalesImport.importFileId, input.importFileId)) as any;
      }

      const allReconciliations = await query;

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
import { Router } from "express";
import multer from "multer";

// ─── Express Router para upload de arquivo Rede (evita limite tRPC) ──────────
const redeUpload = multer({ dest: "/tmp/rede-uploads/" });
export const redeExpressRouter = Router();

redeExpressRouter.post("/api/rede/upload", redeUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    const fs = await import("fs");
    const buffer = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path);
    const periodStart = req.body.periodStart;
    const periodEnd = req.body.periodEnd;
    if (!periodStart || !periodEnd) return res.status(400).json({ error: "Período não informado" });

    
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Parse do arquivo
    let sales: any[] = [];
    try { sales = await parseRedeExcel(buffer); } catch (parseErr: any) { console.error("[rede/upload] Parse error:", parseErr.message); return res.status(400).json({ error: "Erro no parse: " + parseErr.message }); }
    if (sales.length === 0) return res.status(400).json({ error: "Nenhuma venda encontrada no arquivo" });

    // Upload do arquivo para S3
    const fileKey = `rede-imports/${Date.now()}-${req.file.originalname}`;
    const { url: fileUrl } = await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    // Salvar no banco
    const [importFile] = await db.insert(redeImportFiles).values({
      fileName: req.file.originalname,
      fileUrl,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      totalRecords: sales.length,
      totalValue: String(sales.reduce((sum, s) => sum + (s.valorDaVendaOriginal || 0), 0).toFixed(2)),
      importedBy: 0,
    }).$returningId();

    // Inserir vendas em lotes
    const batchSize = 100;
    for (let i = 0; i < sales.length; i += batchSize) {
      const batch = sales.slice(i, i + batchSize).map((s: any) => ({
        importFileId: importFile.id,
        dataDaVenda: s.dataDaVenda,
        horaDaVenda: s.horaDaVenda,
        statusDaVenda: s.statusDaVenda || "aprovada",
        valorDaVendaOriginal: String(s.valorDaVendaOriginal || 0),
        valorDaVendaAtualizado: String(s.valorDaVendaAtualizado || 0),
        modalidade: s.modalidade || "desconhecido",
        tipo: s.tipo,
        bandeira: s.bandeira,
        numeroDeParcelas: s.numeroDeParcelas,
        taxaMDR: (s.taxaMDR != null && !isNaN(s.taxaMDR)) ? String(s.taxaMDR) : null,
        valorMDR: (!isNaN(s.valorMDR) && s.valorMDR) ? String(s.valorMDR) : "0",
        taxaRecebimentoAutomatico: (s.taxaRecebimentoAutomatico != null && !isNaN(s.taxaRecebimentoAutomatico)) ? String(s.taxaRecebimentoAutomatico) : null,
        valorTaxaRecebimentoAutomatico: (!isNaN(s.valorTaxaRecebimentoAutomatico) && s.valorTaxaRecebimentoAutomatico) ? String(s.valorTaxaRecebimentoAutomatico) : "0",
        valorTotalTaxas: (!isNaN(s.valorTotalTaxas) && s.valorTotalTaxas) ? String(s.valorTotalTaxas) : "0",
        valorLiquido: (s.valorLiquido != null && !isNaN(s.valorLiquido)) ? String(s.valorLiquido) : null,
        nsuCV: s.nsuCV || "",
        idTransacao: s.idTransacao,
        numeroAutorizacao: s.numeroAutorizacao,
        prazoDeRecebimento: s.prazoDeRecebimento,
        numeroDoEstabelecimento: s.numeroDoEstabelecimento || "",
        nomeDoEstabelecimento: s.nomeDoEstabelecimento,
        cnpj: s.cnpj,
        numeroDoCartao: s.numeroDoCartao,
        codigoDaMaquininha: s.codigoDaMaquininha,
        tipoDeMaquininha: s.tipoDeMaquininha,
        canceladaPeloEstabelecimento: s.canceladaPeloEstabelecimento || false,
        dataDoCancelamento: (s.dataDoCancelamento instanceof Date && !isNaN(s.dataDoCancelamento.getTime())) ? s.dataDoCancelamento : null,
        valorCancelado: (s.valorCancelado != null && !isNaN(s.valorCancelado)) ? String(s.valorCancelado) : null,
        emDisputaDeChargeback: s.emDisputaDeChargeback || false,
      }));
      await db.insert(redeSalesImport).values(batch);
    }

    res.json({ importFileId: importFile.id, totalRecords: sales.length });
  } catch (err: any) {
    console.error("[rede/upload] Error:", err.message);
    res.status(500).json({ error: err.message || "Erro interno" });
  }
});
