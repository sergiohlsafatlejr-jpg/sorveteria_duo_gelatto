/**
 * Inteligência Financeira, Climática e de Metas Semanais para Sorveteria (Duo Gelatto)
 *
 * Reúne os 4 pilares estratégicos:
 * 1. Contas a Pagar: Break-Even Semanal (em R$, Tickets, Kg de Sorvete e Picolés),
 *    Alerta de Concentração Seg–Qua ("Vale da Morte"), Ranking ABC e geração de boletos via NF-e.
 * 2. Contas a Receber (Previsão): Liquidação D+0 (Pix/Dinheiro), D+1 (Débito), D+30 (Crédito)
 *    + Fluxo de Caixa Diário Projetado com Clima para 7, 15 e 30 dias.
 * 3. Inteligência Climática: Curva Térmica (°C), Janela de Ouro (13h–20h) e
 *    Relatório "Performance Descontando o Clima".
 * 4. Metas Semanais da Equipe: Desdobramento semanal ponderado por clima,
 *    Meta de Recuperação Automática, Metas Táticas de Balcão (Ticket Médio e "Leve para Casa")
 *    e Resumo formatado para WhatsApp.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, gte, like, lte, or } from "drizzle-orm";
import {
  finBanks,
  finCategories,
  finGoals,
  finGoalExtraCosts,
  finReceivables,
  finTransactions,
  purchaseInvoices,
  redeSalesImport,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  getDailyRevenues,
  getForecastSettings,
} from "./db.fin";
import {
  buildForecastDays,
  buildForecastMonth,
  calculateForecastDay,
  DEFAULT_FORECAST_SETTINGS,
  ForecastSettingsValues,
} from "./forecast-calculation";
import { getRedePaymentFamily, isAcceptedRedeSale } from "./rede-excel-parsing";

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function businessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return formatIsoDate(dt);
}

function nextBusinessDay(dateStr: string, daysToAdd = 1): string {
  let current = dateStr;
  let remaining = daysToAdd;
  while (remaining > 0) {
    current = addDays(current, 1);
    const [y, m, d] = current.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }
  return current;
}

async function resolveUserForecastSettings(userId: number): Promise<ForecastSettingsValues> {
  const saved = await getForecastSettings(userId);
  if (!saved) return DEFAULT_FORECAST_SETTINGS;
  const numeric = (value: unknown, fallback: number) =>
    value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    avgWeekday: numeric(saved.avgWeekday, DEFAULT_FORECAST_SETTINGS.avgWeekday),
    avgSaturday: numeric(saved.avgSaturday, DEFAULT_FORECAST_SETTINGS.avgSaturday),
    avgSundayHoliday: numeric(saved.avgSundayHoliday, DEFAULT_FORECAST_SETTINGS.avgSundayHoliday),
    rainFactor: numeric(saved.rainFactor, DEFAULT_FORECAST_SETTINGS.rainFactor),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PILAR 1: Contas a Pagar — Break-Even Semanal, Alerta Seg-Qua, Ranking ABC e NF-e
// ─────────────────────────────────────────────────────────────────────────────

export async function getWeeklyPayablesBreakEven(
  userId: number,
  params: {
    year: number;
    month: number;
    contributionMarginPct?: number; // default 62% (CMC típico de sorveteria ~38%)
    avgTicket?: number;             // default R$ 28,50
    avgSorveteKgPrice?: number;     // default R$ 64,90/kg
    avgPicolePrice?: number;        // default R$ 6,50/un
  },
) {
  const db = await getDb();
  const {
    year,
    month,
    contributionMarginPct = 62,
    avgTicket = 28.5,
    avgSorveteKgPrice = 64.9,
    avgPicolePrice = 6.5,
  } = params;

  const marginRatio = Math.max(0.1, Math.min(0.95, contributionMarginPct / 100));
  const lastDay = new Date(year, month, 0).getDate();
  const dateFrom = new Date(year, month - 1, 1, 0, 0, 0);
  const dateTo = new Date(year, month - 1, lastDay, 23, 59, 59);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const settings = await resolveUserForecastSettings(userId);
  const [forecastMonth, realRevenues] = await Promise.all([
    buildForecastMonth(year, month, settings),
    getDailyRevenues(userId, year, month),
  ]);

  const realMap = new Map<string, number>();
  realRevenues.forEach((r: any) => realMap.set(r.revenueDate, Number(r.realAmount) || 0));

  if (!db) {
    return {
      month: monthKey,
      contributionMarginPct,
      totalPayables: 0,
      totalBreakEvenRevenue: 0,
      totalProjectedRevenue: forecastMonth.summary.totalThermalProjected,
      totalRealRevenue: 0,
      weeks: [],
      abcCategories: [],
    };
  }

  const [txRows, extraCosts] = await Promise.all([
    db
      .select({
        id: finTransactions.id,
        description: finTransactions.description,
        amount: finTransactions.amount,
        dueDate: finTransactions.dueDate,
        isPaid: finTransactions.isPaid,
        categoryName: finCategories.name,
        bankName: finBanks.name,
      })
      .from(finTransactions)
      .leftJoin(finCategories, eq(finTransactions.categoryId, finCategories.id))
      .leftJoin(finBanks, eq(finTransactions.bankId, finBanks.id))
      .where(and(gte(finTransactions.dueDate, dateFrom), lte(finTransactions.dueDate, dateTo))),
    db.select().from(finGoalExtraCosts).where(eq(finGoalExtraCosts.month, monthKey)),
  ]);

  const weekRanges = [
    { index: 1, label: "1ª Semana", start: 1, end: Math.min(7, lastDay) },
    { index: 2, label: "2ª Semana", start: 8, end: Math.min(14, lastDay) },
    { index: 3, label: "3ª Semana", start: 15, end: Math.min(21, lastDay) },
    { index: 4, label: "4ª Semana", start: 22, end: lastDay },
  ];

  const extraPerWeek =
    extraCosts.reduce((s, e) => s + Number(e.amount || 0), 0) / weekRanges.length;

  const weeks = weekRanges.map((range) => {
    const startStr = `${monthKey}-${String(range.start).padStart(2, "0")}`;
    const endStr = `${monthKey}-${String(range.end).padStart(2, "0")}`;

    const weekTxs = txRows.filter((t) => {
      const d = new Date(t.dueDate).getDate();
      return d >= range.start && d <= range.end;
    });

    const payablesTotal = weekTxs.reduce((s, t) => s + Number(t.amount || 0), 0) + extraPerWeek;
    const paidTotal = weekTxs.filter((t) => t.isPaid).reduce((s, t) => s + Number(t.amount || 0), 0);
    const pendingTotal = Math.max(0, payablesTotal - paidTotal);

    // Boletos concentrados entre Segunda (1) e Quarta (3)
    const monWedPayables = weekTxs
      .filter((t) => {
        const dow = new Date(t.dueDate).getDay();
        return dow >= 1 && dow <= 3;
      })
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const monWedSharePct = payablesTotal > 0 ? Math.round((monWedPayables / payablesTotal) * 100) : 0;

    // Receita projetada e realizada na semana
    const weekDays = forecastMonth.days.filter((d) => d.day >= range.start && d.day <= range.end);
    const projectedRevenue = weekDays.reduce((s, d) => s + d.thermalAdjustedAmount, 0);
    const realRevenue = weekDays.reduce((s, d) => s + (realMap.get(d.date) ?? 0), 0);
    const effectiveRevenue = weekDays.reduce(
      (s, d) => s + (realMap.has(d.date) ? realMap.get(d.date)! : d.thermalAdjustedAmount),
      0,
    );

    const breakEvenRevenue = Math.round(payablesTotal / marginRatio);
    const dailyBreakEven = Math.round(breakEvenRevenue / Math.max(1, weekDays.length));
    const requiredTickets = Math.ceil(breakEvenRevenue / Math.max(1, avgTicket));
    const requiredSorveteKg = Number((breakEvenRevenue / Math.max(1, avgSorveteKgPrice)).toFixed(1));
    const requiredPicoles = Math.ceil(breakEvenRevenue / Math.max(1, avgPicolePrice));

    const coveragePct = breakEvenRevenue > 0 ? Math.round((effectiveRevenue / breakEvenRevenue) * 100) : 100;
    const hasCashCrunchAlert = monWedSharePct >= 60 && payablesTotal > 0;

    return {
      weekIndex: range.index,
      weekLabel: range.label,
      dateRange: `${String(range.start).padStart(2, "0")}/${String(month).padStart(2, "0")} a ${String(range.end).padStart(2, "0")}/${String(month).padStart(2, "0")}`,
      startDate: startStr,
      endDate: endStr,
      payablesTotal: Math.round(payablesTotal * 100) / 100,
      paidTotal: Math.round(paidTotal * 100) / 100,
      pendingTotal: Math.round(pendingTotal * 100) / 100,
      monWedPayables: Math.round(monWedPayables * 100) / 100,
      monWedSharePct,
      hasCashCrunchAlert,
      cashCrunchMessage: hasCashCrunchAlert
        ? `${monWedSharePct}% dos vencimentos (${monWedPayables.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) caem entre Segunda e Quarta. Reserve o caixa de Sábado/Domingo!`
        : null,
      breakEvenRevenue,
      dailyBreakEven,
      requiredTickets,
      requiredSorveteKg,
      requiredPicoles,
      projectedRevenue,
      realRevenue,
      effectiveRevenue,
      coveragePct,
      surplusOrDeficit: Math.round(effectiveRevenue - breakEvenRevenue),
    };
  });

  // Ranking ABC de Saídas por Categoria
  const categoryTotals = new Map<string, { category: string; amount: number; count: number }>();
  txRows.forEach((t) => {
    const cat = t.categoryName || "Sem Categoria";
    const cur = categoryTotals.get(cat) ?? { category: cat, amount: 0, count: 0 };
    cur.amount += Number(t.amount || 0);
    cur.count += 1;
    categoryTotals.set(cat, cur);
  });
  if (extraCosts.length > 0) {
    const extraSum = extraCosts.reduce((s, e) => s + Number(e.amount || 0), 0);
    categoryTotals.set("Custos Extras / Rateios", {
      category: "Custos Extras / Rateios",
      amount: extraSum,
      count: extraCosts.length,
    });
  }

  const totalPayables = Array.from(categoryTotals.values()).reduce((s, c) => s + c.amount, 0);
  const totalProjectedRevenue = forecastMonth.summary.totalThermalProjected;
  const totalRealRevenue = Array.from(realMap.values()).reduce((s, v) => s + v, 0);
  const referenceRevenue = Math.max(totalRealRevenue, totalProjectedRevenue, 1);

  let cumulativePct = 0;
  const abcCategories = Array.from(categoryTotals.values())
    .sort((a, b) => b.amount - a.amount)
    .map((item) => {
      const shareOfPayablesPct = totalPayables > 0 ? Number(((item.amount / totalPayables) * 100).toFixed(1)) : 0;
      cumulativePct += shareOfPayablesPct;
      const abcClass: "A" | "B" | "C" = cumulativePct <= 70 ? "A" : cumulativePct <= 90 ? "B" : "C";
      return {
        category: item.category,
        amount: Math.round(item.amount * 100) / 100,
        count: item.count,
        shareOfPayablesPct,
        shareOfRevenuePct: Number(((item.amount / referenceRevenue) * 100).toFixed(1)),
        abcClass,
      };
    });

  return {
    month: monthKey,
    contributionMarginPct,
    totalPayables: Math.round(totalPayables * 100) / 100,
    totalBreakEvenRevenue: Math.round(totalPayables / marginRatio),
    totalProjectedRevenue,
    totalRealRevenue,
    weeks,
    abcCategories,
  };
}

/**
 * Gera automaticamente boletos/parcelas em Contas a Pagar (`fin_transactions`)
 * a partir de uma Nota Fiscal de Compra (`purchase_invoices`).
 */
