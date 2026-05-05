import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, Search, ShoppingCart, TrendingUp, AlertCircle,
  Package, Download, ChevronUp, ChevronDown, ChevronsUpDown,
  Filter, Wifi, WifiOff, Database, BarChart2, Activity, Zap
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type WeekData = { weekLabel: string; qty: number; revenue: number };
type ProductRow = {
  productId: number;
  productName: string;
  currentStock: number;
  currentStockCalc?: number;
  isNegativeStock?: boolean;
  minStock: number;
  costPrice: number;
  salePrice: number;
  avgQtyPerWeek: number;
  coverageWeeks: number;
  suggestedPurchase: number;
  turnover: number;
  margin: number;
  stockStatus: string;
  totalQtySold: number;
  weekData: WeekData[];
};

// ── Sparkline mini-gráfico ────────────────────────────────────────────────────
function Sparkline({ values, avgPerWeek }: { values: number[]; avgPerWeek: number }) {
  if (!values || values.length === 0) return <span className="text-muted-foreground/30 text-xs">—</span>;
  const max = Math.max(...values, 1);
  const w = 56;
  const h = 24;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * w;
    const y = h - (v / max) * (h - 2) - 1;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  // Linha da média
  const avgY = h - (avgPerWeek / max) * (h - 2) - 1;
  const lastVal = values[values.length - 1];
  const trend = values.length >= 2 ? lastVal - values[values.length - 2] : 0;
  const color = trend > 0 ? "#22c55e" : trend < 0 ? "#f97316" : "#94a3b8";

  return (
    <div className="flex items-center gap-1.5">
      <svg width={w} height={h} className="shrink-0">
        {/* Linha da média */}
        <line x1={0} y1={avgY} x2={w} y2={avgY} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="2,2" />
        {/* Linha do sparkline */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Ponto final */}
        <circle
          cx={parseFloat(pts[pts.length - 1].split(",")[0])}
          cy={parseFloat(pts[pts.length - 1].split(",")[1])}
          r={2.5}
          fill={color}
        />
      </svg>
      <span className={`text-xs font-semibold ${trend > 0 ? "text-green-600" : trend < 0 ? "text-orange-500" : "text-muted-foreground"}`}>
        {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"}
      </span>
    </div>
  );
}

// ── Badge de status ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "negativo") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />Negativo
    </span>
  );
  if (status === "critico") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Crítico
    </span>
  );
  if (status === "sem_estoque") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />Zerado
    </span>
  );
  if (status === "baixo") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />Baixo
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />OK
    </span>
  );
}

