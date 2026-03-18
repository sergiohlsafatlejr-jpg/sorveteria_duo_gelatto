import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { BarChart3, DollarSign, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const COLORS = [
  "oklch(0.52 0.22 280)",
  "oklch(0.65 0.18 340)",
  "oklch(0.70 0.15 200)",
  "oklch(0.75 0.18 140)",
  "oklch(0.80 0.15 60)",
];

const paymentLabels: Record<string, string> = {
  cash: "Dinheiro",
  credit_card: "Crédito",
  debit_card: "Débito",
  pix: "PIX",
  other: "Outro",
};

export default function Finance() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(firstDay.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);

  const { data: summary, isLoading } = trpc.finance.summary.useQuery({ from, to });
  const { data: chartData } = trpc.finance.chartData.useQuery({ days: 30 });
  const { data: topProducts } = trpc.finance.topProducts.useQuery({ limit: 8 });

  const salesChart = (chartData ?? []).map((d) => ({
    date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    total: parseFloat(d.total),
    count: d.count,
  }));

  const paymentPieData = Object.entries(summary?.byPayment ?? {}).map(([key, value]) => ({
    name: paymentLabels[key] ?? key,
    value,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Financeiro
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Relatórios e análise de desempenho</p>
        </div>

        {/* Date Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Data Inicial</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label className="text-xs">Data Final</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
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
                  onClick={() => {
                    const d = new Date();
                    setFrom(new Date(d.getFullYear(), 0, 1).toISOString().split("T")[0]);
                    setTo(d.toISOString().split("T")[0]);
                  }}
                >
                  Este Ano
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-5 bg-gradient-to-br from-violet-600 to-purple-700 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm opacity-90">Faturamento Total</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(summary?.totalRevenue ?? 0)}</p>
                  <p className="text-xs opacity-75 mt-1">{summary?.count ?? 0} vendas</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-5 bg-gradient-to-br from-pink-500 to-rose-600 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm opacity-90">Total de Descontos</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(summary?.totalDiscount ?? 0)}</p>
                  <p className="text-xs opacity-75 mt-1">concedidos no período</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <TrendingDown className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-5 bg-gradient-to-br from-cyan-500 to-teal-600 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm opacity-90">Ticket Médio</p>
                  <p className="text-2xl font-bold mt-1">
                    {formatCurrency((summary?.count ?? 0) > 0 ? (summary?.totalRevenue ?? 0) / (summary?.count ?? 1) : 0)}
                  </p>
                  <p className="text-xs opacity-75 mt-1">por venda</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Vendas Diárias — Últimos 30 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={salesChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 270)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Total"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="total" fill="oklch(0.52 0.22 280)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Por Forma de Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentPieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={paymentPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                        {paymentPieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {paymentPieData.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span>{item.name}</span>
                        </div>
                        <span className="font-medium">{formatCurrency(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  Sem dados no período
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Products */}
        {(topProducts?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Produtos Mais Vendidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topProducts!.map((p, i) => (
                  <div key={p.productName} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium truncate">{p.productName}</span>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <Badge variant="secondary" className="text-xs">{p.totalQty} un</Badge>
                          <span className="text-xs font-semibold text-primary">
                            {formatCurrency(parseFloat(String(p.totalRevenue)))}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(100, (p.totalQty / (topProducts![0]?.totalQty ?? 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
