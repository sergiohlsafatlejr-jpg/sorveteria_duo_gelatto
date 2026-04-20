import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package,
  CreditCard, BarChart2, Search, Warehouse, AlertTriangle, CheckCircle2, Clock, Download,
} from "lucide-react";
import { exportToExcel } from "@/lib/exportExcel";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PAYMENT_COLORS: Record<string, string> = {
  "C. DEBITO": "#6366f1",
  "C. CREDITO": "#f59e0b",
  "PIX": "#10b981",
  "DINHEIRO": "#3b82f6",
  "CORTESIA": "#ec4899",
};
const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];

function fmt(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v: number | null | undefined) {
  return `${Number(v || 0).toFixed(1)}%`;
}
function fmtQty(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTHS_PT[parseInt(mo) - 1]}/${y}`;
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

// ─── Aba: Custo x Venda ───────────────────────────────────────────────────────
function CostVsSalesTab({ referenceMonth }: { referenceMonth?: string }) {
  const { data = [], isLoading } = trpc.reports.costVsSales.useQuery({ referenceMonth });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"revenue" | "margin" | "profit">("revenue");

  const filtered = useMemo(() => {
    return [...data]
      .filter((r) => r.productName?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === "revenue") return b.totalRevenue - a.totalRevenue;
        if (sortBy === "margin") return b.margin - a.margin;
        return b.grossProfit - a.grossProfit;
      });
  }, [data, search, sortBy]);

  const withCost = filtered.filter((r) => r.costPrice > 0);
  const withoutCost = filtered.filter((r) => r.costPrice === 0);
  const totalRevenue = data.reduce((s, r) => s + r.totalRevenue, 0);
  const totalCMV = data.reduce((s, r) => s + r.totalCost, 0);
  const totalProfit = data.reduce((s, r) => s + r.grossProfit, 0);

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Receita Total" value={fmt(totalRevenue)} icon={TrendingUp} color="bg-green-500" />
        <KpiCard title="CMV Total" value={fmt(totalCMV)} sub={`${fmtPct(totalRevenue > 0 ? (totalCMV / totalRevenue) * 100 : 0)} da receita`} icon={Package} color="bg-orange-500" />
        <KpiCard title="Lucro Bruto" value={fmt(totalProfit)} sub={`Margem ${fmtPct(totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0)}`} icon={DollarSign} color="bg-blue-500" />
        <KpiCard title="Sem custo cadastrado" value={String(withoutCost.length)} sub="produtos — margem não calculada" icon={Package} color="bg-red-400" />
      </div>

      {withCost.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 — Margem Bruta por Produto (%)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={withCost.slice(0, 10)} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="productName" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v?.substring(0, 14)} />
                <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Margem"]} />
                <Bar dataKey="margin" radius={[4, 4, 0, 0]}>
                  {withCost.slice(0, 10).map((entry, i) => (
                    <Cell key={i} fill={Number(entry.margin) >= 40 ? "#10b981" : Number(entry.margin) >= 20 ? "#f59e0b" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <CardTitle className="text-base">Detalhamento por Produto ({filtered.length})</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar produto..." className="pl-8 h-9 w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Por Receita</SelectItem>
                  <SelectItem value="margin">Por Margem</SelectItem>
                  <SelectItem value="profit">Por Lucro</SelectItem>
                </SelectContent>
              </Select>
              {filtered.length > 0 && (
                <button
                  onClick={() => {
                    const rows = filtered.map((r: any) => ({
                      "Produto": r.productName,
                      "Qtd Vendida": r.totalQty,
                      "Preço Médio (R$)": parseFloat(Number(r.avgSalePrice).toFixed(2)),
                      "Custo Unit. (R$)": r.costPrice > 0 ? parseFloat(Number(r.costPrice).toFixed(2)) : "",
                      "Receita (R$)": parseFloat(Number(r.totalRevenue).toFixed(2)),
                      "CMV (R$)": r.costPrice > 0 ? parseFloat(Number(r.totalCost).toFixed(2)) : "",
                      "Lucro Bruto (R$)": r.costPrice > 0 ? parseFloat(Number(r.grossProfit).toFixed(2)) : "",
                      "Margem (%)": r.costPrice > 0 ? parseFloat(Number(r.margin).toFixed(1)) : "",
                    }));
                    exportToExcel(rows, `Custo_x_Venda_${new Date().toISOString().slice(0,10)}`, "Custo x Venda");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar Excel
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-2 px-4 font-medium">Produto</th>
                  <th className="text-right py-2 px-3 font-medium">Qtd</th>
                  <th className="text-right py-2 px-3 font-medium">Preço Médio</th>
                  <th className="text-right py-2 px-3 font-medium">Custo Unit.</th>
                  <th className="text-right py-2 px-3 font-medium">Receita</th>
                  <th className="text-right py-2 px-3 font-medium">CMV</th>
                  <th className="text-right py-2 px-3 font-medium">Lucro Bruto</th>
                  <th className="text-right py-2 px-3 font-medium">Margem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.productId} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-4 max-w-[200px] truncate">{r.productName}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmtQty(r.totalQty)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmt(r.avgSalePrice)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      {r.costPrice > 0 ? fmt(r.costPrice) : <span className="text-red-400 text-xs">sem custo</span>}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-green-600">{fmt(r.totalRevenue)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-orange-500">{r.costPrice > 0 ? fmt(r.totalCost) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      {r.costPrice > 0 ? (
                        <span className={r.grossProfit >= 0 ? "text-green-600" : "text-red-500"}>{fmt(r.grossProfit)}</span>
                      ) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {r.costPrice > 0 ? (
                        <Badge variant="outline" className={
                          r.margin >= 40 ? "border-green-500 text-green-600" :
                          r.margin >= 20 ? "border-yellow-500 text-yellow-600" :
                          "border-red-400 text-red-500"
                        }>
                          {fmtPct(r.margin)}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Aba: Produtos Mais Vendidos ──────────────────────────────────────────────
function TopProductsTab({ referenceMonth }: { referenceMonth?: string }) {
  const { data = [], isLoading } = trpc.reports.topProducts.useQuery({ referenceMonth, limit: 30 });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  const top10Revenue = data.slice(0, 10);
  const top10Qty = [...data].sort((a, b) => b.totalQty - a.totalQty).slice(0, 10);
  const totalRevenue = data.reduce((s, r) => s + r.totalRevenue, 0);
  const totalQty = data.reduce((s, r) => s + r.totalQty, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Produtos Analisados" value={String(data.length)} icon={Package} color="bg-blue-500" />
        <KpiCard title="Receita Total" value={fmt(totalRevenue)} icon={TrendingUp} color="bg-green-500" />
        <KpiCard title="Itens Vendidos" value={fmtQty(totalQty)} icon={ShoppingCart} color="bg-purple-500" />
        <KpiCard
          title="Ticket Médio"
          value={fmt(totalQty > 0 ? totalRevenue / totalQty : 0)}
          sub="por unidade vendida"
          icon={DollarSign}
          color="bg-amber-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 — Por Receita</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={top10Revenue} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="productName" tick={{ fontSize: 10 }} width={140} tickFormatter={(v: string) => v?.substring(0, 18)} />
                <Tooltip formatter={(v: number) => [fmt(v), "Receita"]} />
                <Bar dataKey="totalRevenue" radius={[0, 4, 4, 0]}>
                  {top10Revenue.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 — Por Quantidade Vendida</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={top10Qty} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="productName" tick={{ fontSize: 10 }} width={140} tickFormatter={(v: string) => v?.substring(0, 18)} />
                <Tooltip formatter={(v: number) => [fmtQty(v), "Unidades"]} />
                <Bar dataKey="totalQty" radius={[0, 4, 4, 0]}>
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
              onClick={() => {
                const rows = data.map((r: any) => ({
                  "#": r.rank,
                  "Produto": r.productName,
                  "Qtd Vendida": r.totalQty,
                  "Preço Médio (R$)": parseFloat(Number(r.avgSalePrice).toFixed(2)),
                  "Receita Total (R$)": parseFloat(Number(r.totalRevenue).toFixed(2)),
                  "Lucro Bruto (R$)": r.costPrice > 0 ? parseFloat(Number(r.grossProfit).toFixed(2)) : "",
                  "Margem (%)": r.costPrice > 0 ? parseFloat(Number(r.margin).toFixed(1)) : "",
                }));
                exportToExcel(rows, `Ranking_Produtos_${new Date().toISOString().slice(0,10)}`, "Mais Vendidos");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Exportar Excel
            </button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-center py-2 px-3 font-medium w-12">#</th>
                  <th className="text-left py-2 px-4 font-medium">Produto</th>
                  <th className="text-right py-2 px-3 font-medium">Qtd Vendida</th>
                  <th className="text-right py-2 px-3 font-medium">Preço Médio</th>
                  <th className="text-right py-2 px-3 font-medium">Receita Total</th>
                  <th className="text-right py-2 px-3 font-medium">Lucro Bruto</th>
                  <th className="text-right py-2 px-3 font-medium">Margem</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.productId} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 text-center">
                      <span className={`font-bold text-xs ${r.rank <= 3 ? "text-amber-500" : "text-muted-foreground"}`}>
                        {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}
                      </span>
                    </td>
                    <td className="py-2 px-4 max-w-[200px] truncate font-medium">{r.productName}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmtQty(r.totalQty)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmt(r.avgSalePrice)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-green-600 font-semibold">{fmt(r.totalRevenue)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      {r.costPrice > 0 ? (
                        <span className={r.grossProfit >= 0 ? "text-green-600" : "text-red-500"}>{fmt(r.grossProfit)}</span>
                      ) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {r.costPrice > 0 ? (
                        <Badge variant="outline" className={
                          r.margin >= 40 ? "border-green-500 text-green-600" :
                          r.margin >= 20 ? "border-yellow-500 text-yellow-600" :
                          "border-red-400 text-red-500"
                        }>
                          {fmtPct(r.margin)}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">sem custo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Aba: Formas de Pagamento ─────────────────────────────────────────────────
function PaymentMethodsTab({ referenceMonth }: { referenceMonth?: string }) {
  const { data = [], isLoading } = trpc.reports.paymentMethods.useQuery({ referenceMonth });
  const { data: evolution = [] } = trpc.reports.monthlySalesEvolution.useQuery();

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  const totalRevenue = data.reduce((s, r) => s + r.totalAmount, 0);
  const totalTransactions = data.reduce((s, r) => s + r.transactionCount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Receita Total" value={fmt(totalRevenue)} icon={TrendingUp} color="bg-green-500" />
        <KpiCard title="Total Transações" value={fmtQty(totalTransactions)} icon={ShoppingCart} color="bg-blue-500" />
        <KpiCard
          title="Ticket Médio"
          value={fmt(totalTransactions > 0 ? totalRevenue / totalTransactions : 0)}
          sub="por transação"
          icon={DollarSign}
          color="bg-purple-500"
        />
        <KpiCard title="Formas de Pagamento" value={String(data.length)} icon={CreditCard} color="bg-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Forma de Pagamento</CardTitle></CardHeader>
          <CardContent>
            {data.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Nenhum dado de caixa importado para o período selecionado.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={data} dataKey="totalAmount" nameKey="paymentMethod" cx="50%" cy="50%" outerRadius={90}
                    label={({ paymentMethod, percentage }: { paymentMethod: string; percentage: number }) => `${paymentMethod}: ${percentage}%`}>
                    {data.map((entry, i) => (
                      <Cell key={i} fill={PAYMENT_COLORS[entry.paymentMethod] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmt(v), "Valor"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Detalhamento</CardTitle>
            {data.length > 0 && (
              <button
                onClick={() => {
                  const rows = data.map((r: any) => ({
                    "Forma de Pagamento": r.paymentMethod,
                    "Valor Total (R$)": parseFloat(Number(r.totalAmount).toFixed(2)),
                    "% do Total": parseFloat(Number(r.percentage).toFixed(1)),
                    "Transações": r.transactionCount,
                    "Ticket Médio (R$)": r.transactionCount > 0 ? parseFloat((Number(r.totalAmount) / r.transactionCount).toFixed(2)) : 0,
                  }));
                  exportToExcel(rows, `Formas_Pagamento_${new Date().toISOString().slice(0,10)}`, "Formas de Pagamento");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Exportar Excel
              </button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {data.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
                Importe o arquivo de caixa junto com as vendas para ver as formas de pagamento.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-2 px-4 font-medium">Forma</th>
                    <th className="text-right py-2 px-3 font-medium">Valor</th>
                    <th className="text-right py-2 px-3 font-medium">%</th>
                    <th className="text-right py-2 px-3 font-medium">Transações</th>
                    <th className="text-right py-2 px-3 font-medium">Ticket Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.paymentMethod} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-4 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ background: PAYMENT_COLORS[r.paymentMethod] || "#6b7280" }} />
                        {r.paymentMethod}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs font-semibold">{fmt(r.totalAmount)}</td>
                      <td className="py-2 px-3 text-right">
                        <Badge variant="outline">{fmtPct(r.percentage)}</Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs">{fmtQty(r.transactionCount)}</td>
                      <td className="py-2 px-3 text-right font-mono text-xs">
                        {fmt(r.transactionCount > 0 ? r.totalAmount / r.transactionCount : 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {evolution.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Evolução Mensal de Vendas</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={evolution} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="referenceMonth" tickFormatter={monthLabel} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [fmt(v), "Receita"]} labelFormatter={monthLabel} />
                <Line type="monotone" dataKey="totalRevenue" stroke="#6366f1" strokeWidth={2} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Aba: Estoque Gerencial ──────────────────────────────────────────────────
function StockGerencialTab() {
  const { data: summary, isLoading: loadingSummary } = trpc.reports.stockSummary.useQuery();
  const { data: purchased = [], isLoading: loadingPurchased } = trpc.reports.mostPurchased.useQuery({ limit: 30 });
  const { data: turnover = [], isLoading: loadingTurnover } = trpc.reports.stockTurnover.useQuery();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "critico" | "baixo" | "ok">("all");
  const [view, setView] = useState<"compras" | "giro">("giro");

  const filteredTurnover = useMemo(() => {
    return turnover
      .filter((r) => {
        const matchSearch = r.productName?.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === "all" || r.stockStatus === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => b.totalQtySold - a.totalQtySold);
  }, [turnover, search, statusFilter]);

  const statusBadge = (s: string) => {
    if (s === "critico") return <Badge variant="destructive" className="text-[10px]">Crítico</Badge>;
    if (s === "baixo") return <Badge className="text-[10px] bg-amber-500">Baixo</Badge>;
    if (s === "sem_estoque") return <Badge variant="outline" className="text-[10px] border-red-400 text-red-500">Zerado</Badge>;
    return <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">OK</Badge>;
  };

  const coverageColor = (days: number) =>
    days < 7 ? "text-red-500" : days < 15 ? "text-amber-500" : "text-green-600";

  if (loadingSummary || loadingTurnover) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* KPIs de estoque */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="Valor em Estoque (Custo)" value={fmt(summary.totalStockValue)} sub="Custo total dos produtos" icon={Warehouse} color="bg-indigo-500" />
          <KpiCard title="Valor em Estoque (Venda)" value={fmt(summary.totalSaleValue)} sub={`Lucro potencial: ${fmt(summary.potentialProfit)}`} icon={TrendingUp} color="bg-green-500" />
          <KpiCard title="Estoque Crítico" value={String(summary.lowStockCount)} sub="produtos abaixo do mínimo" icon={AlertTriangle} color="bg-red-500" />
          <KpiCard title="Sem Custo Cadastrado" value={String(summary.totalProducts - summary.withCostCount)} sub="produtos sem preço de custo" icon={Package} color="bg-amber-500" />
        </div>
      )}

      {/* Seletor de visão */}
      <div className="flex gap-2">
        <button
          onClick={() => setView("giro")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            view === "giro" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Giro + Cobertura
        </button>
        <button
          onClick={() => setView("compras")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            view === "compras" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Mais Comprados (NF-e)
        </button>
      </div>

      {view === "compras" && (
        <>
          {/* Gráfico top 10 mais comprados */}
          {purchased.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 Produtos Mais Comprados (Qtd. Entrada)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={purchased.slice(0, 10)} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="productName" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v?.substring(0, 14)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [fmtQty(v), "Unidades compradas"]} />
                    <Bar dataKey="totalQtyIn" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Produtos Mais Comprados via NF-e ({purchased.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium">#</th>
                      <th className="text-left px-4 py-3 font-medium">Produto</th>
                      <th className="text-right px-4 py-3 font-medium">Qtd. Comprada</th>
                      <th className="text-right px-4 py-3 font-medium">Custo Total</th>
                      <th className="text-right px-4 py-3 font-medium">Custo Unit.</th>
                      <th className="text-right px-4 py-3 font-medium">Estoque Atual</th>
                      <th className="text-right px-4 py-3 font-medium">Entradas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchased.map((r, i) => (
                      <tr key={r.productId} className="border-b hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium">{r.productName}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtQty(r.totalQtyIn)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(r.totalCostIn)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(r.costPrice)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtQty(r.currentStock)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.movCount}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {view === "giro" && (
        <>
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar produto..." className="pl-8 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="critico">Crítico</SelectItem>
                <SelectItem value="baixo">Baixo</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Giro de Estoque + Cobertura ({filteredTurnover.length} produtos)</CardTitle>
              <p className="text-xs text-muted-foreground">Cobertura = dias estimados de estoque com base nas vendas. Giro = qtd vendida ÷ estoque atual.</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium">Produto</th>
                      <th className="text-right px-4 py-3 font-medium">Estoque</th>
                      <th className="text-right px-4 py-3 font-medium">Qtd Vendida</th>
                      <th className="text-right px-4 py-3 font-medium">Qtd Comprada</th>
                      <th className="text-right px-4 py-3 font-medium">Giro</th>
                      <th className="text-right px-4 py-3 font-medium">Cobertura</th>
                      <th className="text-right px-4 py-3 font-medium">Margem</th>
                      <th className="text-center px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTurnover.map((r) => (
                      <tr key={r.productId} className="border-b hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{r.productName}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtQty(r.currentStock)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtQty(r.totalQtySold)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtQty(r.totalQtyIn)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {r.turnover > 0 ? (
                            <span className={r.turnover >= 2 ? "text-green-600 font-medium" : "text-amber-500"}>{r.turnover.toFixed(1)}x</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${coverageColor(r.coverageDays)}`}>
                          {r.coverageDays >= 999 ? "∞" : `${r.coverageDays}d`}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {r.totalQtySold > 0 ? (
                            <span className={r.margin >= 30 ? "text-green-600" : r.margin >= 15 ? "text-amber-500" : "text-red-500"}>
                              {fmtPct(r.margin)}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">{statusBadge(r.stockStatus)}</td>
                      </tr>
                    ))}
                    {filteredTurnover.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado</td></tr>
                    )}
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

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function GerencialReports() {
  const { data: months = [] } = trpc.reports.availableMonths.useQuery();
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const refMonth = selectedMonth === "all" ? undefined : selectedMonth;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <BackButton to="/dashboard" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-indigo-500" />
              Relatórios Gerenciais
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Análise de desempenho, custo, margem e formas de pagamento
            </p>
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Selecionar mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="estoque">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="estoque">Estoque Gerencial</TabsTrigger>
            <TabsTrigger value="custo">Custo x Venda</TabsTrigger>
            <TabsTrigger value="ranking">Mais Vendidos</TabsTrigger>
            <TabsTrigger value="pagamentos">Formas de Pagamento</TabsTrigger>
          </TabsList>

          <TabsContent value="estoque" className="mt-6">
            <StockGerencialTab />
          </TabsContent>
          <TabsContent value="custo" className="mt-6">
            <CostVsSalesTab referenceMonth={refMonth} />
          </TabsContent>
          <TabsContent value="ranking" className="mt-6">
            <TopProductsTab referenceMonth={refMonth} />
          </TabsContent>
          <TabsContent value="pagamentos" className="mt-6">
            <PaymentMethodsTab referenceMonth={refMonth} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
