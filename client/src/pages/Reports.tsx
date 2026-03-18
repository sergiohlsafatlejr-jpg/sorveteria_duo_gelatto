import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart2, Download, TrendingUp, Users } from "lucide-react";
import { useState } from "react";

const COLORS = ["#7c3aed", "#ec4899", "#f97316", "#06b6d4", "#10b981", "#f59e0b"];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function Reports() {
  const [period, setPeriod] = useState("30");

  const { data: dashData } = trpc.dashboard.metrics.useQuery();
  const { data: salesChart } = trpc.dashboard.chartData.useQuery({ days: parseInt(period) });
  const { data: topProducts } = trpc.dashboard.topProducts.useQuery({ limit: 10 });
  const { data: customers } = trpc.customers.list.useQuery({});
  const { data: products } = trpc.products.list.useQuery({});

  // Payment method distribution from sales chart data
  const paymentData = [
    { name: "Dinheiro", value: 0 },
    { name: "Cartão Crédito", value: 0 },
    { name: "Cartão Débito", value: 0 },
    { name: "PIX", value: 0 },
    { name: "Outros", value: 0 },
  ];

  type ChartEntry = { date: string; total: string; count: number };
  const totalRevenue = salesChart?.reduce((sum: number, d: ChartEntry) => sum + (parseFloat(String(d.total)) || 0), 0) ?? 0;
  const totalSales = salesChart?.reduce((sum: number, d: ChartEntry) => sum + (d.count || 0), 0) ?? 0;
  const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

  const lowStockCount = products?.filter((p) => p.currentStock <= p.minStock).length ?? 0;
  const activeCustomers = customers?.filter((c) => c.active).length ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-primary" />
              Relatórios e Análises
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visão completa do desempenho da sorveteria
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2" onClick={() => window.print()}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Faturamento no Período",
              value: formatCurrency(totalRevenue),
              icon: <TrendingUp className="h-5 w-5" />,
              color: "bg-violet-600",
              sub: `${totalSales} vendas`,
            },
            {
              label: "Ticket Médio",
              value: formatCurrency(avgTicket),
              icon: <BarChart2 className="h-5 w-5" />,
              color: "bg-pink-500",
              sub: "por venda",
            },
            {
              label: "Clientes Ativos",
              value: String(activeCustomers),
              icon: <Users className="h-5 w-5" />,
              color: "bg-cyan-500",
              sub: "cadastrados",
            },
            {
              label: "Estoque Baixo",
              value: String(lowStockCount),
              icon: <BarChart2 className="h-5 w-5" />,
              color: lowStockCount > 0 ? "bg-orange-500" : "bg-green-500",
              sub: "produtos",
            },
          ].map((kpi) => (
            <Card key={kpi.label} className="overflow-hidden">
              <CardContent className="p-0">
                <div className={`${kpi.color} text-white p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium opacity-90">{kpi.label}</span>
                    {kpi.icon}
                  </div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs opacity-80 mt-0.5">{kpi.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Vendas</TabsTrigger>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="customers">Clientes</TabsTrigger>
            <TabsTrigger value="stock">Estoque</TabsTrigger>
          </TabsList>

          {/* Sales Tab */}
          <TabsContent value="sales" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Faturamento Diário</CardTitle>
              </CardHeader>
              <CardContent>
                {!salesChart?.length ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    Nenhuma venda no período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={salesChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `R$${v}`} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: number) => formatCurrency(v)}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        name="Faturamento"
                        stroke="#7c3aed"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Número de Vendas por Dia</CardTitle>
              </CardHeader>
              <CardContent>
                {!salesChart?.length ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground">
                    Nenhuma venda no período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={salesChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Vendas" fill="#ec4899" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Produtos Mais Vendidos</CardTitle>
                </CardHeader>
                <CardContent>
                  {!topProducts?.length ? (
                    <div className="h-48 flex items-center justify-center text-muted-foreground">
                      Nenhuma venda registrada.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={topProducts} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="productName" type="category" tick={{ fontSize: 11 }} width={100} />
                        <Tooltip />
                        <Bar dataKey="totalQty" name="Qtd. Vendida" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Receita por Produto</CardTitle>
                </CardHeader>
                <CardContent>
                  {!topProducts?.length ? (
                    <div className="h-48 flex items-center justify-center text-muted-foreground">
                      Nenhuma venda registrada.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={topProducts.slice(0, 6)}
                          dataKey="totalRevenue"
                          nameKey="productName"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }: { name: string; percent: number }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {topProducts.slice(0, 6).map((_: unknown, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Product Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de Produtos</CardTitle>
              </CardHeader>
              <CardContent>
                {!topProducts?.length ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma venda registrada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-muted-foreground">#</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Produto</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Qtd. Vendida</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Receita</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProducts.map((p: { productName: string; totalQty: number; totalRevenue: string }, i: number) => (
                          <tr key={p.productName} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 font-medium">{p.productName}</td>
                            <td className="py-2 text-right">{p.totalQty}</td>
                            <td className="py-2 text-right font-medium text-green-600">
                              {formatCurrency(parseFloat(p.totalRevenue))}
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

          {/* Customers Tab */}
          <TabsContent value="customers" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Total de Clientes", value: customers?.length ?? 0, color: "text-violet-600" },
                { label: "Clientes Ativos", value: activeCustomers, color: "text-green-600" },
                {
                  label: "Com Pontos Acumulados",
                  value: customers?.filter((c) => (c.totalPoints ?? 0) > 0).length ?? 0,
                  color: "text-orange-500",
                },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-4 text-center">
                    <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clientes com Mais Pontos</CardTitle>
              </CardHeader>
              <CardContent>
                {!customers?.length ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum cliente cadastrado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-muted-foreground">#</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Cliente</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Telefone</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Pontos</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Total Compras</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...customers]
                          .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
                          .slice(0, 10)
                          .map((c, i) => (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2 text-muted-foreground">{i + 1}</td>
                              <td className="py-2 font-medium">{c.fullName}</td>
                              <td className="py-2 text-muted-foreground">{c.phone ?? "—"}</td>
                              <td className="py-2 text-right">
                                <Badge variant="secondary">{c.totalPoints ?? 0} pts</Badge>
                              </td>
                              <td className="py-2 text-right font-medium text-green-600">
                                {formatCurrency(parseFloat(String(c.totalPurchases ?? 0)))}
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

          {/* Stock Tab */}
          <TabsContent value="stock" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Total de Produtos", value: products?.length ?? 0, color: "text-violet-600" },
                { label: "Produtos Ativos", value: products?.filter((p) => p.active).length ?? 0, color: "text-green-600" },
                { label: "Estoque Baixo/Crítico", value: lowStockCount, color: lowStockCount > 0 ? "text-red-500" : "text-green-600" },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-4 text-center">
                    <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Situação do Estoque</CardTitle>
              </CardHeader>
              <CardContent>
                {!products?.length ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum produto cadastrado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-muted-foreground">Produto</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Estoque Atual</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Estoque Mínimo</th>
                          <th className="text-center py-2 font-medium text-muted-foreground">Status</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Preço Venda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...products]
                          .sort((a, b) => a.currentStock - a.minStock - (b.currentStock - b.minStock))
                          .map((p) => {
                            const isLow = p.currentStock <= p.minStock;
                            const isCritical = p.currentStock === 0;
                            return (
                              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="py-2 font-medium">{p.name}</td>
                                <td className={`py-2 text-right font-bold ${isCritical ? "text-red-600" : isLow ? "text-orange-500" : "text-green-600"}`}>
                                  {p.currentStock}
                                </td>
                                <td className="py-2 text-right text-muted-foreground">{p.minStock}</td>
                                <td className="py-2 text-center">
                                  <Badge
                                    variant={isCritical ? "destructive" : isLow ? "outline" : "secondary"}
                                    className={isLow && !isCritical ? "border-orange-400 text-orange-600" : ""}
                                  >
                                    {isCritical ? "Sem estoque" : isLow ? "Estoque baixo" : "Normal"}
                                  </Badge>
                                </td>
                                <td className="py-2 text-right">
                                  {formatCurrency(parseFloat(String(p.salePrice)))}
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
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
