import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Edit2, TrendingUp } from "lucide-react";
import { format, getDaysInMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1];

type ForecastForm = {
  amount: string;
  actualAmount: string;
  description: string;
};

export default function FinRevenueForecast() {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(currentYear);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const utils = trpc.useUtils();
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${getDaysInMonth(new Date(year, month))}`;

  const { data: forecasts = [] } = trpc.fin.revenueForecast.list.useQuery({ monthStart, monthEnd });

  const upsertMut = trpc.fin.revenueForecast.upsert.useMutation({
    onSuccess: () => {
      utils.fin.revenueForecast.list.invalidate();
      toast.success("Previsão salva!");
      setModalOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.fin.revenueForecast.delete.useMutation({
    onSuccess: () => { utils.fin.revenueForecast.list.invalidate(); toast.success("Removido!"); },
  });

  const forecastMap = new Map(forecasts.map(f => [f.forecastDate, f]));

  const daysInMonth = getDaysInMonth(new Date(year, month));
  const firstDayOfWeek = startOfMonth(new Date(year, month)).getDay();

  const totalForecast = forecasts.reduce((s, f) => s + Number(f.amount), 0);
  const totalActual = forecasts.filter(f => f.actualAmount).reduce((s, f) => s + Number(f.actualAmount ?? 0), 0);
  const performance = totalForecast > 0 ? (totalActual / totalForecast) * 100 : 0;

  const [formData, setFormData] = useState<ForecastForm>({ amount: "", actualAmount: "", description: "" });

  const openModal = (dateStr: string) => {
    const existing = forecastMap.get(dateStr);
    setSelectedDate(dateStr);
    setFormData({
      amount: existing ? String(existing.amount) : "",
      actualAmount: existing?.actualAmount ? String(existing.actualAmount) : "",
      description: existing?.description ?? "",
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!selectedDate || !formData.amount) return;
    upsertMut.mutate({
      forecastDate: selectedDate,
      amount: Number(formData.amount),
      actualAmount: formData.actualAmount ? Number(formData.actualAmount) : null,
      description: formData.description || undefined,
    });
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Previsão de Faturamento</h1>
          <p className="text-sm text-muted-foreground">Planeje e acompanhe suas metas de receita</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Previsto", value: totalForecast, color: "text-blue-500" },
          { label: "Realizado", value: totalActual, color: "text-emerald-500" },
          { label: "Performance", value: performance, color: performance >= 100 ? "text-emerald-500" : performance >= 70 ? "text-amber-500" : "text-destructive", isPercent: true },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn("text-xl font-bold", s.color)}>
              {s.isPercent ? `${s.value.toFixed(1)}%` : fmtBRL(s.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Calendar Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="text-lg font-semibold">{MONTHS[month]} {year}</h2>
        <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/20">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center py-2 text-xs font-medium text-muted-foreground">{d}</div>
          ))}
        </div>
        {/* Days */}
        <div className="grid grid-cols-7">
          {/* Empty cells for first week */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="border-r border-b border-border/20 min-h-[80px] bg-muted/5" />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const forecast = forecastMap.get(dateStr);
            const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
            const isPast = new Date(year, month, day) < new Date();

            return (
              <div
                key={day}
                onClick={() => openModal(dateStr)}
                className={cn(
                  "border-r border-b border-border/20 min-h-[80px] p-2 cursor-pointer transition-colors",
                  "hover:bg-primary/5",
                  isToday && "bg-primary/10 border-primary/30",
                  isPast && !forecast && "bg-muted/5",
                  forecast && "bg-emerald-500/5",
                )}
              >
                <div className={cn(
                  "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground",
                  !isToday && "text-foreground",
                )}>
                  {day}
                </div>
                {forecast && (
                  <div className="space-y-0.5">
                    <div className="text-xs text-blue-500 font-medium truncate">
                      {fmtBRL(Number(forecast.amount))}
                    </div>
                    {forecast.actualAmount && (
                      <div className="text-xs text-emerald-500 truncate">
                        {fmtBRL(Number(forecast.actualAmount))}
                      </div>
                    )}
                    {forecast.description && (
                      <div className="text-xs text-muted-foreground truncate">{forecast.description}</div>
                    )}
                  </div>
                )}
                {!forecast && (
                  <div className="text-xs text-muted-foreground/40 mt-1">+</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/30" /> Previsto</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" /> Realizado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/20 border border-primary/30" /> Hoje</span>
      </div>

      {/* Forecast list */}
      {forecasts.length > 0 && (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <div className="p-4 border-b border-border/50 bg-muted/20">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Previsões do Mês
            </h3>
          </div>
          <div className="divide-y divide-border/30">
            {forecasts.map(f => (
              <div key={f.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20">
                <div>
                  <p className="text-sm font-medium">{new Date(f.forecastDate + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                  {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Previsto</p>
                    <p className="text-sm font-medium text-blue-500">{fmtBRL(Number(f.amount))}</p>
                  </div>
                  {f.actualAmount && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Realizado</p>
                      <p className="text-sm font-medium text-emerald-500">{fmtBRL(Number(f.actualAmount))}</p>
                    </div>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate({ id: f.id })}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Previsão — {selectedDate ? new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor Previsto (R$) *</Label>
              <Input
                type="number" step="0.01" placeholder="0,00"
                value={formData.amount}
                onChange={e => setFormData(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor Realizado (R$)</Label>
              <Input
                type="number" step="0.01" placeholder="0,00"
                value={formData.actualAmount}
                onChange={e => setFormData(f => ({ ...f, actualAmount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                placeholder="Ex: Venda de sorvetes"
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleSave} className="flex-1" disabled={!formData.amount || upsertMut.isPending}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
