import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Package, DollarSign, ShoppingCart, Calendar, Minus, BarChart2 } from "lucide-react";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#84cc16"];

function fmt(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtQty(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTHS_PT[parseInt(mo) - 1]}/${y}`;
}

function getAvailableMonths() {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ value, label: monthLabel(value) });
  }
  return months;
}

export default function InoveProductSales() {
  const availableMonths = useMemo(() => getAvailableMonths(), []);
  const [selectedMonth, setSelectedMonth] = useState(availableMonths[0].value);

  const { data, isLoading, error } = trpc.inove.getSalesByProduct.useQuery(
    { month: selectedMonth },
    { retry: false }
  );

  const chartData = useMemo(() => {
    if (!data?.top10) return [];
    return data.top10.map((item) => ({
      nome: (item.nome ?? "").length > 14 ? (item.nome ?? "").substring(0, 14) + "…" : (item.nome ?? `Produto ${item.produtoId}`),
      nomeCompleto: item.nome ?? `Produto ${item.produtoId}`,
      atual: item.faturamento,
      anterior: item.faturamentoPrev ?? 0,
    }));
  }, [data]);

  const prevMonthLabel = data?.prevMonth ? monthLabel(data.prevMonth) : "Mês Anterior";
  const currMonthLabel = monthLabel(selectedMonth);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BarChart2 className="h-6 w-6 text-indigo-600" />
                Relatório de Vendas por Produto
              </h1>
              <p className="text-sm text-muted-foreground">
                Top 10 produtos mais vendidos com comparativo ao mês anterior.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mês:</span>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 text-red-700 text-sm">
              ⚠️ {error.message}. Verifique se o conector INOVE está ativo.
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Mês Analisado</p>
                  <p className="text-2xl font-bold mt-1 text-indigo-600">{currMonthLabel}</p>
                  <p className="text-xs text-muted-foreground mt-1">Top 10 produtos</p>
                </div>
                <div className="p-2 rounded-lg bg-indigo-500"><Calendar className="w-5 h-5 text-white" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">$ Faturamento Top 10</p>
                  <p className="text-2xl font-bold mt-1">
                    {isLoading ? "..." : fmt(data?.top10Faturamento)}
                  </p>
                  {data && data.totalFaturamentoPrev > 0 && (
                    <p className={`text-xs mt-1 flex items-center gap-1 ${
                      (data.top10Faturamento - data.totalFaturamentoPrev) >= 0
                        ? "text-green-600" : "text-red-500"
                    }`}>
                      {(data.top10Faturamento - data.totalFaturamentoPrev) >= 0
                        ? <TrendingUp className="h-3 w-3" />
                        : <TrendingDown className="h-3 w-3" />
                      }
                      {(((data.top10Faturamento - data.totalFaturamentoPrev) / data.totalFaturamentoPrev) * 100).toFixed(1)}% vs {prevMonthLabel}
                    </p>
                  )}
                </div>
                <div className="p-2 rounded-lg bg-green-500"><DollarSign className="w-5 h-5 text-white" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Qtd. Vendida (Top 10)</p>
                  <p className="text-2xl font-bold mt-1">
                    {isLoading ? "..." : fmtQty(data?.top10Qtd)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">unidades</p>
                </div>
                <div className="p-2 rounded-lg bg-orange-500"><ShoppingCart className="w-5 h-5 text-white" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Mês Comparativo</p>
                  <p className="text-2xl font-bold mt-1 text-slate-600">{prevMonthLabel}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isLoading ? "..." : fmt(data?.totalFaturamentoPrev)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-400"><Package className="w-5 h-5 text-white" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico comparativo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Faturamento por Produto — {currMonthLabel} vs {prevMonthLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-72 flex items-center justify-center text-muted-foreground">Carregando dados do INOVE...</div>
            ) : !data || data.top10.length === 0 ? (
              <div className="h-72 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Package className="h-10 w-10 opacity-30" />
                <p>Nenhum dado para {currMonthLabel}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="nome"
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [fmt(value), name === "atual" ? currMonthLabel : prevMonthLabel]}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.nomeCompleto ?? _label}
                  />
                  <Legend
                    formatter={(value) => value === "atual" ? currMonthLabel : prevMonthLabel}
                    wrapperStyle={{ paddingTop: 8 }}
                  />
                  <Bar dataKey="atual" fill="#6366f1" name="atual" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="anterior" fill="#c4b5fd" name="anterior" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Tabela detalhada */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-indigo-600" />
              Top 10 Produtos — Detalhamento
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : !data || data.top10.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhum dado de vendas para {currMonthLabel}.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium w-8">#</th>
                      <th className="text-left p-3 font-medium">Produto</th>
                      <th className="text-left p-3 font-medium">Cód. PDV</th>
                      <th className="text-right p-3 font-medium">Qtd. Vendida</th>
                      <th className="text-right p-3 font-medium">Faturamento</th>
                      <th className="text-right p-3 font-medium">Mês Anterior</th>
                      <th className="text-center p-3 font-medium">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top10.map((item, idx) => (
                      <tr key={item.produtoId} className="border-t hover:bg-muted/20">
                        <td className="p-3">
                          <span
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
                            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="p-3 font-medium">{item.nome ?? `Produto ${item.produtoId}`}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{item.codPdv ?? "—"}</td>
                        <td className="p-3 text-right tabular-nums">{fmtQty(item.qtd)}</td>
                        <td className="p-3 text-right tabular-nums font-semibold">{fmt(item.faturamento)}</td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {item.faturamentoPrev != null ? fmt(item.faturamentoPrev) : "—"}
                        </td>
                        <td className="p-3 text-center">
                          {item.variacao === null ? (
                            <Badge variant="outline" className="text-xs">Novo</Badge>
                          ) : item.variacao > 0 ? (
                            <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">
                              <TrendingUp className="h-3 w-3 mr-1" />+{item.variacao.toFixed(1)}%
                            </Badge>
                          ) : item.variacao < 0 ? (
                            <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-xs">
                              <TrendingDown className="h-3 w-3 mr-1" />{item.variacao.toFixed(1)}%
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <Minus className="h-3 w-3 mr-1" />0%
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