export async function createPayablesFromPurchaseInvoice(
  userId: number,
  input: {
    invoiceId: number;
    installments: number;
    firstDueDate: string; // YYYY-MM-DD
    intervalDays?: number; // default 28
    categoryId?: number;
    bankId?: number;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db.transaction(async (tx) => {
    // Serializa cliques/retries da mesma nota; nada é criado fora desta transação.
    const [invoice] = await tx.select().from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, input.invoiceId)).limit(1).for("update");
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada" });
    if (invoice.operationNature !== "VENDA" ||
        !["extracted", "confirmed"].includes(invoice.status) ||
        !invoice.reviewedBy || !invoice.reviewedAt) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Revise a nota de compra com natureza VENDA antes de gerar boletos." });
    }

    const totalCents = Math.round(Number(invoice.totalAmount) * 100);
    if (!Number.isFinite(totalCents) || totalCents <= 0) {
      throw new Error("A nota fiscal não possui valor total válido para gerar boletos");
    }
    const installments = Math.max(1, Math.min(24, input.installments));
    const intervalDays = Math.max(1, input.intervalDays ?? 28);
    const legacyNotes = `Gerado automaticamente da NF-e #${invoice.invoiceNumber || invoice.id} (${invoice.supplierName})`;
    const markerPrefix = `[NF-e invoiceID=${invoice.id} parcel=`;
    // Qualquer parcela prévia (inclusive paga, outro usuário ou lote parcial) bloqueia TODO o lote.
    const existing = await tx.select({ id: finTransactions.id }).from(finTransactions)
      .where(or(like(finTransactions.notes, `%${markerPrefix}%`), eq(finTransactions.notes, legacyNotes)))
      .limit(1).for("update");
    if (existing.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Esta nota já possui boletos gerados. Revise as parcelas existentes; não serão duplicadas." });
    }

    const baseCents = Math.floor(totalCents / installments);
    const values = Array.from({ length: installments }, (_, i) => ({
      userId,
      description: `NF-e #${invoice.invoiceNumber || invoice.id} — ${invoice.supplierName}${installments > 1 ? ` (${i + 1}/${installments})` : ""}`,
      amount: ((i === installments - 1 ? totalCents - baseCents * (installments - 1) : baseCents) / 100).toFixed(2),
      dueDate: new Date(`${addDays(input.firstDueDate, i * intervalDays)}T12:00:00Z`),
      categoryId: input.categoryId,
      bankId: input.bankId,
      isPaid: false,
      notes: `${legacyNotes} ${markerPrefix}${i + 1}/${installments}]`,
    }));
    const createdIds = await tx.insert(finTransactions).values(values).$returningId();
    if (createdIds.length !== installments) throw new Error("Falha ao gerar todas as parcelas; operação revertida.");
    return {
      createdCount: createdIds.length,
      totalAmount: totalCents / 100,
      invoiceNumber: invoice.invoiceNumber,
      supplierName: invoice.supplierName,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PILAR 2: Contas a Receber (Previsão D+0/D+1/D+30 + Liquidez Diária Projetada)
// ─────────────────────────────────────────────────────────────────────────────

export async function getReceivablesForecastAndLiquidity(
  userId: number,
  params: {
    horizonDays?: number; // 7, 15 ou 30
    debitFeePct?: number; // default 1.39%
    creditFeePct?: number; // default 3.19%
    pixCashSharePct?: number; // default 42%
    debitSharePct?: number; // default 33%
    creditSharePct?: number; // default 25%
  } = {},
) {
  const db = await getDb();
  const horizonDays = Math.max(7, Math.min(45, params.horizonDays ?? 15));
  const debitFeePct = params.debitFeePct ?? 1.39;
  const creditFeePct = params.creditFeePct ?? 3.19;
  const pixCashShare = (params.pixCashSharePct ?? 42) / 100;
  const debitShare = (params.debitSharePct ?? 33) / 100;
  const creditShare = (params.creditSharePct ?? 25) / 100;

  const now = new Date();
  const todayStr = businessDate(now);
  const dateStrings = Array.from({ length: horizonDays }, (_, i) => addDays(todayStr, i));
  const endStr = dateStrings[dateStrings.length - 1];

  const settings = await resolveUserForecastSettings(userId);
  const forecastDays = await buildForecastDays(dateStrings, settings, now);

  if (!db) {
    return {
      horizonDays,
      initialBankBalance: 0,
      summary: {
        totalManualReceivables: 0,
        totalCardSettlementsFromPastSales: 0,
        totalProjectedSalesInflow: 0,
        totalExpectedInflow: 0,
        totalPayablesOutflow: 0,
        netProjectedCashflow: 0,
        negativeDaysCount: 0,
        minProjectedBalance: 0,
      },
      days: [],
    };
  }

  // Inclui parcelas tardias de contratos convencionais (até 24 parcelas mensais).
  const lookbackStr = addDays(todayStr, -(24 * 30 + 7));
  const [banks, manualReceivables, payables, recentCardSales, realRevenues] = await Promise.all([
    db.select().from(finBanks),
    db
      .select()
      .from(finReceivables)
      .where(
        and(
          gte(finReceivables.dueDate, new Date(`${todayStr}T00:00:00`)),
          lte(finReceivables.dueDate, new Date(`${endStr}T23:59:59`)),
        ),
      ),
    db
      .select()
      .from(finTransactions)
      .where(
        and(
          gte(finTransactions.dueDate, new Date(`${todayStr}T00:00:00`)),
          lte(finTransactions.dueDate, new Date(`${endStr}T23:59:59`)),
        ),
      ),
    db
      .select()
      .from(redeSalesImport)
      .where(
        and(
          gte(redeSalesImport.dataDaVenda, new Date(`${lookbackStr}T00:00:00Z`)),
          lte(redeSalesImport.dataDaVenda, new Date(`${todayStr}T23:59:59`)),
        ),
      ),
    getDailyRevenues(userId, Number(todayStr.slice(0, 4)), Number(todayStr.slice(5, 7))),
  ]);

  const initialBankBalance = banks.reduce((s, b) => s + Number(b.initialBalance || 0), 0);

  // Mapa de liquidação de vendas de cartão já realizadas (Rede)
  // Prazo contratado prevalece; D+1 antecipado liquida todas as parcelas juntas.
  const pastCardSettlementByDate = new Map<string, number>();
  const todayActual = { pix: 0, debit: 0, credit: 0 };
  recentCardSales.forEach((sale) => {
    if (!sale.dataDaVenda || sale.canceladaPeloEstabelecimento) return;
    if (sale.statusDaVenda && !isAcceptedRedeSale(sale.statusDaVenda, sale.canceladaPeloEstabelecimento)) return;
    const saleDateStr = formatIsoDate(new Date(sale.dataDaVenda));
    const family = getRedePaymentFamily(sale.modalidade);
    if (family !== "pix" && family !== "debit" && family !== "credit") return;
    const fee = family === "debit" ? debitFeePct : family === "credit" ? creditFeePct : 0;
    const netAmount = sale.valorLiquido != null
      ? Number(sale.valorLiquido)
      : Number(sale.valorDaVendaAtualizado ?? sale.valorDaVendaOriginal ?? 0) * (1 - fee / 100);
    if (!Number.isFinite(netAmount) || netAmount <= 0) return;
    if (saleDateStr === todayStr) todayActual[family] += netAmount;
    if (family === "pix") return; // Pix já liquidou em D+0, não é recebível futuro.

    const term = (sale.prazoDeRecebimento ?? "").toLowerCase();
    const explicitDays = term.match(/d\s*\+\s*(\d+)\b/);
    const termDays = term.includes("mesmo dia") ? 0 : explicitDays ? Number(explicitDays[1]) : null;
    const daysToSettle = termDays ?? (family === "debit" ? 1 : 30);
    const count = family === "credit" && daysToSettle >= 30
      ? Math.max(1, Math.min(24, Math.trunc(sale.numeroDeParcelas ?? 1))) : 1;
    const totalCents = Math.round(netAmount * 100);
    const baseCents = Math.floor(totalCents / count);
    for (let i = 0; i < count; i++) {
      const settlementDate = daysToSettle === 1
        ? nextBusinessDay(saleDateStr)
        : addDays(saleDateStr, daysToSettle + 30 * i);
      const amount = (i === count - 1 ? totalCents - baseCents * (count - 1) : baseCents) / 100;
      if (settlementDate >= todayStr && settlementDate <= endStr) {
        pastCardSettlementByDate.set(settlementDate, (pastCardSettlementByDate.get(settlementDate) ?? 0) + amount);
      }
    }
  });

  // Vendas projetadas para cada dia futuro geram:
  // - Pix/Dinheiro no próprio dia (D+0)
  // - Débito no próximo dia útil (D+1 descontando taxa)
  // - Crédito em D+30 (descontando taxa)
  const projectedSalesCashByDate = new Map<string, { d0PixCash: number; d1Debit: number; d30Credit: number }>();
  dateStrings.forEach((d) => projectedSalesCashByDate.set(d, { d0PixCash: 0, d1Debit: 0, d30Credit: 0 }));

  const todayRealRevenue = Number(realRevenues.find(r => r.revenueDate === todayStr)?.realAmount ?? 0);
  forecastDays.forEach((fDay) => {
    const rev = fDay.thermalAdjustedAmount;
    const isToday = fDay.date === todayStr;
    // PDV e Rede são duas observações do mesmo realizado, nunca devem ser somados.
    const d0 = Math.max(0, rev * pixCashShare - (isToday ? Math.max(todayActual.pix, todayRealRevenue * pixCashShare) : 0));
    const d1 = Math.max(0, rev * debitShare * (1 - debitFeePct / 100) -
      (isToday ? Math.max(todayActual.debit, todayRealRevenue * debitShare * (1 - debitFeePct / 100)) : 0));
    const d30 = Math.max(0, rev * creditShare * (1 - creditFeePct / 100) -
      (isToday ? Math.max(todayActual.credit, todayRealRevenue * creditShare * (1 - creditFeePct / 100)) : 0));

    const curD0 = projectedSalesCashByDate.get(fDay.date);
    if (curD0) curD0.d0PixCash += d0;

    const d1Date = nextBusinessDay(fDay.date, 1);
    const curD1 = projectedSalesCashByDate.get(d1Date);
    if (curD1) curD1.d1Debit += d1;

    const d30Date = addDays(fDay.date, 30);
    const curD30 = projectedSalesCashByDate.get(d30Date);
    if (curD30) curD30.d30Credit += d30;
  });

  let runningBalance = initialBankBalance;
  let totalManualReceivables = 0;
  let totalCardSettlementsFromPastSales = 0;
  let totalProjectedSalesInflow = 0;
  let totalPayablesOutflow = 0;
  let negativeDaysCount = 0;
  let minProjectedBalance = initialBankBalance;

  const days = forecastDays.map((fDay) => {
    const dStr = fDay.date;
    const dayManualRx = manualReceivables
      .filter((r) => !r.isReceived && formatIsoDate(new Date(r.dueDate)) === dStr)
      .reduce((s, r) => s + Number(r.amount || 0), 0);

    const dayPastCardRx = pastCardSettlementByDate.get(dStr) ?? 0;
    const projInflows = projectedSalesCashByDate.get(dStr) ?? { d0PixCash: 0, d1Debit: 0, d30Credit: 0 };
    const dayProjectedSalesRx = projInflows.d0PixCash + projInflows.d1Debit + projInflows.d30Credit;

    const dayPayables = payables
      .filter((t) => !t.isPaid && formatIsoDate(new Date(t.dueDate)) === dStr)
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const totalInflow = dayManualRx + dayPastCardRx + dayProjectedSalesRx;
    const netDay = totalInflow - dayPayables;
    runningBalance += netDay;

    totalManualReceivables += dayManualRx;
    totalCardSettlementsFromPastSales += dayPastCardRx;
    totalProjectedSalesInflow += dayProjectedSalesRx;
    totalPayablesOutflow += dayPayables;

    if (runningBalance < 0) negativeDaysCount++;
    if (runningBalance < minProjectedBalance) minProjectedBalance = runningBalance;

    return {
      date: dStr,
      dayType: fDay.dayType,
      weather: fDay.weather,
      projectedGrossSales: fDay.thermalAdjustedAmount,
      manualReceivables: Math.round(dayManualRx * 100) / 100,
      pastCardSettlements: Math.round(dayPastCardRx * 100) / 100,
      projectedPixCashD0: Math.round(projInflows.d0PixCash * 100) / 100,
      projectedDebitD1: Math.round(projInflows.d1Debit * 100) / 100,
      projectedCreditD30: Math.round(projInflows.d30Credit * 100) / 100,
      totalInflow: Math.round(totalInflow * 100) / 100,
      payablesOutflow: Math.round(dayPayables * 100) / 100,
      netFlow: Math.round(netDay * 100) / 100,
      cumulativeBalance: Math.round(runningBalance * 100) / 100,
      isCashGapAlert: runningBalance < 0 || (dayPayables > totalInflow && dayPayables > 1500),
    };
  });

  const totalExpectedInflow =
    totalManualReceivables + totalCardSettlementsFromPastSales + totalProjectedSalesInflow;

  return {
    horizonDays,
    initialBankBalance: Math.round(initialBankBalance * 100) / 100,
    summary: {
      totalManualReceivables: Math.round(totalManualReceivables * 100) / 100,
      totalCardSettlementsFromPastSales: Math.round(totalCardSettlementsFromPastSales * 100) / 100,
      totalProjectedSalesInflow: Math.round(totalProjectedSalesInflow * 100) / 100,
      totalExpectedInflow: Math.round(totalExpectedInflow * 100) / 100,
      totalPayablesOutflow: Math.round(totalPayablesOutflow * 100) / 100,
      netProjectedCashflow: Math.round((totalExpectedInflow - totalPayablesOutflow) * 100) / 100,
      negativeDaysCount,
      minProjectedBalance: Math.round(minProjectedBalance * 100) / 100,
    },
    days,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PILAR 3: Inteligência Climática — Curva Térmica (°C) e Performance vs Clima
// ─────────────────────────────────────────────────────────────────────────────

export async function getWeatherSalesIntelligence(
  userId: number,
  params: { year: number; month: number },
) {
  const { year, month } = params;
  const settings = await resolveUserForecastSettings(userId);
  const realRevenues = await getDailyRevenues(userId, year, month);
  const realMap = new Map<string, number>();
  realRevenues.forEach((r: any) => realMap.set(r.revenueDate, Number(r.realAmount) || 0));

  const daysInMonth = new Date(year, month, 0).getDate();
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const todayStr = businessDate();

  // Open-Meteo /v1/forecast aceita apenas até 15 dias à frente e ~90 dias no passado.
  // Se end_date ultrapassar today + 15 dias (ex.: fim do mês atual), a API inteira retornava HTTP 400!
  const minForecastDate = addDays(todayStr, -90);
  const maxForecastDate = addDays(todayStr, 15);
  const forecastStart = dateFrom > minForecastDate ? dateFrom : minForecastDate;
  const forecastEnd = dateTo < maxForecastDate ? dateTo : maxForecastDate;

  const weatherByDate = new Map<
    string,
    { code: number; tempMax: number; precip: number; precipProb: number; peakHoursRainProb: number | null; peakHoursPrecip: number | null }
  >();

  const parseOpenMeteoResponse = (data: any) => {
    const daily = data?.daily ?? {};
    const hourly = data?.hourly ?? {};
    const hTimes: string[] = hourly.time ?? [];
    const hProbs: number[] = hourly.precipitation_probability ?? [];
    const hPrecip: number[] = hourly.precipitation ?? [];
    const peakStatsMap = new Map<string, { maxProb: number; sumPrecip: number; hasProb: boolean }>();
    hTimes.forEach((iso, idx) => {
      const [dStr, tStr] = iso.split("T");
      const h = Number((tStr ?? "00").slice(0, 2));
      if (h >= 13 && h <= 20) {
        const peak = peakStatsMap.get(dStr) ?? { maxProb: 0, sumPrecip: 0, hasProb: false };
        if (hProbs[idx] != null && Number.isFinite(Number(hProbs[idx]))) {
          peak.maxProb = Math.max(peak.maxProb, Number(hProbs[idx]));
          peak.hasProb = true;
        }
        peak.sumPrecip += Number(hPrecip[idx] ?? 0);
        peakStatsMap.set(dStr, peak);
      }
    });
    (daily.time ?? []).forEach((dStr: string, i: number) => {
      if (
        daily.weathercode?.[i] == null ||
        daily.temperature_2m_max?.[i] == null ||
        !Number.isFinite(Number(daily.weathercode[i])) ||
        Number(daily.weathercode[i]) < 0 ||
        !Number.isFinite(Number(daily.temperature_2m_max[i]))
      ) {
        return;
      }
      const peak = peakStatsMap.get(dStr);
      const precipSum = Number(daily.precipitation_sum?.[i] ?? 0);
      const precipProb =
        daily.precipitation_probability_max?.[i] != null
          ? Number(daily.precipitation_probability_max[i])
          : precipSum > 5
            ? 80
            : precipSum > 1
              ? 50
              : 0;
      weatherByDate.set(dStr, {
        code: Number(daily.weathercode[i]),
        tempMax: Number(daily.temperature_2m_max[i]),
        precip: precipSum,
        precipProb,
        peakHoursRainProb: peak ? (peak.hasProb ? peak.maxProb : peak.sumPrecip > 2 ? 75 : 0) : null,
        peakHoursPrecip: peak ? Number(peak.sumPrecip.toFixed(1)) : null,
      });
    });
  };

  if (forecastStart <= forecastEnd) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=-16.6864&longitude=-49.2643&daily=weathercode,temperature_2m_max,precipitation_sum,precipitation_probability_max&hourly=precipitation_probability,precipitation&timezone=America%2FSao_Paulo&start_date=${forecastStart}&end_date=${forecastEnd}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (res.ok) {
        parseOpenMeteoResponse(await res.json());
      }
    } catch { /* fallback sem API externa */ }
  }

  // Para meses históricos (>90 dias atrás), consulta o Archive API da Open-Meteo
  if (dateFrom < minForecastDate) {
    const archiveEnd = dateTo < minForecastDate ? dateTo : addDays(minForecastDate, -1);
    if (dateFrom <= archiveEnd) {
      try {
        const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=-16.6864&longitude=-49.2643&daily=weathercode,temperature_2m_max,precipitation_sum&hourly=precipitation&timezone=America%2FSao_Paulo&start_date=${dateFrom}&end_date=${archiveEnd}`;
        const archRes = await fetch(archiveUrl, { signal: AbortSignal.timeout(4500) });
        if (archRes.ok) {
          parseOpenMeteoResponse(await archRes.json());
        }
      } catch { /* fallback sem arquivo histórico */ }
    }
  }

  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const dStr = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    const w = weatherByDate.get(dStr) ?? null;
    const calc = calculateForecastDay(dStr, settings, null, w, todayStr);
    const realAmount = realMap.get(dStr) ?? null;
    const weatherExpected = calc.thermalAdjustedAmount;
    const operationalEfficiencyPct =
      w !== null && realAmount !== null && weatherExpected > 0
        ? Math.round((realAmount / weatherExpected) * 100)
        : null;

    let diagnosis: "outperformed" | "on_track" | "underperformed" | "pending" = "pending";
    if (operationalEfficiencyPct !== null) {
      if (operationalEfficiencyPct >= 105) diagnosis = "outperformed";
      else if (operationalEfficiencyPct >= 88) diagnosis = "on_track";
      else diagnosis = "underperformed";
    }

    return {
      ...calc,
      realAmount,
      weatherExpected,
      weatherStatus: w ? "available" as const : "unknown" as const,
      operationalEfficiencyPct,
      diagnosis,
    };
  });

  // Agrupamento por faixa térmica (Curva Térmica da Sorveteria)
  const bands = [
    { key: "hot", label: "Calor Forte (≥ 31°C sem chuva)", days: 0, totalReal: 0, totalExpected: 0, forecastDaysCount: 0, totalForecastExpected: 0 },
    { key: "warm", label: "Clima Ideal (27°C a 30.9°C sem chuva)", days: 0, totalReal: 0, totalExpected: 0, forecastDaysCount: 0, totalForecastExpected: 0 },
    { key: "mild", label: "Clima Ameno (< 27°C sem chuva)", days: 0, totalReal: 0, totalExpected: 0, forecastDaysCount: 0, totalForecastExpected: 0 },
    { key: "rain", label: "Dias Chuvosos / Tempestade", days: 0, totalReal: 0, totalExpected: 0, forecastDaysCount: 0, totalForecastExpected: 0 },
  ];

  allDays.forEach((d) => {
    if (!d.weather) return;
    const isRain = d.weather.label === "rain" || d.weather.label === "storm";
    const band = isRain
      ? bands[3]
      : d.weather.tempMax >= 31
        ? bands[0]
        : d.weather.tempMax >= 27
          ? bands[1]
          : bands[2];
    band.forecastDaysCount += 1;
    band.totalForecastExpected += d.weatherExpected;
    if (d.realAmount && d.realAmount > 0) {
      band.days += 1;
      band.totalReal += d.realAmount;
      band.totalExpected += d.weatherExpected;
    }
  });

  const thermalCurve = bands.map((b) => ({
    ...b,
    avgRealRevenue: b.days > 0 ? Math.round(b.totalReal / b.days) : 0,
    avgExpectedRevenue: b.days > 0 ? Math.round(b.totalExpected / b.days) : 0,
    avgForecastRevenue: b.forecastDaysCount > 0 ? Math.round(b.totalForecastExpected / b.forecastDaysCount) : 0,
    efficiencyPct: b.totalExpected > 0 ? Math.round((b.totalReal / b.totalExpected) * 100) : null,
  }));

  return {
    year,
    month,
    thermalCurve,
    days: allDays,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PILAR 4: Metas Semanais da Equipe + Metas Táticas de Balcão + WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

export const WEEKLY_TEAM_CONFIG_LABEL = "__WEEKLY_TEAM_CONFIG__";

export type WeeklyTeamWeekOverride = {
  customGoal?: number | null;
  customTakeHomePotes?: number | null;
  managerAnalysis?: string;
  employeeNote?: string;
};

export type WeeklyTeamStoredConfig = {
  monthlyAnalysis?: string;
  teamGeneralNotice?: string;
  targetMonthlyRevenueOverride?: number | null;
  targetTicketOverride?: number | null;
  weeks?: Record<string, WeeklyTeamWeekOverride>;
};

function parseWeeklyTeamConfig(rawNotes: string | null | undefined): WeeklyTeamStoredConfig {
  if (!rawNotes) return {};
  try {
    const parsed = JSON.parse(rawNotes);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveWeeklyTeamGoalsConfig(
  _userId: number,
  input: {
    month: string;
    monthlyAnalysis?: string;
    teamGeneralNotice?: string;
    targetMonthlyRevenueOverride?: number | null;
    targetTicketOverride?: number | null;
    weekIndex?: number;
    weekOverride?: WeeklyTeamWeekOverride;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const existingRows = await db
    .select()
    .from(finGoals)
    .where(and(eq(finGoals.month, input.month), eq(finGoals.label, WEEKLY_TEAM_CONFIG_LABEL)));

  const currentRow = existingRows[0];
  const currentConfig = parseWeeklyTeamConfig(currentRow?.notes);

  const nextConfig: WeeklyTeamStoredConfig = {
    ...currentConfig,
    ...(input.monthlyAnalysis !== undefined ? { monthlyAnalysis: input.monthlyAnalysis } : {}),
    ...(input.teamGeneralNotice !== undefined ? { teamGeneralNotice: input.teamGeneralNotice } : {}),
    ...(input.targetMonthlyRevenueOverride !== undefined
      ? { targetMonthlyRevenueOverride: input.targetMonthlyRevenueOverride }
      : {}),
    ...(input.targetTicketOverride !== undefined
      ? { targetTicketOverride: input.targetTicketOverride }
      : {}),
    weeks: {
      ...(currentConfig.weeks ?? {}),
      ...(input.weekIndex !== undefined && input.weekOverride !== undefined
        ? {
            [String(input.weekIndex)]: {
              ...(currentConfig.weeks?.[String(input.weekIndex)] ?? {}),
              ...input.weekOverride,
            },
          }
        : {}),
    },
  };

  const notesJson = JSON.stringify(nextConfig);
  if (currentRow) {
    await db
      .update(finGoals)
      .set({ notes: notesJson, updatedAt: new Date() })
      .where(eq(finGoals.id, currentRow.id));
  } else {
    await db.insert(finGoals).values({
      month: input.month,
      label: WEEKLY_TEAM_CONFIG_LABEL,
      targetRevenue: "0",
      salary: "0",
      notes: notesJson,
      sortOrder: -999,
    });
  }

  return { success: true, config: nextConfig };
}

export async function getWeeklyTeamGoalsPlan(
  userId: number,
  params: {
    month: string; // YYYY-MM
    targetMonthlyRevenue?: number;
    targetTicket?: number;
  },
) {
  const db = await getDb();
  const [year, month] = params.month.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const todayStr = businessDate();

  const settings = await resolveUserForecastSettings(userId);
  const [forecastMonth, realRevenues, savedGoals] = await Promise.all([
    buildForecastMonth(year, month, settings),
    getDailyRevenues(userId, year, month),
    db ? db.select().from(finGoals).where(eq(finGoals.month, params.month)) : Promise.resolve([]),
  ]);

  const realMap = new Map<string, number>();
  realRevenues.forEach((r: any) => realMap.set(r.revenueDate, Number(r.realAmount) || 0));

  const configRow = savedGoals.find((g: any) => g.label === WEEKLY_TEAM_CONFIG_LABEL);
  const storedConfig = parseWeeklyTeamConfig(configRow?.notes);
  const scenarioGoals = savedGoals.filter((g: any) => g.label !== WEEKLY_TEAM_CONFIG_LABEL);

  // Se o usuário cadastrou metas em FinGoals, usa a maior/principal ou o override informado
  const defaultGoalFromDb =
    scenarioGoals.length > 0
      ? Math.max(...scenarioGoals.map((g) => Number(g.targetRevenue || 0)))
      : 0;
  const targetMonthlyRevenue =
    params.targetMonthlyRevenue && params.targetMonthlyRevenue > 0
      ? params.targetMonthlyRevenue
      : storedConfig.targetMonthlyRevenueOverride && storedConfig.targetMonthlyRevenueOverride > 0
        ? storedConfig.targetMonthlyRevenueOverride
        : defaultGoalFromDb > 0
          ? defaultGoalFromDb
          : forecastMonth.summary.totalThermalProjected;

  const targetTicket =
    params.targetTicket && params.targetTicket > 0
      ? params.targetTicket
      : storedConfig.targetTicketOverride && storedConfig.targetTicketOverride > 0
        ? storedConfig.targetTicketOverride
        : 31.5;

  const totalThermalWeight = Math.max(
    1,
    forecastMonth.days.reduce((s, d) => s + d.thermalAdjustedAmount, 0),
  );

  // Meta original de cada dia ponderada pelo clima/temperatura + dia da semana
  const dailyWithOriginalGoal = forecastMonth.days.map((d) => {
    const originalGoal = Math.round((d.thermalAdjustedAmount / totalThermalWeight) * targetMonthlyRevenue);
    const real = d.date <= todayStr ? realMap.get(d.date) ?? 0 : 0;
    const isCompletedDay = d.date < todayStr;
    return {
      ...d,
      originalGoal,
      real,
      isCompletedDay,
    };
  });

  // Cálculo de Recuperação Dinâmica: quanto falta realizar no mês dividido pelos dias restantes
  const realizedSoFar = dailyWithOriginalGoal.reduce((s, d) => s + d.real, 0);
  const remainingTargetRevenue = Math.max(0, targetMonthlyRevenue - realizedSoFar);
  const openDays = dailyWithOriginalGoal.filter(d => !d.isCompletedDay);
  const remainingDaysWeight = openDays.reduce((s, d) => s + d.thermalAdjustedAmount, 0);
  const remainingCents = Math.round(remainingTargetRevenue * 100);
  let allocatedCents = 0;
  let openDayIndex = 0;

  const dailyPlans = dailyWithOriginalGoal.map((d) => {
    let recoveryGoal = d.real;
    if (!d.isCompletedDay) {
      const weight = remainingDaysWeight > 0 ? d.thermalAdjustedAmount / remainingDaysWeight : 1 / openDays.length;
      const cents = ++openDayIndex === openDays.length ? remainingCents - allocatedCents
        : Math.min(remainingCents - allocatedCents, Math.round(weight * remainingCents));
      allocatedCents += cents;
      // Dias passados ficam no realizado; hoje continua aberto e conserva suas vendas parciais.
      recoveryGoal += cents / 100;
    }
    return {
      ...d,
      recoveryGoal,
    };
  });

  const weekRanges = [
    { index: 1, label: "1ª Semana", start: 1, end: Math.min(7, lastDay) },
    { index: 2, label: "2ª Semana", start: 8, end: Math.min(14, lastDay) },
    { index: 3, label: "3ª Semana", start: 15, end: Math.min(21, lastDay) },
    { index: 4, label: "4ª Semana", start: 22, end: lastDay },
  ];

  const weeks = weekRanges.map((range) => {
    const wDays = dailyPlans.filter((d) => d.day >= range.start && d.day <= range.end);
    const originalGoal = wDays.reduce((s, d) => s + d.originalGoal, 0);
    const computedRecoveryGoal = wDays.reduce((s, d) => s + d.recoveryGoal, 0);
    const weekOverride = storedConfig.weeks?.[String(range.index)];
    const hasCustomGoal = weekOverride?.customGoal != null && weekOverride.customGoal > 0;
    const recoveryGoal = hasCustomGoal ? Number(weekOverride!.customGoal) : computedRecoveryGoal;
    const realized = wDays.reduce((s, d) => s + d.real, 0);
    const expectedUntilToday = wDays
      .filter((d) => d.date <= todayStr)
      .reduce((s, d) => s + d.originalGoal, 0);

    const rainyOrCloudyDays = wDays.filter(
      (d) => d.weather?.label === "rain" || d.weather?.label === "storm" || d.weather?.label === "cloud",
    ).length;
    const hotDays = wDays.filter((d) => (d.weather?.tempMax ?? 0) >= 31).length;

    const progressPct = recoveryGoal > 0 ? Math.round((realized / recoveryGoal) * 100) : 0;
    const pacePct = expectedUntilToday > 0 ? Math.round((realized / expectedUntilToday) * 100) : 100;

    // Metas táticas da equipe para a semana
    const targetTicketsCount = Math.ceil(recoveryGoal / Math.max(1, targetTicket));
    // Se houver previsão de chuva/nublado, aumenta o foco na meta "Leve para Casa" (Potes 1.5L/2L e Combos)
    const takeHomeShareTargetPct = rainyOrCloudyDays >= 2 ? 28 : 18;
    const defaultTakeHomeRevenueTarget = Math.round(recoveryGoal * (takeHomeShareTargetPct / 100));
    const defaultTakeHomePotesTarget = Math.ceil(defaultTakeHomeRevenueTarget / 42); // ticket médio pote 1.5L/2L ~ R$ 42
    const hasCustomPotes = weekOverride?.customTakeHomePotes != null && weekOverride.customTakeHomePotes >= 0;
    const takeHomePotesTarget = hasCustomPotes ? Number(weekOverride!.customTakeHomePotes) : defaultTakeHomePotesTarget;
    const takeHomeRevenueTarget = hasCustomPotes ? takeHomePotesTarget * 42 : defaultTakeHomeRevenueTarget;

    const tacticalFocus =
      rainyOrCloudyDays >= 2
        ? "Semana com instabilidade/chuva: focar equipe em oferecer Potes 1,5L/2L ('Leve para Casa'), Açaí e Cascão Recheado para proteger o faturamento."
        : hotDays >= 3
          ? "Semana de calor forte (≥31°C): garantir cubas de 10L cheias antes das 13h, agilidade no peso e oferta ativa de água/picolés na fila."
          : "Semana de clima estável: focar em elevar o Ticket Médio oferecendo 1 adicional/cobertura ou troca do copinho pelo cascão.";

    const managerAnalysis = weekOverride?.managerAnalysis?.trim() ?? "";
    const employeeNote = weekOverride?.employeeNote?.trim() ?? "";

    const startStr = `${params.month}-${String(range.start).padStart(2, "0")}`;
    const endStr = `${params.month}-${String(range.end).padStart(2, "0")}`;
    const isCurrentWeek = todayStr >= startStr && todayStr <= endStr;

    const whatsappSummaryLines = [
      `🍨 *META DA SEMANA — DUO GELATTO (${range.label}: ${String(range.start).padStart(2, "0")}/${String(month).padStart(2, "0")} a ${String(range.end).padStart(2, "0")}/${String(month).padStart(2, "0")})*`,
      ``,
      `🎯 *Meta da Semana:* ${recoveryGoal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      `✅ *Realizado até agora:* ${realized.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${progressPct}%)`,
      `🎫 *Meta de Ticket Médio:* ${targetTicket.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (~${targetTicketsCount} atendimentos)`,
      `🏠 *Meta "Leve para Casa" (Potes 1,5L/2L & Combos):* ${takeHomePotesTarget} un (${takeHomeRevenueTarget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`,
      ``,
      `⛅ *Clima & Foco Tático:* ${tacticalFocus}`,
    ];
    if (employeeNote) {
      whatsappSummaryLines.push(``, `📢 *Orientação da Gerência p/ Equipe:* ${employeeNote}`);
    }
    if (storedConfig.teamGeneralNotice?.trim()) {
      whatsappSummaryLines.push(``, `📌 *Comunicado Geral:* ${storedConfig.teamGeneralNotice.trim()}`);
    }
    const whatsappSummaryText = whatsappSummaryLines.join("\n");

    return {
      weekIndex: range.index,
      weekLabel: range.label,
      dateRange: `${String(range.start).padStart(2, "0")}/${String(month).padStart(2, "0")} a ${String(range.end).padStart(2, "0")}/${String(month).padStart(2, "0")}`,
      isCurrentWeek,
      originalGoal,
      computedRecoveryGoal,
      recoveryGoal,
      hasCustomGoal,
      realized,
      expectedUntilToday,
      progressPct,
      pacePct,
      rainyOrCloudyDays,
      hotDays,
      targetTicket,
      targetTicketsCount,
      takeHomeShareTargetPct,
      takeHomeRevenueTarget,
      takeHomePotesTarget,
      hasCustomPotes,
      tacticalFocus,
      managerAnalysis,
      employeeNote,
      whatsappSummaryText,
      days: wDays,
    };
  });

  return {
    month: params.month,
    targetMonthlyRevenue: Math.round(targetMonthlyRevenue),
    realizedMonthlySoFar: Math.round(realizedSoFar),
    remainingMonthlyTarget: Math.round(remainingTargetRevenue),
    monthlyProgressPct:
      targetMonthlyRevenue > 0 ? Math.round((realizedSoFar / targetMonthlyRevenue) * 100) : 0,
    targetTicket,
    monthlyAnalysis: storedConfig.monthlyAnalysis ?? "",
    teamGeneralNotice: storedConfig.teamGeneralNotice ?? "",
    targetMonthlyRevenueOverride: storedConfig.targetMonthlyRevenueOverride ?? null,
    weeks,
  };
}
