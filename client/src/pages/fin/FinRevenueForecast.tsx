import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import BackButton from "@/components/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sun, Cloud, CloudRain, CloudLightning, HelpCircle,
  TrendingUp, CalendarDays, DollarSign, Umbrella, Settings2,
  ChevronLeft, ChevronRight,
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

function dayTypeColor(type: string, isPast: boolean, isToday: boolean) {
  if (isToday) return "ring-2 ring-primary bg-primary/10";
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

export default function FinRevenueForecast() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [showSettings, setShowSettings] = useState(false);

  const [avgWeekday, setAvgWeekday] = useState(2000);
  const [avgSaturday, setAvgSaturday] = useState(5300);
  const [avgSundayHoliday, setAvgSundayHoliday] = useState(8300);
  const [rainFactor, setRainFactor] = useState(0.7);

  const { data, isLoading } = trpc.fin.forecastCalendar.getCalendar.useQuery({
    year,
    month,
    avgWeekday,
    avgSaturday,
    avgSundayHoliday,
    rainFactor,
  });

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

  const weatherSummary = useMemo(() => {
    if (!data) return null;
    const w = data.days.filter(d => d.weather !== null);
    return {
      sunny: w.filter(d => d.weather?.label === "sun").length,
      cloudy: w.filter(d => d.weather?.label === "cloud").length,
      rainy: w.filter(d => d.weather?.label === "rain" || d.weather?.label === "storm").length,
    };
  }, [data]);

  // Calcular semanas para a tabela de resumo
  const weeks = useMemo(() => {
    if (!data) return [];
    const result: { label: string; start: string; end: string; total: number; days: number }[] = [];
    let num = 1;
    let remaining = [...data.days];
    // Primeira semana pode ser incompleta
    const firstChunkSize = 7 - firstDayOffset;
    const firstChunk = remaining.splice(0, firstChunkSize);
    if (firstChunk.length > 0) {
      result.push({
        label: `Semana ${num++}`,
        start: firstChunk[0].date,
        end: firstChunk[firstChunk.length - 1].date,
        total: firstChunk.reduce((s, d) => s + d.projectedAmount, 0),
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
        days: chunk.length,
      });
    }
    return result;
  }, [data, firstDayOffset]);

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
          <Button
            variant="outline" size="sm"
            onClick={() => setShowSettings(s => !s)}
            className={cn("gap-2 h-8 text-xs", showSettings && "bg-primary/10 border-primary/40")}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configurar Médias
          </Button>
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
              {[
                { label: "Dia de Semana (Seg–Sex)", value: avgWeekday, set: setAvgWeekday, max: 15000 },
                { label: "Sábado", value: avgSaturday, set: setAvgSaturday, max: 20000 },
                { label: "Domingo / Feriado", value: avgSundayHoliday, set: setAvgSundayHoliday, max: 20000 },
              ].map(({ label, value, set, max }) => (
                <div key={label} className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <p className="text-sm font-bold text-primary">{fmtBRL(value)}</p>
                  <Slider
                    min={500} max={max} step={100}
                    value={[value]}
                    onValueChange={([v]) => set(v)}
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Umbrella className="h-3 w-3" />
                  Fator Chuva
                </Label>
                <p className="text-sm font-bold text-blue-400">
                  {Math.round(rainFactor * 100)}% da média
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    (−{Math.round((1 - rainFactor) * 100)}%)
                  </span>
                </p>
                <Slider
                  min={0.3} max={1} step={0.05}
                  value={[rainFactor]}
                  onValueChange={([v]) => setRainFactor(v)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Projeção do Mês</span>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <p className="text-lg font-bold text-primary">
                {isLoading ? "..." : fmtBRLShort(data?.summary.totalProjected ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sem ajuste clima: {isLoading ? "..." : fmtBRLShort(data?.summary.totalBase ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Dias de Semana</span>
                <DollarSign className="h-4 w-4 text-blue-400" />
              </div>
              <p className="text-lg font-bold text-blue-400">{data?.summary.weekdayCount ?? "..."}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Média {fmtBRL(avgWeekday)}/dia</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Sábados</span>
                <DollarSign className="h-4 w-4 text-violet-400" />
              </div>
              <p className="text-lg font-bold text-violet-400">{data?.summary.saturdayCount ?? "..."}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Média {fmtBRL(avgSaturday)}/dia</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Dom / Feriados</span>
                <DollarSign className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-lg font-bold text-amber-400">{data?.summary.sundayHolidayCount ?? "..."}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Média {fmtBRL(avgSundayHoliday)}/dia</p>
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
                    <span className="flex items-center gap-1">
                      <Sun size={12} className="text-yellow-400" /> {weatherSummary.sunny} sol
                    </span>
                    <span className="flex items-center gap-1">
                      <Cloud size={12} className="text-slate-400" /> {weatherSummary.cloudy} nublado
                    </span>
                    <span className="flex items-center gap-1">
                      <CloudRain size={12} className="text-blue-400" /> {weatherSummary.rainy} chuva
                    </span>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {/* Cabeçalho dias da semana */}
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

            {/* Grid dias */}
            {isLoading ? (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="h-[84px] bg-muted/30 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: firstDayOffset }).map((_, i) => (
                  <div key={`e${i}`} />
                ))}
                {data?.days.map(d => {
                  const info = dayTypeInfo(d.dayType);
                  const colorClass = dayTypeColor(d.dayType, d.isPast, d.isToday);
                  const weatherReduced = d.weather &&
                    (d.weather.label === "rain" || d.weather.label === "storm");

                  return (
                    <Tooltip key={d.date}>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          "rounded-lg p-1.5 flex flex-col gap-0.5 cursor-default",
                          "transition-all hover:scale-[1.03] hover:shadow-md min-h-[84px]",
                          colorClass
                        )}>
                          {/* Linha superior: número + ícone clima */}
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              "text-xs font-bold leading-none",
                              d.isToday ? "text-primary" : "text-foreground"
                            )}>
                              {d.day}
                            </span>
                            {d.weather && (
                              <WeatherIcon label={d.weather.label as WeatherLabel} size={11} />
                            )}
                          </div>

                          {/* Tipo do dia */}
                          <span className={cn("text-[9px] leading-none font-medium", info.color)}>
                            {d.isHoliday ? "🎉 Feriado" : info.label}
                          </span>

                          {/* Valor projetado */}
                          <div className="mt-auto">
                            <span className={cn(
                              "text-[10px] font-bold leading-none block",
                              weatherReduced ? "text-blue-400" : "text-foreground"
                            )}>
                              {fmtBRLShort(d.projectedAmount)}
                            </span>
                            {weatherReduced && (
                              <span className="text-[8px] text-blue-400 leading-none">↓ chuva</span>
                            )}
                          </div>

                          {/* Temperatura */}
                          {d.weather && (
                            <span className="text-[9px] text-muted-foreground leading-none">
                              {d.weather.tempMax.toFixed(0)}°C
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[210px]">
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">
                            {new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", {
                              weekday: "long", day: "numeric", month: "long"
                            })}
                          </p>
                          {d.isHoliday && (
                            <p className="text-amber-400">🎉 {d.holidayName}</p>
                          )}
                          <p>Tipo: <span className="font-medium">{info.label}</span></p>
                          <p>Média base: <span className="font-medium">{fmtBRL(d.baseAvg)}</span></p>
                          <p>Projeção: <span className="font-bold text-primary">{fmtBRL(d.projectedAmount)}</span></p>
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
                              <p>Prob. chuva: {d.weather.precipProb}%</p>
                              {weatherReduced && (
                                <p className="text-blue-400">
                                  Fator chuva: {Math.round(rainFactor * 100)}% da média
                                </p>
                              )}
                            </>
                          )}
                          {!d.weather && (
                            <p className="text-muted-foreground italic text-[10px]">
                              Previsão indisponível para esta data
                            </p>
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

        {/* Legenda */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-card border border-border/40" /> Dia de semana
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-violet-500/20 border border-violet-400/40" /> Sábado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-500/15 border border-rose-400/30" /> Domingo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40" /> Feriado
          </span>
          <span className="flex items-center gap-1.5">
            <Sun size={12} className="text-yellow-400" /> Sol (100%)
          </span>
          <span className="flex items-center gap-1.5">
            <Cloud size={12} className="text-slate-400" /> Nublado (−10%)
          </span>
          <span className="flex items-center gap-1.5">
            <CloudRain size={12} className="text-blue-400" /> Chuva (−{Math.round((1 - rainFactor) * 100)}%)
          </span>
          <span className="flex items-center gap-1.5">
            <CloudLightning size={12} className="text-purple-400" /> Tempestade (−{Math.round((1 - rainFactor * 0.8) * 100)}%)
          </span>
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
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Dias</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Projeção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w, i) => (
                      <tr key={i} className={cn("border-b border-border/30", i % 2 === 0 && "bg-muted/10")}>
                        <td className="px-4 py-2 font-medium">{w.label}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(w.start + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                          {" – "}
                          {new Date(w.end + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{w.days} dias</td>
                        <td className="px-4 py-2 text-right font-bold text-primary">{fmtBRL(w.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20 font-bold">
                      <td className="px-4 py-2.5 text-xs" colSpan={2}>Total do Mês</td>
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                        {data.daysInMonth} dias
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-primary">
                        {fmtBRL(data.summary.totalProjected)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
