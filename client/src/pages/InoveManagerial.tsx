import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, Package, ShoppingCart, DollarSign, Warehouse, CreditCard, BarChart2 } from "lucide-react";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#84cc16"];
const PAYMENT_COLORS: Record<string, string> = {
  "C. DEBITO": "#6366f1",
  "C. CREDITO": "#f59e0b",
  "PIX": "#10b981",
  "DINHEIRO": "#3b82f6",
  "CORTESIA": "#ec4899",
};

function fmt(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtQty(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
function fmtPct(v: number | null | undefined) {
  return `${Number(v || 0).toFixed(1)}%`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTHS_PT[parseInt(mo) - 1]}/${y}`;
}

function getAvailableMonths() {
  const months: { value: string; label: string }[] = [{ value: "", label: "Todos os meses" }];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ value, label: monthLabel(value) });
  }
  return months;
}

function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InoveManagerial() {
  const availableMonths = useMemo(() => getAvailableMonths(), []);
  const [selectedMonth, setSelectedMonth] = useState("");

  const { data, isLoading, error } = trpc.inove.getManagerialReport.useQuery(
    { month: selectedMonth || undefined },
    { retry: false }
  );

  const pagamentosChart = useMemo(() => {
    if (!data?.pagamentos) return [];
    return data.pagamentos.map((p, i) => ({
      name: p.forma,
      value: p.total,
      fill: PAYMENT_COLORS[p.forma] ?? CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [data]);

  const topReceitaChart = useMemo(() => {
    if (!data?.topReceita) return [];
    return data.topReceita.map(r => ({
      nome: (r.nome ?? "").length > 18 ? (r.nome ?? "").substring(0, 18) + "…" : (r.nome ?? "Produto s/nome"),
      nomeCompleto: r.nome ?? "Produto s/nome",
      receita: r.receita,
    }));
  }, [data]);

  const topQtdChart = useMemo(() => {
    if (!data?.topQtd) return [];
    return data.topQtd.map(r => ({
      nome: (r.nome ?? "").length > 18 ? (r.nome ?? "").substring(0, 18) + "…" : (r.nome ?? "Produto s/nome"),
      nomeCompleto: r.nome ?? "Produto s/nome",
      qtd: r.qtd,
    }));
  }, [data]);

  const totalPagamentos = data?.pagamentos.reduce((s, p) => s + p.total, 0) ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BarChart2 className="h-6 w-6 text-indigo-600" />
                Relatórios Gerenciais
              </h1>
              <p className="text-sm text-muted-foreground">
                Análise de desempenho, custo, margem e formas de pagamento
              </p>
            </div>
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos os meses" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={m.value || "all"} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 text-red-700 text-sm">
              ⚠️ {error.message}. Verifique se o conector INOVE está ativo.
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="mais-vendidos">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="estoque">Estoque Gerencial</TabsTrigger>
            <TabsTrigger value="custo-venda">Custo x Venda</TabsTrigger>
            <TabsTrigger value="mais-vendidos">Mais Vendidos</TabsTrigger>
            <TabsTrigger value="pagamentos">Formas de Pagamento</TabsTrigger>
          </TabsList>

          {/* Aba: Mais Vendidos */}
          <TabsContent value="mais-vendidos" className="space-y-6 mt-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                title="Produtos Analisados"
                value={isLoading ? "..." : String(data?.kpis.produtosAnalisados ?? 0)}
                icon={Package}
                color="bg-blue-500"
              />
              <KpiCard
                title="Receita Total"
                value={isLoading ? "..." : fmt(data?.kpis.receita)}
                icon={TrendingUp}
                color="bg-green-500"
              />
              <KpiCard
                title="Itens Vendidos"
                value={isLoading ? "..." : fmtQty(data?.kpis.itensVendidos)}
                icon={ShoppingCart}
                color="bg-purple-500"
              />
              <KpiCard
                title="Ticket Médio"
                value={isLoading ? "..." : fmt(data?.kpis.ticketMedio)}
                sub="por unidade vendida"
                icon={DollarSign}
                color="bg-orange-500"
              />
            </div>

            {/* Gráficos lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Top 10 — Por Receita</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={topReceitaChart} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip
                          formatter={(v: number) => [fmt(v), "Receita"]}
                          labelFormatter={(_l, p) => p?.[0]?.payload?.nomeCompleto ?? _l}
                        />
                        <Bar dataKey="receita" fill="#6366f1" radius={[0, 3, 3, 0]}>
                          {topReceitaChart.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Top 10 — Por Quantidade Vendida</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={topQtdChart} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip
                          formatter={(v: number) => [fmtQty(v), "Qtd"]}
                          labelFormatter={(_l, p) => p?.[0]?.payload?.nomeCompleto ?? _l}
                        />
                        <Bar dataKey="qtd" fill="#10b981" radius={[0, 3, 3, 0]}>
                          {topQtdChart.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Aba: Formas de Pagamento */}
          <TabsContent value="pagamentos" className="space-y-6 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                title="Total Arrecadado"
                value={isLoading ? "..." : fmt(totalPagamentos)}
                icon={DollarSign}
                color="bg-green-500"
              />
              <KpiCard
                title="Formas de Pagamento"
                value={isLoading ? "..." : String(data?.pagamentos.length ?? 0)}
                icon={CreditCard}
                color="bg-blue-500"
              />
              <KpiCard
                title="Total de Vendas"
                value={isLoading ? "..." : String(data?.kpis.totalVendas ?? 0)}
                icon={ShoppingCart}
                color="bg-purple-500"
              />
              <KpiCard
                title="Ticket Médio"
                value={isLoading ? "..." : fmt(data?.kpis.ticketMedio)}
                icon={TrendingUp}
                color="bg-orange-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Distribuição por Forma de Pagamento</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
                  ) : pagamentosChart.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={pagamentosChart}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                          labelLine={false}
                        >
                          {pagamentosChart.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [fmt(v), "Total"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Valor por Forma de Pagamento</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {isLoading ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">Carregando...</div>
                    ) : data?.pagamentos.map((p, i) => (
                      <div key={p.forma} className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: PAYMENT_COLORS[p.forma] ?? CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          <span className="text-sm font-medium">{p.forma}</span>
                          <Badge variant="outline" className="text-xs">{p.qtdVendas} vendas</Badge>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{fmt(p.total)}</p>
                          {totalPagamentos > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {fmtPct((p.total / totalPagamentos) * 100)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Aba: Custo x Venda */}
          <TabsContent value="custo-venda" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard title="Receita Total" value={isLoading ? "..." : fmt(data?.kpis.receita)} icon={TrendingUp} color="bg-green-500" />
              <KpiCard title="Itens Vendidos" value={isLoading ? "..." : fmtQty(data?.kpis.itensVendidos)} icon={ShoppingCart} color="bg-blue-500" />
              <KpiCard title="Produtos" value={isLoading ? "..." : String(data?.kpis.produtosAnalisados ?? 0)} icon={Package} color="bg-purple-500" />
              <KpiCard title="Ticket Médio" value={isLoading ? "..." : fmt(data?.kpis.ticketMedio)} sub="por unidade" icon={DollarSign} color="bg-orange-500" />
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top 10 — Por Receita (Custo x Venda)</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topReceitaChart} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip
                        formatter={(v: number) => [fmt(v), "Receita"]}
                        labelFormatter={(_l, p) => p?.[0]?.payload?.nomeCompleto ?? _l}
                      />
                      <Bar dataKey="receita" fill="#6366f1" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba: Estoque Gerencial */}
          <TabsContent value="estoque" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard
                title="Produtos Ativos"
                value={isLoading ? "..." : String(data?.estoque.length ?? 0)}
                icon={Warehouse}
                color="bg-blue-500"
              />
              <KpiCard
                title="Estoque Zerado"
                value={isLoading ? "..." : String(data?.estoque.filter(e => e.saldo <= 0).length ?? 0)}
                sub="produtos com saldo ≤ 0"
                icon={Package}
                color="bg-red-400"
              />
              <KpiCard
                title="Valor em Estoque"
                value={isLoading ? "..." : fmt(data?.estoque.reduce((s, e) => s + (e.custo * Math.max(e.saldo, 0)), 0))}
                sub="custo × saldo atual"
                icon={DollarSign}
                color="bg-green-500"
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Estoque Gerencial — Saldo Atual</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 font-medium">Produto</th>
                          <th className="text-left p-3 font-medium">Código</th>
                          <th className="text-right p-3 font-medium">Custo Unit.</th>
                          <th className="text-right p-3 font-medium">Preço Venda</th>
                          <th className="text-right p-3 font-medium">Saldo</th>
                          <th className="text-center p-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.estoque.map((e) => (
                          <tr key={e.codigo} className="border-t hover:bg-muted/20">
                            <td className="p-3 font-medium">{e.nome}</td>
                            <td className="p-3 font-mono text-xs text-muted-foreground">{e.codigo}</td>
                            <td className="p-3 text-right tabular-nums">{fmt(e.custo)}</td>
                            <td className="p-3 text-right tabular-nums">{fmt(e.venda)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">{fmtQty(e.saldo)}</td>
                            <td className="p-3 text-center">
                              {e.saldo <= 0 ? (
                                <Badge className="bg-red-500/15 text-red-700 border-red-500/30 text-xs">Zerado</Badge>
                              ) : e.saldo <= 5 ? (
                                <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30 text-xs">Baixo</Badge>
                              ) : (
                                <Badge className="bg-green-500/15 text-green-700 border-green-500/30 text-xs">OK</Badge>
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
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
