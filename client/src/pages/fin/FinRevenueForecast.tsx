import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import BackButton from "@/components/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Sun, Cloud, CloudRain, CloudLightning, HelpCircle,
  TrendingUp, CalendarDays, DollarSign, Umbrella, Settings2,
  ChevronLeft, ChevronRight, CheckCircle2, BarChart3, CopyPlus, Square, CheckSquare, Target, Trash2, AlertTriangle, Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtBRLShort = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return fmtBRL(v);
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS_HEADER = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type WeatherLabel = "sun" | "cloud" | "rain" | "storm" | "unknown";

function WeatherIcon({ label, size = 14 }: { label: WeatherLabel; size?: number }) {
  if (label === "sun") return <Sun size={size} style={{ color: "#fbbf24" }} className="shrink-0" />;
  if (label === "cloud") return <Cloud size={size} style={{ color: "#94a3b8" }} className="shrink-0" />;
  if (label === "rain") return <CloudRain size={size} style={{ color: "#60a5fa" }} className="shrink-0" />;
  if (label === "storm") return <CloudLightning size={size} style={{ color: "#a78bfa" }} className="shrink-0" />;
  return <HelpCircle size={size} style={{ color: "#6b7280" }} className="shrink-0" />;
}

function dayTypeColor(type: string, isPast: boolean, isToday: boolean, hasReal: boolean) {
  if (isToday) return "ring-2 ring-primary bg-primary/10";
  if (hasReal && isPast) return "bg-emerald-500/10 border border-emerald-500/40";
  if (isPast) return "opacity-55 bg-muted/20 border border-border/20";
  if (type === "holiday") return "bg-amber-500/15 border border-amber-500/40";
  if (type === "sunday") return "bg-rose-500/10 border border-rose-400/30";
  if (type === "saturday") return "bg-violet-500/10 border border-violet-400/30";
  return "bg-card border border-border/40";
}

function dayTypeInfo(type: string) {
  if (type === "holiday") return { label: "Feriado", color: "text-amber-400" };
  if (type === "sunday") return { label: "Dom", color: "text-rose-400" };
  if (type === "saturday") return { label: "Sáb", color: "text-violet-400" };
  return { label: "Semana", color: "text-muted-foreground" };
}

