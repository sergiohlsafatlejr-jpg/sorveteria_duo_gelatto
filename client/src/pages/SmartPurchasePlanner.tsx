import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  Brain, ShoppingCart, TrendingUp, Package, AlertTriangle,
  RefreshCw, FileSpreadsheet, FileText, ChevronDown, ChevronUp,
  CheckSquare, Square, Sparkles, DollarSign, BarChart3, Settings2, EyeOff
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtNum = (v: number, dec = 1) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);

type Prioridade = "alta" | "media" | "baixa";

interface ItemCompra {
  produtoId: number;
  nome: string;
  codPdv: string;
  qtdSemana: number;
  qtdMes: number;
  faturamentoSemana: number;
  faturamentoMes: number;
  diasComVenda: number;
  mediaDiaria: number;
  necessidade: number;
  necessidadeComSeguranca: number;
  estoqueAtual: number;
  custoProduto: number;
  sugestaoQtd: number;
  custoTotal: number;
  custoTotalAjustado: number;
  qtdAjustada: number;
  prioridade: Prioridade;
  selecionado: boolean;
}

type ItemEdit = { qtdAjustada: number; selecionado: boolean };

export default function SmartPurchasePlanner() {
  // ── Parâmetros ──────────────────────────────────────────────────────────────
  const [diasAnalise, setDiasAnalise] = useState(7);
  const [diasProjecao, setDiasProjecao] = useState(7);
  const [fatorSeguranca, setFatorSeguranca] = useState(0.2);
  const [orcamentoTotal, setOrcamentoTotal] = useState<string>("");
  const [filtro, setFiltro] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState<"todas" | Prioridade>("todas");
  const [mostrarSoComSugestao, setMostrarSoComSugestao] = useState(true);
  const [showIA, setShowIA] = useState(true);
  const [queryKey, setQueryKey] = useState(0); // forçar refetch

  // ── Edições locais (qtd ajustada e seleção) ─────────────────────────────────
  const [edits, setEdits] = useState<Map<number, ItemEdit>>(new Map());

  // ── Configuração de produtos ────────────────────────────────────────────────
  const [configSheetOpen, setConfigSheetOpen] = useState(false);
  const [configProduto, setConfigProduto] = useState<{ produtoId: number; nome: string } | null>(null);
  const [configIgnorar, setConfigIgnorar] = useState(false);
  const [configMotivo, setConfigMotivo] = useState("");
  const [configUnidade, setConfigUnidade] = useState("");
  const [configLote, setConfigLote] = useState("");
  const [configEstoqueMin, setConfigEstoqueMin] = useState("");
  const [mostrarIgnorados, setMostrarIgnorados] = useState(false);
  const [configCategoria, setConfigCategoria] = useState<"sorvete" | "guloseimas" | "outros">("sorvete");
  const [abaAtiva, setAbaAtiva] = useState<"sorvete" | "guloseimas" | "outros" | "todos">("sorvete");

  const utils = trpc.useUtils();
  const { data: configs } = trpc.inove.getPurchaseProductConfigs.useQuery();
  const configMap = useMemo(() => {
    const m = new Map<number, typeof configs extends (infer T)[] | undefined ? T : never>();
    configs?.forEach(c => m.set(c.produtoId, c));
    return m;
  }, [configs]);

  const upsertConfig = trpc.inove.upsertPurchaseProductConfig.useMutation({
    onSuccess: () => {
      utils.inove.getPurchaseProductConfigs.invalidate();
      toast.success("Configuração salva!");
      setConfigSheetOpen(false);
    },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });

  const openConfig = (produtoId: number, nome: string) => {
    const existing = configMap.get(produtoId);
    setConfigProduto({ produtoId, nome });
    setConfigIgnorar(existing?.ignorar ?? false);
    setConfigMotivo(existing?.motivoIgnorar ?? "");
    setConfigUnidade(existing?.unidadeCompra ?? "");
    setConfigLote(existing?.qtdLoteCompra ? String(existing.qtdLoteCompra) : "");
    setConfigEstoqueMin(existing?.qtdMinimaEstoque ? String(existing.qtdMinimaEstoque) : "");
    setConfigCategoria((existing?.purchaseCategory as "sorvete" | "guloseimas" | "outros") ?? "sorvete");
    setConfigSheetOpen(true);
  };

  const saveConfig = () => {
    if (!configProduto) return;
    upsertConfig.mutate({
      produtoId: configProduto.produtoId,
      nomeProduto: configProduto.nome,
      ignorar: configIgnorar,
      motivoIgnorar: configMotivo || undefined,
      unidadeCompra: configUnidade || undefined,
      qtdLoteCompra: configLote ? parseFloat(configLote) : undefined,
      qtdMinimaEstoque: configEstoqueMin ? parseFloat(configEstoqueMin) : undefined,
      purchaseCategory: configCategoria,
    });
  };

  const orcamentoNum = orcamentoTotal ? parseFloat(orcamentoTotal.replace(",", ".")) : undefined;

  const { data, isLoading, error, refetch } = trpc.inove.getSmartPurchasePlan.useQuery(
    {
      diasAnalise,
      diasProjecao,
      fatorSeguranca,
      orcamentoTotal: orcamentoNum,
    },
    {
      retry: false,
      staleTime: 5 * 60 * 1000,
    }
  );

  // Mesclar dados do servidor com edições locais
  const itens: ItemCompra[] = useMemo(() => {
    if (!data?.itens) return [];
    return data.itens.map(item => {
      const edit = edits.get(item.produtoId);
      const qtdAjustada = edit?.qtdAjustada ?? item.sugestaoQtd;
      const selecionado = edit?.selecionado ?? item.selecionado;
      const custoTotalAjustado = item.custoProduto > 0
        ? Math.round(qtdAjustada * item.custoProduto * 100) / 100
        : 0;
      return { ...item, qtdAjustada, selecionado, custoTotalAjustado };
    });
  }, [data, edits]);

  // Filtrar itens
  const itensFiltrados = useMemo(() => {
    return itens.filter(item => {
      const cfg = configMap.get(item.produtoId);
      const isIgnorado = cfg?.ignorar === true;
      if (isIgnorado && !mostrarIgnorados) return false;
      if (mostrarSoComSugestao && item.qtdAjustada <= 0 && !item.selecionado && !isIgnorado) return false;
      if (filtroPrioridade !== "todas" && item.prioridade !== filtroPrioridade) return false;
      if (filtro) {
        const f = filtro.toLowerCase();
        if (!item.nome.toLowerCase().includes(f) && !item.codPdv?.toLowerCase().includes(f)) return false;
      }
      // Filtro por aba de categoria
      if (abaAtiva !== "todos") {
        const cat = cfg?.purchaseCategory ?? "sorvete"; // padrão sorvete se não configurado
        if (cat !== abaAtiva) return false;
      }
      return true;
    });
  }, [itens, filtro, filtroPrioridade, mostrarSoComSugestao, configMap, mostrarIgnorados, abaAtiva]);

  // Totais dos itens selecionados
  const totais = useMemo(() => {
    const selecionados = itensFiltrados.filter(x => x.selecionado);
    const totalCusto = selecionados.reduce((s, x) => s + x.custoTotalAjustado, 0);
    const totalItens = selecionados.length;
    const totalUnidades = selecionados.reduce((s, x) => s + x.qtdAjustada, 0);
    return { totalCusto, totalItens, totalUnidades };
  }, [itensFiltrados]);

  const orcamentoRestante = orcamentoNum ? orcamentoNum - totais.totalCusto : null;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const updateEdit = useCallback((produtoId: number, field: keyof ItemEdit, value: number | boolean) => {
    setEdits(prev => {
      const next = new Map(prev);
      const current = next.get(produtoId) ?? { qtdAjustada: 0, selecionado: false };
      next.set(produtoId, { ...current, [field]: value });
      return next;
    });
  }, []);

  const toggleSelecionado = useCallback((produtoId: number, current: boolean) => {
    updateEdit(produtoId, "selecionado", !current);
  }, [updateEdit]);

  const selecionarTodos = () => {
    setEdits(prev => {
      const next = new Map(prev);
      itensFiltrados.forEach(item => {
        const current = next.get(item.produtoId) ?? { qtdAjustada: item.qtdAjustada, selecionado: item.selecionado };
        next.set(item.produtoId, { ...current, selecionado: true });
      });
      return next;
    });
  };

  const deselecionarTodos = () => {
    setEdits(prev => {
      const next = new Map(prev);
      itensFiltrados.forEach(item => {
        const current = next.get(item.produtoId) ?? { qtdAjustada: item.qtdAjustada, selecionado: item.selecionado };
        next.set(item.produtoId, { ...current, selecionado: false });
      });
      return next;
    });
  };

  const handleRefresh = () => {
    setEdits(new Map());
    setQueryKey(k => k + 1);
  };

  // ── Exportar Excel ───────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const selecionados = itensFiltrados.filter(x => x.selecionado);
    if (selecionados.length === 0) {
      toast.error("Nenhum item selecionado", { description: "Selecione ao menos um produto para exportar." });
      return;
    }
    const wsData: (string | number)[][] = [
      [`Planejamento de Compras — Duo Gelatto`],
      [`Período analisado: ${data?.periodo?.dataInicio} a ${data?.periodo?.dataFim}`],
      [`Projeção: ${diasProjecao} dias | Margem de segurança: ${(fatorSeguranca * 100).toFixed(0)}%`],
      [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
      [],
      ["#", "Produto", "Cód. PDV", "Venda Semana", "Venda Mês", "Estoque Atual", "Necessidade", "Qtd. Comprar", "Custo Unit. (R$)", "Custo Total (R$)", "Prioridade"],
    ];
    selecionados.forEach((item, i) => {
      wsData.push([
        i + 1,
        item.nome,
        item.codPdv || "",
        item.qtdSemana,
        item.qtdMes,
        item.estoqueAtual,
        item.necessidadeComSeguranca,
        item.qtdAjustada,
        item.custoProduto,
        item.custoTotalAjustado,
        item.prioridade === "alta" ? "ALTA" : item.prioridade === "media" ? "MÉDIA" : "BAIXA",
      ]);
    });
    wsData.push([]);
    wsData.push(["", "", "", "", "", "", "", "TOTAL", "", totais.totalCusto, ""]);
    if (orcamentoNum) {
      wsData.push(["", "", "", "", "", "", "", "Orçamento", "", orcamentoNum, ""]);
      wsData.push(["", "", "", "", "", "", "", "Saldo", "", orcamentoRestante ?? 0, ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 4 }, { wch: 35 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras");
    XLSX.writeFile(wb, `Compras_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`);
    toast.success("Excel exportado!", { description: `${selecionados.length} produtos exportados.` });
  };

  // ── Exportar PDF ─────────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    const selecionados = itensFiltrados.filter(x => x.selecionado);
    if (selecionados.length === 0) {
      toast.error("Nenhum item selecionado", { description: "Selecione ao menos um produto para exportar." });
      return;
    }
    const rowsHtml = selecionados.map((item, i) => `
      <tr style="border-bottom:1px solid #e5e7eb;background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
        <td style="padding:6px 8px;font-size:11px;">${i + 1}</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:${item.prioridade === "alta" ? "bold" : "normal"}">${item.nome}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:center;">${item.codPdv || "-"}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:center;">${fmtNum(item.qtdSemana, 0)}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:center;">${fmtNum(item.estoqueAtual, 0)}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:center;font-weight:bold;color:${item.prioridade === "alta" ? "#dc2626" : "#1f2937"};">${item.qtdAjustada}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:right;">${item.custoProduto > 0 ? fmtBRL(item.custoProduto) : "-"}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:right;font-weight:bold;">${item.custoTotalAjustado > 0 ? fmtBRL(item.custoTotalAjustado) : "-"}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Compras</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;padding:24px;color:#1f2937;}
    h1{font-size:18px;font-weight:bold;margin-bottom:4px;}
    .sub{font-size:11px;color:#6b7280;margin-bottom:16px;}
    .summary{display:flex;gap:12px;margin-bottom:16px;}
    .card{flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center;}
    .card .lbl{font-size:10px;color:#6b7280;}.card .val{font-size:15px;font-weight:bold;}
    table{width:100%;border-collapse:collapse;}
    thead th{background:#1e293b;color:#fff;padding:8px;text-align:left;font-size:11px;}
    tfoot td{padding:8px;font-weight:bold;font-size:12px;border-top:2px solid #1e293b;}
    @media print{body{padding:12px;}}</style></head><body>
    <h1>🛒 Planejamento de Compras — Duo Gelatto</h1>
    <div class="sub">Período: ${data?.periodo?.dataInicio} a ${data?.periodo?.dataFim} | Projeção: ${diasProjecao} dias | Gerado em: ${new Date().toLocaleString("pt-BR")}</div>
    <div class="summary">
      <div class="card"><div class="lbl">Produtos Selecionados</div><div class="val">${selecionados.length}</div></div>
      <div class="card"><div class="lbl">Total Unidades</div><div class="val">${fmtNum(totais.totalUnidades, 0)}</div></div>
      <div class="card"><div class="lbl">Custo Total</div><div class="val" style="color:#dc2626;">${fmtBRL(totais.totalCusto)}</div></div>
      ${orcamentoNum ? `<div class="card"><div class="lbl">Saldo do Orçamento</div><div class="val" style="color:${(orcamentoRestante ?? 0) >= 0 ? "#16a34a" : "#dc2626"};">${fmtBRL(orcamentoRestante ?? 0)}</div></div>` : ""}
    </div>
    <table><thead><tr><th>#</th><th>Produto</th><th>Cód.</th><th>Venda/Sem</th><th>Estoque</th><th>Qtd. Comprar</th><th>Custo Unit.</th><th>Custo Total</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr><td colspan="7" style="text-align:right;">TOTAL</td><td style="text-align:right;">${fmtBRL(totais.totalCusto)}</td></tr></tfoot>
    </table></body></html>`;

    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  const prioridadeConfig = {
    alta: { label: "Alta", color: "bg-red-500/10 text-red-600 border-red-500/20", dot: "bg-red-500" },
    media: { label: "Média", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", dot: "bg-amber-500" },
    baixa: { label: "Baixa", color: "bg-green-500/10 text-green-600 border-green-500/20", dot: "bg-green-500" },
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      <BackButton to="/purchase-suggestion" />

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-500" />
            Planejamento de Compras com IA
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sugestão automática baseada em vendas + estoque + preço de custo do INOVE
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5 border-green-500/40 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5 border-red-500/40 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
            <FileText className="w-3.5 h-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {/* Parâmetros */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Parâmetros do Planejamento
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Dias de análise */}
          <div className="space-y-2">
            <Label className="text-xs">Dias analisados: <span className="font-bold text-primary">{diasAnalise}</span></Label>
            <Slider
              min={7} max={30} step={1}
              value={[diasAnalise]}
              onValueChange={([v]) => setDiasAnalise(v)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground"><span>7d</span><span>30d</span></div>
          </div>
          {/* Dias de projeção */}
          <div className="space-y-2">
            <Label className="text-xs">Projeção para: <span className="font-bold text-primary">{diasProjecao} dias</span></Label>
            <Slider
              min={7} max={14} step={1}
              value={[diasProjecao]}
              onValueChange={([v]) => setDiasProjecao(v)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground"><span>7d</span><span>14d</span></div>
          </div>
          {/* Margem de segurança */}
          <div className="space-y-2">
            <Label className="text-xs">Margem de segurança: <span className="font-bold text-primary">{(fatorSeguranca * 100).toFixed(0)}%</span></Label>
            <Slider
              min={0} max={0.5} step={0.05}
              value={[fatorSeguranca]}
              onValueChange={([v]) => setFatorSeguranca(v)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground"><span>0%</span><span>50%</span></div>
          </div>
          {/* Orçamento */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Orçamento total (R$)
            </Label>
            <Input
              type="text"
              placeholder="Ex: 5000,00"
              value={orcamentoTotal}
              onChange={e => setOrcamentoTotal(e.target.value)}
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">Deixe vazio para sem limite</p>
          </div>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Erro ao carregar dados</p>
            <p className="text-xs text-muted-foreground">{error.message}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center space-y-3">
          <Brain className="w-10 h-10 text-purple-500 mx-auto animate-pulse" />
          <p className="text-sm font-medium">Analisando vendas e estoque com IA...</p>
          <p className="text-xs text-muted-foreground">Consultando PDV INOVE e gerando recomendações</p>
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/50 bg-card/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Produtos analisados</p>
              <p className="text-2xl font-bold text-primary">{data.totalProdutosAnalisados}</p>
              <p className="text-[10px] text-muted-foreground">período: {data.periodo?.dataInicio} a {data.periodo?.dataFim}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Precisam de compra</p>
              <p className="text-2xl font-bold text-amber-500">{data.totalItensParaComprar}</p>
              <p className="text-[10px] text-muted-foreground">produtos com sugestão &gt; 0</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Custo estimado total</p>
              <p className="text-xl font-bold text-destructive">{fmtBRL(data.totalCustoEstimado)}</p>
              <p className="text-[10px] text-muted-foreground">todos os produtos sugeridos</p>
            </div>
            <div className={cn(
              "rounded-xl border p-3 text-center",
              orcamentoNum
                ? (orcamentoRestante ?? 0) >= 0
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-red-500/30 bg-red-500/5"
                : "border-border/50 bg-card/50"
            )}>
              <p className="text-xs text-muted-foreground">
                {orcamentoNum ? "Saldo do orçamento" : "Selecionados"}
              </p>
              <p className={cn(
                "text-xl font-bold",
                orcamentoNum
                  ? (orcamentoRestante ?? 0) >= 0 ? "text-green-600" : "text-destructive"
                  : "text-foreground"
              )}>
                {orcamentoNum ? fmtBRL(orcamentoRestante ?? 0) : `${totais.totalItens} itens`}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {orcamentoNum
                  ? `de ${fmtBRL(orcamentoNum)} disponível`
                  : `${fmtBRL(totais.totalCusto)} selecionado`}
              </p>
            </div>
          </div>

          {/* Análise da IA */}
          {data.analiseIA && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 overflow-hidden">
              <button
                onClick={() => setShowIA(v => !v)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                    Análise da IA — Recomendações para esta semana
                  </span>
                </div>
                {showIA ? <ChevronUp className="w-4 h-4 text-purple-500" /> : <ChevronDown className="w-4 h-4 text-purple-500" />}
              </button>
              {showIA && (
                <div className="px-4 pb-4">
                  <div className="text-sm text-purple-900 dark:text-purple-100 whitespace-pre-wrap leading-relaxed">
                    {data.analiseIA}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Barra de totais selecionados */}
          {totais.totalItens > 0 && (
            <div className="sticky top-0 z-10 rounded-xl border border-primary/30 bg-primary/5 p-3 flex flex-wrap items-center gap-3">
              <ShoppingCart className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm font-semibold text-primary">{totais.totalItens} itens selecionados</span>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm">{fmtNum(totais.totalUnidades, 0)} unidades</span>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm font-bold text-destructive">{fmtBRL(totais.totalCusto)}</span>
              {orcamentoNum && (
                <>
                  <span className="text-sm text-muted-foreground">·</span>
                  <span className={cn(
                    "text-sm font-medium",
                    (orcamentoRestante ?? 0) >= 0 ? "text-green-600" : "text-destructive"
                  )}>
                    Saldo: {fmtBRL(orcamentoRestante ?? 0)}
                  </span>
                </>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={deselecionarTodos} className="h-7 text-xs">Limpar</Button>
                <Button size="sm" onClick={handleExportExcel} className="h-7 text-xs gap-1">
                  <FileSpreadsheet className="w-3 h-3" /> Exportar
                </Button>
              </div>
            </div>
          )}

          {/* Abas de categoria de compra */}
          <div className="flex gap-1 border-b border-border/50 pb-0">
            {([
              { key: "sorvete", label: "🍦 Sorvete", emoji: "🍦" },
              { key: "guloseimas", label: "🍬 Guloseimas", emoji: "🍬" },
              { key: "outros", label: "📦 Outros", emoji: "📦" },
              { key: "todos", label: "Todos", emoji: "" },
            ] as const).map(aba => {
              const count = itens.filter(item => {
                const cfg = configMap.get(item.produtoId);
                if (aba.key === "todos") return true;
                return (cfg?.purchaseCategory ?? "sorvete") === aba.key;
              }).length;
              return (
                <button
                  key={aba.key}
                  onClick={() => setAbaAtiva(aba.key)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                    abaAtiva === aba.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {aba.label}
                  <span className={cn(
                    "ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full",
                    abaAtiva === aba.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Filtros da tabela */}
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="Buscar produto..."
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              className="h-8 text-sm w-48"
            />
            <div className="flex gap-1">
              {(["todas", "alta", "media", "baixa"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setFiltroPrioridade(p)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                    filtroPrioridade === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border/50 text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  {p === "todas" ? "Todas" : p === "alta" ? "🔴 Alta" : p === "media" ? "🟡 Média" : "🟢 Baixa"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarSoComSugestao}
                onChange={e => setMostrarSoComSugestao(e.target.checked)}
                className="rounded"
              />
              Só com sugestão
            </label>
            <button onClick={selecionarTodos} className="text-xs text-primary underline underline-offset-2">
              Selecionar todos
            </button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={mostrarIgnorados}
                onChange={e => setMostrarIgnorados(e.target.checked)}
                className="rounded"
              />
              <EyeOff className="w-3 h-3" />
              Mostrar ignorados ({configs?.filter(c => c.ignorar).length ?? 0})
            </label>
          </div>

          {/* Tabela de produtos */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/50">
                    <th className="w-10 p-3 text-center"></th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Produto</th>
                    <th className="p-3 text-center font-medium text-muted-foreground whitespace-nowrap">Venda<br/><span className="text-[10px]">semana</span></th>
                    <th className="p-3 text-center font-medium text-muted-foreground whitespace-nowrap">Venda<br/><span className="text-[10px]">mês</span></th>
                    <th className="p-3 text-center font-medium text-muted-foreground whitespace-nowrap">Estoque<br/><span className="text-[10px]">atual</span></th>
                    <th className="p-3 text-center font-medium text-muted-foreground whitespace-nowrap">Necessidade<br/><span className="text-[10px]">c/ margem</span></th>
                    <th className="p-3 text-center font-medium text-muted-foreground whitespace-nowrap">Custo<br/><span className="text-[10px]">unit.</span></th>
                    <th className="p-3 text-center font-medium text-primary whitespace-nowrap">Qtd.<br/><span className="text-[10px]">comprar</span></th>
                    <th className="p-3 text-right font-medium text-primary whitespace-nowrap">Custo<br/><span className="text-[10px]">total</span></th>
                    <th className="p-3 text-center font-medium text-muted-foreground">Prior.</th>
                    <th className="w-10 p-3 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {itensFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-muted-foreground text-sm">
                        Nenhum produto encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  )}
                  {itensFiltrados.map(item => {
                    const pc = prioridadeConfig[item.prioridade];
                    const estoqueNegativo = item.estoqueAtual < 0;
                    const estoqueZero = item.estoqueAtual === 0;
                    const cfg = configMap.get(item.produtoId);
                    const isIgnorado = cfg?.ignorar === true;
                    return (
                      <tr
                        key={item.produtoId}
                        className={cn(
                          "transition-colors",
                          isIgnorado ? "opacity-40 bg-muted/10" :
                          item.selecionado ? "bg-primary/5" : "hover:bg-muted/10",
                          item.prioridade === "alta" && !item.selecionado && !isIgnorado && "bg-red-500/3"
                        )}
                      >
                        {/* Checkbox */}
                        <td className="p-3 text-center">
                          {!isIgnorado && (
                            <button onClick={() => toggleSelecionado(item.produtoId, item.selecionado)}>
                              {item.selecionado
                                ? <CheckSquare className="w-4 h-4 text-primary" />
                                : <Square className="w-4 h-4 text-muted-foreground" />
                              }
                            </button>
                          )}
                        </td>
                        {/* Nome */}
                        <td className="p-3">
                          <div className="font-medium text-sm leading-tight flex items-center gap-1.5">
                            {item.nome}
                            {isIgnorado && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground border border-border/50 font-normal">
                                ignorado
                              </span>
                            )}
                            {cfg?.unidadeCompra && !isIgnorado && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 font-normal">
                                {cfg.unidadeCompra}
                              </span>
                            )}
                          </div>
                          {item.codPdv && (
                            <div className="text-[10px] text-muted-foreground">Cód: {item.codPdv}</div>
                          )}
                          <div className="text-[10px] text-muted-foreground">{item.diasComVenda}d c/ venda · {fmtNum(item.mediaDiaria)}un/dia</div>
                        </td>
                        {/* Venda semana */}
                        <td className="p-3 text-center">
                          <span className="font-medium">{fmtNum(item.qtdSemana, 0)}</span>
                          <div className="text-[10px] text-muted-foreground">{fmtBRL(item.faturamentoSemana)}</div>
                        </td>
                        {/* Venda mês */}
                        <td className="p-3 text-center text-muted-foreground">
                          <span>{fmtNum(item.qtdMes, 0)}</span>
                          <div className="text-[10px]">{fmtBRL(item.faturamentoMes)}</div>
                        </td>
                        {/* Estoque */}
                        <td className="p-3 text-center">
                          <span className={cn(
                            "font-medium",
                            estoqueNegativo ? "text-destructive" :
                            estoqueZero ? "text-amber-500" :
                            "text-foreground"
                          )}>
                            {fmtNum(item.estoqueAtual, 0)}
                          </span>
                          {(estoqueNegativo || estoqueZero) && (
                            <div className="text-[10px] text-destructive">
                              {estoqueNegativo ? "negativo!" : "zerado"}
                            </div>
                          )}
                        </td>
                        {/* Necessidade */}
                        <td className="p-3 text-center text-muted-foreground">
                          {fmtNum(item.necessidadeComSeguranca, 0)}
                        </td>
                        {/* Custo unit */}
                        <td className="p-3 text-center text-muted-foreground text-xs">
                          {item.custoProduto > 0 ? fmtBRL(item.custoProduto) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        {/* Qtd editável */}
                        <td className="p-3 text-center">
                          <Input
                            type="number"
                            min={0}
                            value={item.qtdAjustada}
                            onChange={e => {
                              const v = Math.max(0, parseInt(e.target.value) || 0);
                              updateEdit(item.produtoId, "qtdAjustada", v);
                              if (!item.selecionado && v > 0) updateEdit(item.produtoId, "selecionado", true);
                            }}
                            className="h-7 w-20 text-center text-sm font-bold mx-auto"
                          />
                        </td>
                        {/* Custo total */}
                        <td className="p-3 text-right">
                          {item.custoTotalAjustado > 0
                            ? <span className="font-medium">{fmtBRL(item.custoTotalAjustado)}</span>
                            : <span className="text-muted-foreground/40 text-xs">—</span>
                          }
                        </td>
                        {/* Prioridade */}
                        <td className="p-3 text-center">
                          {!isIgnorado && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", pc.color)}>
                              {pc.label}
                            </span>
                          )}
                        </td>
                        {/* Botão configurar */}
                        <td className="p-3 text-center">
                          <button
                            onClick={() => openConfig(item.produtoId, item.nome)}
                            className={cn(
                              "p-1 rounded hover:bg-muted/50 transition-colors",
                              isIgnorado ? "text-muted-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                            title="Configurar produto"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {totais.totalItens > 0 && (
                  <tfoot>
                    <tr className="bg-muted/20 border-t-2 border-border/50">
                      <td colSpan={8} className="p-3 text-right text-sm font-semibold text-muted-foreground">
                        Total selecionado ({totais.totalItens} itens · {fmtNum(totais.totalUnidades, 0)} un):
                      </td>
                      <td className="p-3 text-center font-bold text-primary">{fmtNum(totais.totalUnidades, 0)}</td>
                      <td className="p-3 text-right font-bold text-destructive text-base">{fmtBRL(totais.totalCusto)}</td>
                      <td></td>
                    </tr>
                    {orcamentoNum && (
                      <tr className={cn(
                        "border-t border-border/30",
                        (orcamentoRestante ?? 0) >= 0 ? "bg-green-500/5" : "bg-red-500/5"
                      )}>
                        <td colSpan={8} className="p-3 text-right text-sm font-semibold">
                          Orçamento: {fmtBRL(orcamentoNum)} · Saldo:
                        </td>
                        <td className={cn(
                          "p-3 text-right font-bold text-base",
                          (orcamentoRestante ?? 0) >= 0 ? "text-green-600" : "text-destructive"
                        )}>
                          {fmtBRL(orcamentoRestante ?? 0)}
                        </td>
                        <td></td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Dados do PDV INOVE · Período: {data.periodo?.dataInicio} a {data.periodo?.dataFim} ·
            Margem de segurança: {(fatorSeguranca * 100).toFixed(0)}% · {data.totalProdutosAnalisados} produtos analisados
          </p>
        </>
      )}
      {/* Sheet de Configuração de Produto */}
      <Sheet open={configSheetOpen} onOpenChange={setConfigSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Configurar Produto
            </SheetTitle>
            {configProduto && (
              <p className="text-sm text-muted-foreground font-medium">{configProduto.nome}</p>
            )}
          </SheetHeader>

          <div className="space-y-5">
            {/* Ignorar no planejamento */}
            <div className="rounded-lg border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Ignorar no planejamento</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Produto não aparecerá na lista de compras</p>
                </div>
                <Switch
                  checked={configIgnorar}
                  onCheckedChange={setConfigIgnorar}
                />
              </div>
              {configIgnorar && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Input
                    placeholder="Ex: vendido em kg, comprado em litros"
                    value={configMotivo}
                    onChange={e => setConfigMotivo(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </div>

            {/* Categoria de compra */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Categoria de Compra</Label>
              <p className="text-xs text-muted-foreground">Define em qual aba do planejamento este produto aparece</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "sorvete", label: "🍦 Sorvete" },
                  { key: "guloseimas", label: "🍬 Guloseimas" },
                  { key: "outros", label: "📦 Outros" },
                ] as const).map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setConfigCategoria(cat.key)}
                    className={cn(
                      "text-xs px-2 py-2 rounded border transition-colors",
                      configCategoria === cat.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border/50 hover:bg-muted/50"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Unidade de compra */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Unidade de Compra</Label>
              <p className="text-xs text-muted-foreground">Como este produto é comprado do fornecedor</p>
              <div className="grid grid-cols-3 gap-2">
                {["unidade", "caixa", "litro", "kg", "fardo", "pacote"].map(u => (
                  <button
                    key={u}
                    onClick={() => setConfigUnidade(configUnidade === u ? "" : u)}
                    className={cn(
                      "text-xs px-2 py-1.5 rounded border transition-colors",
                      configUnidade === u
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border/50 hover:bg-muted/50"
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Ou digite outra unidade..."
                value={["unidade", "caixa", "litro", "kg", "fardo", "pacote"].includes(configUnidade) ? "" : configUnidade}
                onChange={e => setConfigUnidade(e.target.value)}
                className="h-8 text-sm mt-1"
              />
            </div>

            {/* Lote mínimo */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Lote Mínimo de Compra</Label>
              <p className="text-xs text-muted-foreground">Múltiplo de compra (ex: caixas de 12 unidades)</p>
              <Input
                type="number"
                min={0}
                step={1}
                placeholder="Ex: 12"
                value={configLote}
                onChange={e => setConfigLote(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Estoque mínimo */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Estoque Mínimo Desejado</Label>
              <p className="text-xs text-muted-foreground">Quantidade mínima que deve sempre ter em estoque</p>
              <Input
                type="number"
                min={0}
                step={1}
                placeholder="Ex: 50"
                value={configEstoqueMin}
                onChange={e => setConfigEstoqueMin(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Botões */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={saveConfig}
                disabled={upsertConfig.isPending}
                className="flex-1"
              >
                {upsertConfig.isPending ? "Salvando..." : "Salvar Configuração"}
              </Button>
              <Button variant="outline" onClick={() => setConfigSheetOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
