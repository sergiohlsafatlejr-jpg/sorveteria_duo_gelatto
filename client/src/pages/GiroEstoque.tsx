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
  Filter
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type WeekData = { weekLabel: string; qty: number; revenue: number };
type ProductRow = {
  productId: number;
  productName: string;
  currentStock: number;
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "critico") return <Badge className="bg-red-500 text-white text-xs px-1.5 py-0">Crítico</Badge>;
  if (status === "sem_estoque") return <Badge className="bg-gray-800 text-white text-xs px-1.5 py-0">Zerado</Badge>;
  if (status === "baixo") return <Badge className="bg-yellow-500 text-white text-xs px-1.5 py-0">Baixo</Badge>;
  return <Badge className="bg-green-500 text-white text-xs px-1.5 py-0">OK</Badge>;
}

function CoverageBar({ weeks }: { weeks: number }) {
  const pct = Math.min((weeks / 4) * 100, 100);
  const color = weeks < 1 ? "bg-red-500" : weeks < 2 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold ${weeks < 1 ? "text-red-500" : weeks < 2 ? "text-yellow-600" : "text-green-600"}`}>
        {weeks >= 99 ? "∞" : `${weeks}sem`}
      </span>
    </div>
  );
}

type SortKey = "productName" | "currentStock" | "avgQtyPerWeek" | "coverageWeeks" | "suggestedPurchase" | "turnover" | "margin";

export default function GiroEstoque() {
  const [weeksBack, setWeeksBack] = useState(6);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "critico" | "baixo" | "ok" | "sem_estoque">("all");
  const [sortKey, setSortKey] = useState<SortKey>("coverageWeeks");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showOnlySuggested, setShowOnlySuggested] = useState(false);

  const query = trpc.reports.weeklyStockTurnover.useQuery(
    { weeksBack },
    { staleTime: 5 * 60 * 1000 }
  );

  const data = query.data as { weeks: string[]; products: ProductRow[]; generatedAt: string } | undefined;
  const weekLabels = data?.weeks ?? [];
  const allProducts = data?.products ?? [];

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
    // Ordenação
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

  // ── Totais do resumo ──────────────────────────────────────────────────────
  const totalSuggested = filtered.filter(p => p.suggestedPurchase > 0).length;
  const totalCritico = allProducts.filter(p => p.stockStatus === "critico" || p.stockStatus === "sem_estoque").length;
  const totalBaixo = allProducts.filter(p => p.stockStatus === "baixo").length;
  const totalOk = allProducts.filter(p => p.stockStatus === "ok").length;

  // ── Custo estimado da sugestão de compra ─────────────────────────────────
  const estimatedCost = filtered
    .filter(p => p.suggestedPurchase > 0)
    .reduce((s, p) => s + p.suggestedPurchase * p.costPrice, 0);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-pink-500" /> Giro de Estoque Semanal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Velocidade de saída por produto · Sugestão de compra para a próxima semana
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(weeksBack)} onValueChange={v => setWeeksBack(Number(v))}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">Últimas 4 semanas</SelectItem>
              <SelectItem value="6">Últimas 6 semanas</SelectItem>
              <SelectItem value="8">Últimas 8 semanas</SelectItem>
              <SelectItem value="12">Últimas 12 semanas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`w-4 h-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:border-red-300" onClick={() => setStatusFilter(statusFilter === "critico" ? "all" : "critico")}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-red-500">{totalCritico}</p>
                <p className="text-xs text-muted-foreground">Críticos / Zerados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-yellow-300" onClick={() => setStatusFilter(statusFilter === "baixo" ? "all" : "baixo")}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-yellow-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{totalBaixo}</p>
                <p className="text-xs text-muted-foreground">Estoque Baixo</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-green-300" onClick={() => setStatusFilter(statusFilter === "ok" ? "all" : "ok")}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-green-600">{totalOk}</p>
                <p className="text-xs text-muted-foreground">Estoque OK</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-blue-300" onClick={() => setShowOnlySuggested(s => !s)}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-blue-600">{totalSuggested}</p>
                <p className="text-xs text-muted-foreground">Sugestões de Compra</p>
                {estimatedCost > 0 && (
                  <p className="text-xs font-semibold text-blue-700 mt-0.5">≈ R${estimatedCost.toFixed(0)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <Filter className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="critico">Crítico / Zerado</SelectItem>
            <SelectItem value="baixo">Estoque Baixo</SelectItem>
            <SelectItem value="ok">Estoque OK</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={showOnlySuggested ? "default" : "outline"}
          size="sm"
          className="h-9 text-sm"
          onClick={() => setShowOnlySuggested(s => !s)}
        >
          <ShoppingCart className="w-4 h-4 mr-1" />
          {showOnlySuggested ? "Mostrar todos" : "Só com sugestão"}
        </Button>
      </div>

      {/* ── Tabela ────────────────────────────────────────────────────────── */}
      {query.isLoading ? (
        <Card>
          <CardContent className="pt-4 space-y-3">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum produto encontrado com os filtros aplicados.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              {filtered.length} produto(s) · {weekLabels.length} semanas
              {data?.generatedAt && (
                <span className="ml-2 text-xs">· Atualizado {new Date(data.generatedAt).toLocaleString("pt-BR")}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2.5 px-3 font-semibold cursor-pointer whitespace-nowrap" onClick={() => handleSort("productName")}>
                      <span className="flex items-center gap-1">Produto <SortIcon col="productName" /></span>
                    </th>
                    <th className="text-right py-2.5 px-2 font-semibold cursor-pointer whitespace-nowrap" onClick={() => handleSort("currentStock")}>
                      <span className="flex items-center justify-end gap-1">Estoque <SortIcon col="currentStock" /></span>
                    </th>
                    <th className="text-right py-2.5 px-2 font-semibold cursor-pointer whitespace-nowrap" onClick={() => handleSort("avgQtyPerWeek")}>
                      <span className="flex items-center justify-end gap-1">Média/Sem <SortIcon col="avgQtyPerWeek" /></span>
                    </th>
                    {/* Semanas dinâmicas */}
                    {weekLabels.map((w, i) => (
                      <th key={i} className="text-right py-2.5 px-2 font-medium text-muted-foreground whitespace-nowrap min-w-[70px]">
                        {w}
                      </th>
                    ))}
                    <th className="text-right py-2.5 px-2 font-semibold cursor-pointer whitespace-nowrap" onClick={() => handleSort("coverageWeeks")}>
                      <span className="flex items-center justify-end gap-1">Cobertura <SortIcon col="coverageWeeks" /></span>
                    </th>
                    <th className="text-right py-2.5 px-2 font-semibold cursor-pointer whitespace-nowrap" onClick={() => handleSort("turnover")}>
                      <span className="flex items-center justify-end gap-1">Giro <SortIcon col="turnover" /></span>
                    </th>
                    <th className="text-right py-2.5 px-2 font-semibold cursor-pointer whitespace-nowrap" onClick={() => handleSort("margin")}>
                      <span className="flex items-center justify-end gap-1">Margem <SortIcon col="margin" /></span>
                    </th>
                    <th className="text-right py-2.5 px-2 font-semibold cursor-pointer whitespace-nowrap" onClick={() => handleSort("suggestedPurchase")}>
                      <span className="flex items-center justify-end gap-1">
                        <ShoppingCart className="w-3 h-3 text-blue-500" /> Sugestão <SortIcon col="suggestedPurchase" />
                      </span>
                    </th>
                    <th className="text-center py-2.5 px-2 font-semibold whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => (
                    <tr
                      key={p.productId}
                      className={`border-b last:border-0 hover:bg-muted/20 ${
                        p.stockStatus === "critico" || p.stockStatus === "sem_estoque"
                          ? "bg-red-50/30 dark:bg-red-950/10"
                          : p.stockStatus === "baixo"
                          ? "bg-yellow-50/30 dark:bg-yellow-950/10"
                          : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 font-medium max-w-[200px]">
                        <p className="truncate" title={p.productName}>{p.productName}</p>
                        {p.minStock > 0 && (
                          <p className="text-muted-foreground text-xs">mín: {p.minStock}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold">
                        <span className={
                          p.currentStock <= 0 ? "text-gray-400" :
                          p.currentStock <= p.minStock ? "text-red-500" :
                          "text-foreground"
                        }>{p.currentStock}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-muted-foreground">
                        {p.avgQtyPerWeek > 0 ? p.avgQtyPerWeek : "—"}
                      </td>
                      {/* Células de vendas por semana */}
                      {p.weekData.map((w, wi) => (
                        <td key={wi} className="py-2.5 px-2 text-right">
                          {w.qty > 0 ? (
                            <span className={`font-semibold ${
                              w.qty >= (p.avgQtyPerWeek * 1.2) ? "text-green-600" :
                              w.qty <= (p.avgQtyPerWeek * 0.5) && p.avgQtyPerWeek > 0 ? "text-orange-500" :
                              "text-foreground"
                            }`}>{w.qty}</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      ))}
                      <td className="py-2.5 px-2 text-right">
                        <CoverageBar weeks={p.coverageWeeks >= 99 ? 99 : p.coverageWeeks} />
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={`font-semibold ${
                          p.turnover >= 10 ? "text-green-600" :
                          p.turnover >= 3 ? "text-blue-600" :
                          p.turnover > 0 ? "text-muted-foreground" : "text-gray-400"
                        }`}>
                          {p.turnover >= 99 ? "99+" : p.turnover > 0 ? `${p.turnover}x` : "—"}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={`font-semibold ${
                          p.margin >= 40 ? "text-green-600" :
                          p.margin >= 25 ? "text-yellow-600" :
                          p.margin > 0 ? "text-orange-500" : "text-gray-400"
                        }`}>
                          {p.margin > 0 ? `${p.margin}%` : "—"}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {p.suggestedPurchase > 0 ? (
                          <span className="font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded">
                            {p.suggestedPurchase}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <StatusBadge status={p.stockStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Legenda ───────────────────────────────────────────────────────── */}
      <div className="text-xs text-muted-foreground space-y-1 pb-4">
        <p><strong>Cobertura:</strong> semanas de estoque restante com base na média de vendas · <strong>Giro:</strong> qtd vendida ÷ estoque atual</p>
        <p><strong>Sugestão de Compra:</strong> quantidade para garantir 2 semanas de estoque + estoque mínimo · <strong>Verde</strong> = acima da média · <strong>Laranja</strong> = abaixo da média</p>
        <p>Clique nos cards de KPI para filtrar por status · Clique nos cabeçalhos para ordenar</p>
      </div>
    </div>
  );
}
