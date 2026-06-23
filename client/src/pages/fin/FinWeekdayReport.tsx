import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown, ChevronRight, Calendar, TrendingDown, CheckCircle, AlertCircle, FileSpreadsheet } from "lucide-react";
import { Link } from "wouter";
import { exportToExcelMultiSheet, fmtMoeda } from "@/lib/exportExcel";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DAY_COLORS = {
  pending: "#f59e0b",
  paid: "#10b981",
  overdue: "#ef4444",
};

const WEEK_LABELS = ["1ª Semana", "2ª Semana", "3ª Semana", "4ª Semana", "5ª Semana"];

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

type ViewMode = "weekday" | "byweek";

export default function FinWeekdayReport() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("byweek");
  const [selectedWeek, setSelectedWeek] = useState(0); // índice da semana selecionada

  // Dados agrupados por dia da semana (visão geral)
  const { data: summaries = [], isLoading: loadingWeekday } = trpc.fin.weekdayReport.payablesByWeekday.useQuery(
    { year, month },
  );

  // Dados agrupados por semana do mês
  const { data: weekData = [], isLoading: loadingWeek } = trpc.fin.weekdayReport.payablesByWeek.useQuery(
    { year, month },
  );

  const isLoading = loadingWeekday || loadingWeek;

  // Dados para o gráfico da visão por dia da semana
  const chartDataWeekday = summaries.map((s) => ({
    name: s.dayName.split("-")[0].trim(),
    Pendente: parseFloat(s.pending.toFixed(2)),
    Pago: parseFloat(s.paid.toFixed(2)),
    Vencido: parseFloat(s.overdue.toFixed(2)),
  }));

  // Dados para o gráfico da semana selecionada
  const currentWeek = weekData[selectedWeek];
  const chartDataWeek = currentWeek?.days?.map((d: any) => ({
    name: d.dayName.split("-")[0].trim(),
    Pendente: parseFloat(d.pending.toFixed(2)),
    Pago: parseFloat(d.paid.toFixed(2)),
    Vencido: parseFloat(d.overdue.toFixed(2)),
  })) ?? [];

  const totalPending = summaries.reduce((a, s) => a + s.pending, 0);
  const totalPaid = summaries.reduce((a, s) => a + s.paid, 0);
  const totalOverdue = summaries.reduce((a, s) => a + s.overdue, 0);
  const totalGeral = summaries.reduce((a, s) => a + s.total, 0);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedWeek(0);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedWeek(0);
  }

  function toggleExpand(key: string) {
    setExpandedDay(expandedDay === key ? null : key);
  }

  function handleExportExcel() {
    const monthLabel = `${MONTH_NAMES[month - 1]}_${year}`;
    // Aba 1: Resumo por semana
    const resumoSemanas = weekData.flatMap((week: any, idx: number) =>
      (week.days ?? []).map((day: any) => ({
        Semana: WEEK_LABELS[idx],
        "Período": week.dateRange,
        "Dia": day.dayName,
        "Data": day.dateLabel,
        "Lançamentos": day.count,
        "Pendente": fmtMoeda(day.pending),
        "Pago": fmtMoeda(day.paid),
        "Vencido": fmtMoeda(day.overdue),
        "Total": fmtMoeda(day.total),
      }))
    );
    // Aba 2: Todos os lançamentos detalhados
    const lancamentos = weekData.flatMap((week: any, idx: number) =>
      (week.days ?? []).flatMap((day: any) =>
        (day.items ?? []).map((item: any) => ({
          Semana: WEEK_LABELS[idx],
          "Dia": day.dayName,
          "Descrição": item.description,
          "Categoria": item.categoryName ?? "",
          "Banco": item.bankName ?? "",
          "Vencimento": item.dueDate ? new Date(item.dueDate).toLocaleDateString("pt-BR") : "",
          "Status": item.isPaid ? "Pago" : item.isOverdue ? "Vencido" : "Pendente",
          "Valor": fmtMoeda(item.amount),
        }))
      )
    );
    exportToExcelMultiSheet(
      [
        { name: "Resumo por Semana", data: resumoSemanas },
        { name: "Lançamentos Detalhados", data: lancamentos },
      ],
      `Contas_a_Pagar_Semanal_${monthLabel}`
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/fin/payables">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                ← Voltar
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Contas a Pagar por Dia da Semana
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Acompanhamento dos valores a pagar agrupados por dia da semana (Segunda a Sexta)
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Botão Excel */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={weekData.length === 0}
            className="gap-2 text-green-700 border-green-300 hover:bg-green-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          {/* Navegação de mês */}
          <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2">
            <Button variant="ghost" size="sm" onClick={prevMonth}>‹</Button>
            <span className="font-semibold text-lg min-w-[160px] text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <Button variant="ghost" size="sm" onClick={nextMonth}>›</Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pendente</p>
            <p className="text-xl font-bold text-amber-600">{fmt(totalPending)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pago</p>
            <p className="text-xl font-bold text-green-600">{fmt(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Vencido</p>
            <p className="text-xl font-bold text-red-600">{fmt(totalOverdue)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Geral</p>
            <p className="text-xl font-bold text-blue-600">{fmt(totalGeral)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Abas de visualização */}
      <div className="flex gap-2 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === "byweek"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setViewMode("byweek")}
        >
          Por Semana do Mês
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === "weekday"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setViewMode("weekday")}
        >
          Visão Geral (Seg–Sex)
        </button>
      </div>

      {/* ─── VISÃO POR SEMANA DO MÊS ─── */}
      {viewMode === "byweek" && (
        <>
          {/* Seletor de semana */}
          <div className="flex gap-2 flex-wrap">
            {weekData.map((week: any, idx: number) => (
              <button
                key={idx}
                onClick={() => setSelectedWeek(idx)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                  selectedWeek === idx
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                }`}
              >
                <div className="font-semibold">{WEEK_LABELS[idx]}</div>
                <div className="text-xs opacity-80">{week.dateRange}</div>
              </button>
            ))}
          </div>

          {/* Gráfico da semana selecionada */}
          {currentWeek && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  {WEEK_LABELS[selectedWeek]} — {currentWeek.dateRange}
                  <span className="ml-auto text-sm font-normal text-muted-foreground">
                    Total: <strong className="text-foreground">{fmt(currentWeek.total)}</strong>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">Carregando...</div>
                ) : chartDataWeek.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartDataWeek} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => fmt(value)} labelStyle={{ fontWeight: "bold" }} />
                      <Legend />
                      <Bar dataKey="Pendente" fill={DAY_COLORS.pending} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Pago" fill={DAY_COLORS.paid} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Vencido" fill={DAY_COLORS.overdue} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-40 flex items-center justify-center text-muted-foreground">
                    Nenhum lançamento nesta semana
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tabela por dia da semana selecionada */}
          {currentWeek && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Detalhamento — {WEEK_LABELS[selectedWeek]}
                  <span className="text-sm font-normal text-muted-foreground ml-2">({currentWeek.dateRange})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Carregando...</div>
                ) : (
                  <div className="divide-y">
                    {currentWeek.days?.map((day: any) => {
                      const key = `week-${selectedWeek}-day-${day.dayIndex}`;
                      return (
                        <div key={key}>
                          <button
                            className="w-full text-left px-6 py-4 hover:bg-muted/50 transition-colors"
                            onClick={() => toggleExpand(key)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {expandedDay === key
                                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                }
                                <div>
                                  <span className="font-semibold text-base">{day.dayName}</span>
                                  <span className="ml-2 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                    {day.dateLabel}
                                  </span>
                                  <span className="ml-2 text-sm text-muted-foreground">
                                    {day.count} lançamento{day.count !== 1 ? "s" : ""}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                {day.overdue > 0 && (
                                  <span className="flex items-center gap-1 text-red-600 font-medium">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    {fmt(day.overdue)} vencido
                                  </span>
                                )}
                                {day.pending > 0 && (
                                  <span className="text-amber-600 font-medium">{fmt(day.pending)} pendente</span>
                                )}
                                {day.paid > 0 && (
                                  <span className="flex items-center gap-1 text-green-600 font-medium">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    {fmt(day.paid)} pago
                                  </span>
                                )}
                                <span className="font-bold text-base min-w-[100px] text-right">{fmt(day.total)}</span>
                              </div>
                            </div>
                          </button>

                          {expandedDay === key && day.items?.length > 0 && (
                            <div className="bg-muted/20 border-t">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                                    <th className="px-8 py-2 text-left">Descrição</th>
                                    <th className="px-4 py-2 text-left">Categoria</th>
                                    <th className="px-4 py-2 text-left">Banco</th>
                                    <th className="px-4 py-2 text-center">Vencimento</th>
                                    <th className="px-4 py-2 text-center">Status</th>
                                    <th className="px-6 py-2 text-right">Valor</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                  {day.items.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-muted/30">
                                      <td className="px-8 py-2.5 font-medium">{item.description}</td>
                                      <td className="px-4 py-2.5 text-muted-foreground">
                                        {item.categoryName ?? <span className="italic text-xs">—</span>}
                                      </td>
                                      <td className="px-4 py-2.5 text-muted-foreground">
                                        {item.bankName ?? <span className="italic text-xs">—</span>}
                                      </td>
                                      <td className="px-4 py-2.5 text-center text-muted-foreground">
                                        {fmtDate(item.dueDate)}
                                      </td>
                                      <td className="px-4 py-2.5 text-center">
                                        {item.isPaid ? (
                                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Pago</Badge>
                                        ) : item.isOverdue ? (
                                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Vencido</Badge>
                                        ) : (
                                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Pendente</Badge>
                                        )}
                                      </td>
                                      <td className="px-6 py-2.5 text-right font-semibold">{fmt(item.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t font-bold bg-muted/30">
                                    <td colSpan={5} className="px-8 py-2 text-right text-muted-foreground">
                                      Subtotal {day.dayName}:
                                    </td>
                                    <td className="px-6 py-2 text-right">{fmt(day.total)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Total da semana */}
                    {currentWeek.days?.length > 0 && (
                      <div className="px-6 py-4 bg-muted/30 flex items-center justify-between font-bold">
                        <span className="text-base">Total {WEEK_LABELS[selectedWeek]}</span>
                        <div className="flex items-center gap-6 text-sm">
                          {currentWeek.pending > 0 && <span className="text-amber-600">{fmt(currentWeek.pending)} pendente</span>}
                          {currentWeek.paid > 0 && <span className="text-green-600">{fmt(currentWeek.paid)} pago</span>}
                          {currentWeek.overdue > 0 && <span className="text-red-600">{fmt(currentWeek.overdue)} vencido</span>}
                          <span className="text-base font-bold text-foreground">{fmt(currentWeek.total)}</span>
                        </div>
                      </div>
                    )}

                    {(!currentWeek.days || currentWeek.days.length === 0) && !isLoading && (
                      <div className="p-12 text-center text-muted-foreground">
                        <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>Nenhum lançamento nesta semana</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {weekData.length === 0 && !isLoading && (
            <div className="p-12 text-center text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum lançamento encontrado para {MONTH_NAMES[month - 1]} {year}</p>
            </div>
          )}
        </>
      )}

      {/* ─── VISÃO GERAL POR DIA DA SEMANA ─── */}
      {viewMode === "weekday" && (
        <>
          {/* Gráfico de Barras */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Distribuição por Dia da Semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">Carregando...</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartDataWeekday} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => fmt(value)} labelStyle={{ fontWeight: "bold" }} />
                    <Legend />
                    <Bar dataKey="Pendente" fill={DAY_COLORS.pending} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Pago" fill={DAY_COLORS.paid} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Vencido" fill={DAY_COLORS.overdue} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Tabela por Dia */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhamento por Dia da Semana</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Carregando...</div>
              ) : (
                <div className="divide-y">
                  {summaries.map((day) => {
                    const key = `weekday-${day.dayIndex}`;
                    return (
                      <div key={key}>
                        <button
                          className="w-full text-left px-6 py-4 hover:bg-muted/50 transition-colors"
                          onClick={() => toggleExpand(key)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {expandedDay === key
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              }
                              <div>
                                <span className="font-semibold text-base">{day.dayName}</span>
                                <span className="ml-2 text-sm text-muted-foreground">
                                  {day.count} lançamento{day.count !== 1 ? "s" : ""}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              {day.overdue > 0 && (
                                <span className="flex items-center gap-1 text-red-600 font-medium">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  {fmt(day.overdue)} vencido
                                </span>
                              )}
                              {day.pending > 0 && (
                                <span className="text-amber-600 font-medium">{fmt(day.pending)} pendente</span>
                              )}
                              {day.paid > 0 && (
                                <span className="flex items-center gap-1 text-green-600 font-medium">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  {fmt(day.paid)} pago
                                </span>
                              )}
                              <span className="font-bold text-base min-w-[100px] text-right">{fmt(day.total)}</span>
                            </div>
                          </div>
                        </button>

                        {expandedDay === key && day.items.length > 0 && (
                          <div className="bg-muted/20 border-t">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                                  <th className="px-8 py-2 text-left">Descrição</th>
                                  <th className="px-4 py-2 text-left">Categoria</th>
                                  <th className="px-4 py-2 text-left">Banco</th>
                                  <th className="px-4 py-2 text-center">Vencimento</th>
                                  <th className="px-4 py-2 text-center">Status</th>
                                  <th className="px-6 py-2 text-right">Valor</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/50">
                                {day.items.map((item) => (
                                  <tr key={item.id} className="hover:bg-muted/30">
                                    <td className="px-8 py-2.5 font-medium">{item.description}</td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                      {item.categoryName ?? <span className="italic text-xs">—</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                      {item.bankName ?? <span className="italic text-xs">—</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-center text-muted-foreground">
                                      {fmtDate(item.dueDate)}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      {item.isPaid ? (
                                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Pago</Badge>
                                      ) : item.isOverdue ? (
                                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Vencido</Badge>
                                      ) : (
                                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Pendente</Badge>
                                      )}
                                    </td>
                                    <td className="px-6 py-2.5 text-right font-semibold">{fmt(item.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t font-bold bg-muted/30">
                                  <td colSpan={5} className="px-8 py-2 text-right text-muted-foreground">
                                    Subtotal {day.dayName}:
                                  </td>
                                  <td className="px-6 py-2 text-right">{fmt(day.total)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {summaries.length > 0 && (
                    <div className="px-6 py-4 bg-muted/30 flex items-center justify-between font-bold">
                      <span className="text-base">Total Geral (Seg–Sex)</span>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-amber-600">{fmt(totalPending)} pendente</span>
                        <span className="text-green-600">{fmt(totalPaid)} pago</span>
                        {totalOverdue > 0 && <span className="text-red-600">{fmt(totalOverdue)} vencido</span>}
                        <span className="text-base font-bold text-foreground">{fmt(totalGeral)}</span>
                      </div>
                    </div>
                  )}

                  {summaries.length === 0 && !isLoading && (
                    <div className="p-12 text-center text-muted-foreground">
                      <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p>Nenhum lançamento encontrado para {MONTH_NAMES[month - 1]} {year}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
