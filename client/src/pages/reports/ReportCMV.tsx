import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp, Package, DollarSign, AlertTriangle, Search, Download, RefreshCw,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { exportToExcel } from "@/lib/exportExcel";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
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

export default function ReportCMV() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"revenue" | "margin" | "profit">("revenue");

  const { data: rawData = [], isLoading, refetch } = trpc.inove.getCostVsSalesInove.useQuery(
    { referenceMonth: month },
    { refetchInterval: 5 * 60 * 1000 }
  );

  const fonte = rawData.length > 0 ? (rawData[0] as any).fonte : null;

  const data = useMemo(() => {
    const mapped = rawData.map((r: any) => ({
      productId: r.productId ?? 0,
      productName: r.productName ?? "",
      costPrice: Number(r.costPrice ?? 0),
      avgSalePrice: Number(r.avgSalePrice ?? 0),
      totalQty: Number(r.totalQty ?? 0),
      totalRevenue: Number(r.totalRevenue ?? 0),
      totalCost: Number(r.totalCost ?? 0),
      grossProfit: Number(r.grossProfit ?? 0),
      margin: Number(r.margin ?? 0),
    }));

    const filtered = mapped.filter(r =>
      !search || r.productName.toLowerCase().includes(search.toLowerCase())
    );

    filtered.sort((a, b) => {
      if (sortBy === "margin") return b.margin - a.margin;
      if (sortBy === "profit") return b.grossProfit - a.grossProfit;
      return b.totalRevenue - a.totalRevenue;
    });

    return filtered;
  }, [rawData, search, sortBy]);

  const withCost = data.filter(r => r.costPrice > 0);
  const withoutCost = data.filter(r => r.costPrice === 0);

  const totalReceita = data.reduce((s, r) => s + r.totalRevenue, 0);
  const totalCMV = withCost.reduce((s, r) => s + r.totalCost, 0);
  const totalLucro = withCost.reduce((s, r) => s + r.grossProfit, 0);
  const margemGeral = totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0;

  const top10Margin = [...withCost].sort((a, b) => b.margin - a.margin).slice(0, 10);

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
        <BackButton to="/dashboard" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-green-600" />
              Relatório de CMV
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Custo de Mercadoria Vendida — análise de margem por produto
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {getMonthOptions().map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <button onClick={() => refetch()} className="p-2 rounded-lg border hover:bg-muted">
              <RefreshCw className="w-4 h-4" />
            </button>
            {fonte && (
              <Badge variant={fonte === "inove" ? "default" : "outline"} className="text-xs">
                {fonte === "inove" ? "INOVE" : "Local"}
              </Badge>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando dados de CMV...</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <KpiCard title="Receita Total" value={fmt(totalReceita)} icon={TrendingUp} color="bg-green-500" />
              <KpiCard
                title="CMV Total"
                value={fmt(totalCMV)}
                sub={`${fmtPct(totalReceita > 0 ? (totalCMV / totalReceita) * 100 : 0)} da receita`}
                icon={Package}
                color="bg-orange-500"
              />
              <KpiCard
                title="Lucro Bruto"
                value={fmt(totalLucro)}
                sub={`Margem ${fmtPct(margemGeral)}`}
                icon={DollarSign}
                color="bg-blue-500"
              />
              <KpiCard
                title="Sem Custo"
                value={String(withoutCost.length)}
                sub="produtos — margem não calculada"
                icon={AlertTriangle}
                color="bg-red-400"
              />
            </div>

            {/* Gráfico Top 10 Margem */}
            {top10Margin.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Top 10 — Margem Bruta por Produto (%)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={top10Margin} margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="productName" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v?.substring(0, 14)} />
                      <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Margem"]} />
                      <Bar dataKey="margin" radius={[4, 4, 0, 0]}>
                        {top10Margin.map((entry, i) => (
                          <Cell key={i} fill={entry.margin >= 50 ? "#10b981" : entry.margin >= 30 ? "#f59e0b" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Tabela detalhada */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                  <CardTitle className="text-base">Detalhamento por Produto ({data.length})</CardTitle>
                  <div className="flex gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Buscar produto..." className="pl-8 h-9 w-48" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                      <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="revenue">Por Receita</SelectItem>
                        <SelectItem value="margin">Por Margem</SelectItem>
                        <SelectItem value="profit">Por Lucro</SelectItem>
                      </SelectContent>
                    </Select>
                    {data.length > 0 && (
                      <button
                        onClick={() => {
                          const rows = data.map(r => ({
                            "Produto": r.productName,
                            "Qtd Vendida": r.totalQty,
                            "Preço Médio (R$)": r.avgSalePrice.toFixed(2),
                            "Custo Unit. (R$)": r.costPrice > 0 ? r.costPrice.toFixed(2) : "—",
                            "Receita (R$)": r.totalRevenue.toFixed(2),
                            "CMV (R$)": r.costPrice > 0 ? r.totalCost.toFixed(2) : "—",
                            "Lucro Bruto (R$)": r.costPrice > 0 ? r.grossProfit.toFixed(2) : "—",
                            "Margem (%)": r.costPrice > 0 ? r.margin.toFixed(1) : "—",
                          }));
                          exportToExcel(rows, `CMV_${month}`, "CMV");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border hover:bg-muted"
                      >
                        <Download className="w-3.5 h-3.5" /> Excel
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-xs sm:text-sm min-w-[600px]">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-2 sm:px-4 font-medium whitespace-nowrap">Produto</th>
                        <th className="text-right py-2 px-1 sm:px-3 font-medium">Qtd</th>
                        <th className="text-right py-2 px-1 sm:px-3 font-medium hidden sm:table-cell">Preço Médio</th>
                        <th className="text-right py-2 px-1 sm:px-3 font-medium hidden sm:table-cell">Custo Unit.</th>
                        <th className="text-right py-2 px-1 sm:px-3 font-medium">Receita</th>
                        <th className="text-right py-2 px-1 sm:px-3 font-medium">CMV</th>
                        <th className="text-right py-2 px-1 sm:px-3 font-medium">Lucro Bruto</th>
                        <th className="text-right py-2 px-1 sm:px-3 font-medium">Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.length === 0 && (
                        <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado para o período.</td></tr>
                      )}
                      {data.map((r, i) => (
                        <tr key={i} className={`border-b hover:bg-muted/30 ${r.costPrice === 0 ? "opacity-60" : ""}`}>
                          <td className="py-2 px-2 sm:px-4 max-w-[120px] sm:max-w-[200px] truncate font-medium">{r.productName}</td>
                          <td className="py-2 px-1 sm:px-3 text-right font-mono text-xs">{fmtQty(r.totalQty)}</td>
                          <td className="py-2 px-1 sm:px-3 text-right font-mono text-xs hidden sm:table-cell">{fmt(r.avgSalePrice)}</td>
                          <td className="py-2 px-1 sm:px-3 text-right font-mono text-xs hidden sm:table-cell">
                            {r.costPrice > 0 ? fmt(r.costPrice) : <span className="text-red-400">Sem custo</span>}
                          </td>
                          <td className="py-2 px-1 sm:px-3 text-right font-mono text-xs text-green-600 font-semibold">{fmt(r.totalRevenue)}</td>
                          <td className="py-2 px-1 sm:px-3 text-right font-mono text-xs">{r.costPrice > 0 ? fmt(r.totalCost) : "—"}</td>
                          <td className="py-2 px-1 sm:px-3 text-right font-mono text-xs font-semibold">
                            {r.costPrice > 0 ? (
                              <span className={r.grossProfit >= 0 ? "text-green-600" : "text-red-500"}>{fmt(r.grossProfit)}</span>
                            ) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs">
                            {r.costPrice > 0 ? (
                              <Badge variant={r.margin >= 50 ? "default" : r.margin >= 30 ? "secondary" : "destructive"} className="text-xs">
                                {fmtPct(r.margin)}
                              </Badge>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Alerta de produtos sem custo */}
            {withoutCost.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">
                        {withoutCost.length} produto(s) sem custo cadastrado
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        A margem desses produtos não pode ser calculada. Cadastre o custo no PDV INOVE para análise completa.
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {withoutCost.slice(0, 10).map((r, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{r.productName}</Badge>
                        ))}
                        {withoutCost.length > 10 && (
                          <Badge variant="outline" className="text-xs">+{withoutCost.length - 10} mais</Badge>
                        )}
                      </div>
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
