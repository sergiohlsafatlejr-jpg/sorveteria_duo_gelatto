import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp, Package, AlertTriangle, Search, ChevronDown, ChevronUp, Wand2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const PERIOD_OPTIONS = [
  { label: "Últimos 3 meses", value: 3 },
  { label: "Últimos 6 meses", value: 6 },
  { label: "Últimos 12 meses", value: 12 },
];

const MONTHS_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

function fmtQty(v: number) {
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
}

function StockIndicator({ current, avg }: { current: number | null; avg: number }) {
  if (current === null) return <span className="text-muted-foreground text-xs">—</span>;
  const ratio = avg > 0 ? current / avg : 1;
  if (ratio < 0.5) return (
    <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs">
      <AlertTriangle className="w-3 h-3" /> {current} <span className="text-muted-foreground font-normal">(crítico)</span>
    </span>
  );
  if (ratio < 1) return (
    <span className="inline-flex items-center gap-1 text-amber-600 font-semibold text-xs">
      <AlertTriangle className="w-3 h-3" /> {current} <span className="text-muted-foreground font-normal">(baixo)</span>
    </span>
  );
  return <span className="text-green-700 font-semibold text-xs">{current}</span>;
}

export default function SalesAverage() {
  const [months, setMonths] = useState(6);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"avgQty" | "currentStock" | "suggestedMinStock">("avgQty");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [showTop, setShowTop] = useState(20);
  const [showApplyModal, setShowApplyModal] = useState(false);

  const { data, isLoading } = trpc.salesImport.salesAverage.useQuery({ months });
  const utils = trpc.useUtils();

  const applyBulkMutation = trpc.products.applyMinStockBulk.useMutation({
    onSuccess: (result) => {
      toast.success(`Estoque mínimo atualizado em ${result.updated} produto(s)!`);
      setShowApplyModal(false);
      utils.salesImport.salesAverage.invalidate();
    },
    onError: (err) => {
      toast.error(`Erro ao aplicar: ${err.message}`);
    },
  });

  // Produtos com productId que têm sugestão diferente do minStock atual
  const applyItems = useMemo(() => {
    if (!data) return [];
    return data
      .filter(r => r.productId !== null)
      .map(r => ({ productId: r.productId as number, minStock: r.suggestedMinStock, productName: r.productName, avgQty: r.avgQty }))
      .filter(r => r.minStock > 0);
  }, [data]);

  // Meses disponíveis para colunas
  const allMonths = useMemo(() => {
    if (!data || data.length === 0) return [];
    const monthSet = new Set<string>();
    for (const row of data) {
      for (const m of Object.keys(row.monthlyQty)) monthSet.add(m);
    }
    return Array.from(monthSet).sort();
  }, [data]);

  // Filtrar e ordenar
  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        r.productName.toLowerCase().includes(q) ||
        r.externalCode.toLowerCase().includes(q) ||
        r.externalName.toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      const av = sortField === "currentStock" ? (a.currentStock ?? -1) : a[sortField];
      const bv = sortField === "currentStock" ? (b.currentStock ?? -1) : b[sortField];
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return rows;
  }, [data, search, sortField, sortDir]);

  // Top 15 para gráfico
  const chartData = useMemo(() => {
    if (!filtered) return [];
    return filtered.slice(0, 15).map(r => ({
      name: r.productName.length > 20 ? r.productName.slice(0, 18) + "…" : r.productName,
      avg: r.avgQty,
      stock: r.currentStock ?? 0,
      suggested: r.suggestedMinStock,
    }));
  }, [filtered]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3 inline ml-0.5" /> : <ChevronUp className="w-3 h-3 inline ml-0.5" />;
  };

  // Estatísticas resumo
  const stats = useMemo(() => {
    if (!filtered) return null;
    const criticalStock = filtered.filter(r => r.currentStock !== null && r.currentStock < r.avgQty * 0.5).length;
    const lowStock = filtered.filter(r => r.currentStock !== null && r.currentStock >= r.avgQty * 0.5 && r.currentStock < r.avgQty).length;
    const noStock = filtered.filter(r => r.currentStock === null).length;
    return { total: filtered.length, criticalStock, lowStock, noStock };
  }, [filtered]);

  return (
    <div className="p-6 max-w-full">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            Média de Vendas por Produto
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Média mensal de quantidade vendida por produto — base para ajuste de estoque mínimo
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMonths(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                months === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {applyItems.length > 0 && (
            <button
              onClick={() => setShowApplyModal(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors shadow-sm"
            >
              <Wand2 className="w-4 h-4" />
              Aplicar sugestões ({applyItems.length})
            </button>
          )}
        </div>
      </div>

      {/* Cards resumo */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border rounded-xl p-4">
            <div className="text-muted-foreground text-xs mb-1">Produtos analisados</div>
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <div className="text-muted-foreground text-xs mb-1">Estoque crítico</div>
            <div className="text-2xl font-bold text-red-600">{stats.criticalStock}</div>
            <div className="text-xs text-muted-foreground">abaixo de 50% da média</div>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <div className="text-muted-foreground text-xs mb-1">Estoque baixo</div>
            <div className="text-2xl font-bold text-amber-600">{stats.lowStock}</div>
            <div className="text-xs text-muted-foreground">entre 50% e 100% da média</div>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <div className="text-muted-foreground text-xs mb-1">Sem estoque cadastrado</div>
            <div className="text-2xl font-bold text-muted-foreground">{stats.noStock}</div>
          </div>
        </div>
      )}

      {/* Gráfico Top 15 */}
      {!isLoading && chartData.length > 0 && (
        <div className="bg-card border rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
            Top 15 Mais Vendidos — Média Mensal (Qtd)
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  fmtQty(value),
                  name === "avg" ? "Média Mensal" : name === "stock" ? "Estoque Atual" : "Estoque Sugerido"
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="avg" name="avg" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={`hsl(${210 + i * 8}, 70%, 55%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b">
          <h2 className="font-semibold text-sm">
            Todos os Produtos
            {filtered && <span className="text-muted-foreground font-normal ml-2">({filtered.length})</span>}
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar produto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando dados...</div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Nenhum produto encontrado.</p>
            <p className="text-xs mt-1">Importe e confirme relatórios mensais para ver a média de vendas.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Produto</th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Cód. PDV</th>
                    {allMonths.map(m => {
                      const [y, mo] = m.split("-");
                      return (
                        <th key={m} className="text-center px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">
                          {MONTHS_LABELS[mo]}/{y.slice(2)}
                        </th>
                      );
                    })}
                    <th
                      className="text-center px-3 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"
                      onClick={() => toggleSort("avgQty")}
                    >
                      Média/mês <SortIcon field="avgQty" />
                    </th>
                    <th
                      className="text-center px-3 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"
                      onClick={() => toggleSort("currentStock")}
                    >
                      Estoque Atual <SortIcon field="currentStock" />
                    </th>
                    <th
                      className="text-center px-3 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"
                      onClick={() => toggleSort("suggestedMinStock")}
                    >
                      Est. Mín. Sugerido <SortIcon field="suggestedMinStock" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, showTop).map((row, i) => (
                    <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-foreground">{row.productName}</div>
                        {row.productName !== row.externalName && (
                          <div className="text-xs text-muted-foreground">{row.externalName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground font-mono text-xs">{row.externalCode}</td>
                      {allMonths.map(m => (
                        <td key={m} className="px-3 py-2.5 text-center">
                          {row.monthlyQty[m] !== undefined ? (
                            <span className="font-medium">{fmtQty(row.monthlyQty[m])}</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-bold text-blue-700">{fmtQty(row.avgQty)}</span>
                        <span className="text-muted-foreground text-xs ml-1">{row.unit}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StockIndicator current={row.currentStock} avg={row.avgQty} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-block bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-semibold text-xs px-2 py-0.5 rounded-full">
                          {row.suggestedMinStock} {row.unit}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > showTop && (
              <div className="p-4 text-center border-t">
                <button
                  onClick={() => setShowTop(n => n + 20)}
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  Mostrar mais ({filtered.length - showTop} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Legenda */}
      <div className="mt-4 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
        <strong>Como interpretar:</strong> A <strong>Média/mês</strong> é calculada apenas nos meses em que houve venda (importações mensais confirmadas).
        O <strong>Estoque Mín. Sugerido</strong> = média × 1,2 (20% de margem de segurança).
        Indicadores: <span className="text-red-600 font-medium">vermelho</span> = estoque abaixo de 50% da média,
        <span className="text-amber-600 font-medium ml-1">âmbar</span> = entre 50% e 100%,
        <span className="text-green-700 font-medium ml-1">verde</span> = adequado.
      </div>

      {/* Modal de confirmação de aplicação em lote */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg border">
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-green-600" />
                <h2 className="font-bold text-lg">Aplicar Estoque Mínimo Sugerido</h2>
              </div>
              <button onClick={() => setShowApplyModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-4">
                O sistema vai atualizar o <strong>estoque mínimo</strong> de <strong>{applyItems.length} produto(s)</strong> com o valor sugerido
                (média mensal × 1,2). Essa ação afeta diretamente o cadastro de cada produto.
              </p>
              <div className="max-h-64 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Produto</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">Média/mês</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">Novo Est. Mínimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applyItems.slice(0, 50).map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5 text-foreground">{item.productName}</td>
                        <td className="px-3 py-1.5 text-center text-muted-foreground">{fmtQty(item.avgQty)}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className="font-semibold text-green-700">{item.minStock}</span>
                        </td>
                      </tr>
                    ))}
                    {applyItems.length > 50 && (
                      <tr className="border-t">
                        <td colSpan={3} className="px-3 py-2 text-center text-muted-foreground text-xs">
                          + {applyItems.length - 50} produtos adicionais
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t justify-end">
              <button
                onClick={() => setShowApplyModal(false)}
                className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
                disabled={applyBulkMutation.isPending}
              >
                Cancelar
              </button>
              <button
                onClick={() => applyBulkMutation.mutate({ items: applyItems.map(i => ({ productId: i.productId, minStock: i.minStock })) })}
                disabled={applyBulkMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {applyBulkMutation.isPending ? "Aplicando..." : `Confirmar (${applyItems.length} produtos)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