// Gráfico de barras simples inline
function AccuracyBar({ projected, real, label }: { projected: number; real: number; label: string }) {
  const max = Math.max(projected, real, 1);
  const projPct = (projected / max) * 100;
  const realPct = (real / max) * 100;
  const accuracy = projected > 0 && real > 0 ? Math.round((real / projected) * 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        {accuracy !== null && (
          <span className={cn(
            "font-bold text-xs",
            accuracy >= 95 ? "text-emerald-400" : accuracy >= 75 ? "text-amber-400" : "text-rose-400"
          )}>
            {accuracy}%
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground w-10 text-right">Prev.</span>
          <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500/60 rounded-full transition-all" style={{ width: `${projPct}%` }} />
          </div>
          <span className="text-[9px] text-muted-foreground w-14 text-right">{fmtBRLShort(projected)}</span>
        </div>
        {real > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-10 text-right">Real</span>
            <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500/70 rounded-full transition-all" style={{ width: `${realPct}%` }} />
            </div>
            <span className="text-[9px] text-muted-foreground w-14 text-right">{fmtBRLShort(real)}</span>
          </div>
        )}
        {real === 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-10 text-right">Real</span>
            <div className="flex-1 h-2 bg-muted/20 rounded-full">
              <div className="h-full w-0" />
            </div>
            <span className="text-[9px] text-muted-foreground/50 w-14 text-right italic">sem dados</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FinRevenueForecast() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [showSettings, setShowSettings] = useState(false);
  const [showAccuracy, setShowAccuracy] = useState(false);

  const [avgWeekday, setAvgWeekday] = useState(2000);
  const [avgSaturday, setAvgSaturday] = useState(5300);
  const [avgSundayHoliday, setAvgSundayHoliday] = useState(8300);
  const [rainFactor, setRainFactor] = useState(0.7);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Seleção para duplicar
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  const toggleSelectDate = (date: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const toggleSelectAllDates = () => {
    if (!data) return;
    const allDates = data.days.map(d => d.date);
    if (selectedDates.size === allDates.length) setSelectedDates(new Set());
    else setSelectedDates(new Set(allDates));
  };

  // Modal de lançamento real
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<{ date: string; projected: number; goalAmount: number | null; label: string } | null>(null);
  const [realAmount, setRealAmount] = useState("");
  const [realNote, setRealNote] = useState("");

  const utils = trpc.useUtils();

  // Carregar configurações salvas do banco
  const { data: savedSettings } = trpc.fin.forecastCalendar.getSettings.useQuery();

  useEffect(() => {
    if (savedSettings && !settingsLoaded) {
      setAvgWeekday(savedSettings.avgWeekday);
      setAvgSaturday(savedSettings.avgSaturday);
      setAvgSundayHoliday(savedSettings.avgSundayHoliday);
      setRainFactor(parseFloat(savedSettings.rainFactor));
      setSettingsLoaded(true);
    }
  }, [savedSettings, settingsLoaded]);

  const saveSettingsMut = trpc.fin.forecastCalendar.saveSettings.useMutation({
    onSuccess: () => toast.success("Médias salvas com sucesso!"),
    onError: (e) => toast.error(e.message),
  });

  const { data, isLoading } = trpc.fin.forecastCalendar.getCalendar.useQuery({
    year, month, avgWeekday, avgSaturday, avgSundayHoliday, rainFactor,
  });

  const { data: realRevenues = [] } = trpc.fin.forecastCalendar.getRealRevenues.useQuery({
    year, month,
  });

  // Previsões de meta (populadas via Meta de Gerência)
  const { data: goalForecasts = [] } = trpc.fin.forecastCalendar.getGoalForecasts.useQuery({
    year, month,
  });

  const { data: accuracyHistory = [] } = trpc.fin.forecastCalendar.getAccuracyHistory.useQuery({
    avgWeekday, avgSaturday, avgSundayHoliday, rainFactor, months: 6,
  });

  const duplicateDaysMut = trpc.fin.forecastCalendar.duplicateDaysToNextMonth.useMutation({
    onSuccess: (r: { created: number }) => {
      utils.fin.forecastCalendar.getRealRevenues.invalidate();
      const nextMonthName = MONTHS[month === 12 ? 0 : month];
      toast.success(`${r.created} dia(s) duplicado(s) para ${nextMonthName}!`);
      setSelectedDates(new Set());
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const saveRealMut = trpc.fin.forecastCalendar.saveRealRevenue.useMutation({
    onSuccess: () => {
      utils.fin.forecastCalendar.getRealRevenues.invalidate();
      utils.fin.forecastCalendar.getAccuracyHistory.invalidate();
      toast.success("Faturamento real salvo!");
      setModalOpen(false);
      setRealAmount("");
      setRealNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRealMut = trpc.fin.forecastCalendar.deleteRealRevenue.useMutation({
    onSuccess: () => {
      utils.fin.forecastCalendar.getRealRevenues.invalidate();
      utils.fin.forecastCalendar.getAccuracyHistory.invalidate();
      toast.success("Valor real removido!");
      setModalOpen(false);
      setRealAmount("");
      setRealNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showInoveImport, setShowInoveImport] = useState(false);
  const [inoveImporting, setInoveImporting] = useState(false);
  const { data: vendasOntem } = trpc.inove.getVendasOntem.useQuery();
  const clearMonthMut = trpc.fin.forecastCalendar.clearMonthRealRevenues.useMutation({
    onSuccess: (r: { deleted: number }) => {
      utils.fin.forecastCalendar.getRealRevenues.invalidate();
      utils.fin.forecastCalendar.getAccuracyHistory.invalidate();
      toast.success(`${r.deleted} valor(es) real(is) removido(s)!`);
      setShowClearConfirm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // Mapa de faturamento real por data
  const realMap = useMemo(() => {
    const m = new Map<string, number>();
    realRevenues.forEach(r => m.set(r.revenueDate, Number(r.realAmount)));
    return m;
  }, [realRevenues]);

  // Mapa de meta por data (finRevenueForecasts.amount)
  const goalMap = useMemo(() => {
    const m = new Map<string, number>();
    goalForecasts.forEach((f: { forecastDate: string; amount: string | number }) => m.set(f.forecastDate, Number(f.amount)));
    return m;
  }, [goalForecasts]);

  const firstDayOffset = useMemo(
    () => new Date(year, month - 1, 1).getDay(),
    [year, month]
  );

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function openModal(d: { date: string; projectedAmount: number; day: number; dayType: string }) {
    const existing = realMap.get(d.date);
    const goalAmt = goalMap.get(d.date) ?? null;
    const dateLabel = new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", {
      weekday: "long", day: "numeric", month: "long",
    });
    setSelectedDay({ date: d.date, projected: d.projectedAmount, goalAmount: goalAmt, label: dateLabel });
    setRealAmount(existing !== undefined ? String(existing) : "");
    setRealNote("");
    setModalOpen(true);
  }

  const weatherSummary = useMemo(() => {
    if (!data) return null;
    const w = data.days.filter(d => d.weather !== null);
    return {
      sunny: w.filter(d => d.weather?.label === "sun").length,
      cloudy: w.filter(d => d.weather?.label === "cloud").length,
      rainy: w.filter(d => d.weather?.label === "rain" || d.weather?.label === "storm").length,
    };
  }, [data]);

  const weeks = useMemo(() => {
    if (!data) return [];
    const result: { label: string; start: string; end: string; total: number; totalReal: number; days: number }[] = [];
    let num = 1;
    let remaining = [...data.days];
    const firstChunkSize = 7 - firstDayOffset;
    const firstChunk = remaining.splice(0, firstChunkSize);
    if (firstChunk.length > 0) {
      result.push({
        label: `Semana ${num++}`,
        start: firstChunk[0].date,
        end: firstChunk[firstChunk.length - 1].date,
        total: firstChunk.reduce((s, d) => s + d.projectedAmount, 0),
        totalReal: firstChunk.reduce((s, d) => s + (realMap.get(d.date) ?? 0), 0),
        days: firstChunk.length,
      });
    }
    while (remaining.length > 0) {
      const chunk = remaining.splice(0, 7);
      result.push({
        label: `Semana ${num++}`,
        start: chunk[0].date,
        end: chunk[chunk.length - 1].date,
        total: chunk.reduce((s, d) => s + d.projectedAmount, 0),
        totalReal: chunk.reduce((s, d) => s + (realMap.get(d.date) ?? 0), 0),
        days: chunk.length,
      });
    }
    return result;
  }, [data, firstDayOffset, realMap]);

  // Totais do mês com real e meta
  const totalReal = useMemo(() => realRevenues.reduce((s, r) => s + Number(r.realAmount), 0), [realRevenues]);
  const totalGoal = useMemo(() => goalForecasts.reduce((s: number, f: { amount: string | number }) => s + Number(f.amount), 0), [goalForecasts]);
  const hasGoalMonth = totalGoal > 0;
  // Acurácia: real vs meta (se tiver meta), senão real vs projeção
  const accuracyBase = hasGoalMonth ? totalGoal : (data?.summary.totalProjected ?? 0);
  const accuracy = totalReal > 0 && accuracyBase > 0
    ? Math.round((totalReal / accuracyBase) * 100)
    : null;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <BackButton to="/finance" />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <CalendarDays className="h-6 w-6 text-primary" />
                Previsão de Faturamento
              </h1>
              <p className="text-sm text-muted-foreground">
                Calendário com feriados e previsão do tempo — Goiânia/GO
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setShowInoveImport(true)}
              className="gap-2 h-8 text-xs border-blue-500/50 text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
            >
              <Database className="h-3.5 w-3.5" />
              Importar INOVE
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setShowAccuracy(s => !s)}
              className={cn("gap-2 h-8 text-xs", showAccuracy && "bg-emerald-500/10 border-emerald-500/40")}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Acurácia
            </Button>
            {totalReal > 0 && (
              <Button
                variant="outline" size="sm"
                onClick={() => setShowClearConfirm(true)}
                className="gap-2 h-8 text-xs border-rose-500/50 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar Mês
              </Button>
            )}
          <Button
              variant="outline" size="sm"
              onClick={() => setShowSettings(s => !s)}
              className={cn("gap-2 h-8 text-xs", showSettings && "bg-primary/10 border-primary/40")}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Médias
            </Button>
          </div>
        </div>

        {/* Painel de configurações */}
        {showSettings && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-primary">
                Médias de Faturamento por Tipo de Dia
              </CardTitle>
            </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6 pb-5">
                {/* Botão salvar */}
                <div className="col-span-2 md:col-span-4 flex justify-end">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => saveSettingsMut.mutate({ avgWeekday, avgSaturday, avgSundayHoliday, rainFactor })}
                    disabled={saveSettingsMut.isPending}
                  >
                    {saveSettingsMut.isPending ? "Salvando..." : "Salvar Médias"}
                  </Button>
                </div>
              {[
                { label: "Dia de Semana (Seg–Sex)", value: avgWeekday, set: setAvgWeekday, max: 15000 },
                { label: "Sábado", value: avgSaturday, set: setAvgSaturday, max: 20000 },
                { label: "Domingo / Feriado", value: avgSundayHoliday, set: setAvgSundayHoliday, max: 20000 },
              ].map(({ label, value, set, max }) => (
                <div key={label} className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <p className="text-sm font-bold text-primary">{fmtBRL(value)}</p>
                  <Slider min={500} max={max} step={100} value={[value]} onValueChange={([v]) => set(v)} />
                </div>
              ))}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Umbrella className="h-3 w-3" /> Fator Chuva
                </Label>
                <p className="text-sm font-bold text-blue-400">
                  {Math.round(rainFactor * 100)}%
                  <span className="text-xs text-muted-foreground font-normal ml-1">(−{Math.round((1 - rainFactor) * 100)}%)</span>
                </p>
                <Slider min={0.3} max={1} step={0.05} value={[rainFactor]} onValueChange={([v]) => setRainFactor(v)} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Painel de acurácia histórica */}
        {showAccuracy && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Histórico de Acurácia — Últimos 6 Meses
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-5">
              {accuracyHistory.map(h => (
                <AccuracyBar
                  key={h.month}
                  label={h.label}
                  projected={h.totalProjected}
                  real={h.totalReal}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-border/50 md:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Projeção</span>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <p className="text-base font-bold text-primary">
                {isLoading ? "..." : fmtBRLShort(data?.summary.totalProjected ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50 md:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Real lançado</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-base font-bold text-emerald-400">{fmtBRLShort(totalReal)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{realRevenues.length} dias</p>
            </CardContent>
          </Card>
                <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Acurácia</span>
                <BarChart3 className="h-4 w-4 text-amber-400" />
              </div>
              <p className={cn(
                "text-base font-bold",
                accuracy === null ? "text-muted-foreground" :
                accuracy >= 95 ? "text-emerald-400" : accuracy >= 75 ? "text-amber-400" : "text-rose-400"
              )}>
                {accuracy !== null ? `${accuracy}%` : "—"}
              </p>
              {hasGoalMonth && <p className="text-[10px] text-muted-foreground mt-0.5">vs meta</p>}
            </CardContent>
          </Card>
          {hasGoalMonth && (
            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Meta do Mês</span>
                  <Target className="h-4 w-4 text-orange-400" />
                </div>
                <p className="text-base font-bold text-orange-400">{fmtBRLShort(totalGoal)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{goalForecasts.length} dias</p>
              </CardContent>
            </Card>
          )}
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Sábados</span>
                <DollarSign className="h-4 w-4 text-violet-400" />
              </div>
              <p className="text-base font-bold text-violet-400">{data?.summary.saturdayCount ?? "..."}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Dom/Feriados</span>
                <DollarSign className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-base font-bold text-amber-400">{data?.summary.sundayHolidayCount ?? "..."}</p>
            </CardContent>
          </Card>
        </div>

        {/* Calendário */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <h2 className="font-bold text-base">{MONTHS[month - 1]} {year}</h2>
                {weatherSummary && (
                  <div className="flex items-center justify-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Sun size={12} className="text-yellow-400" /> {weatherSummary.sunny}</span>
                    <span className="flex items-center gap-1"><Cloud size={12} className="text-slate-400" /> {weatherSummary.cloudy}</span>
                    <span className="flex items-center gap-1"><CloudRain size={12} className="text-blue-400" /> {weatherSummary.rainy}</span>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS_HEADER.map((d, i) => (
                <div key={d} className={cn(
                  "text-center text-xs font-semibold py-1",
                  i === 0 ? "text-rose-400" : i === 6 ? "text-violet-400" : "text-muted-foreground"
                )}>
                  {d}
                </div>
              ))}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="h-[90px] bg-muted/30 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: firstDayOffset }).map((_, i) => <div key={`e${i}`} />)}
                {data?.days.map(d => {
                  const info = dayTypeInfo(d.dayType);
                  const realVal = realMap.get(d.date);
                  const hasReal = realVal !== undefined;
                  const goalVal = goalMap.get(d.date);
                  const hasGoal = goalVal !== undefined;
                  const colorClass = dayTypeColor(d.dayType, d.isPast, d.isToday, hasReal);
                  const weatherReduced = d.weather && (d.weather.label === "rain" || d.weather.label === "storm");
                  // Acurácia: real vs meta (se tiver meta), senão real vs projeção
                  const compareBase = hasGoal ? goalVal! : d.projectedAmount;
                  const accuracyDay = hasReal && compareBase > 0
                    ? Math.round((realVal! / compareBase) * 100)
                    : null;

                  return (
                    <Tooltip key={d.date}>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => openModal(d)}
                          className={cn(
                            "rounded-lg p-1.5 flex flex-col gap-0.5 cursor-pointer",
                            "transition-all hover:scale-[1.04] hover:shadow-md min-h-[90px]",
                            colorClass
                          )}
                        >
                          {/* Número + clima */}
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              "text-xs font-bold leading-none",
                              d.isToday ? "text-primary" : "text-foreground"
                            )}>
                              {d.day}
                            </span>
                            <div className="flex items-center gap-0.5">
                              {hasReal && <CheckCircle2 size={9} className="text-emerald-400" />}
                              {d.weather && <WeatherIcon label={d.weather.label as WeatherLabel} size={10} />}
                            </div>
                          </div>

                          {/* Tipo */}
                          <span className={cn("text-[9px] leading-none font-medium", info.color)}>
                            {d.isHoliday ? "🎉" : info.label}
                          </span>

                          {/* Valores */}
                          <div className="mt-auto space-y-0.5">
                            {/* Meta (da Meta de Gerência) - exibida em laranja quando disponível */}
                            {hasGoal ? (
                              <span className="text-[10px] font-bold leading-none block text-orange-400">
                                {fmtBRLShort(goalVal!)}
                              </span>
                            ) : (
                              <span className={cn(
                                "text-[10px] font-bold leading-none block",
                                weatherReduced ? "text-blue-400" : "text-muted-foreground"
                              )}>
                                {fmtBRLShort(d.projectedAmount)}
                              </span>
                            )}
                            {/* Real lançado manualmente */}
                            {hasReal && (
                              <span className="text-[10px] font-bold leading-none block text-emerald-400">
                                {fmtBRLShort(realVal!)}
                              </span>
                            )}
                          </div>

                          {/* Acurácia do dia */}
                          {accuracyDay !== null && (
                            <span className={cn(
                              "text-[8px] leading-none font-bold",
                              accuracyDay >= 95 ? "text-emerald-400" : accuracyDay >= 75 ? "text-amber-400" : "text-rose-400"
                            )}>
                              {accuracyDay}%
                            </span>
                          )}

                          {/* Temperatura */}
                          {d.weather && (
                            <span className="text-[9px] text-muted-foreground leading-none">
                              {d.weather.tempMax.toFixed(0)}°C
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px]">
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">
                            {new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", {
                              weekday: "long", day: "numeric", month: "long"
                            })}
                          </p>
                          {d.isHoliday && <p className="text-amber-400">🎉 {d.holidayName}</p>}
                          <p>Projeção: <span className="font-bold text-primary">{fmtBRL(d.projectedAmount)}</span></p>
                          {hasGoal && (
                            <p>Meta: <span className="font-bold text-orange-400">{fmtBRL(goalVal!)}</span></p>
                          )}
                          {hasReal && (
                            <>
                              <p>Real: <span className="font-bold text-emerald-400">{fmtBRL(realVal!)}</span></p>
                              {accuracyDay !== null && (
                                <p>Acurácia vs {hasGoal ? "meta" : "projeção"}: <span className={cn(
                                  "font-bold",
                                  accuracyDay >= 95 ? "text-emerald-400" : accuracyDay >= 75 ? "text-amber-400" : "text-rose-400"
                                )}>{accuracyDay}%</span></p>
                              )}
                            </>
                          )}
                          {!hasReal && d.isPast && (
                            <p className="text-muted-foreground italic text-[10px]">Clique para lançar o real</p>
                          )}
                          {!d.isPast && !d.isToday && (
                            <p className="text-muted-foreground italic text-[10px]">Clique para lançar antecipado</p>
                          )}
                          {d.weather && (
                            <>
                              <hr className="border-border/50 my-1" />
                              <p className="flex items-center gap-1">
                                <WeatherIcon label={d.weather.label as WeatherLabel} size={11} />
                                {d.weather.label === "sun" ? "Ensolarado"
                                  : d.weather.label === "cloud" ? "Nublado"
                                  : d.weather.label === "rain" ? "Chuva"
                                  : d.weather.label === "storm" ? "Tempestade"
                                  : "Sem previsão"}
                              </p>
                              <p>Temp. máx: {d.weather.tempMax.toFixed(1)}°C</p>
                              <p>Precipitação: {d.weather.precip.toFixed(1)} mm</p>
                            </>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selecionador de dias para duplicar */}
        {data && data.days.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={toggleSelectAllDates} className="text-muted-foreground hover:text-foreground transition-colors">
                    {selectedDates.size === data.days.length && data.days.length > 0
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4" />}
                  </button>
                  <CardTitle className="text-sm font-semibold">
                    Duplicar dias para o próximo mês
                    {selectedDates.size > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{selectedDates.size} dia(s) selecionado(s)</span>
                    )}
                  </CardTitle>
                </div>
                {selectedDates.size > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs border-blue-500/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                    onClick={() => duplicateDaysMut.mutate({ dates: Array.from(selectedDates) })}
                    disabled={duplicateDaysMut.isPending}
                  >
                    <CopyPlus className="h-3.5 w-3.5" />
                    {duplicateDaysMut.isPending ? "Duplicando..." : `Duplicar ${selectedDates.size} dia(s) para ${MONTHS[month === 12 ? 0 : month]}`}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-xs text-muted-foreground mb-2">Selecione os dias cujo faturamento real você quer copiar para o mesmo dia do próximo mês. Apenas dias com valor real lançado serão duplicados.</p>
              <div className="grid grid-cols-7 gap-1">
                {data.days.map(d => {
                  const isSelected = selectedDates.has(d.date);
                  const realVal = realMap.get(d.date);
                  const hasReal = realVal !== undefined;
                  return (
                    <button
                      key={d.date}
                      onClick={() => toggleSelectDate(d.date)}
                      className={cn(
                        "rounded-md p-1.5 text-center text-xs transition-all border",
                        isSelected
                          ? "bg-blue-500/20 border-blue-500/60 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/40"
                          : hasReal
                          ? "bg-emerald-500/10 border-emerald-500/30 text-foreground hover:bg-emerald-500/20"
                          : "bg-muted/20 border-border/30 text-muted-foreground/50 hover:bg-muted/40"
                      )}
                    >
                      <div className="font-bold">{d.day}</div>
                      {hasReal && (
                        <div className="text-[9px] text-emerald-500 font-medium">{fmtBRLShort(realVal!)}</div>
                      )}
                      {!hasReal && (
                        <div className="text-[9px] text-muted-foreground/30">—</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Legenda */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-card border border-border/40" /> Dia de semana</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-500/20 border border-violet-400/40" /> Sábado</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500/15 border border-rose-400/30" /> Domingo</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40" /> Feriado</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/15 border border-emerald-500/40" /> Real lançado</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-400" /> Real registrado</span>
          {hasGoalMonth && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-500/20 border border-orange-500/40" /> Meta (Gerência)</span>}
          <span className="flex items-center gap-1.5"><CloudRain size={12} className="text-blue-400" /> Chuva (−{Math.round((1 - rainFactor) * 100)}%)</span>
        </div>

        {/* Tabela de resumo por semana */}
        {data && weeks.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Resumo por Semana</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Semana</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Período</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Projeção</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Real</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w, i) => {
                      const wAccuracy = w.total > 0 && w.totalReal > 0
                        ? Math.round((w.totalReal / w.total) * 100) : null;
                      return (
                        <tr key={i} className={cn("border-b border-border/30", i % 2 === 0 && "bg-muted/10")}>
                          <td className="px-4 py-2 font-medium">
                            {w.label}
                            {wAccuracy !== null && (
                              <span className={cn(
                                "ml-2 text-[10px] font-bold",
                                wAccuracy >= 95 ? "text-emerald-400" : wAccuracy >= 75 ? "text-amber-400" : "text-rose-400"
                              )}>
                                {wAccuracy}%
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {new Date(w.start + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                            {" – "}
                            {new Date(w.end + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-primary">{fmtBRL(w.total)}</td>
                          <td className="px-4 py-2 text-right font-bold text-emerald-400">
                            {w.totalReal > 0 ? fmtBRL(w.totalReal) : <span className="text-muted-foreground/40 font-normal italic">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20 font-bold">
                      <td className="px-4 py-2.5 text-xs" colSpan={2}>
                        Total do Mês
                        {accuracy !== null && (
                          <span className={cn(
                            "ml-2 text-[10px]",
                            accuracy >= 95 ? "text-emerald-400" : accuracy >= 75 ? "text-amber-400" : "text-rose-400"
                          )}>
                            {accuracy}% acurácia
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-primary">
                        {fmtBRL(data.summary.totalProjected)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-emerald-400">
                        {totalReal > 0 ? fmtBRL(totalReal) : <span className="text-muted-foreground/40 font-normal italic">—</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de lançamento real */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Lançar Faturamento Real
            </DialogTitle>
          </DialogHeader>
          {selectedDay && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground capitalize">{selectedDay.label}</p>
              <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-xs space-y-1">
                {selectedDay.goalAmount !== null ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Meta do dia (Gerência):</span>
                      <span className="font-bold text-orange-400">{fmtBRL(selectedDay.goalAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Projeção (médias):</span>
                      <span className="font-bold text-primary">{fmtBRL(selectedDay.projected)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Projeção do dia:</span>
                    <span className="font-bold text-primary">{fmtBRL(selectedDay.projected)}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Valor Real Faturado (R$) *</Label>
                <Input
                  type="number" step="0.01" min="0" placeholder="0,00"
                  value={realAmount}
                  onChange={e => setRealAmount(e.target.value)}
                  autoFocus
                />
                {realAmount && (() => {
                  const base = selectedDay.goalAmount ?? selectedDay.projected;
                  const pct = base > 0 ? Math.round((Number(realAmount) / base) * 100) : null;
                  return pct !== null ? (
                    <p className={cn(
                      "text-xs font-medium",
                      pct >= 95 ? "text-emerald-400" : pct >= 75 ? "text-amber-400" : "text-rose-400"
                    )}>
                      Acurácia vs {selectedDay.goalAmount !== null ? "meta" : "projeção"}: {pct}%
                      {Number(realAmount) >= base ? " ✓ Acima da meta!" : ""}
                    </p>
                  ) : null;
                })()}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Observação (opcional)</Label>
                <Input
                  placeholder="Ex: Chuva forte à tarde..."
                  value={realNote}
                  onChange={e => setRealNote(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => setModalOpen(false)} className="flex-1 h-8 text-xs">
                  Cancelar
                </Button>
                {realMap.has(selectedDay.date) && (
                  <Button
                    variant="outline"
                    onClick={() => deleteRealMut.mutate({ revenueDate: selectedDay.date })}
                    disabled={deleteRealMut.isPending}
                    className="h-8 text-xs border-rose-500/50 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    {deleteRealMut.isPending ? "..." : "Apagar"}
                  </Button>
                )}
                <Button
                  onClick={() => {
                    if (!selectedDay || !realAmount) return;
                    saveRealMut.mutate({
                      revenueDate: selectedDay.date,
                      realAmount: Number(realAmount),
                      note: realNote || undefined,
                    });
                  }}
                  disabled={!realAmount || saveRealMut.isPending}
                  className="flex-1 h-8 text-xs"
                >
                  {saveRealMut.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Diálogo de confirmação: Limpar Mês */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2 text-rose-500">
              <AlertTriangle className="h-4 w-4" />
              Limpar Faturamento Real do Mês
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja apagar <strong>todos os {realRevenues.length} valor(es) real(is)</strong> lançados em <strong>{MONTHS[month - 1]} {year}</strong>?
            </p>
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
              Esta ação não pode ser desfeita. Os valores de meta e projeção não serão afetados.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowClearConfirm(false)} className="flex-1 h-8 text-xs">
                Cancelar
              </Button>
              <Button
                onClick={() => clearMonthMut.mutate({ year, month })}
                disabled={clearMonthMut.isPending}
                className="flex-1 h-8 text-xs bg-rose-500 hover:bg-rose-600 text-white"
              >
                {clearMonthMut.isPending ? "Apagando..." : "Apagar Tudo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Modal Importar INOVE */}
      <Dialog open={showInoveImport} onOpenChange={setShowInoveImport}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-400" />
              Importar Faturamento de Ontem — INOVE
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!vendasOntem ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <span className="animate-pulse text-sm">Buscando dados do INOVE...</span>
              </div>
            ) : vendasOntem.qtd > 0 ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                    Vendas de ontem: {fmtBRL(Number(vendasOntem.total))} ({vendasOntem.qtd} transações)
                  </p>

                </div>
                <div className="space-y-1">
                  {(vendasOntem.formas ?? []).map((f: { forma: string; valor: number | string }, i: number) => (
                    <div key={i} className="flex justify-between text-sm px-1">
                      <span className="text-muted-foreground">{f.forma}</span>
                      <span className="font-medium">{fmtBRL(Number(f.valor))}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                  Isso irá salvar o total de <strong>{fmtBRL(Number(vendasOntem.total))}</strong> como faturamento real do dia anterior no calendário de previsão.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowInoveImport(false)} className="flex-1 h-9 text-sm">
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    disabled={inoveImporting}
                    onClick={async () => {
                      setInoveImporting(true);
                      try {
                        // Calcula a data de ontem no fuso de Brasília
                        const now = new Date();
                        const brtOffset = -3 * 60;
                        const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60000);
                        brtNow.setDate(brtNow.getDate() - 1);
                        const dateStr = brtNow.toISOString().slice(0, 10);
                        await saveRealMut.mutateAsync({
                          revenueDate: dateStr,
                          realAmount: Number(vendasOntem.total),
                          note: `Importado do INOVE PDV (${vendasOntem.qtd} vendas)`,
                        });
                        setShowInoveImport(false);
                        toast.success(`Faturamento de ${fmtBRL(Number(vendasOntem.total))} importado do INOVE!`);
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : "Erro ao importar");
                      } finally {
                        setInoveImporting(false);
                      }
                    }}
                  >
                    <Database className="h-4 w-4" />
                    Importar {fmtBRL(Number(vendasOntem.total))}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-4">Conector INOVE não configurado ou sem vendas ontem.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
