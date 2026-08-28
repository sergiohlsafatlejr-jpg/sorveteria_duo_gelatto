import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  BarChart3,
  Cloud,
  CloudRain,
  CreditCard,
  DollarSign,
  Eye,
  IceCream,
  Megaphone,
  MousePointerClick,
  Package,
  ShoppingCart,
  Sun,
  Target,
  TrendingUp,
  Users,
  Star,
  Trophy,
  Wallet,
  Wind,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
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

// ── Widget de Previsão do Tempo (Open-Meteo — Goiânia/GO) ─────────────────
const WMO_ICONS: Record<number, { label: string; Icon: React.ElementType; color: string }> = {
  0: { label: "Céu limpo", Icon: Sun, color: "text-yellow-500" },
  1: { label: "Poucas nuvens", Icon: Sun, color: "text-yellow-400" },
  2: { label: "Parcialmente nublado", Icon: Cloud, color: "text-slate-400" },
  3: { label: "Nublado", Icon: Cloud, color: "text-slate-500" },
  45: { label: "Névoa", Icon: Wind, color: "text-slate-400" },
  48: { label: "Névoa congelante", Icon: Wind, color: "text-blue-300" },
  51: { label: "Garoa leve", Icon: CloudRain, color: "text-blue-400" },
  53: { label: "Garoa", Icon: CloudRain, color: "text-blue-500" },
  55: { label: "Garoa forte", Icon: CloudRain, color: "text-blue-600" },
  61: { label: "Chuva leve", Icon: CloudRain, color: "text-blue-500" },
  63: { label: "Chuva", Icon: CloudRain, color: "text-blue-600" },
  65: { label: "Chuva forte", Icon: CloudRain, color: "text-blue-700" },
  80: { label: "Pancadas leves", Icon: CloudRain, color: "text-blue-500" },
  81: { label: "Pancadas", Icon: CloudRain, color: "text-blue-600" },
  82: { label: "Pancadas fortes", Icon: CloudRain, color: "text-blue-700" },
  95: { label: "Trovoada", Icon: CloudRain, color: "text-purple-600" },
  96: { label: "Trovoada c/ granizo", Icon: CloudRain, color: "text-purple-700" },
  99: { label: "Trovoada forte", Icon: CloudRain, color: "text-purple-800" },
};

function WeatherWidget() {
  const [weather, setWeather] = useState<{
    daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[]; precipitation_sum: number[] };
  } | null>(null);

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=-16.68&longitude=-49.25&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&timezone=America/Sao_Paulo&forecast_days=5")
      .then((r) => r.json())
      .then(setWeather)
      .catch(() => {});
  }, []);

  if (!weather) return null;
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-r from-sky-50 to-blue-50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sun className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-semibold text-foreground">Previsão — Goiânia/GO</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {weather.daily.time.map((t, i) => {
            const date = new Date(t + "T12:00:00");
            const d = { max: Math.round(weather.daily.temperature_2m_max[i]), min: Math.round(weather.daily.temperature_2m_min[i]), code: weather.daily.weathercode[i], precip: weather.daily.precipitation_sum[i] };
            const w = WMO_ICONS[d.code] ?? WMO_ICONS[0];
            const DIcon = w.Icon;
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
      </CardContent>
    </Card>
  );
}

