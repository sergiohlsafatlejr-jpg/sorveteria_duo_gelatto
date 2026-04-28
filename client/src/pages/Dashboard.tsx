import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  AlertTriangle,
  BarChart3,
  Cloud,
  CloudRain,
  DollarSign,
  Eye,
  IceCream,
  Megaphone,
  MousePointerClick,
  Package,
  ShoppingCart,
  Sun,
  TrendingUp,
  Users,
  Star,
  Trophy,
  Wind,
} from "lucide-react";
import { useEffect, useState } from "react";
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

// ── Widget de Previsão do Tempo (Open-Meteo — Uberlândia/MG) ─────────────────
const WMO_ICONS: Record<number, { label: string; Icon: React.ElementType; color: string }> = {
  0: { label: "Céu limpo", Icon: Sun, color: "text-yellow-500" },
  1: { label: "Poucas nuvens", Icon: Sun, color: "text-yellow-400" },
  2: { label: "Parcialmente nublado", Icon: Cloud, color: "text-slate-400" },
  3: { label: "Nublado", Icon: Cloud, color: "text-slate-500" },
  45: { label: "Névoa", Icon: Wind, color: "text-slate-400" },
  48: { label: "Névoa", Icon: Wind, color: "text-slate-400" },
  51: { label: "Garoa leve", Icon: CloudRain, color: "text-blue-400" },
  61: { label: "Chuva leve", Icon: CloudRain, color: "text-blue-500" },
  63: { label: "Chuva moderada", Icon: CloudRain, color: "text-blue-600" },
  80: { label: "Pancadas leves", Icon: CloudRain, color: "text-blue-400" },
  81: { label: "Pancadas", Icon: CloudRain, color: "text-blue-500" },
  95: { label: "Tempestade", Icon: CloudRain, color: "text-indigo-600" },
};
function getWmo(code: number) {
  return WMO_ICONS[code] ?? { label: "Variável", Icon: Cloud, color: "text-slate-400" };
}
const DIAS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
function WeatherWidget() {
  const [weather, setWeather] = useState<{
    current: { temp: number; code: number; wind: number };
    daily: Array<{ date: string; max: number; min: number; code: number; precip: number }>;
  } | null>(null);
  useEffect(() => {
    // Uberlândia, MG — lat: -18.9186, lon: -48.2772
    fetch("https://api.open-meteo.com/v1/forecast?latitude=-18.9186&longitude=-48.2772&current=temperature_2m,weathercode,windspeed_10m&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=America%2FSao_Paulo&forecast_days=4")
      .then(r => r.json())
      .then(d => {
        setWeather({
          current: { temp: Math.round(d.current.temperature_2m), code: d.current.weathercode, wind: Math.round(d.current.windspeed_10m) },
          daily: d.daily.time.slice(0, 4).map((date: string, i: number) => ({
            date, max: Math.round(d.daily.temperature_2m_max[i]), min: Math.round(d.daily.temperature_2m_min[i]),
            code: d.daily.weathercode[i], precip: d.daily.precipitation_sum[i],
          })),
        });
      }).catch(() => {});
  }, []);
  if (!weather) return null;
  const now = getWmo(weather.current.code);
  const NowIcon = now.Icon;
  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <NowIcon className={`h-10 w-10 ${now.color}`} />
            <div>
              <p className="text-3xl font-bold text-foreground">{weather.current.temp}°C</p>
              <p className="text-xs text-muted-foreground">{now.label} · Vento {weather.current.wind} km/h</p>
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400">Uberlândia, MG</p>
            </div>
          </div>
          <div className="flex gap-3">
            {weather.daily.slice(1).map((d, i) => {
              const w = getWmo(d.code); const DIcon = w.Icon;
              const date = new Date(d.date + "T12:00:00-03:00");
              return (
                <div key={i} className="text-center">
                  <p className="text-xs text-muted-foreground font-medium">{DIAS[date.getDay()]}</p>
                  <DIcon className={`h-5 w-5 mx-auto my-1 ${w.color}`} />
                  <p className="text-xs font-semibold">{d.max}°</p>
                  <p className="text-xs text-muted-foreground">{d.min}°</p>
                  {d.precip > 0 && <p className="text-xs text-blue-500">{d.precip}mm</p>}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: metrics, isLoading } = trpc.dashboard.metrics.useQuery();
  const { data: birthdays } = trpc.dashboard.birthdays.useQuery();
  const { data: lowStock } = trpc.dashboard.lowStock.useQuery();
  const { data: topPointsCustomers = [] } = trpc.dashboard.topCustomersByPoints.useQuery({ limit: 8 });
  const { data: pointsCount = 0 } = trpc.dashboard.customersWithPointsCount.useQuery();
  const { data: metaSummary } = trpc.metaAds.getSummary.useQuery(
    { datePreset: "last_7d" },
    { staleTime: 10 * 60 * 1000 }
  );

  // Dados do INOVE (PDV SQL Server)
  const { data: inoveSalesByDay = [] } = trpc.inove.getSalesByDay.useQuery({ days: 30 });
  const { data: inoveTopProducts = [] } = trpc.inove.getTopProducts.useQuery({ days: 30, limit: 8 });
  const { data: inoveKpis } = trpc.inove.getKpis.useQuery();
  const { data: vendasHoje } = trpc.inove.getVendasHoje.useQuery(undefined, { refetchInterval: 60000 });

  // Gráfico: prioriza INOVE se disponível, senão usa dados locais
  const salesChart = inoveSalesByDay.length > 0
    ? inoveSalesByDay.map((d) => ({
        date: new Date(d.dia + 'T00:00:00-03:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }),
        total: d.total,
        count: d.qtd,
      }))
    : [];

  // Top produtos: prioriza INOVE
  const topProductsChart = inoveTopProducts.length > 0
    ? inoveTopProducts.map((p) => ({ productName: p.nome.slice(0, 20), totalQty: p.qtd, totalRevenue: p.total }))
    : [];

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

        {/* KPI Cards — prioriza INOVE quando conectado */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Vendas Hoje"
            value={formatCurrency(vendasHoje ? vendasHoje.total : (metrics?.todaySalesTotal ?? 0))}
            subtitle={vendasHoje
              ? `${vendasHoje.qtd} transações · PDV INOVE`
              : `${metrics?.todaySalesCount ?? 0} transações`}
            icon={ShoppingCart}
            gradient="bg-gradient-to-br from-violet-600 to-purple-700"
          />
          <StatCard
            title="Vendas do Mês"
            value={formatCurrency(inoveKpis ? inoveKpis.vendas_mes.total : (metrics?.monthSalesTotal ?? 0))}
            subtitle={inoveKpis
              ? `${inoveKpis.vendas_mes.qtd} transações · PDV`
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
            title={inoveKpis ? "Ticket Médio (30d)" : "Produtos"}
            value={inoveKpis ? formatCurrency(inoveKpis.ticket_medio) : String(metrics?.totalProducts ?? 0)}
            subtitle={inoveKpis ? "média por venda · PDV" : `${metrics?.lowStockCount ?? 0} com estoque baixo`}
            icon={inoveKpis ? DollarSign : Package}
            gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          />
        </div>

        {/* Widget de Previsão do Tempo */}
        <WeatherWidget />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Vendas — Últimos 30 dias
                {inoveSalesByDay.length > 0 && (
                  <span className="ml-auto text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">PDV INOVE</span>
                )}
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
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Mais Vendidos
                {inoveTopProducts.length > 0 && (
                  <span className="ml-auto text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">PDV INOVE</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topProductsChart} layout="vertical">
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

        {/* Meta Ads Summary Card */}
        {metaSummary && (
          <Link href="/meta-ads">
            <Card className="cursor-pointer hover:shadow-md transition-shadow border-blue-100 hover:border-blue-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-blue-600" />
                    Meta Ads — Últimos 7 dias
                  </span>
                  <span className="text-xs font-normal text-blue-600 hover:underline">Ver análise completa →</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg p-2 bg-green-100 text-green-600">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Valor usado</p>
                      <p className="font-bold text-sm">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(metaSummary.totalSpend)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg p-2 bg-blue-100 text-blue-600">
                      <Eye className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Impressões</p>
                      <p className="font-bold text-sm">{new Intl.NumberFormat("pt-BR").format(metaSummary.totalImpressions)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg p-2 bg-purple-100 text-purple-600">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Alcance</p>
                      <p className="font-bold text-sm">{new Intl.NumberFormat("pt-BR").format(metaSummary.totalReach)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg p-2 bg-orange-100 text-orange-600">
                      <MousePointerClick className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cliques no link</p>
                      <p className="font-bold text-sm">{new Intl.NumberFormat("pt-BR").format(metaSummary.totalLinkClicks)}</p>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-3">
                  {metaSummary.activeCampaigns} campanha(s) ativa(s) · Clique para ver análise completa
                </p>
              </CardContent>
            </Card>
          </Link>
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