// ── Barra de cobertura ────────────────────────────────────────────────────────
function CoverageBar({ weeks }: { weeks: number }) {
  if (weeks >= 99) return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full overflow-hidden">
        <div className="h-full w-full bg-emerald-500 rounded-full" />
      </div>
      <span className="text-xs font-bold text-emerald-600">∞</span>
    </div>
  );
  const pct = Math.min((weeks / 4) * 100, 100);
  const color = weeks < 1 ? "bg-red-500" : weeks < 2 ? "bg-amber-500" : "bg-emerald-500";
  const textColor = weeks < 1 ? "text-red-600" : weeks < 2 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${textColor}`}>{weeks}s</span>
    </div>
  );
}

type SortKey = "productName" | "currentStock" | "avgQtyPerWeek" | "coverageWeeks" | "suggestedPurchase" | "turnover" | "margin";

export default function GiroEstoque() {
  const [weeksBack, setWeeksBack] = useState(6);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "critico" | "baixo" | "ok" | "sem_estoque" | "negativo">("all");
  const [sortKey, setSortKey] = useState<SortKey>("coverageWeeks");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showOnlySuggested, setShowOnlySuggested] = useState(false);

  const query = trpc.inove.getWeeklyStockTurnoverInove.useQuery(
    { weeksBack },
    { staleTime: 5 * 60 * 1000 }
  );

  const rawData = query.data;
  const fonte = (rawData as any)?.fonte ?? "local";
  const weekLabels: string[] = rawData?.weeks ?? [];

  // Normalizar dados: INOVE retorna formato diferente do local
  const allProducts: ProductRow[] = useMemo(() => {
    if (!rawData?.products) return [];
    if (fonte === "inove") {
      return (rawData.products as any[]).map(p => {
        const ws: number[] = p.weekSales ?? [];
        const totalSold = ws.reduce((s: number, v: number) => s + v, 0);
        const estoque = p.estoqueAtual ?? 0;
        return {
          productId: p.produtoId ?? 0,
          productName: p.nome ?? "Produto s/nome",
          currentStock: estoque,
          currentStockCalc: Math.max(0, estoque),
          isNegativeStock: estoque < 0,
          minStock: p.estoqueMinimo ?? 0,
          costPrice: p.costPrice ?? 0,
          salePrice: p.salePrice ?? 0,
          avgQtyPerWeek: p.avgPerWeek ?? 0,
          coverageWeeks: p.cobertura ?? 0,
          suggestedPurchase: p.sugestao ?? 0,
          turnover: p.turnover ?? (totalSold > 0 && estoque > 0 ? parseFloat((totalSold / estoque).toFixed(1)) : totalSold > 0 ? 99 : 0),
          margin: p.margin ?? 0,
          stockStatus: p.status === "zerado" ? "sem_estoque" : (p.status ?? "ok"),
          totalQtySold: totalSold,
          weekData: ws.map((qty: number, i: number) => ({
            weekLabel: weekLabels[i] ?? `Sem ${i + 1}`,
            qty,
            revenue: 0,
          })),
        } as ProductRow;
      });
    }
    return rawData.products as ProductRow[];
  }, [rawData, fonte, weekLabels]);

  const data = rawData ? { weeks: weekLabels, products: allProducts, generatedAt: (rawData as any).generatedAt ?? new Date().toISOString() } : undefined;

  // ── Filtros e ordenação ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = allProducts;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(p => p.productName.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      rows = rows.filter(p => p.stockStatus === statusFilter);
    }
    if (showOnlySuggested) {
      rows = rows.filter(p => p.suggestedPurchase > 0);
    }
    rows = [...rows].sort((a, b) => {
      const va = a[sortKey] as number | string;
      const vb = b[sortKey] as number | string;
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return rows;
  }, [allProducts, search, statusFilter, showOnlySuggested, sortKey, sortDir]);

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalSuggested = filtered.filter(p => p.suggestedPurchase > 0).length;
  const totalNegativo = allProducts.filter(p => p.stockStatus === "negativo").length;
  const totalCritico = allProducts.filter(p => p.stockStatus === "critico" || p.stockStatus === "sem_estoque").length;
  const totalBaixo = allProducts.filter(p => p.stockStatus === "baixo").length;
  const totalOk = allProducts.filter(p => p.stockStatus === "ok").length;
  const estimatedCost = filtered.filter(p => p.suggestedPurchase > 0).reduce((s, p) => s + p.suggestedPurchase * p.costPrice, 0);
  const totalVendidoSemana = allProducts.reduce((s, p) => s + (p.weekData[p.weekData.length - 1]?.qty ?? 0), 0);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-pink-500" />
      : <ChevronDown className="w-3 h-3 text-pink-500" />;
  }

  function exportCSV() {
    const header = ["Produto", "Estoque", "Mín", "Média/Sem", "Cobertura(sem)", "Sugestão Compra", "Giro", "Margem%", "Status",
      ...weekLabels.map(w => `Vend. ${w}`)].join(";");
    const rows = filtered.map(p => [
      p.productName, p.currentStock, p.minStock, p.avgQtyPerWeek, p.coverageWeeks,
      p.suggestedPurchase, p.turnover, p.margin, p.stockStatus,
      ...p.weekData.map(w => w.qty)
    ].join(";"));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `giro_estoque_semanal_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-full">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Giro de Estoque Semanal</h1>
              <p className="text-sm text-muted-foreground">Velocidade de saída · Cobertura · Sugestão de compra</p>
            </div>
          </div>
          {/* Badge de fonte */}
          {rawData && (
            fonte === "inove" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-700">
                <Wifi className="w-3 h-3" /> Dados em tempo real · PDV INOVE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-700">
                <Database className="w-3 h-3" /> Dados locais · Conector INOVE inativo
              </span>
            )
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={String(weeksBack)} onValueChange={v => setWeeksBack(Number(v))}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">Últimas 4 semanas</SelectItem>
              <SelectItem value="6">Últimas 6 semanas</SelectItem>
              <SelectItem value="8">Últimas 8 semanas</SelectItem>
              <SelectItem value="12">Últimas 12 semanas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`w-4 h-4 ${query.isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline text-xs">Atualizar</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportCSV} disabled={!data}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">CSV</span>
          </Button>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Críticos / Zerados */}
        <button
          onClick={() => setStatusFilter(statusFilter === "critico" ? "all" : "critico")}
          className={`text-left rounded-xl border p-4 transition-all hover:shadow-md ${
            statusFilter === "critico"
              ? "border-red-400 bg-red-50 dark:bg-red-950/20"
              : "border-border bg-card hover:border-red-300"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-bold text-red-500 tabular-nums">{totalCritico}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Críticos / Zerados</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
          </div>
          <p className="text-xs text-red-500 mt-1.5 font-medium">Reposição urgente</p>
        </button>

        {/* Estoque Baixo */}
        <button
          onClick={() => setStatusFilter(statusFilter === "baixo" ? "all" : "baixo")}
          className={`text-left rounded-xl border p-4 transition-all hover:shadow-md ${
            statusFilter === "baixo"
              ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
              : "border-border bg-card hover:border-amber-300"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-bold text-amber-600 tabular-nums">{totalBaixo}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Estoque Baixo</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Package className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-1.5 font-medium">Atenção necessária</p>
        </button>

        {/* Estoque OK */}
        <button
          onClick={() => setStatusFilter(statusFilter === "ok" ? "all" : "ok")}
          className={`text-left rounded-xl border p-4 transition-all hover:shadow-md ${
            statusFilter === "ok"
              ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
              : "border-border bg-card hover:border-emerald-300"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">{totalOk}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Estoque OK</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <p className="text-xs text-emerald-600 mt-1.5 font-medium">Abastecido</p>
        </button>

        {/* Sugestões de Compra */}
        <button
          onClick={() => setShowOnlySuggested(s => !s)}
          className={`text-left rounded-xl border p-4 transition-all hover:shadow-md ${
            showOnlySuggested
              ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
              : "border-border bg-card hover:border-blue-300"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-bold text-blue-600 tabular-nums">{totalSuggested}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Sugestões de Compra</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-blue-500" />
            </div>
          </div>
          {estimatedCost > 0 ? (
            <p className="text-xs text-blue-600 mt-1.5 font-semibold">≈ R$ {estimatedCost.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1.5">Clique para filtrar</p>
          )}
        </button>

        {/* Vendas última semana */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-bold text-pink-600 tabular-nums">{totalVendidoSemana}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Vendas Última Sem.</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-pink-500" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{allProducts.length} produtos monitorados</p>
        </div>
      </div>

      {/* Negativo (condicional) */}
      {totalNegativo > 0 && (
        <button
          onClick={() => setStatusFilter(statusFilter === "negativo" ? "all" : "negativo")}
          className={`w-full text-left rounded-xl border p-3 transition-all flex items-center gap-3 ${
            statusFilter === "negativo"
              ? "border-purple-400 bg-purple-50 dark:bg-purple-950/20"
              : "border-purple-200 bg-purple-50/50 dark:bg-purple-950/10 hover:border-purple-400"
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">
              <span className="text-lg font-bold tabular-nums">{totalNegativo}</span> produto(s) com estoque negativo
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400">Vendas importadas superam o saldo cadastrado — corrija no módulo de Estoque</p>
          </div>
        </button>
      )}

      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="w-48 h-9 text-sm">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="critico">Crítico / Zerado</SelectItem>
            <SelectItem value="negativo">Estoque Negativo</SelectItem>
            <SelectItem value="baixo">Estoque Baixo</SelectItem>
            <SelectItem value="ok">Estoque OK</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={showOnlySuggested ? "default" : "outline"}
          size="sm"
          className="h-9 text-sm gap-1.5"
          onClick={() => setShowOnlySuggested(s => !s)}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          {showOnlySuggested ? "Mostrar todos" : "Com sugestão"}
        </Button>
      </div>

      {/* ── Tabela ────────────────────────────────────────────────────────── */}
      {query.isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">Nenhum produto encontrado</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Tente ajustar os filtros aplicados</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <span className="font-semibold text-foreground">{filtered.length}</span> produto(s) ·{" "}
                <span className="font-semibold text-foreground">{weekLabels.length}</span> semanas analisadas
              </CardTitle>
              {data?.generatedAt && (
                <span className="text-xs text-muted-foreground">
                  Atualizado {new Date(data.generatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/10">
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground cursor-pointer whitespace-nowrap hover:text-foreground" onClick={() => handleSort("productName")}>
                      <span className="flex items-center gap-1">Produto <SortIcon col="productName" /></span>
                    </th>
                    <th className="text-right py-3 px-3 font-semibold text-muted-foreground cursor-pointer whitespace-nowrap hover:text-foreground" onClick={() => handleSort("currentStock")}>
                      <span className="flex items-center justify-end gap-1">Estoque <SortIcon col="currentStock" /></span>
                    </th>
                    <th className="text-right py-3 px-3 font-semibold text-muted-foreground cursor-pointer whitespace-nowrap hover:text-foreground" onClick={() => handleSort("avgQtyPerWeek")}>
                      <span className="flex items-center justify-end gap-1">Média/Sem <SortIcon col="avgQtyPerWeek" /></span>
                    </th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground whitespace-nowrap">
                      Tendência
                    </th>
                    <th className="text-right py-3 px-3 font-semibold text-muted-foreground cursor-pointer whitespace-nowrap hover:text-foreground" onClick={() => handleSort("coverageWeeks")}>
                      <span className="flex items-center justify-end gap-1">Cobertura <SortIcon col="coverageWeeks" /></span>
                    </th>
                    <th className="text-right py-3 px-3 font-semibold text-muted-foreground cursor-pointer whitespace-nowrap hover:text-foreground" onClick={() => handleSort("suggestedPurchase")}>
                      <span className="flex items-center justify-end gap-1">
                        <ShoppingCart className="w-3 h-3 text-blue-400" /> Sugestão <SortIcon col="suggestedPurchase" />
                      </span>
                    </th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                    {/* Semanas dinâmicas (compactas) */}
                    {weekLabels.map((w, i) => (
                      <th key={i} className="text-right py-3 px-2 font-medium text-muted-foreground/60 whitespace-nowrap min-w-[60px] text-[11px]">
                        {w}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.productId}
                      className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                        p.stockStatus === "negativo"
                          ? "bg-purple-50/30 dark:bg-purple-950/10"
                          : p.stockStatus === "critico" || p.stockStatus === "sem_estoque"
                          ? "bg-red-50/20 dark:bg-red-950/10"
                          : p.stockStatus === "baixo"
                          ? "bg-amber-50/20 dark:bg-amber-950/10"
                          : ""
                      }`}
                    >
                      {/* Nome do produto */}
                      <td className="py-3 px-4 font-medium">
                        <div className="max-w-[200px]">
                          <p className="truncate font-semibold text-foreground" title={p.productName}>{p.productName}</p>
                          {p.minStock > 0 && (
                            <p className="text-muted-foreground/60 text-[10px] mt-0.5">mín: {p.minStock} un</p>
                          )}
                        </div>
                      </td>

                      {/* Estoque atual */}
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`font-bold tabular-nums text-sm ${
                            p.isNegativeStock ? "text-purple-600" :
                            p.currentStock <= 0 ? "text-gray-400" :
                            p.currentStock <= p.minStock ? "text-red-500" :
                            "text-foreground"
                          }`}
                          title={p.isNegativeStock ? `Estoque negativo (${p.currentStock}): corrija o saldo no cadastro de produtos.` : undefined}
                        >
                          {p.currentStock}
                        </span>
                      </td>

                      {/* Média por semana */}
                      <td className="py-3 px-3 text-right">
                        <span className="font-medium text-muted-foreground tabular-nums">
                          {p.avgQtyPerWeek > 0 ? p.avgQtyPerWeek : "—"}
                        </span>
                      </td>

                      {/* Sparkline */}
                      <td className="py-3 px-3">
                        <Sparkline values={p.weekData.map(w => w.qty)} avgPerWeek={p.avgQtyPerWeek} />
                      </td>

                      {/* Cobertura */}
                      <td className="py-3 px-3 text-right">
                        <CoverageBar weeks={p.coverageWeeks >= 99 ? 99 : p.coverageWeeks} />
                      </td>

                      {/* Sugestão de compra */}
                      <td className="py-3 px-3 text-right">
                        {p.suggestedPurchase > 0 ? (
                          <span className="inline-flex items-center justify-center font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 px-2 py-0.5 rounded-lg tabular-nums text-sm">
                            {p.suggestedPurchase}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <StatusBadge status={p.stockStatus} />
                      </td>

                      {/* Vendas por semana (compactas) */}
                      {p.weekData.map((w, wi) => (
                        <td key={wi} className="py-3 px-2 text-right">
                          {w.qty > 0 ? (
                            <span className={`tabular-nums font-medium ${
                              w.qty >= (p.avgQtyPerWeek * 1.2) ? "text-emerald-600" :
                              w.qty <= (p.avgQtyPerWeek * 0.5) && p.avgQtyPerWeek > 0 ? "text-orange-500" :
                              "text-foreground/70"
                            }`}>{w.qty}</span>
                          ) : (
                            <span className="text-muted-foreground/25">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Legenda ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Legenda</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-muted-foreground">
          <p><strong className="text-foreground">Cobertura:</strong> semanas de estoque restante com base na média de vendas</p>
          <p><strong className="text-foreground">Sugestão:</strong> quantidade para garantir 2 semanas de estoque + estoque mínimo</p>
          <p><strong className="text-emerald-600">Verde</strong> = acima da média semanal · <strong className="text-orange-500">Laranja</strong> = abaixo da média</p>
          <p><strong className="text-purple-600">Estoque Negativo:</strong> vendas importadas superam o saldo cadastrado</p>
        </div>
        <p className="text-xs text-muted-foreground/60 pt-1">Clique nos cards de KPI para filtrar · Clique nos cabeçalhos para ordenar</p>
      </div>
    </div>
  );
}
