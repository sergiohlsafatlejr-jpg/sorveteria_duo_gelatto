import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, ShoppingCart, DollarSign, Package, CreditCard,
  Clock, Download, BarChart2, RefreshCw,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { exportToExcel } from "@/lib/exportExcel";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];
const PAYMENT_COLORS: Record<string, string> = {
  "C. DEBITO": "#6366f1",
  "C. CREDITO": "#f59e0b",
  "PIX": "#10b981",
  "DINHEIRO": "#3b82f6",
  "CORTESIA": "#ec4899",
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtQty(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTHS_PT[parseInt(mo) - 1]}/${y}`;
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getMonthOptions() {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ value, label: monthLabel(value) });
  }
  return months;
}

// ─── Aba: Vendas por Período ─────────────────────────────────────────────────
function VendasPeriodoTab() {
  const defaultDates = useMemo(() => {
    const today = new Date();
    const d7 = new Date(today); d7.setDate(today.getDate() - 6);
    return { from: toDateStr(d7), to: toDateStr(today) };
  }, []);

  const [from, setFrom] = useState(defaultDates.from);
  const [to, setTo] = useState(defaultDates.to);
  const [queryFrom, setQueryFrom] = useState(defaultDates.from);
  const [queryTo, setQueryTo] = useState(defaultDates.to);
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = trpc.inove.getSalesByPeriodInove.useQuery(
    { from: queryFrom, to: queryTo },
    { refetchInterval: 5 * 60 * 1000 }
  );

  function applyFilter() {
    setQueryFrom(from);
    setQueryTo(to);
  }

  const items = useMemo(() => {
    if (!data?.itens) return [];
    return data.itens.filter(i => !search || i.nome.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const totalReceita = data?.resumo?.totalRevenue ?? 0;
  const totalQtd = data?.resumo?.totalQty ?? 0;
  const totalVendas = data?.resumo?.totalVendas ?? 0;
  const ticketMedio = totalVendas > 0 ? totalReceita / totalVendas : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-9" />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-9" />
        </div>
        <Button size="sm" onClick={applyFilter}>Filtrar</Button>
        <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Receita Total" value={fmt(totalReceita)} icon={TrendingUp} color="bg-green-500" />
            <KpiCard title="Total de Vendas" value={fmtQty(totalVendas)} icon={ShoppingCart} color="bg-blue-500" />
            <KpiCard title="Itens Vendidos" value={fmtQty(totalQtd)} icon={Package} color="bg-purple-500" />
            <KpiCard title="Ticket Médio" value={fmt(ticketMedio)} icon={DollarSign} color="bg-amber-500" />
          </div>



          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Produtos Vendidos ({items.length})</CardTitle>
                <div className="flex gap-2">
                  <Input placeholder="Buscar..." className="h-8 w-40" value={search} onChange={e => setSearch(e.target.value)} />
                  {items.length > 0 && (
                    <button
                      onClick={() => exportToExcel(items.map(r => ({ Produto: r.nome, Qtd: r.totalQty, "Receita (R$)": r.totalRevenue.toFixed(2) })), `Vendas_${queryFrom}_${queryTo}`, "Vendas")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted"
                    >
                      <Download className="w-3.5 h-3.5" /> Excel
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-4 font-medium">Produto</th>
                      <th className="text-right py-2 px-3 font-medium">Qtd</th>
                      <th className="text-right py-2 px-3 font-medium">Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-4 max-w-[200px] truncate">{r.nome}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{fmtQty(r.totalQty)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-green-600 font-semibold">{fmt(r.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Aba: Ranking de Produtos ────────────────────────────────────────────────
function RankingProdutosTab() {
  const [month, setMonth] = useState(getCurrentMonth());
  const { data: rawData = [], isLoading, refetch } = trpc.inove.getTopProductsInove.useQuery(
    { referenceMonth: month, limit: 50 },
    { refetchInterval: 5 * 60 * 1000 }
  );

  const data = rawData.map((r: any, i: number) => ({
    rank: i + 1,
    nome: r.nome ?? r.productName ?? "",
    qtd: Number(r.qtd ?? r.totalQty ?? 0),
    faturamento: Number(r.faturamento ?? r.totalRevenue ?? 0),
  }));

  const totalReceita = data.reduce((s, r) => s + r.faturamento, 0);
  const totalQtd = data.reduce((s, r) => s + r.qtd, 0);
  const top10Revenue = data.slice(0, 10);
  const top10Qty = [...data].sort((a, b) => b.qtd - a.qtd).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getMonthOptions().map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        <Badge variant="outline" className="text-xs">PDV INOVE</Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard title="Receita Total" value={fmt(totalReceita)} icon={TrendingUp} color="bg-green-500" />
            <KpiCard title="Itens Vendidos" value={fmtQty(totalQtd)} icon={Package} color="bg-purple-500" />
            <KpiCard title="Produtos Analisados" value={String(data.length)} icon={BarChart2} color="bg-blue-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 — Por Receita</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={top10Revenue} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={140} tickFormatter={(v: string) => v?.substring(0, 18)} />
                    <Tooltip formatter={(v: number) => [fmt(v), "Receita"]} />
                    <Bar dataKey="faturamento" radius={[0, 4, 4, 0]}>
                      {top10Revenue.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 — Por Quantidade</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={top10Qty} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={140} tickFormatter={(v: string) => v?.substring(0, 18)} />
                    <Tooltip formatter={(v: number) => [fmtQty(v), "Unidades"]} />
                    <Bar dataKey="qtd" radius={[0, 4, 4, 0]}>
                      {top10Qty.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Ranking Completo</CardTitle>
              {data.length > 0 && (
                <button
                  onClick={() => exportToExcel(data.map(r => ({ "#": r.rank, Produto: r.nome, Qtd: r.qtd, "Receita (R$)": r.faturamento.toFixed(2) })), `Ranking_${month}`, "Ranking")}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted"
                >
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-center py-2 px-3 font-medium w-12">#</th>
                      <th className="text-left py-2 px-4 font-medium">Produto</th>
                      <th className="text-right py-2 px-3 font-medium">Qtd</th>
                      <th className="text-right py-2 px-3 font-medium">Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-3 text-center">
                          <span className={`font-bold text-xs ${r.rank <= 3 ? "text-amber-500" : "text-muted-foreground"}`}>
                            {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}
                          </span>
                        </td>
                        <td className="py-2 px-4 max-w-[200px] truncate font-medium">{r.nome}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{fmtQty(r.qtd)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-green-600 font-semibold">{fmt(r.faturamento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Aba: Formas de Pagamento ────────────────────────────────────────────────
function PagamentosTab() {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [appliedFrom, setAppliedFrom] = useState(weekAgo);
  const [appliedTo, setAppliedTo] = useState(today);

  const { data: rawPayments = [], isLoading, refetch } = trpc.inove.getPaymentMethodsInove.useQuery(
    { dateFrom: appliedFrom, dateTo: appliedTo },
    { refetchInterval: 5 * 60 * 1000 }
  );
  const { data: rawEvolution = [] } = trpc.inove.getMonthlySalesEvolutionInove.useQuery();

  const payments = rawPayments.map((r: any) => ({
    forma: r.paymentMethod ?? r.forma ?? "",
    total: Number(r.totalAmount ?? r.total ?? 0),
    qtd: Number(r.transactionCount ?? r.qtdVendas ?? 0),
  }));
  const totalGeral = payments.reduce((s, p) => s + p.total, 0);

  const evolution = rawEvolution.map((r: any) => ({
    month: r.month ?? r.referenceMonth ?? "",
    totalRevenue: Number(r.totalRevenue ?? 0),
    transactionCount: Number(r.transactionCount ?? 0),
    ticketMedio: Number(r.ticketMedio ?? 0),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">De</label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 h-9" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Até</label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-9" />
        </div>
        <Button size="sm" onClick={() => { setAppliedFrom(dateFrom); setAppliedTo(dateTo); }}>Filtrar</Button>
        <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        <Badge variant="outline" className="text-xs">PDV INOVE</Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Distribuição por Forma de Pagamento</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={payments} dataKey="total" nameKey="forma" cx="50%" cy="50%" outerRadius={100} label={({ forma, percent }) => `${forma} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {payments.map((p, i) => <Cell key={i} fill={PAYMENT_COLORS[p.forma] || CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Detalhamento</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-2 px-4 font-medium">Forma</th>
                      <th className="text-right py-2 px-3 font-medium">Total</th>
                      <th className="text-right py-2 px-3 font-medium">%</th>
                      <th className="text-right py-2 px-3 font-medium">Vendas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 px-4 flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[p.forma] || CHART_COLORS[i % CHART_COLORS.length] }} />
                          {p.forma}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{fmt(p.total)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{totalGeral > 0 ? ((p.total / totalGeral) * 100).toFixed(1) : 0}%</td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{fmtQty(p.qtd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {evolution.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Evolução Mensal de Faturamento</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={evolution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [fmt(v), "Receita"]} labelFormatter={monthLabel} />
                    <Bar dataKey="totalRevenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Aba: Vendas por Hora ────────────────────────────────────────────────────
function VendasHoraTab() {
  const [days, setDays] = useState("30");
  const { data = [], isLoading } = trpc.inove.getSalesByHour.useQuery(
    { days: parseInt(days) },
    { refetchInterval: 5 * 60 * 1000 }
  );

  const totalVendas = data.reduce((s, r) => s + r.qtd_vendas, 0);
  const totalReceita = data.reduce((s, r) => s + r.total, 0);
  const picoHora = data.length > 0 ? data.reduce((max, r) => r.qtd_vendas > max.qtd_vendas ? r : max, data[0]) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard title="Total de Vendas" value={fmtQty(totalVendas)} icon={ShoppingCart} color="bg-blue-500" />
            <KpiCard title="Receita Total" value={fmt(totalReceita)} icon={TrendingUp} color="bg-green-500" />
            <KpiCard title="Horário de Pico" value={picoHora ? `${picoHora.hora}h` : "—"} sub={picoHora ? `${picoHora.qtd_vendas} vendas` : ""} icon={Clock} color="bg-amber-500" />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Vendas por Hora do Dia</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hora" tickFormatter={(v: number) => `${v}h`} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number, name: string) => [name === "qtd_vendas" ? fmtQty(v) : fmt(v), name === "qtd_vendas" ? "Vendas" : "Receita"]} labelFormatter={(v: number) => `${v}h`} />
                  <Bar dataKey="qtd_vendas" name="Vendas" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Ticket Médio por Hora</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hora" tickFormatter={(v: number) => `${v}h`} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `R$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [fmt(v), "Ticket Médio"]} labelFormatter={(v: number) => `${v}h`} />
                  <Line type="monotone" dataKey="ticket_medio" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
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

// ─── Página Principal ────────────────────────────────────────────────────────
export default function ReportSales() {
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <BackButton to="/dashboard" />

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-indigo-500" />
            Relatório de Vendas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise completa de vendas — dados em tempo real do PDV INOVE
          </p>
        </div>

        <Tabs defaultValue="periodo">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="periodo">Por Período</TabsTrigger>
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
            <TabsTrigger value="hora">Por Hora</TabsTrigger>
          </TabsList>

          <TabsContent value="periodo" className="mt-6"><VendasPeriodoTab /></TabsContent>
          <TabsContent value="pagamentos" className="mt-6"><PagamentosTab /></TabsContent>
          <TabsContent value="hora" className="mt-6"><VendasHoraTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
