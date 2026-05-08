import { useState, useMemo } from "react";
import BackButton from "@/components/BackButton";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ArrowUpCircle,
  ArrowDownCircle, Activity, Download, ShoppingCart,
  Receipt, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtBRLShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return fmtBRL(v);
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1 min-w-[200px]">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium">{fmtBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

function VariationBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const isPos = pct >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full",
      isPos ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
    )}>
      {isPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export default function FinCashflow() {
  const [monthsBack, setMonthsBack] = useState(3);
  const [monthsAhead, setMonthsAhead] = useState(6);

  const { data: months = [], isLoading } = trpc.fin.cashflow.monthly.useQuery({
    monthsBack,
    monthsAhead,
  });

  const { data: comp, isLoading: compLoading } = trpc.inove.getCashflowComparativo.useQuery();

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const summary = useMemo(() => {
    const totalPayable = months.reduce((s, m) => s + m.totalPayable, 0);
    const totalReceivable = months.reduce((s, m) => s + m.totalReceivable, 0);
    const totalPaid = months.reduce((s, m) => s + m.totalPaid, 0);
    const totalReceived = months.reduce((s, m) => s + m.totalReceived, 0);
    const projectedNet = totalReceivable - totalPayable;
    const realizedNet = totalReceived - totalPaid;
    return { totalPayable, totalReceivable, totalPaid, totalReceived, projectedNet, realizedNet };
  }, [months]);

  const chartData = months.map(m => ({
    ...m,
    isCurrent: m.month === currentMonthKey,
    isFuture: m.month > currentMonthKey,
  }));

  function exportCSV() {
    const header = "Mês;A Pagar;Pago;A Receber;Recebido;Saldo Projetado;Saldo Realizado";
    const rows = months.map(m =>
      [m.label, m.totalPayable, m.totalPaid, m.totalReceivable, m.totalReceived, m.projectedBalance, m.realizedBalance]
        .join(";")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fluxo-de-caixa-${currentMonthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-80 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton to="/finance" />
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Fluxo de Caixa
            </h1>
            <p className="text-sm text-muted-foreground">Projeção de entradas e saídas por mês</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-1.5">
            <span>Meses atrás:</span>
            {[1, 3, 6, 12].map(n => (
              <button
                key={n}
                onClick={() => setMonthsBack(n)}
                className={cn(
                  "px-2 py-0.5 rounded font-medium transition-colors",
                  monthsBack === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >{n}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-1.5">
            <span>Meses à frente:</span>
            {[3, 6, 12].map(n => (
              <button
                key={n}
                onClick={() => setMonthsAhead(n)}
                className={cn(
                  "px-2 py-0.5 rounded font-medium transition-colors",
                  monthsAhead === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >{n}</button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* ── PAINEL COMPARATIVO INOVE ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Vendas PDV — Comparativo Mensal</span>
            {comp && (
              <Badge variant="outline" className={cn(
                "text-[10px] h-4 px-1.5",
                comp.fonte === "inove"
                  ? "border-emerald-500/50 text-emerald-400"
                  : "border-yellow-500/50 text-yellow-400"
              )}>
                {comp.fonte === "inove" ? "● INOVE" : "⚠ Local"}
              </Badge>
            )}
          </div>
          {comp && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{comp.previous.label}</span>
              <span className="text-border">→</span>
              <span className="font-medium text-foreground">{comp.current.label}</span>
            </div>
          )}
        </div>

        {compLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : comp ? (
          <div className="p-5 space-y-4">
            {/* KPIs comparativos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Faturamento */}
              <div className="bg-card/60 rounded-xl p-4 space-y-2 border border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Faturamento
                  </span>
                  <VariationBadge pct={comp.variationPct} />
                </div>
                <p className="text-xl font-bold text-emerald-400">{fmtBRL(comp.current.totalRevenue)}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Mês anterior</span>
                  <span>{fmtBRL(comp.previous.totalRevenue)}</span>
                </div>
                {/* Mini barra de progresso */}
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{
                      width: comp.previous.totalRevenue > 0
                        ? `${Math.min(100, (comp.current.totalRevenue / comp.previous.totalRevenue) * 100)}%`
                        : "0%"
                    }}
                  />
                </div>
              </div>

              {/* Qtd de Vendas */}
              <div className="bg-card/60 rounded-xl p-4 space-y-2 border border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" /> Qtd Vendas
                  </span>
                  <VariationBadge pct={
                    comp.previous.totalCount > 0
                      ? ((comp.current.totalCount - comp.previous.totalCount) / comp.previous.totalCount) * 100
                      : null
                  } />
                </div>
                <p className="text-xl font-bold text-blue-400">{comp.current.totalCount.toLocaleString("pt-BR")}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Mês anterior</span>
                  <span>{comp.previous.totalCount.toLocaleString("pt-BR")}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width: comp.previous.totalCount > 0
                        ? `${Math.min(100, (comp.current.totalCount / comp.previous.totalCount) * 100)}%`
                        : "0%"
                    }}
                  />
                </div>
              </div>

              {/* Ticket Médio */}
              <div className="bg-card/60 rounded-xl p-4 space-y-2 border border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Receipt className="h-3 w-3" /> Ticket Médio
                  </span>
                  <VariationBadge pct={
                    comp.previous.ticketMedio > 0
                      ? ((comp.current.ticketMedio - comp.previous.ticketMedio) / comp.previous.ticketMedio) * 100
                      : null
                  } />
                </div>
                <p className="text-xl font-bold text-purple-400">{fmtBRL(comp.current.ticketMedio)}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Mês anterior</span>
                  <span>{fmtBRL(comp.previous.ticketMedio)}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{
                      width: comp.previous.ticketMedio > 0
                        ? `${Math.min(100, (comp.current.ticketMedio / comp.previous.ticketMedio) * 100)}%`
                        : "0%"
                    }}
                  />
                </div>
              </div>

              {/* Descontos */}
              <div className="bg-card/60 rounded-xl p-4 space-y-2 border border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowDownCircle className="h-3 w-3" /> Descontos
                  </span>
                  <VariationBadge pct={
                    comp.previous.totalDiscount > 0
                      ? ((comp.current.totalDiscount - comp.previous.totalDiscount) / comp.previous.totalDiscount) * 100
                      : null
                  } />
                </div>
                <p className="text-xl font-bold text-orange-400">{fmtBRL(comp.current.totalDiscount)}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Mês anterior</span>
                  <span>{fmtBRL(comp.previous.totalDiscount)}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all"
                    style={{
                      width: comp.previous.totalDiscount > 0
                        ? `${Math.min(100, (comp.current.totalDiscount / comp.previous.totalDiscount) * 100)}%`
                        : "0%"
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Gráfico de vendas diárias do mês atual */}
            {comp.dailyCurrent.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Vendas Diárias — {comp.current.label}
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={comp.dailyCurrent} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false}
                      tickFormatter={(v: string) => v.substring(8)}
                    />
                    <YAxis
                      tickFormatter={fmtBRLShort}
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false} width={60}
                    />
                    <Tooltip
                      formatter={(v: number) => [fmtBRL(v), "Vendas"]}
                      labelFormatter={(l: string) => {
                        const d = new Date(l + "T12:00:00");
                        return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
                      }}
                      contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    />
                    <Area
                      type="monotone" dataKey="total" name="Vendas"
                      stroke="#10b981" strokeWidth={2}
                      fill="url(#salesGrad)"
                      dot={false} activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Sem dados disponíveis. Verifique a conexão com o INOVE em Administração.
          </div>
        )}
      </div>

      {/* KPI Cards — Fluxo Geral */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total a Pagar</span>
              <ArrowDownCircle className="h-4 w-4 text-red-400" />
            </div>
            <p className="text-lg font-bold text-red-400">{fmtBRL(summary.totalPayable)}</p>
            <p className="text-xs text-muted-foreground mt-1">Pago: {fmtBRL(summary.totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total a Receber</span>
              <ArrowUpCircle className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-lg font-bold text-emerald-400">{fmtBRL(summary.totalReceivable)}</p>
            <p className="text-xs text-muted-foreground mt-1">Recebido: {fmtBRL(summary.totalReceived)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Saldo Projetado</span>
              {summary.projectedNet >= 0
                ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                : <TrendingDown className="h-4 w-4 text-red-400" />}
            </div>
            <p className={cn("text-lg font-bold", summary.projectedNet >= 0 ? "text-emerald-400" : "text-red-400")}>
              {fmtBRL(summary.projectedNet)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Receber − Pagar</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Saldo Realizado</span>
              <DollarSign className="h-4 w-4 text-blue-400" />
            </div>
            <p className={cn("text-lg font-bold", summary.realizedNet >= 0 ? "text-blue-400" : "text-red-400")}>
              {fmtBRL(summary.realizedNet)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Recebido − Pago</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Barras — Entradas vs Saídas */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Entradas vs Saídas por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={fmtBRLShort}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="totalReceivable" name="A Receber" fill="#34d399" radius={[3, 3, 0, 0]} opacity={0.85} />
              <Bar dataKey="totalPayable" name="A Pagar" fill="#f87171" radius={[3, 3, 0, 0]} opacity={0.85} />
              <Bar dataKey="totalReceived" name="Recebido" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="totalPaid" name="Pago" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico de Linha — Saldo Projetado vs Realizado */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Evolução do Saldo (Projetado vs Realizado)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={fmtBRLShort}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <Line
                type="monotone" dataKey="projectedBalance" name="Saldo Projetado"
                stroke="#818cf8" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
              />
              <Line
                type="monotone" dataKey="realizedBalance" name="Saldo Realizado"
                stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
                strokeDasharray="5 3"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela Detalhada */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Detalhamento Mensal</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mês</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">A Pagar</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Pago</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Pendente Pagar</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">A Receber</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Recebido</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Pendente Receber</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo Projetado</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo Realizado</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m, idx) => {
                  const isCurrent = m.month === currentMonthKey;
                  const isFuture = m.month > currentMonthKey;
                  return (
                    <tr
                      key={m.month}
                      className={cn(
                        "border-b border-border/30 transition-colors hover:bg-muted/20",
                        isCurrent && "bg-primary/5 font-medium",
                        idx % 2 === 0 && !isCurrent && "bg-muted/10",
                      )}
                    >
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        <span>{m.label}</span>
                        {isCurrent && <Badge variant="outline" className="text-[10px] h-4 px-1 border-primary/50 text-primary">Atual</Badge>}
                        {isFuture && <Badge variant="outline" className="text-[10px] h-4 px-1 border-muted-foreground/30 text-muted-foreground">Projeção</Badge>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-red-400">{fmtBRL(m.totalPayable)}</td>
                      <td className="px-3 py-2.5 text-right text-red-300">{fmtBRL(m.totalPaid)}</td>
                      <td className="px-3 py-2.5 text-right text-orange-400">{fmtBRL(m.pendingPayable)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-400">{fmtBRL(m.totalReceivable)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-300">{fmtBRL(m.totalReceived)}</td>
                      <td className="px-3 py-2.5 text-right text-teal-400">{fmtBRL(m.pendingReceivable)}</td>
                      <td className={cn("px-4 py-2.5 text-right font-medium", m.projectedBalance >= 0 ? "text-blue-400" : "text-red-400")}>
                        {fmtBRL(m.projectedBalance)}
                      </td>
                      <td className={cn("px-4 py-2.5 text-right font-medium", m.realizedBalance >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmtBRL(m.realizedBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                  <td className="px-4 py-3 text-xs">Total</td>
                  <td className="px-3 py-3 text-right text-xs text-red-400">{fmtBRL(summary.totalPayable)}</td>
                  <td className="px-3 py-3 text-right text-xs text-red-300">{fmtBRL(summary.totalPaid)}</td>
                  <td className="px-3 py-3 text-right text-xs text-orange-400">
                    {fmtBRL(months.reduce((s, m) => s + m.pendingPayable, 0))}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-emerald-400">{fmtBRL(summary.totalReceivable)}</td>
                  <td className="px-3 py-3 text-right text-xs text-emerald-300">{fmtBRL(summary.totalReceived)}</td>
                  <td className="px-3 py-3 text-right text-xs text-teal-400">
                    {fmtBRL(months.reduce((s, m) => s + m.pendingReceivable, 0))}
                  </td>
                  <td className={cn("px-4 py-3 text-right text-xs font-bold", summary.projectedNet >= 0 ? "text-blue-400" : "text-red-400")}>
                    {fmtBRL(summary.projectedNet)}
                  </td>
                  <td className={cn("px-4 py-3 text-right text-xs font-bold", summary.realizedNet >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {fmtBRL(summary.realizedNet)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
