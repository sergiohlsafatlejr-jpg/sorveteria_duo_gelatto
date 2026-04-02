import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, ArrowLeft, BarChart2,
  Package, DollarSign, ShoppingCart, RefreshCw
} from "lucide-react";
import { Link } from "wouter";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtQty(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function getPrevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(mo) - 1]}/${y}`;
}

const COLORS = [
  "#7c3aed", "#ec4899", "#f97316", "#06b6d4", "#10b981",
  "#f59e0b", "#3b82f6", "#84cc16", "#ef4444", "#8b5cf6",
];

export default function SalesReport() {
  const { data: confirmedMonths, isLoading: loadingMonths } = trpc.salesImport.getConfirmedMonths.useQuery();

  const currentMonth = confirmedMonths?.[0] ?? "";
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const activeMonth = selectedMonth || currentMonth;
  const compareMonth = activeMonth ? getPrevMonth(activeMonth) : "";

  const { data: report, isLoading: loadingReport } = trpc.salesImport.getSalesReport.useQuery(
    { referenceMonth: activeMonth, compareMonth },
    { enabled: !!activeMonth }
  );

  // Mapa do mês anterior para lookup rápido
  const prevMap = useMemo(() => {
    const m: Record<string, { totalRevenue: number; totalQuantity: number }> = {};
    for (const p of report?.previous ?? []) {
      m[p.externalCode] = { totalRevenue: p.totalRevenue, totalQuantity: p.totalQuantity };
    }
    return m;
  }, [report]);

  // Top 10 do mês atual
  const top10 = report?.current?.slice(0, 10) ?? [];

  // Dados para o gráfico de barras
  const chartData = top10.map((item, idx) => {
    const prev = prevMap[item.externalCode];
    return {
      name: (item.productName ?? item.externalName).substring(0, 20),
      fullName: item.productName ?? item.externalName,
      atual: item.totalRevenue,
      anterior: prev?.totalRevenue ?? 0,
      color: COLORS[idx % COLORS.length],
    };
  });

  // KPIs totais
  const totalRevenue = top10.reduce((s, i) => s + i.totalRevenue, 0);
  const totalQty = top10.reduce((s, i) => s + i.totalQuantity, 0);
  const totalPrevRevenue = top10.reduce((s, i) => s + (prevMap[i.externalCode]?.totalRevenue ?? 0), 0);
  const revenueChange = totalPrevRevenue > 0 ? ((totalRevenue - totalPrevRevenue) / totalPrevRevenue) * 100 : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/sales/import">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Importação
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <BarChart2 className="h-6 w-6 text-purple-600" />
            Relatório de Vendas por Produto
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Top 10 produtos mais vendidos com comparativo ao mês anterior.
          </p>
        </div>

        {/* Seletor de mês */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Mês:</span>
          <Select value={activeMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Selecionar mês..." />
            </SelectTrigger>
            <SelectContent>
              {loadingMonths ? (
                <SelectItem value="__loading__" disabled>Carregando...</SelectItem>
              ) : confirmedMonths?.length === 0 ? (
                <SelectItem value="__empty__" disabled>Nenhuma importação confirmada</SelectItem>
              ) : (
                confirmedMonths?.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!activeMonth ? (
        <Card className="p-12 text-center">
          <BarChart2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">
            Nenhuma importação de vendas confirmada ainda.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Confirme uma importação em{" "}
            <Link href="/sales/import" className="text-purple-600 underline">
              Importação de Vendas
            </Link>{" "}
            para ver o relatório.
          </p>
        </Card>
      ) : loadingReport ? (
        <div className="p-12 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 mx-auto animate-spin mb-2" />
          Carregando relatório...
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Mês Analisado</p>
              <p className="text-xl font-bold text-purple-600">{monthLabel(activeMonth)}</p>
              <p className="text-xs text-muted-foreground">Top 10 produtos</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Faturamento Top 10
              </p>
              <p className="text-xl font-bold">{fmtBRL(totalRevenue)}</p>
              {revenueChange !== null && (
                <p className={`text-xs flex items-center gap-1 ${revenueChange >= 0 ? "text-green-600" : "text-rose-600"}`}>
                  {revenueChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {revenueChange >= 0 ? "+" : ""}{revenueChange.toFixed(1)}% vs {monthLabel(compareMonth)}
                </p>
              )}
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" />
                Qtd. Vendida (Top 10)
              </p>
              <p className="text-xl font-bold">{fmtQty(totalQty)}</p>
              <p className="text-xs text-muted-foreground">unidades</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3" />
                Mês Comparativo
              </p>
              <p className="text-xl font-bold text-muted-foreground">{compareMonth ? monthLabel(compareMonth) : "—"}</p>
              <p className="text-xs text-muted-foreground">
                {totalPrevRevenue > 0 ? fmtBRL(totalPrevRevenue) : "Sem dados"}
              </p>
            </Card>
          </div>

          {/* Gráfico de barras comparativo */}
          {top10.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Faturamento por Produto — {monthLabel(activeMonth)} vs {compareMonth ? monthLabel(compareMonth) : "Mês Anterior"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        fmtBRL(value),
                        name === "atual" ? monthLabel(activeMonth) : monthLabel(compareMonth),
                      ]}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload;
                        return item?.fullName ?? label;
                      }}
                    />
                    <Legend
                      formatter={(value) =>
                        value === "atual" ? monthLabel(activeMonth) : monthLabel(compareMonth)
                      }
                    />
                    <Bar dataKey="atual" fill="#7c3aed" radius={[4, 4, 0, 0]} name="atual" />
                    <Bar dataKey="anterior" fill="#c4b5fd" radius={[4, 4, 0, 0]} name="anterior" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Tabela detalhada */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4 text-purple-500" />
                Top 10 Produtos — Detalhamento
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {top10.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhum dado de vendas para {monthLabel(activeMonth)}.</p>
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
                      {top10.map((item, idx) => {
                        const prev = prevMap[item.externalCode];
                        const diff = prev
                          ? ((item.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100
                          : null;
                        return (
                          <tr key={item.externalCode} className="border-t hover:bg-muted/20">
                            <td className="p-3 text-muted-foreground font-mono text-xs">
                              <span
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
                                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                              >
                                {idx + 1}
                              </span>
                            </td>
                            <td className="p-3">
                              <p className="font-medium">{item.productName ?? item.externalName}</p>
                              {item.productName && item.externalName !== item.productName && (
                                <p className="text-xs text-muted-foreground">{item.externalName}</p>
                              )}
                            </td>
                            <td className="p-3 font-mono text-xs text-muted-foreground">
                              {item.externalCode}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {fmtQty(item.totalQuantity)}
                            </td>
                            <td className="p-3 text-right tabular-nums font-semibold">
                              {fmtBRL(item.totalRevenue)}
                            </td>
                            <td className="p-3 text-right tabular-nums text-muted-foreground">
                              {prev ? fmtBRL(prev.totalRevenue) : "—"}
                            </td>
                            <td className="p-3 text-center">
                              {diff === null ? (
                                <Badge variant="outline" className="text-xs">Novo</Badge>
                              ) : diff > 0 ? (
                                <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                  +{diff.toFixed(1)}%
                                </Badge>
                              ) : diff < 0 ? (
                                <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-xs">
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                  {diff.toFixed(1)}%
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  <Minus className="h-3 w-3 mr-1" />
                                  0%
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Produtos além do top 10 */}
          {(report?.current?.length ?? 0) > 10 && (
            <p className="text-xs text-muted-foreground text-center">
              + {(report?.current?.length ?? 0) - 10} outros produtos vendidos no período (não exibidos no top 10)
            </p>
          )}
        </>
      )}
    </div>
  );
}
