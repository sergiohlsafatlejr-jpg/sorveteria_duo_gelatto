import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import {
  TrendingUp, ShoppingCart, DollarSign, CreditCard,
  BarChart2, RefreshCw, Download, ArrowUpRight, ArrowDownRight,
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
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getPreviousMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

function KpiCard({ title, value, sub, icon: Icon, color, trend }: {
  title: string; value: string; sub?: string; icon: React.ElementType; color: string; trend?: { value: number; label: string };
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            {trend && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend.value >= 0 ? "text-green-600" : "text-red-500"}`}>
                {trend.value >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(trend.value).toFixed(1)}% {trend.label}
              </div>
            )}
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportManagerial() {
  const [month, setMonth] = useState(getCurrentMonth());
  const prevMonth = getPreviousMonth(month);

  // Dados do mês atual
  const { data: topProducts = [], isLoading: loadingTop, refetch: refetchTop } = trpc.inove.getTopProductsInove.useQuery(
    { referenceMonth: month, limit: 10 },
    { refetchInterval: 5 * 60 * 1000 }
  );
  // Dados do mês anterior para comparação
  const { data: prevTopProducts = [] } = trpc.inove.getTopProductsInove.useQuery(
    { referenceMonth: prevMonth, limit: 10 },
    { refetchInterval: 5 * 60 * 1000 }
  );

  const { data: payments = [], isLoading: loadingPay } = trpc.inove.getPaymentMethodsInove.useQuery(
    { referenceMonth: month },
    { refetchInterval: 5 * 60 * 1000 }
  );
  const { data: prevPayments = [] } = trpc.inove.getPaymentMethodsInove.useQuery(
    { referenceMonth: prevMonth },
    { refetchInterval: 5 * 60 * 1000 }
  );

  const { data: evolution = [] } = trpc.inove.getMonthlySalesEvolutionInove.useQuery();

  // Cálculos
  const currentProducts = topProducts.map((r: any) => ({
    nome: r.nome ?? r.productName ?? "",
    qtd: Number(r.qtd ?? r.totalQty ?? 0),
    faturamento: Number(r.faturamento ?? r.totalRevenue ?? 0),
  }));
  const prevProducts = prevTopProducts.map((r: any) => ({
    nome: r.nome ?? r.productName ?? "",
    qtd: Number(r.qtd ?? r.totalQty ?? 0),
    faturamento: Number(r.faturamento ?? r.totalRevenue ?? 0),
  }));

  const currentPayments = payments.map((r: any) => ({
    forma: r.paymentMethod ?? r.forma ?? "",
    total: Number(r.totalAmount ?? r.total ?? 0),
    qtd: Number(r.transactionCount ?? r.qtdVendas ?? 0),
  }));
  const prevPaymentsData = prevPayments.map((r: any) => ({
    forma: r.paymentMethod ?? r.forma ?? "",
    total: Number(r.totalAmount ?? r.total ?? 0),
    qtd: Number(r.transactionCount ?? r.qtdVendas ?? 0),
  }));

  const receitaAtual = currentProducts.reduce((s, r) => s + r.faturamento, 0);
  const receitaAnterior = prevProducts.reduce((s, r) => s + r.faturamento, 0);
  const vendasAtual = currentPayments.reduce((s, p) => s + p.qtd, 0);
  const vendasAnterior = prevPaymentsData.reduce((s, p) => s + p.qtd, 0);
  const ticketAtual = vendasAtual > 0 ? receitaAtual / vendasAtual : 0;
  const ticketAnterior = vendasAnterior > 0 ? receitaAnterior / vendasAnterior : 0;

  const trendReceita = receitaAnterior > 0 ? ((receitaAtual - receitaAnterior) / receitaAnterior) * 100 : 0;
  const trendVendas = vendasAnterior > 0 ? ((vendasAtual - vendasAnterior) / vendasAnterior) * 100 : 0;
  const trendTicket = ticketAnterior > 0 ? ((ticketAtual - ticketAnterior) / ticketAnterior) * 100 : 0;

  const totalPagamentos = currentPayments.reduce((s, p) => s + p.total, 0);

  const evolutionData = evolution.map((r: any) => ({
    month: r.month ?? r.referenceMonth ?? "",
    totalRevenue: Number(r.totalRevenue ?? 0),
    transactionCount: Number(r.transactionCount ?? 0),
    ticketMedio: Number(r.ticketMedio ?? 0),
  }));

  const isLoading = loadingTop || loadingPay;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <BackButton to="/dashboard" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-indigo-500" />
              Relatório Gerencial
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visão executiva com KPIs e comparativos mensais
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {getMonthOptions().map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => refetchTop()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Badge variant="outline" className="text-xs">PDV INOVE</Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando dados gerenciais...</div>
        ) : (
          <>
            {/* KPIs com comparativo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                title="Receita do Mês"
                value={fmt(receitaAtual)}
                icon={TrendingUp}
                color="bg-green-500"
                trend={receitaAnterior > 0 ? { value: trendReceita, label: "vs mês anterior" } : undefined}
              />
              <KpiCard
                title="Total de Vendas"
                value={fmtQty(vendasAtual)}
                icon={ShoppingCart}
                color="bg-blue-500"
                trend={vendasAnterior > 0 ? { value: trendVendas, label: "vs mês anterior" } : undefined}
              />
              <KpiCard
                title="Ticket Médio"
                value={fmt(ticketAtual)}
                icon={DollarSign}
                color="bg-amber-500"
                trend={ticketAnterior > 0 ? { value: trendTicket, label: "vs mês anterior" } : undefined}
              />
              <KpiCard
                title="Formas de Pagamento"
                value={String(currentPayments.length)}
                sub={`Maior: ${currentPayments.length > 0 ? currentPayments.sort((a, b) => b.total - a.total)[0]?.forma : "—"}`}
                icon={CreditCard}
                color="bg-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top 10 Produtos */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Top 10 Produtos — {monthLabel(month)}</CardTitle>
                  {currentProducts.length > 0 && (
                    <button
                      onClick={() => exportToExcel(currentProducts.map((r, i) => ({ "#": i + 1, Produto: r.nome, Qtd: r.qtd, "Receita (R$)": r.faturamento.toFixed(2) })), `Gerencial_Top10_${month}`, "Top10")}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs border hover:bg-muted"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  )}
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={currentProducts} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={130} tickFormatter={(v: string) => v?.substring(0, 16)} />
                      <Tooltip formatter={(v: number) => [fmt(v), "Receita"]} />
                      <Bar dataKey="faturamento" radius={[0, 4, 4, 0]}>
                        {currentProducts.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Formas de Pagamento */}
              <Card>
                <CardHeader><CardTitle className="text-base">Formas de Pagamento — {monthLabel(month)}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={currentPayments} dataKey="total" nameKey="forma" cx="50%" cy="50%" outerRadius={90} label={({ forma, percent }) => `${forma} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {currentPayments.map((p, i) => <Cell key={i} fill={PAYMENT_COLORS[p.forma] || CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-4 space-y-2">
                    {currentPayments.sort((a, b) => b.total - a.total).map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[p.forma] || CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span>{p.forma}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-xs">{fmt(p.total)}</span>
                          <span className="text-muted-foreground text-xs">{totalPagamentos > 0 ? ((p.total / totalPagamentos) * 100).toFixed(1) : 0}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Evolução Mensal */}
            {evolutionData.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Evolução Mensal (Receita e Ticket Médio)</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Receita por Mês</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={evolutionData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => [fmt(v), "Receita"]} labelFormatter={monthLabel} />
                          <Bar dataKey="totalRevenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Ticket Médio por Mês</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={evolutionData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={(v: number) => `R$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => [fmt(v), "Ticket Médio"]} labelFormatter={monthLabel} />
                          <Line type="monotone" dataKey="ticketMedio" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
