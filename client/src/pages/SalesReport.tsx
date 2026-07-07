import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, ArrowLeft, BarChart2,
  Package, DollarSign, ShoppingCart, RefreshCw, Database, AlertCircle,
  CalendarDays, FileSpreadsheet, TrendingUp as TrendUp, Percent
} from "lucide-react";
import { Link } from "wouter";
import { exportToExcel, exportToExcelMultiSheet } from "@/lib/exportExcel";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtQty(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function getPrevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(m: string): string {
  if (!m) return "—";
  const [y, mo] = m.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(mo) - 1]}/${y}`;
}

// Gera lista dos últimos 12 meses no formato yyyy-MM
function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

const COLORS = [
  "#7c3aed", "#ec4899", "#f97316", "#06b6d4", "#10b981",
  "#f59e0b", "#3b82f6", "#84cc16", "#ef4444", "#8b5cf6",
];

// ─── Aba: Vendas da Semana ────────────────────────────────────────────────────
function VendasSemanaTab() {
  function toDateStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Inicializar com os últimos 7 dias
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
  const [filtroGrupo, setFiltroGrupo] = useState("__all__");

  const { data, isLoading, error } = trpc.inove.getSalesByPeriodInove.useQuery(
    { from: queryFrom, to: queryTo },
    { enabled: !!queryFrom && !!queryTo, retry: 1 }
  );

  function handleBuscar() {
    setQueryFrom(from);
    setQueryTo(to);
  }

  function setPreset(preset: "today" | "week" | "last7" | "month") {
    const now = new Date();
    if (preset === "today") {
      const s = toDateStr(now);
      setFrom(s); setTo(s);
    } else if (preset === "week") {
      const dow = now.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const mon = new Date(now); mon.setDate(now.getDate() + diff);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      setFrom(toDateStr(mon)); setTo(toDateStr(sun));
    } else if (preset === "last7") {
      const d7 = new Date(now); d7.setDate(now.getDate() - 6);
      setFrom(toDateStr(d7)); setTo(toDateStr(now));
    } else if (preset === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFrom(toDateStr(first)); setTo(toDateStr(last));
    }
  }

  const grupos = useMemo(() => {
    if (!data?.itens) return [];
    return Array.from(new Set(data.itens.map(i => i.grupoNome))).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let items = data?.itens ?? [];
    if (filtroGrupo && filtroGrupo !== "__all__") items = items.filter(i => i.grupoNome === filtroGrupo);
    if (search) items = items.filter(i =>
      i.nome.toLowerCase().includes(search.toLowerCase()) ||
      (i.codPdv ?? "").includes(search)
    );
    return items;
  }, [data, filtroGrupo, search]);

  function fmtDate(s: string) {
    if (!s) return "";
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }

  function handleExport() {
    if (!filtered.length) return;
    exportToExcelMultiSheet(
      [
        {
          name: "Vendas do Período",
          data: filtered.map((item, idx) => ({
            "#": idx + 1,
            "Cód. PDV": item.codPdv ?? "",
            "Produto": item.nome,
            "Grupo": item.grupoNome,
            "Qtd. Vendida": item.totalQty,
            "Preço Médio": fmtBRL(item.precoMedio),
            "Faturamento": fmtBRL(item.totalRevenue),
            "Custo Unit.": item.custoProduto != null ? fmtBRL(item.custoProduto) : "",
            "Custo Total": item.custoTotal != null ? fmtBRL(item.custoTotal) : "",
            "Margem Bruta": item.margemBruta != null ? `${item.margemBruta}%` : "",
          }))
        },
        {
          name: "Resumo",
          data: [{
            "Período": `${fmtDate(queryFrom)} a ${fmtDate(queryTo)}`,
            "Total Produtos": filtered.length,
            "Qtd. Total Vendida": data?.resumo.totalQty ?? 0,
            "Faturamento Total": fmtBRL(data?.resumo.totalRevenue ?? 0),
            "Custo Total": fmtBRL(data?.resumo.totalCusto ?? 0),
            "Margem Bruta": `${data?.resumo.margemGeral ?? 0}%`,
          }]
        }
      ],
      `Vendas_${queryFrom}_a_${queryTo}`
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Data Início</Label>
            <Input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-40 h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Data Fim</Label>
            <Input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-40 h-8 text-sm"
            />
          </div>
          <Button size="sm" onClick={handleBuscar} className="gap-2 h-8">
            <RefreshCw className="h-3.5 w-3.5" />
            Buscar
          </Button>
          <div className="flex gap-1.5 ml-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPreset("today")}>Hoje</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPreset("week")}>Esta Semana</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPreset("last7")}>Últimos 7 dias</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPreset("month")}>Este Mês</Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 mx-auto animate-spin mb-2" />
          Buscando vendas...
        </div>
      ) : error ? (
        <Card className="p-10 text-center">
          <AlertCircle className="h-14 w-14 mx-auto mb-3 text-rose-400" />
          <p className="text-muted-foreground font-medium">Erro ao buscar dados do INOVE</p>
          <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
        </Card>
      ) : !data || filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Package className="h-14 w-14 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nenhuma venda encontrada para o período selecionado.</p>
          <p className="text-xs text-muted-foreground mt-1">Verifique se há vendas no INOVE neste intervalo de datas.</p>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Período
              </p>
              <p className="text-base font-bold text-purple-600">{fmtDate(queryFrom)}</p>
              <p className="text-xs text-muted-foreground">a {fmtDate(queryTo)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Faturamento
              </p>
              <p className="text-xl font-bold">{fmtBRL(data.resumo.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">{data.itens.length} produtos vendidos</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" />
                Qtd. Total
              </p>
              <p className="text-xl font-bold">{data.resumo.totalQty.toLocaleString("pt-BR")}</p>
              <p className="text-xs text-muted-foreground">{data.resumo.totalVendas} vendas</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Percent className="h-3 w-3" />
                Margem Bruta
              </p>
              <p className={`text-xl font-bold ${data.resumo.margemGeral >= 30 ? "text-green-600" : data.resumo.margemGeral >= 15 ? "text-amber-600" : "text-rose-600"}`}>
                {data.resumo.margemGeral}%
              </p>
              <p className="text-xs text-muted-foreground">Custo: {fmtBRL(data.resumo.totalCusto)}</p>
            </Card>
          </div>

          {/* Busca + Filtro Grupo + Exportar */}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Buscar produto ou código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs h-8 text-sm"
            />
            {grupos.length > 0 && (
              <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="Todos os grupos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os grupos</SelectItem>
                  {grupos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="gap-2 text-green-700 border-green-300 hover:bg-green-50 h-8"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </Button>
            <span className="text-xs text-muted-foreground">{filtered.length} produto(s)</span>
          </div>

          {/* Tabela */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium w-8">#</th>
                      <th className="text-left p-3 font-medium">Produto</th>
                      <th className="text-left p-3 font-medium">Cód. PDV</th>
                      <th className="text-right p-3 font-medium">Qtd.</th>
                      <th className="text-right p-3 font-medium">Preço Médio</th>
                      <th className="text-right p-3 font-medium">Faturamento</th>
                      <th className="text-right p-3 font-medium">Custo Unit.</th>
                      <th className="text-right p-3 font-medium">Custo Total</th>
                      <th className="text-right p-3 font-medium">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item, idx) => (
                        <tr key={item.produtoId} className="border-t hover:bg-muted/20">
                          <td className="p-3 text-muted-foreground text-xs">
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
                              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                            >
                              {idx + 1}
                            </span>
                          </td>
                          <td className="p-3">
                            <p className="font-medium">{item.nome}</p>
                            <p className="text-xs text-muted-foreground">{item.grupoNome}</p>
                          </td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{item.codPdv ?? "—"}</td>
                          <td className="p-3 text-right tabular-nums font-semibold">
                            {item.totalQty.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {fmtBRL(item.precoMedio)}
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold">
                            {fmtBRL(item.totalRevenue)}
                          </td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {item.custoProduto != null ? fmtBRL(item.custoProduto) : <span className="text-xs text-muted-foreground/50">—</span>}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {item.custoTotal != null ? fmtBRL(item.custoTotal) : <span className="text-xs text-muted-foreground/50">—</span>}
                          </td>
                          <td className="p-3 text-right">
                            {item.margemBruta != null ? (
                              <Badge
                                className={`text-xs ${
                                  item.margemBruta >= 40 ? "bg-green-500/15 text-green-700 border-green-500/30" :
                                  item.margemBruta >= 20 ? "bg-amber-500/15 text-amber-700 border-amber-500/30" :
                                  "bg-rose-500/15 text-rose-700 border-rose-500/30"
                                }`}
                              >
                                {item.margemBruta}%
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </td>
                        </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t-2">
                    <tr>
                      <td colSpan={3} className="p-3 font-semibold text-sm">Total</td>
                      <td className="p-3 text-right tabular-nums font-semibold">
                        {data.resumo.totalQty.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3"></td>
                      <td className="p-3 text-right tabular-nums font-bold text-purple-600">
                        {fmtBRL(data.resumo.totalRevenue)}
                      </td>
                      <td className="p-3"></td>
                      <td className="p-3 text-right tabular-nums font-semibold">
                        {data.resumo.totalCusto > 0 ? fmtBRL(data.resumo.totalCusto) : "—"}
                      </td>
                      <td className="p-3 text-right">
                        {data.resumo.totalCusto > 0 ? (
                          <Badge className={`text-xs ${
                            data.resumo.margemGeral >= 40 ? "bg-green-500/15 text-green-700 border-green-500/30" :
                            data.resumo.margemGeral >= 20 ? "bg-amber-500/15 text-amber-700 border-amber-500/30" :
                            "bg-rose-500/15 text-rose-700 border-rose-500/30"
                          }`}>{data.resumo.margemGeral}%</Badge>
                        ) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function SalesReport() {
  const currentMonthDefault = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthDefault);
  const activeMonth = selectedMonth || currentMonthDefault;
  const compareMonth = activeMonth ? getPrevMonth(activeMonth) : "";
  const availableMonths = getLast12Months();

  // Fonte primária: INOVE SQL Server
  const { data: inoveData, isLoading: loadingInove, error: inoveError } = trpc.inove.getSalesByProduct.useQuery(
    { month: activeMonth },
    { retry: 1, retryDelay: 500 }
  );

  // Fallback: importações locais confirmadas
  const { data: confirmedMonths } = trpc.salesImport.getConfirmedMonths.useQuery();
  const { data: localReport, isLoading: loadingLocal } = trpc.salesImport.getSalesReport.useQuery(
    { referenceMonth: activeMonth, compareMonth },
    { enabled: !!inoveError && (confirmedMonths?.includes(activeMonth) ?? false) }
  );

  const isLoading = loadingInove || (!!inoveError && loadingLocal);
  const usingInove = !inoveError && !!inoveData;
  const usingLocal = !!inoveError && !!localReport;

  // Normalizar dados para formato unificado
  type Top10Item = { id: string; name: string; codPdv: string; qty: number; revenue: number; prevRevenue: number | null; prevQty: number | null; variacao: number | null };
  const top10 = useMemo((): Top10Item[] => {
    if (usingInove && inoveData) {
      type InoveItem = { produtoId: number; nome: string; codPdv: string; qtd: number; faturamento: number; faturamentoPrev: number | null; qtdPrev: number | null; variacao: number | null };
      return (inoveData.top10 as InoveItem[]).map(item => ({
        id: String(item.produtoId),
        name: item.nome ?? `Produto ${item.produtoId}`,
        codPdv: item.codPdv ?? String(item.produtoId),
        qty: item.qtd,
        revenue: item.faturamento,
        prevRevenue: item.faturamentoPrev,
        prevQty: item.qtdPrev,
        variacao: item.variacao,
      }));
    }
    if (usingLocal && localReport) {
      const prevMap: Record<string, { totalRevenue: number; totalQuantity: number }> = {};
      for (const p of localReport.previous ?? []) {
        prevMap[p.externalCode] = { totalRevenue: p.totalRevenue, totalQuantity: p.totalQuantity };
      }
      return (localReport.current ?? []).slice(0, 10).map(item => {
        const prev = prevMap[item.externalCode];
        const variacao = prev && prev.totalRevenue > 0
          ? ((item.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100
          : null;
        return {
          id: item.externalCode,
          name: item.productName ?? item.externalName,
          codPdv: item.externalCode,
          qty: item.totalQuantity,
          revenue: item.totalRevenue,
          prevRevenue: prev?.totalRevenue ?? null,
          prevQty: prev?.totalQuantity ?? null,
          variacao,
        };
      });
    }
    return [];
  }, [usingInove, inoveData, usingLocal, localReport]);

  const totalRevenue = top10.reduce((s, i) => s + i.revenue, 0);
  const totalQty = top10.reduce((s, i) => s + i.qty, 0);
  const totalPrevRevenue = top10.reduce((s, i) => s + (i.prevRevenue ?? 0), 0);
  const revenueChange = totalPrevRevenue > 0 ? ((totalRevenue - totalPrevRevenue) / totalPrevRevenue) * 100 : null;
  const totalProdutos = usingInove ? (inoveData?.totalProdutos ?? 0) : (localReport?.current?.length ?? 0);

  const chartData = top10.map((item, idx) => ({
    name: (item.name ?? "").substring(0, 20),
    fullName: item.name,
    atual: item.revenue,
    anterior: item.prevRevenue ?? 0,
    color: COLORS[idx % COLORS.length],
  }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2">
        <Link href="/sales/import">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Importação
          </Button>
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart2 className="h-6 w-6 text-purple-600" />
          Relatório de Vendas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Análise de vendas por produto — mensal e por período personalizado.
        </p>
      </div>

      <Tabs defaultValue="mensal">
        <TabsList className="mb-2">
          <TabsTrigger value="mensal" className="gap-2">
            <BarChart2 className="h-4 w-4" />
            Mensal (Top 10)
          </TabsTrigger>
          <TabsTrigger value="semana" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            Vendas da Semana
          </TabsTrigger>
        </TabsList>

        {/* ─── Aba: Mensal ─── */}
        <TabsContent value="mensal" className="space-y-6 mt-4">
          {/* Seletor de mês */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mês:</span>
            <Select value={activeMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Selecionar mês..." />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Badge de fonte dos dados */}
          {!isLoading && (
            <div className="flex items-center gap-2">
              {usingInove ? (
                <Badge className="bg-green-500/15 text-green-700 border-green-500/30 gap-1">
                  <Database className="h-3 w-3" />
                  Dados do PDV INOVE (tempo real)
                </Badge>
              ) : usingLocal ? (
                <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30 gap-1">
                  <Database className="h-3 w-3" />
                  Dados locais (importação)
                </Badge>
              ) : inoveError ? (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1">
                  <AlertCircle className="h-3 w-3" />
                  INOVE indisponível — sem dados locais para este mês
                </Badge>
              ) : null}
            </div>
          )}

          {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 mx-auto animate-spin mb-2" />
          Carregando relatório...
        </div>
      ) : top10.length === 0 ? (
        <Card className="p-12 text-center">
          <BarChart2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">
            Nenhum dado de vendas para {monthLabel(activeMonth)}.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {inoveError
              ? "O conector INOVE está inativo. Confirme uma importação em "
              : "Não há vendas registradas para este período."}
            {inoveError && (
              <Link href="/sales/import" className="text-purple-600 underline">
                Importação de Vendas
              </Link>
            )}
          </p>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Mês Analisado</p>
              <p className="text-xl font-bold text-purple-600">{monthLabel(activeMonth)}</p>
              <p className="text-xs text-muted-foreground">
                {totalProdutos > 0 ? `${totalProdutos} produtos vendidos` : "Top 10 produtos"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Faturamento Top 10
              </p>
              <p className="text-xl font-bold">{fmtBRL(totalRevenue)}</p>
              {revenueChange !== null && (
                <p className={`text-xs flex items-center gap-1 ${revenueChange >= 0 ? "text-green-600" : "text-rose-600"}`}>
                  {revenueChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {revenueChange >= 0 ? "+" : ""}{revenueChange.toFixed(1)}% vs {monthLabel(compareMonth)}
                </p>
              )}
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" />
                Qtd. Vendida (Top 10)
              </p>
              <p className="text-xl font-bold">{fmtQty(totalQty)}</p>
              <p className="text-xs text-muted-foreground">unidades</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3" />
                Mês Comparativo
              </p>
              <p className="text-xl font-bold text-muted-foreground">{compareMonth ? monthLabel(compareMonth) : "—"}</p>
              <p className="text-xs text-muted-foreground">
                {totalPrevRevenue > 0 ? fmtBRL(totalPrevRevenue) : "Sem dados"}
              </p>
            </Card>
          </div>

          {/* Gráfico de barras comparativo */}
          {top10.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Faturamento por Produto — {monthLabel(activeMonth)} vs {compareMonth ? monthLabel(compareMonth) : "Mês Anterior"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        fmtBRL(value),
                        name === "atual" ? monthLabel(activeMonth) : monthLabel(compareMonth),
                      ]}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload;
                        return item?.fullName ?? label;
                      }}
                    />
                    <Legend
                      formatter={(value) =>
                        value === "atual" ? monthLabel(activeMonth) : monthLabel(compareMonth)
                      }
                    />
                    <Bar dataKey="atual" fill="#7c3aed" radius={[4, 4, 0, 0]} name="atual" />
                    <Bar dataKey="anterior" fill="#c4b5fd" radius={[4, 4, 0, 0]} name="anterior" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Tabela detalhada */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4 text-purple-500" />
                Top 10 Produtos — Detalhamento
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium w-8">#</th>
                      <th className="text-left p-3 font-medium">Produto</th>
                      <th className="text-left p-3 font-medium">Cód. PDV</th>
                      <th className="text-right p-3 font-medium">Qtd. Vendida</th>
                      <th className="text-right p-3 font-medium">Faturamento</th>
                      <th className="text-right p-3 font-medium">Mês Anterior</th>
                      <th className="text-center p-3 font-medium">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top10.map((item, idx) => {
                      const diff = item.variacao;
                      return (
                        <tr key={item.id} className="border-t hover:bg-muted/20">
                          <td className="p-3 text-muted-foreground font-mono text-xs">
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
                              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                            >
                              {idx + 1}
                            </span>
                          </td>
                          <td className="p-3">
                            <p className="font-medium">{item.name}</p>
                          </td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">
                            {item.codPdv}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {fmtQty(item.qty)}
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold">
                            {fmtBRL(item.revenue)}
                          </td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {item.prevRevenue != null ? fmtBRL(item.prevRevenue) : "—"}
                          </td>
                          <td className="p-3 text-center">
                            {diff === null ? (
                              <Badge variant="outline" className="text-xs">Novo</Badge>
                            ) : diff > 0 ? (
                              <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                +{diff.toFixed(1)}%
                              </Badge>
                            ) : diff < 0 ? (
                              <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-xs">
                                <TrendingDown className="h-3 w-3 mr-1" />
                                {diff.toFixed(1)}%
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                <Minus className="h-3 w-3 mr-1" />
                                0%
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Produtos além do top 10 */}
          {totalProdutos > 10 && (
            <p className="text-xs text-muted-foreground text-center">
              + {totalProdutos - 10} outros produtos vendidos no período (não exibidos no top 10)
            </p>
          )}
        </>
      )}
        </TabsContent>

        {/* ─── Aba: Vendas da Semana ─── */}
        <TabsContent value="semana" className="mt-4">
          <VendasSemanaTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
