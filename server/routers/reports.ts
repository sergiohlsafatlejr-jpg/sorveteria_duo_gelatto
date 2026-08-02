import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getCostVsSalesReport,
  getTopProductsReport,
  getPaymentMethodsReport,
  getDREReport,
  getMonthlySalesEvolution,
  getAvailableMonths,
  getMostPurchasedReport,
  getStockTurnoverReport,
  getStockSummaryReport,
  getWeeklyStockTurnoverReport,
  getClimateCorrelationReport,
  getLoyaltyCohortReport,
  getAbcMatrixReport,
  getPredictivePurchasePlanning,
  getDreByChannelReport,
} from "../db.reports";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import {
  finTransactions,
  finCategories,
  finCosts,
  inoveConnectorConfig,
  salesImports,
  salesImportItems,
  finDailyRevenue,
  forecastSettings,
} from "../../drizzle/schema";
import { and, eq, sql, desc, gte, lte } from "drizzle-orm";
import * as mssql from "mssql";

export const reportsRouter = router({
  // Meses disponíveis (com vendas confirmadas)
  availableMonths: protectedProcedure.query(async () => {
    return getAvailableMonths();
  }),

  // Evolução mensal de vendas
  monthlySalesEvolution: protectedProcedure.query(async () => {
    return getMonthlySalesEvolution();
  }),

  // Custo x Venda por produto
  costVsSales: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      return getCostVsSalesReport(input.referenceMonth);
    }),

  // Top produtos mais vendidos
  topProducts: protectedProcedure
    .input(
      z.object({
        referenceMonth: z.string().optional(),
        limit: z.number().min(5).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      return getTopProductsReport(input.referenceMonth, input.limit);
    }),

  // Formas de pagamento do caixa
  paymentMethods: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      return getPaymentMethodsReport(input.referenceMonth);
    }),

  // DRE — Demonstrativo de Resultado do Exercício
  dre: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      return getDREReport(input.referenceMonth);
    }),

  // Produtos mais comprados (via NF-e / movimentações de entrada)
  mostPurchased: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(100).default(30) }))
    .query(async ({ input }) => {
      return getMostPurchasedReport(input.limit);
    }),

  // Giro de estoque + cobertura + compras x vendas
  stockTurnover: protectedProcedure.query(async () => {
    return getStockTurnoverReport();
  }),

  // Resumo executivo de estoque
  stockSummary: protectedProcedure.query(async () => {
    return getStockSummaryReport();
  }),

  // Giro de estoque por semana (para planejamento de compras)
  weeklyStockTurnover: protectedProcedure
    .input(z.object({ weeksBack: z.number().min(2).max(12).default(6) }).optional())
    .query(async ({ input }) => {
      return getWeeklyStockTurnoverReport(input?.weeksBack ?? 6);
    }),

  // ─── Relatórios Avançados de Business Intelligence (BI) ───────────────────
  climateCorrelation: protectedProcedure.query(async () => {
    return getClimateCorrelationReport();
  }),

  loyaltyCohort: protectedProcedure.query(async () => {
    return getLoyaltyCohortReport();
  }),

  abcMatrix: protectedProcedure.query(async () => {
    return getAbcMatrixReport();
  }),

  predictivePurchasePlanning: protectedProcedure.query(async () => {
    return getPredictivePurchasePlanning();
  }),

  dreByChannel: protectedProcedure
    .input(z.object({ referenceMonth: z.string().optional() }))
    .query(async ({ input }) => {
      return getDreByChannelReport(input.referenceMonth);
    }),

  // ─── Análise de Otimização Financeira com IA ─────────────────────────────
  // Cruza receita real (INOVE) com despesas do mês, identifica onde cortar
  // para fechar no positivo, com recomendações da IA.
  analiseOtimizacao: protectedProcedure
    .input(
      z.object({
        month: z.string(), // 'YYYY-MM'
        orcamentoCompras: z.number().optional(), // orçamento disponível para compras
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const { month } = input;
      const [year, mon] = month.split("-").map(Number);

      // ── 1. Receita — usa a Projeção da Previsão de Faturamento (médias por tipo de dia) ──
      let receitaInove = 0;
      let fonteReceita: "projecao" | "previsao" | "inove" | "local" = "local";

      const dateFrom = `${year}-${String(mon).padStart(2, "0")}-01`;
      const daysInMonth = new Date(year!, mon!, 0).getDate();
      const dateTo = `${year}-${String(mon).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      // 1a. Calcula a projeção do mês usando as médias salvas em forecastSettings do usuário
      // (mesmo cálculo da tela Previsão de Faturamento — inclui ajuste climático)
      try {
        // Busca as configurações do usuário logado (igual à tela Previsão)
        const settingsRows = await db
          .select()
          .from(forecastSettings)
          .where(eq(forecastSettings.userId, ctx.user.id))
          .limit(1);
        // Se não tiver configurações do usuário, tenta qualquer registro
        const fallbackRows = settingsRows.length === 0
          ? await db.select().from(forecastSettings).limit(1)
          : settingsRows;
        const settings = fallbackRows[0];
        if (!settings) throw new Error("Sem configurações de previsão");

        const avgWeekday = Number(settings.avgWeekday) || 2000;
        const avgSaturday = Number(settings.avgSaturday) || 5300;
        const avgSundayHoliday = Number(settings.avgSundayHoliday) || 8300;
        const rainFactor = parseFloat(settings.rainFactor ?? "0.7") || 0.7;

        // Buscar feriados nacionais (igual à tela Previsão)
        let holidayDates = new Set<string>();
        try {
          const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
          if (res.ok) {
            const holidays: { date: string }[] = await res.json();
            holidayDates = new Set(holidays.map(h => h.date));
          }
        } catch { /* ignora */ }

        // Buscar previsão do tempo para Goiânia (igual à tela Previsão)
        type WeatherDay = { code: number; precip: number; precipProb: number };
        const weatherMap = new Map<string, WeatherDay>();
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=-16.6864&longitude=-49.2643&daily=weathercode,precipitation_sum,precipitation_probability_max&timezone=America%2FSao_Paulo&start_date=${dateFrom}&end_date=${dateTo}`;
          const res = await fetch(url);
          if (res.ok) {
            const wdata = await res.json();
            const { time, weathercode, precipitation_sum, precipitation_probability_max } = wdata.daily;
            (time as string[]).forEach((d: string, i: number) => {
              weatherMap.set(d, {
                code: weathercode[i],
                precip: precipitation_sum[i] ?? 0,
                precipProb: precipitation_probability_max[i] ?? 0,
              });
            });
          }
        } catch { /* ignora */ }

        // Calcular projeção somando média por tipo de dia + ajuste climático
        let totalProjecao = 0;
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const date = new Date(year!, mon! - 1, day);
          const weekday = date.getDay(); // 0=Dom, 6=Sáb
          const isHoliday = holidayDates.has(dateStr);
          const isSunday = weekday === 0;
          const isSaturday = weekday === 6;

          // Média base pelo tipo de dia
          let baseAvg = (isHoliday || isSunday) ? avgSundayHoliday
            : isSaturday ? avgSaturday
            : avgWeekday;

          // Ajuste climático (igual à tela Previsão)
          const weather = weatherMap.get(dateStr);
          let projectedAmount = baseAvg;
          if (weather) {
            const { code, precip, precipProb } = weather;
            let weatherLabel: "sun" | "cloud" | "rain" | "storm" | "unknown" = "unknown";
            if (code === 0) weatherLabel = "sun";
            else if (code <= 3) weatherLabel = "cloud";
            else if (code <= 67 || (code >= 80 && code <= 84)) {
              weatherLabel = precip > 5 || precipProb > 60 ? "rain" : "cloud";
            } else if (code >= 85 || code >= 95) weatherLabel = "storm";
            else weatherLabel = "cloud";

            if (weatherLabel === "rain") projectedAmount = baseAvg * rainFactor;
            else if (weatherLabel === "storm") projectedAmount = baseAvg * (rainFactor * 0.8);
            else if (weatherLabel === "cloud") projectedAmount = baseAvg * 0.9;
          }
          totalProjecao += Math.round(projectedAmount);
        }
        receitaInove = totalProjecao;
        fonteReceita = "projecao";
      } catch {
        // fallback para faturamento real se projeção falhar
      }

      // 1b. Fallback: faturamento real importado do INOVE (finDailyRevenue)
      if (receitaInove === 0) {
        const dailyRows = await db
          .select({ total: sql<number>`COALESCE(SUM(${finDailyRevenue.realAmount}), 0)` })
          .from(finDailyRevenue)
          .where(and(gte(finDailyRevenue.revenueDate, dateFrom), lte(finDailyRevenue.revenueDate, dateTo)));
        receitaInove = Number(dailyRows[0]?.total) || 0;
        if (receitaInove > 0) fonteReceita = "previsao";
      }

      // 1c. Fallback: SQL Server INOVE direto
      if (receitaInove === 0) {
        try {
          const connRows = await db.select().from(inoveConnectorConfig).limit(1);
          if (connRows.length && connRows[0].active) {
            const cfg = connRows[0];
            const pool = await mssql.connect({
              server: cfg.host, port: cfg.port ?? 55444, database: cfg.database,
              user: cfg.username, password: cfg.password,
              options: { encrypt: false, trustServerCertificate: true },
              connectionTimeout: 30000, requestTimeout: 30000,
            });
            const res = await pool.request().query(`
              SELECT CAST(COALESCE(SUM(v.VEN_TOTAL), 0) as float) as total
              FROM VENDAS v WHERE v.VEN_SITUACAO = 2
                AND YEAR(v.VEN_DATA_FIM) = ${year} AND MONTH(v.VEN_DATA_FIM) = ${mon}
            `);
            receitaInove = Number(res.recordset[0]?.total) || 0;
            fonteReceita = "inove";
            await pool.close();
          }
        } catch { /* ignora */ }
      }

      // 1d. Fallback final: importações locais confirmadas
      if (receitaInove === 0) {
        const rows = await db
          .select({ total: sql<number>`COALESCE(SUM(${salesImports.totalRevenue}), 0)` })
          .from(salesImports)
          .where(and(eq(salesImports.status, "confirmed"), sql`${salesImports.referenceMonth} = ${month}`));
        receitaInove = Number(rows[0]?.total) || 0;
        fonteReceita = "local";
      }

      // ── 2. Despesas do mês por categoria e tipo (fixo/variável) ──────────
      const despesasRows = await db
        .select({
          categoryName: finCategories.name,
          categoryId: finTransactions.categoryId,
          totalAmount: sql<number>`COALESCE(SUM(ABS(${finTransactions.amount})), 0)`,
          count: sql<number>`COUNT(*)`,
          isPaid: sql<number>`SUM(CASE WHEN ${finTransactions.isPaid} = 1 THEN 1 ELSE 0 END)`,
          isPending: sql<number>`SUM(CASE WHEN ${finTransactions.isPaid} = 0 THEN 1 ELSE 0 END)`,
          paidAmount: sql<number>`COALESCE(SUM(CASE WHEN ${finTransactions.isPaid} = 1 THEN ABS(${finTransactions.amount}) ELSE 0 END), 0)`,
          pendingAmount: sql<number>`COALESCE(SUM(CASE WHEN ${finTransactions.isPaid} = 0 THEN ABS(${finTransactions.amount}) ELSE 0 END), 0)`,
        })
        .from(finTransactions)
        .leftJoin(finCategories, eq(finTransactions.categoryId, finCategories.id))
        .where(
          sql`DATE_FORMAT(${finTransactions.dueDate}, '%Y-%m') = ${month}`
        )
        .groupBy(finCategories.name, finTransactions.categoryId)
        .orderBy(desc(sql`COALESCE(SUM(ABS(${finTransactions.amount})), 0)`));

      // ── 3. Custos fixos cadastrados (finCosts) ────────────────────────────
      const custosFixos = await db
        .select({
          name: finCosts.name,
          type: finCosts.type,
          costCategory: finCosts.costCategory,
          amount: finCosts.amount,
        })
        .from(finCosts)
        .orderBy(desc(finCosts.amount));

      const totalCustosFixosCadastrados = custosFixos
        .filter((c) => c.type === "fixed")
        .reduce((s, c) => s + Number(c.amount), 0);

      const totalCustosVariaveisCadastrados = custosFixos
        .filter((c) => c.type === "variable")
        .reduce((s, c) => s + Number(c.amount), 0);

      // ── 4. Totais e cálculos ──────────────────────────────────────────────
      const despesas = despesasRows.map((r) => ({
        categoria: r.categoryName || "Sem categoria",
        total: Number(r.totalAmount),
        pago: Number(r.paidAmount),
        pendente: Number(r.pendingAmount),
        qtd: Number(r.count),
      }));

      const totalDespesas = despesas.reduce((s, d) => s + d.total, 0);
      const totalPago = despesas.reduce((s, d) => s + d.pago, 0);
      const totalPendente = despesas.reduce((s, d) => s + d.pendente, 0);

      const resultado = receitaInove - totalDespesas;
      const margemLiquida = receitaInove > 0 ? (resultado / receitaInove) * 100 : 0;

      // Ponto de equilíbrio: receita necessária para cobrir todos os custos
      const pontoEquilibrio = totalDespesas;
      const deficitSuperavit = receitaInove - pontoEquilibrio;

      // Categorias com maior potencial de corte (top 5 maiores despesas)
      const topDespesas = [...despesas]
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

      // Percentual de cada categoria sobre a receita
      const despesasComPercentual = despesas.map((d) => ({
        ...d,
        percentualReceita: receitaInove > 0 ? (d.total / receitaInove) * 100 : 0,
        percentualDespesas: totalDespesas > 0 ? (d.total / totalDespesas) * 100 : 0,
      }));

      // ── 5. Análise da IA ──────────────────────────────────────────────────
      let analiseIA = "";
      try {
        const prompt = `Você é um consultor financeiro especializado em sorveteria/varejo alimentar.

DADOS FINANCEIROS — ${month}:
- Receita Total (PDV): R$ ${receitaInove.toFixed(2)} (fonte: ${fonteReceita})
- Total de Despesas: R$ ${totalDespesas.toFixed(2)}
- Resultado: R$ ${resultado.toFixed(2)} (${resultado >= 0 ? "SUPERÁVIT" : "DÉFICIT"})
- Margem Líquida: ${margemLiquida.toFixed(1)}%
- Despesas Pagas: R$ ${totalPago.toFixed(2)}
- Despesas Pendentes: R$ ${totalPendente.toFixed(2)}

DESPESAS POR CATEGORIA (maiores primeiro):
${topDespesas.map((d, i) => `${i + 1}. ${d.categoria}: R$ ${d.total.toFixed(2)} (${receitaInove > 0 ? ((d.total / receitaInove) * 100).toFixed(1) : 0}% da receita)`).join("\n")}

CUSTOS FIXOS CADASTRADOS: R$ ${totalCustosFixosCadastrados.toFixed(2)}
CUSTOS VARIÁVEIS CADASTRADOS: R$ ${totalCustosVariaveisCadastrados.toFixed(2)}

${input.orcamentoCompras ? `ORÇAMENTO DISPONÍVEL PARA COMPRAS: R$ ${input.orcamentoCompras.toFixed(2)}` : ""}

Analise os dados e forneça:
1. **Diagnóstico** (2-3 frases): situação financeira atual
2. **Top 3 cortes prioritários**: onde reduzir despesas com maior impacto (seja específico com valores)
3. **Meta de receita**: qual receita mínima necessária para fechar no positivo
4. **Alerta de risco**: qual categoria de despesa está mais descontrolada
5. **Recomendação de compras**: se há orçamento, como priorizar as compras para maximizar margem

Seja direto, prático e use números reais. Máximo 300 palavras.`;

        const llmResp = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um consultor financeiro especializado em sorveteria/varejo alimentar. Responda sempre em português brasileiro, de forma direta e prática." },
            { role: "user", content: prompt },
          ],
        });
        analiseIA = String(llmResp?.choices?.[0]?.message?.content ?? "");
      } catch {
        analiseIA = "Análise da IA temporariamente indisponível.";
      }

      return {
        month,
        fonteReceita,
        receitaInove,
        totalDespesas,
        totalPago,
        totalPendente,
        resultado,
        margemLiquida: parseFloat(margemLiquida.toFixed(2)),
        pontoEquilibrio,
        deficitSuperavit,
        despesas: despesasComPercentual,
        custosFixos: custosFixos.map((c) => ({
          name: c.name,
          type: c.type,
          costCategory: c.costCategory,
          amount: Number(c.amount),
        })),
        totalCustosFixosCadastrados,
        totalCustosVariaveisCadastrados,
        analiseIA,
      };
    }),
});