// ── Cores para gráfico de pizza ─────────────────────────────────────────────
const PAYMENT_COLORS: Record<string, string> = {
  "PIX": "#10b981",
  "DINHEIRO": "#f59e0b",
  "CARTAO CREDITO": "#8b5cf6",
  "CARTAO DEBITO": "#3b82f6",
  "CREDITO": "#8b5cf6",
  "DEBITO": "#3b82f6",
};
const DEFAULT_COLORS = ["#10b981", "#8b5cf6", "#3b82f6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

// ── Widget de Metas do Mês ───────────────────────────────────────────────────────────────
function GoalsWidget({ vendasMes, productDataPartial = false }: { vendasMes: number; productDataPartial?: boolean }) {
  const currentMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

  // Buscar meta do mês do Forecast (soma dos valores diários do calendário)
  const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);
  const { data: goalForecasts = [] } = trpc.fin.forecastCalendar.getGoalForecasts.useQuery(
    { year: currentYear, month: currentMonthNum },
    { staleTime: 5 * 60 * 1000 }
  );

  // Buscar metas de produtos configuráveis (productGoals)
  const { data: productGoalsList = [] } = trpc.productGoals.list.useQuery(
    { month: currentMonth },
    { staleTime: 5 * 60 * 1000 }
  );

  // Buscar todos os produtos do mês para matching com metas
  const { data: allProductsMonth = [] } = trpc.inove.getTopProducts.useQuery(
    { days: new Date().getDate(), limit: 200 }, // do dia 1 até hoje — cobre todos os produtos
    { staleTime: 5 * 60 * 1000 }
  );

  // Meta geral do mês = soma dos valores diários do Forecast (mesma "Meta do Mês" exibida no Forecast)
  const metaGeral = goalForecasts.length > 0
    ? goalForecasts.reduce((sum: number, f: { amount: string | number }) => sum + Number(f.amount), 0)
    : 0;
  const percentGeral = metaGeral > 0 ? Math.min((vendasMes / metaGeral) * 100, 150) : 0;

  // Calcular realizado para cada meta de produto usando keywords matching
  const productGoalsWithProgress = productGoalsList.map(goal => {
    const sep = goal.searchKeywords.includes('|') ? '|' : ',';
    const keywords = goal.searchKeywords.split(sep).map((k: string) => k.trim().toUpperCase());
    const matchingProducts = allProductsMonth.filter(p => {
      const nome = p.nome.toUpperCase();
      // Matching exato por nome completo (produtos selecionados via checkbox)
      return keywords.some(kw => kw.length > 0 && nome === kw);
    });
    const totalQty = matchingProducts.reduce((sum, p) => sum + p.qtd, 0);
    const totalRevenue = matchingProducts.reduce((sum, p) => sum + p.total, 0);
    const percent = goal.targetQuantity > 0 ? Math.min((totalQty / goal.targetQuantity) * 100, 150) : 0;
    return { ...goal, totalQty, totalRevenue, percent };
  });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-orange-500" />
          Metas do Mês
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
        </CardTitle>
        {productDataPartial && (
          <p className="text-[11px] text-amber-700">
            Metas de produtos calculadas com a última lista parcial sincronizada do INOVE.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className={`grid grid-cols-1 ${productGoalsWithProgress.length > 0 ? `md:grid-cols-${Math.min(productGoalsWithProgress.length + 1, 4)}` : 'md:grid-cols-2'} gap-4`}>
          {/* Meta Geral de Faturamento (vem do Forecast) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                Faturamento
              </span>
              <span className="text-xs font-bold text-emerald-600">{percentGeral.toFixed(0)}%</span>
            </div>
            <div className="w-full h-3 bg-muted/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                style={{ width: `${Math.min(percentGeral, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(vendasMes)}</span>
              <span>Meta: {formatCurrency(metaGeral)}</span>
            </div>
            {metaGeral > 0 && (
              <p className="text-[10px] text-muted-foreground/70 italic">Meta do Forecast</p>
            )}
          </div>

          {/* Metas de Produtos (dinâmicas da tabela productGoals) */}
          {productGoalsWithProgress.map((goal, idx) => {
            const colors = [
              { bar: 'from-purple-400 to-purple-600', text: 'text-purple-600' },
              { bar: 'from-blue-400 to-blue-600', text: 'text-blue-600' },
              { bar: 'from-orange-400 to-orange-600', text: 'text-orange-600' },
              { bar: 'from-pink-400 to-pink-600', text: 'text-pink-600' },
              { bar: 'from-cyan-400 to-cyan-600', text: 'text-cyan-600' },
            ];
            const color = colors[idx % colors.length];
            return (
              <div key={goal.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <span className="text-sm">{goal.icon || '🎯'}</span>
                    {goal.productName}
                  </span>
                  <span className={`text-xs font-bold ${color.text}`}>{goal.percent.toFixed(0)}%</span>
                </div>
                <div className="w-full h-3 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${color.bar} transition-all`}
                    style={{ width: `${Math.min(goal.percent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{goal.totalQty} un ({formatCurrency(goal.totalRevenue)})</span>
                  <span>Meta: {goal.targetQuantity} un</span>
                </div>
              </div>
            );
          })}

          {/* Mensagem se não há metas de produto configuradas */}
          {productGoalsWithProgress.length === 0 && (
            <div className="space-y-2 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-muted-foreground">Nenhuma meta de produto configurada</span>
              <Link href="/fin/product-goals" className="text-xs text-blue-500 hover:underline">Configurar metas</Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: metrics, isLoading } = trpc.dashboard.metrics.useQuery();
  const { data: birthdays } = trpc.dashboard.birthdays.useQuery();
  const { data: metaSummary } = trpc.metaAds.getSummary.useQuery(
    { datePreset: "last_7d" },
    { staleTime: 10 * 60 * 1000 }
  );
  const { data: googleReviews } = trpc.dashboard.googleReviews.useQuery(
    undefined,
    { staleTime: 60 * 60 * 1000 } // cache 1h
  );

  // Dados do INOVE (PDV SQL Server) — mês atual
  // No dia N do mês, busca os últimos N dias (= do dia 1 até hoje)
  const daysInCurrentMonth = new Date().getDate();
  const { data: inoveSalesByDay = [] } = trpc.inove.getSalesByDay.useQuery({ days: daysInCurrentMonth });
  const { data: inoveTopProducts = [] } = trpc.inove.getTopProducts.useQuery({ days: daysInCurrentMonth, limit: 8 });
  const { data: inoveTopProductsToday = [] } = trpc.inove.getTopProducts.useQuery(
    { days: 1, limit: 5 },
    { refetchInterval: 5 * 60 * 1000 }
  );
  const { data: inoveKpis } = trpc.inove.getKpis.useQuery();
  const { data: vendasHoje } = trpc.inove.getVendasHoje.useQuery(undefined, { refetchInterval: 60000 });
  const { data: paymentTypes = [] } = trpc.inove.getSalesByPaymentType.useQuery(
    { days: 1 },
    { refetchInterval: 5 * 60 * 1000 }
  );
  const inoveKpisSource = (inoveKpis as (typeof inoveKpis & { source?: "live" | "cache" }) | undefined)?.source;

  // Gráfico: prioriza INOVE se disponível
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

  // Dados do gráfico de pizza para formas de pagamento
  const paymentPieData = paymentTypes.map((p, idx) => ({
    name: p.forma,
    value: p.total,
    qtd: p.qtd_vendas,
    color: PAYMENT_COLORS[p.forma.toUpperCase()] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
  }));
  const totalPayments = paymentPieData.reduce((sum, p) => sum + p.value, 0);

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
        {(birthdays?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2 text-sm text-pink-700">
              <span>🎂</span>
              <span className="font-medium">{birthdays!.length} aniversariante(s) hoje!</span>
            </div>
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
              ? `${inoveKpis.vendas_mes.qtd} transações · ${inoveKpisSource === "cache" ? "última sincronização" : "PDV"}`
              : `${metrics?.monthSalesCount ?? 0} transações`}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-pink-500 to-rose-600"
          />
          <StatCard
            title="Ticket Médio"
            value={inoveKpis ? formatCurrency(inoveKpis.ticket_medio) : formatCurrency(metrics?.todaySalesTotal && metrics?.todaySalesCount ? metrics.todaySalesTotal / metrics.todaySalesCount : 0)}
            subtitle={inoveKpisSource === "cache" ? "média do mês · última sincronização" : "média por venda · mês atual"}
            icon={DollarSign}
            gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          />
          <StatCard
            title="Clientes Ativos"
            value={String(metrics?.totalCustomers ?? 0)}
            subtitle="cadastrados no sistema"
            icon={Users}
            gradient="bg-gradient-to-br from-cyan-500 to-teal-600"
          />
        </div>

        {/* Metas do Mês */}
        <GoalsWidget
          vendasMes={inoveKpis?.vendas_mes?.total ?? 0}
          productDataPartial={inoveKpisSource === "cache"}
        />

        {/* Widget de Previsão do Tempo */}
        <WeatherWidget />

        {/* Top Produtos Vendidos Hoje + Formas de Pagamento */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Produtos Vendidos Hoje */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  Top Produtos Vendidos Hoje
                </span>
                <span className="text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  PDV INOVE
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inoveTopProductsToday.length > 0 ? (
                <div className="space-y-3">
                  {inoveTopProductsToday.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        idx === 0 ? "bg-amber-500/20 text-amber-600" :
                        idx === 1 ? "bg-slate-400/20 text-slate-500" :
                        idx === 2 ? "bg-orange-400/20 text-orange-500" :
                        "bg-muted/50 text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.nome}</p>
                        <p className="text-xs text-muted-foreground">{p.qtd} unidades</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-600 shrink-0">
                        {formatCurrency(p.total)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma venda registrada hoje</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formas de Pagamento do Dia */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-500" />
                  Formas de Pagamento — Hoje
                </span>
                <span className="text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  PDV INOVE
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentPieData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <div className="w-32 h-32 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={55}
                          dataKey="value"
                          strokeWidth={2}
                        >
                          {paymentPieData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => [formatCurrency(v), "Total"]}
                          contentStyle={{ borderRadius: 8, fontSize: 11 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {paymentPieData.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{p.name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold">{formatCurrency(p.value)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {totalPayments > 0 ? Math.round((p.value / totalPayments) * 100) : 0}% · {p.qtd} vendas
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum pagamento registrado hoje</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Vendas — Mês Atual
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
                Mais Vendidos (Mês)
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

        {/* Avaliações Google + Meta Ads */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Avaliações Google */}
          <Card className="border-yellow-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                Avaliações Google
              </CardTitle>
            </CardHeader>
            <CardContent>
              {googleReviews ? (
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-yellow-600">{googleReviews.rating.toFixed(1)}</p>
                    <div className="flex items-center gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(googleReviews.rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{googleReviews.totalReviews}</p>
                    <p className="text-xs text-muted-foreground">avaliações no total</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              )}
            </CardContent>
          </Card>

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
                    <span className="text-xs font-normal text-blue-600 hover:underline">Ver análise →</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg p-1.5 bg-green-100 text-green-600">
                        <DollarSign className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Gasto</p>
                        <p className="font-bold text-xs">{formatCurrency(metaSummary.totalSpend)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg p-1.5 bg-blue-100 text-blue-600">
                        <Eye className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Impressões</p>
                        <p className="font-bold text-xs">{new Intl.NumberFormat("pt-BR").format(metaSummary.totalImpressions)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg p-1.5 bg-purple-100 text-purple-600">
                        <TrendingUp className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Alcance</p>
                        <p className="font-bold text-xs">{new Intl.NumberFormat("pt-BR").format(metaSummary.totalReach)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg p-1.5 bg-orange-100 text-orange-600">
                        <MousePointerClick className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Cliques</p>
                        <p className="font-bold text-xs">{new Intl.NumberFormat("pt-BR").format(metaSummary.totalLinkClicks)}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {metaSummary.activeCampaigns} campanha(s) ativa(s)
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

        {/* Aniversariantes */}
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
      </div>
    </DashboardLayout>
  );
}
