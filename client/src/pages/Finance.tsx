import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  BarChart3, DollarSign, TrendingDown, TrendingUp,
  Wifi, Database, RefreshCw, Package, CreditCard
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const COLORS = [
  "#7c3aed", "#ec4899", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6",
];

export default function Finance() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(firstDay.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);

  // Dados do INOVE (fonte primária)
  const { data: inoveData, isLoading, refetch, isFetching } = trpc.inove.getFinancialSummaryInove.useQuery(
    { from, to },
    { staleTime: 5 * 60 * 1000 }
  );

  const fonte = inoveData?.fonte ?? "local";

  // Gráfico de vendas diárias
  const salesChart = useMemo(() => {
    if (!inoveData?.dailySales?.length) return [];
    return inoveData.dailySales.map(d => ({
      date: new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      total: d.total,
      count: d.count,
    }));
  }, [inoveData]);

  // Gráfico de formas de pagamento
  const paymentPieData = useMemo(() => {
    if (!inoveData?.byPayment) return [];
    return Object.entries(inoveData.byPayment)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: key, value }))
      .sort((a, b) => b.value - a.value);
  }, [inoveData]);

  // Top produtos
  const topProducts = inoveData?.topProducts ?? [];

  const totalRevenue = inoveData?.totalRevenue ?? 0;
  const totalDiscount = inoveData?.totalDiscount ?? 0;
  const count = inoveData?.count ?? 0;
  const ticketMedio = inoveData?.ticketMedio ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-1">
        <BackButton to="/dashboard" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-primary" />
              Financeiro
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Relatórios e análise de desempenho</p>
          </div>
          <div className="flex items-center gap-2">
            {inoveData && (
              fonte === "inove" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-700">
                  <Wifi className="w-3 h-3" /> Dados em tempo real · PDV INOVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-700">
                  <Database className="w-3 h-3" /> Dados locais · Conector INOVE inativo
                </span>
              )
            )}
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span className="text-xs">Atualizar</span>
            </Button>
          </div>
        </div>

        {/* Filtro de datas */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Data Inicial</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40 h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Data Final</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40 h-8 text-sm mt-1" />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    const d = new Date();
                    setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]);
                    setTo(d.toISOString().split("T")[0]);
                  }}
                >
                  Este Mês
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    const d = new Date();
                    setFrom(new Date(d.getFullYear(), 0, 1).toISOString().split("T")[0]);
                    setTo(d.toISOString().split("T")[0]);
                  }}
                >
                  Este Ano
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    const d = new Date();
                    const last = new Date(d.getFullYear(), d.getMonth() - 1, 1);
                    const lastEnd = new Date(d.getFullYear(), d.getMonth(), 0);
                    setFrom(last.toISOString().split("T")[0]);
                    setTo(lastEnd.toISOString().split("T")[0]);
                  }}
                >
                  Mês Anterior
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Faturamento Total */}
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-5 bg-gradient-to-br from-violet-600 to-purple-700 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm opacity-90">Faturamento Total</p>
                    <p className="text-3xl font-bold mt-1 tabular-nums">{fmtBRL(totalRevenue)}</p>
                    <p className="text-xs opacity-75 mt-1">{count.toLocaleString("pt-BR")} vendas no período</p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total de Descontos */}
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-5 bg-gradient-to-br from-pink-500 to-rose-600 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm opacity-90">Total de Descontos</p>
                    <p className="text-3xl font-bold mt-1 tabular-nums">{fmtBRL(totalDiscount)}</p>
                    <p className="text-xs opacity-75 mt-1">
                      {totalRevenue > 0 ? `${((totalDiscount / (totalRevenue + totalDiscount)) * 100).toFixed(1)}% do bruto` : "concedidos no período"}
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <TrendingDown className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ticket Médio */}
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-5 bg-gradient-to-br from-cyan-500 to-teal-600 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm opacity-90">Ticket Médio</p>
                    <p className="text-3xl font-bold mt-1 tabular-nums">{fmtBRL(ticketMedio)}</p>
                    <p className="text-xs opacity-75 mt-1">por venda</p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Vendas Diárias */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Vendas Diárias
                {fonte === "inove" && (
                  <Badge variant="secondary" className="text-xs font-normal bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    PDV INOVE
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : salesChart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-56 text-muted-foreground gap-2">
                  <BarChart3 className="w-10 h-10 opacity-20" />
                  <p className="text-sm">Sem dados no período selecionado</p>
                  {fonte === "local" && (
                    <p className="text-xs text-amber-600">Conector INOVE inativo — configure a senha do conector</p>
                  )}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={salesChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => [fmtBRL(v), "Faturamento"]}
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid rgba(128,128,128,0.2)" }}
                    />
                    <Bar dataKey="total" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Por Forma de Pagamento */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                Por Forma de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : paymentPieData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-56 text-muted-foreground gap-2">
                  <CreditCard className="w-10 h-10 opacity-20" />
                  <p className="text-sm">Sem dados no período</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={paymentPieData}
                        cx="50%" cy="50%"
                        innerRadius={48} outerRadius={78}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {paymentPieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [fmtBRL(v), "Total"]}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-1">
                    {paymentPieData.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="truncate text-muted-foreground">{item.name}</span>
                        </div>
                        <span className="font-semibold ml-2 shrink-0">{fmtBRL(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Produtos */}
        {topProducts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                Produtos Mais Vendidos
                {fonte === "inove" && (
                  <Badge variant="secondary" className="text-xs font-normal bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    PDV INOVE
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={p.name + i} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-5 shrink-0 tabular-nums">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate">{p.name}</span>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <Badge variant="secondary" className="text-xs">
                            {p.qty.toLocaleString("pt-BR")} un
                          </Badge>
                          <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                            {fmtBRL(p.revenue)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full"
                          style={{ width: `${Math.min(100, (p.revenue / (topProducts[0]?.revenue ?? 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Aviso quando sem dados e conector inativo */}
        {!isLoading && fonte === "local" && totalRevenue === 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
            <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Conector INOVE inativo</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Os dados financeiros vêm do PDV INOVE SQL Server. Para ativar, acesse{" "}
                <strong>Administração → Conector INOVE</strong> e configure a senha do usuário <code>sa</code>.
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
