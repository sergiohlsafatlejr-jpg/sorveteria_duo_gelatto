import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ShoppingCart, TrendingUp, Package, AlertTriangle, CheckCircle2,
  Download, RefreshCw, Info, BarChart3, Loader2, CheckSquare, Square
} from "lucide-react";
import { exportToExcel } from "@/lib/exportExcel";
import { cn } from "@/lib/utils";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtNum = (v: number, dec = 2) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

const PRIORIDADE_CONFIG = {
  alta: { label: "Alta", color: "bg-red-500/10 text-red-600 border-red-500/30", icon: AlertTriangle },
  media: { label: "Média", color: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: TrendingUp },
  baixa: { label: "Baixa", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
};

export default function PurchaseSuggestion() {
  const [diasAnalise, setDiasAnalise] = useState(7);
  const [diasProjecao, setDiasProjecao] = useState(7);
  const [fatorSeguranca, setFatorSeguranca] = useState(0.2);
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState<"todas" | "alta" | "media" | "baixa">("todas");
  const [apenasComSugestao, setApenasComSugestao] = useState(true);
  const [queryKey, setQueryKey] = useState(0); // força re-fetch
  const [filtroGrupo, setFiltroGrupo] = useState(""); // subfiltro grupo INOVE
  const [filtroSubgrupo, setFiltroSubgrupo] = useState(""); // subfiltro subgrupo INOVE
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set()); // marcadores de seleção

  const { data, isLoading, error, refetch } = trpc.inove.getSugestaoCompras.useQuery(
    { diasAnalise, diasProjecao, fatorSeguranca },
    {
      retry: false,
      staleTime: 5 * 60 * 1000,
    }
  );

  // Listas dinâmicas de grupos e subgrupos do INOVE
  const gruposDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (data?.sugestoes ?? []).forEach(s => { if (s.grupoNome) set.add(s.grupoNome); });
    return Array.from(set).sort();
  }, [data]);

  const subgruposDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (data?.sugestoes ?? []).forEach(s => {
      if (s.subgrupoNome && (!filtroGrupo || s.grupoNome === filtroGrupo)) set.add(s.subgrupoNome);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [data, filtroGrupo]);

  const sugestoesFiltradas = (data?.sugestoes ?? []).filter(s => {
    if (apenasComSugestao && s.sugestaoCompra <= 0) return false;
    if (filtroPrioridade !== "todas" && s.prioridade !== filtroPrioridade) return false;
    if (filtroNome && !s.nome?.toLowerCase().includes(filtroNome.toLowerCase())) return false;
    if (filtroGrupo && s.grupoNome !== filtroGrupo) return false;
    if (filtroSubgrupo && s.subgrupoNome !== filtroSubgrupo) return false;
    return true;
  });

  const totalCustoFiltrado = sugestoesFiltradas.reduce((s, x) => s + (x.custoTotal ?? 0), 0);

  // Helpers de seleção
  const toggleSelecionado = (id: number) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selecionarTodos = () => setSelecionados(new Set(sugestoesFiltradas.map(s => s.produtoId)));
  const deselecionarTodos = () => setSelecionados(new Set());
  const totalSelecionados = sugestoesFiltradas.filter(s => selecionados.has(s.produtoId));
  const custoSelecionados = totalSelecionados.reduce((s, x) => s + (x.custoTotal ?? 0), 0);
  const unidadesSelecionadas = totalSelecionados.reduce((s, x) => s + x.sugestaoCompra, 0);

  const handleExport = () => {
    if (!data) return;
    const rows = sugestoesFiltradas.map(s => ({
      "Produto": s.nome,
      "Cód. PDV": s.codPdv,
      "Qtd. Vendida (Período)": s.qtdVendidaSemana,
      "Dias c/ Venda": s.diasComVenda,
      "Média Diária": s.mediaDiaria,
      "Necessidade Projetada": s.necessidadeProjecao,
      "Estoque Atual": s.estoqueAtual ?? "Não cadastrado",
      "Estoque Mínimo": s.estoqueMinimo ?? "—",
      "Sugestão de Compra": s.sugestaoCompra,
      "Custo Unit. (R$)": s.custoProduto ?? "—",
      "Custo Total (R$)": s.custoTotal ?? "—",
      "Prioridade": PRIORIDADE_CONFIG[s.prioridade].label,
    }));
    exportToExcel(rows, `Sugestao_Compras_${new Date().toISOString().slice(0, 10)}`, "Sugestão de Compras");
    toast.success("Planilha exportada com sucesso!");
  };

  return (
    <div className="p-6 space-y-5">
      <BackButton to="/products" />

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            Sugestão de Compras
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise das vendas do PDV INOVE para projetar necessidade de compra dos produtos
          </p>
          {data?.periodo && (
            <p className="text-xs text-muted-foreground mt-1">
              Período analisado: <strong>{fmtDate(data.periodo.dataInicio)}</strong> a <strong>{fmtDate(data.periodo.dataFim)}</strong>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Atualizar
          </Button>
          {data && (
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Exportar Excel
            </Button>
          )}
        </div>
      </div>

      {/* Parâmetros */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Parâmetros de Cálculo</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Dias de Análise</Label>
            <Select value={String(diasAnalise)} onValueChange={v => setDiasAnalise(Number(v))}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Última semana (7 dias)</SelectItem>
                <SelectItem value="14">Últimas 2 semanas (14 dias)</SelectItem>
                <SelectItem value="21">Últimas 3 semanas (21 dias)</SelectItem>
                <SelectItem value="30">Último mês (30 dias)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Projeção para</Label>
            <Select value={String(diasProjecao)} onValueChange={v => setDiasProjecao(Number(v))}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Próxima semana (7 dias)</SelectItem>
                <SelectItem value="14">Próximas 2 semanas (14 dias)</SelectItem>
                <SelectItem value="21">Próximas 3 semanas (21 dias)</SelectItem>
                <SelectItem value="30">Próximo mês (30 dias)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fator de Segurança</Label>
            <Select value={String(fatorSeguranca)} onValueChange={v => setFatorSeguranca(Number(v))}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sem margem (0%)</SelectItem>
                <SelectItem value="0.1">+10% de margem</SelectItem>
                <SelectItem value="0.2">+20% de margem</SelectItem>
                <SelectItem value="0.3">+30% de margem</SelectItem>
                <SelectItem value="0.5">+50% de margem</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Exibir</Label>
            <Select value={apenasComSugestao ? "sugestao" : "todos"} onValueChange={v => setApenasComSugestao(v === "sugestao")}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sugestao">Apenas com sugestão</SelectItem>
                <SelectItem value="todos">Todos os produtos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Cards de resumo */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">Produtos Analisados</p>
            <p className="text-2xl font-bold text-primary">{data.totalProdutosAnalisados}</p>
            <p className="text-xs text-muted-foreground">vendidos no período</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">Itens para Comprar</p>
            <p className="text-2xl font-bold text-amber-500">{data.totalItensParaComprar}</p>
            <p className="text-xs text-muted-foreground">produtos com sugestão</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">Custo Estimado</p>
            <p className="text-2xl font-bold text-emerald-500">{fmtBRL(data.totalCustoEstimado)}</p>
            <p className="text-xs text-muted-foreground">com preço de custo cadastrado</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">Exibindo</p>
            <p className="text-2xl font-bold">{sugestoesFiltradas.length}</p>
            <p className="text-xs text-muted-foreground">produtos filtrados</p>
          </div>
        </div>
      )}

      {/* Filtros da tabela */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Buscar produto..."
            value={filtroNome}
            onChange={e => setFiltroNome(e.target.value)}
            className="max-w-xs h-8 text-sm"
          />
          {/* Subfiltro Grupo INOVE */}
          {gruposDisponiveis.length > 0 && (
            <Select value={filtroGrupo || "_todos"} onValueChange={v => { setFiltroGrupo(v === "_todos" ? "" : v); setFiltroSubgrupo(""); }}>
              <SelectTrigger className="h-8 text-sm w-44">
                <SelectValue placeholder="Grupo INOVE" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_todos">Todos os grupos</SelectItem>
                {gruposDisponiveis.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* Subfiltro Subgrupo INOVE */}
          {subgruposDisponiveis.length > 0 && (
            <Select value={filtroSubgrupo || "_todos"} onValueChange={v => setFiltroSubgrupo(v === "_todos" ? "" : v)}>
              <SelectTrigger className="h-8 text-sm w-44">
                <SelectValue placeholder="Subgrupo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_todos">Todos os subgrupos</SelectItem>
                {subgruposDisponiveis.map(sg => <SelectItem key={sg} value={sg}>{sg}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-2">
            {(["todas", "alta", "media", "baixa"] as const).map(p => (
              <button
                key={p}
                onClick={() => setFiltroPrioridade(p)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  filtroPrioridade === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border/50 text-muted-foreground hover:border-primary/50"
                )}
              >
                {p === "todas" ? "Todas" : PRIORIDADE_CONFIG[p].label}
              </button>
            ))}
          </div>
          {sugestoesFiltradas.length > 0 && totalCustoFiltrado > 0 && (
            <div className="ml-auto text-sm font-semibold text-emerald-600">
              Total filtrado: {fmtBRL(totalCustoFiltrado)}
            </div>
          )}
        </div>
        {/* Barra de selecionados */}
        {selecionados.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2">
            <CheckSquare className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm font-semibold text-primary">{selecionados.size} selecionados</span>
            <span className="text-sm text-muted-foreground">· {unidadesSelecionadas} un. · {fmtBRL(custoSelecionados)}</span>
            <div className="ml-auto flex gap-2">
              <button onClick={selecionarTodos} className="text-xs text-primary underline">Selecionar todos</button>
              <button onClick={deselecionarTodos} className="text-xs text-muted-foreground underline">Limpar</button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => {
                const rows = totalSelecionados.map(s => ({
                  "Produto": s.nome,
                  "Grupo": s.grupoNome,
                  "Subgrupo": s.subgrupoNome,
                  "Sugestão Compra": s.sugestaoCompra,
                  "Custo Unit.": s.custoProduto ?? "—",
                  "Custo Total": s.custoTotal ?? "—",
                  "Prioridade": PRIORIDADE_CONFIG[s.prioridade].label,
                }));
                exportToExcel(rows, `Compras_Selecionados_${new Date().toISOString().slice(0,10)}`, "Compras");
                toast.success("Exportado!");
              }}>
                <Download className="w-3 h-3" /> Exportar selecionados
              </Button>
            </div>
          </div>
        )}
        {selecionados.size === 0 && sugestoesFiltradas.length > 0 && (
          <div className="flex gap-2">
            <button onClick={selecionarTodos} className="text-xs text-primary underline">Selecionar todos</button>
          </div>
        )}
      </div>

      {/* Estado de carregamento / erro */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Consultando vendas do PDV INOVE e calculando sugestões...</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="font-semibold text-destructive">Erro ao carregar sugestões</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Tabela de sugestões */}
      {!isLoading && !error && data && (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="w-10 px-3 py-3 text-center"></th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">Grupo / Subgrupo</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground">Qtd. Vendida</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground">Média/Dia</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground">Necessidade</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground">Estoque Atual</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground font-semibold text-primary">Sugestão Compra</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Custo Est.</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground">Prioridade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {sugestoesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>Nenhum produto encontrado com os filtros aplicados</p>
                  </td>
                </tr>
              ) : sugestoesFiltradas.map((s, i) => {
                const cfg = PRIORIDADE_CONFIG[s.prioridade];
                const Icon = cfg.icon;
                const isSel = selecionados.has(s.produtoId);
                return (
                  <tr
                    key={s.produtoId}
                    className={cn(
                      "hover:bg-muted/20 transition-colors cursor-pointer",
                      isSel ? "bg-primary/5" : s.prioridade === "alta" ? "bg-red-500/5" : i % 2 === 0 ? "bg-muted/5" : ""
                    )}
                    onClick={() => toggleSelecionado(s.produtoId)}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-3 text-center" onClick={e => { e.stopPropagation(); toggleSelecionado(s.produtoId); }}>
                      {isSel
                        ? <CheckSquare className="w-4 h-4 text-primary mx-auto" />
                        : <Square className="w-4 h-4 text-muted-foreground mx-auto" />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        Cód. PDV: {s.codPdv} · {s.diasComVenda} dia(s) com venda
                        {!s.produtoLocalId && (
                          <span className="ml-1 text-amber-500" title="Produto não encontrado no estoque local">
                            · ⚠ sem estoque local
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Grupo / Subgrupo */}
                    <td className="px-3 py-3">
                      <div className="text-xs font-medium text-foreground">{s.grupoNome}</div>
                      {s.subgrupoNome && <div className="text-[10px] text-muted-foreground">{s.subgrupoNome}</div>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-semibold">{fmtNum(s.qtdVendidaSemana, 0)}</span>
                      <div className="text-xs text-muted-foreground">{diasAnalise} dias</div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-blue-600 font-medium">{fmtNum(s.mediaDiaria)}</span>
                      <div className="text-xs text-muted-foreground">un/dia</div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-medium">{s.necessidadeComSeguranca}</span>
                      <div className="text-xs text-muted-foreground">+{Math.round(fatorSeguranca * 100)}% seg.</div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {s.estoqueAtual !== null ? (
                        <span className={cn(
                          "font-semibold",
                          s.estoqueAtual <= 0 ? "text-red-600" :
                          s.estoqueMinimo !== null && s.estoqueAtual <= s.estoqueMinimo ? "text-amber-600" :
                          "text-emerald-600"
                        )}>
                          {s.estoqueAtual}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn(
                        "text-lg font-bold",
                        s.sugestaoCompra > 0 ? "text-primary" : "text-muted-foreground"
                      )}>
                        {s.sugestaoCompra > 0 ? s.sugestaoCompra : "—"}
                      </span>
                      {s.sugestaoCompra > 0 && (
                        <div className="text-xs text-muted-foreground">unidades</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {s.custoTotal !== null && s.custoTotal > 0 ? (
                        <span className="font-semibold text-emerald-600">{fmtBRL(s.custoTotal)}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge variant="outline" className={cn("text-xs gap-1", cfg.color)}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {sugestoesFiltradas.length > 0 && (
              <tfoot className="bg-muted/20 border-t border-border/50">
                <tr>
                  <td className="px-4 py-3 font-semibold text-sm" colSpan={7}>
                    Total ({sugestoesFiltradas.length} produtos)
                  </td>
                  <td className="px-3 py-3 text-center font-bold text-primary">
                    {sugestoesFiltradas.reduce((s, x) => s + x.sugestaoCompra, 0)} un.
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-emerald-600">
                    {fmtBRL(totalCustoFiltrado)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Legenda */}
      <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Como funciona o cálculo</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div>
            <strong className="text-foreground">Média Diária</strong> = Qtd. vendida no período ÷ {diasAnalise} dias
          </div>
          <div>
            <strong className="text-foreground">Necessidade</strong> = Média Diária × {diasProjecao} dias × (1 + {Math.round(fatorSeguranca * 100)}% segurança)
          </div>
          <div>
            <strong className="text-foreground">Sugestão</strong> = Necessidade − Estoque Atual (mínimo 0)
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          ⚠ Produtos sem estoque local cadastrado aparecem com "—" no estoque e a sugestão considera apenas a necessidade projetada.
        </p>
      </div>
    </div>
  );
}
