import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BarChart3,
  DollarSign,
  IceCream,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  Star,
  Trophy,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <Card className="overflow-hidden border-0 shadow-md">
      <CardContent className={`p-5 ${gradient} text-white`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium opacity-90">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs opacity-75 mt-1">{subtitle}</p>}
          </div>
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: metrics, isLoading } = trpc.dashboard.metrics.useQuery();
  const { data: chartData } = trpc.dashboard.chartData.useQuery({ days: 30 });
  const { data: topProducts } = trpc.dashboard.topProducts.useQuery({ limit: 5 });
  const { data: birthdays } = trpc.dashboard.birthdays.useQuery();
  const { data: lowStock } = trpc.dashboard.lowStock.useQuery();
  const { data: topPointsCustomers = [] } = trpc.dashboard.topCustomersByPoints.useQuery({ limit: 8 });
  const { data: pointsCount = 0 } = trpc.dashboard.customersWithPointsCount.useQuery();

  const salesChart = (chartData ?? []).map((d) => ({
    date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    total: parseFloat(d.total),
    count: d.count,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/dashboard" />

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <IceCream className="h-6 w-6 text-primary" />
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão geral do desempenho da sorveteria
          </p>
        </div>

        {/* Alerts */}
        {((birthdays?.length ?? 0) > 0 || (lowStock?.length ?? 0) > 0) && (
          <div className="flex flex-wrap gap-3">
            {(birthdays?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2 text-sm text-pink-700">
                <span>🎂</span>
                <span className="font-medium">{birthdays!.length} aniversariante(s) hoje!</span>
              </div>
            )}
            {(lowStock?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">{lowStock!.length} produto(s) com estoque baixo</span>
              </div>
            )}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Vendas Hoje"
            value={formatCurrency(metrics?.todaySalesTotal ?? 0)}
            subtitle={(metrics?.importTodayTotal ?? 0) > 0
              ? `incl. R$ ${(metrics!.importTodayTotal!).toFixed(2).replace('.', ',')} PDV`
              : `${metrics?.todaySalesCount ?? 0} transações`}
            icon={ShoppingCart}
            gradient="bg-gradient-to-br from-violet-600 to-purple-700"
          />
          <StatCard
            title="Vendas do Mês"
            value={formatCurrency(metrics?.monthSalesTotal ?? 0)}
            subtitle={(metrics?.importMonthTotal ?? 0) > 0
              ? `incl. ${formatCurrency(metrics!.importMonthTotal!)} PDV`
              : `${metrics?.monthSalesCount ?? 0} transações`}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-pink-500 to-rose-600"
          />
          <StatCard
            title="Clientes Ativos"
            value={String(metrics?.totalCustomers ?? 0)}
            subtitle="cadastrados"
            icon={Users}
            gradient="bg-gradient-to-br from-cyan-500 to-teal-600"
          />
          <StatCard
            title="Produtos"
            value={String(metrics?.totalProducts ?? 0)}
            subtitle={`${metrics?.lowStockCount ?? 0} com estoque baixo`}
            icon={Package}
            gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Vendas — Últimos 30 dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={salesChart}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.50 0.22 280)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.50 0.22 280)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 270)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), "Total"]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="oklch(0.50 0.22 280)"
                    strokeWidth={2}
                    fill="url(#salesGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Mais Vendidos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topProducts ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 270)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="productName"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="totalQty" fill="oklch(0.65 0.18 340)" radius={[0, 4, 4, 0]} name="Qtd" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Customers by Points */}
        {topPointsCustomers.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  Clientes com Pontos
                </span>
                <Badge variant="secondary" className="text-xs font-normal">
                  {pointsCount} cliente{pointsCount !== 1 ? "s" : ""} com saldo
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topPointsCustomers.map((c, idx) => (
                  <div key={c.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      idx === 0 ? "bg-amber-500/20 text-amber-600" :
                      idx === 1 ? "bg-slate-400/20 text-slate-500" :
                      idx === 2 ? "bg-orange-400/20 text-orange-500" :
                      "bg-muted/50 text-muted-foreground"
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.fullName}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </div>
                    <Badge
                      className={`text-xs shrink-0 ${
                        c.totalPoints >= 100 ? "bg-amber-500/15 text-amber-600 border-amber-500/30" :
                        c.totalPoints >= 50 ? "bg-violet-500/15 text-violet-600 border-violet-500/30" :
                        "bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <Star className="h-2.5 w-2.5 mr-1" />
                      {c.totalPoints} pts
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Birthdays & Low Stock */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(birthdays?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">🎂 Aniversariantes de Hoje</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {birthdays!.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{c.fullName}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {c.totalPoints} pts
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(lowStock?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Estoque Baixo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {lowStock!.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <Badge variant="destructive" className="text-xs shrink-0 ml-2">
                        {p.currentStock}/{p.minStock} {p.unit}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
