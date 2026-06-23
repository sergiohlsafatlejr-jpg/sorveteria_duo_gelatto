import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  TrendingDown, TrendingUp, Target, AlertTriangle, Brain,
  DollarSign, BarChart3, Scissors, RefreshCw, ChevronDown, ChevronUp,
  ArrowLeft, Zap
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default function FinOtimizacao() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [orcamento, setOrcamento] = useState("");
  const [expandedCategoria, setExpandedCategoria] = useState<string | null>(null);

  const month = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  const orcamentoNum = orcamento ? parseFloat(orcamento.replace(",", ".")) : undefined;

  const { data, isLoading, refetch } = trpc.reports.analiseOtimizacao.useQuery(
    { month, orcamentoCompras: orcamentoNum },
    { staleTime: 5 * 60 * 1000 }
  );

  const anos = useMemo(() => {
    const a = [];
    for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) a.push(y);
    return a;
  }, []);

  const isPositivo = (data?.resultado ?? 0) >= 0;
  const corteNecessario = data ? Math.max(0, -data.resultado) : 0;

  // Categorias ordenadas por valor
  const despesasOrdenadas = useMemo(() => {
    if (!data) return [];
    return [...data.despesas].sort((a, b) => b.total - a.total);
  }, [data]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/fin/dre">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scissors className="w-6 h-6 text-primary" />
            Otimização Financeira
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise de custos variáveis e recomendações para fechar no positivo
          </p>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            {anos.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Campo de orçamento */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <DollarSign className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1">
              <Label className="text-sm font-semibold">Orçamento disponível para compras (opcional)</Label>
              <p className="text-xs text-muted-foreground">Informe o valor que pode gastar em compras este mês para a IA considerar na análise</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">R$</span>
              <Input
                type="text"
                placeholder="Ex: 15.000,00"
                value={orcamento}
                onChange={(e) => setOrcamento(e.target.value)}
                className="w-36 h-9 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Analisando dados financeiros...</span>
        </div>
      )}

      {data && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Receita */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Receita</p>
                    <p className="text-xl font-bold text-green-600 mt-1">{fmt(data.receitaInove)}</p>
                    <Badge variant="outline" className={`text-[10px] mt-1 ${
                      data.fonteReceita === "projecao" ? "bg-purple-500/20 text-purple-300 border-purple-500/30" :
                      data.fonteReceita === "previsao" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
                      data.fonteReceita === "inove" ? "bg-green-500/20 text-green-300 border-green-500/30" :
                      "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                    }`}>
                      {data.fonteReceita === "projecao" ? "📊 Projeção de Faturamento" :
                       data.fonteReceita === "previsao" ? "📅 Faturamento Real Importado" :
                       data.fonteReceita === "inove" ? "● PDV INOVE" : "⚠ Dados locais"}
                    </Badge>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-500/30" />
                </div>
              </CardContent>
            </Card>

            {/* Despesas */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Despesas Totais</p>
                    <p className="text-xl font-bold text-red-500 mt-1">{fmt(data.totalDespesas)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {fmt(data.totalPago)} pago · {fmt(data.totalPendente)} pendente
                    </p>
                  </div>
                  <TrendingDown className="w-8 h-8 text-red-500/30" />
                </div>
              </CardContent>
            </Card>

            {/* Resultado */}
            <Card className={cn(isPositivo ? "border-green-500/30" : "border-red-500/30")}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Resultado</p>
                    <p className={cn("text-xl font-bold mt-1", isPositivo ? "text-green-600" : "text-red-500")}>
                      {fmt(data.resultado)}
                    </p>
                    <p className={cn("text-[11px] mt-1", isPositivo ? "text-green-600" : "text-red-500")}>
                      Margem: {data.margemLiquida.toFixed(1)}%
                    </p>
                  </div>
                  {isPositivo
                    ? <TrendingUp className="w-8 h-8 text-green-500/30" />
                    : <AlertTriangle className="w-8 h-8 text-red-500/30" />
                  }
                </div>
              </CardContent>
            </Card>

            {/* Corte necessário / Folga */}
            <Card className={cn(!isPositivo ? "border-orange-500/30 bg-orange-50/30" : "border-green-500/30 bg-green-50/30")}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {isPositivo ? "Folga Financeira" : "Corte Necessário"}
                    </p>
                    <p className={cn("text-xl font-bold mt-1", isPositivo ? "text-green-600" : "text-orange-600")}>
                      {fmt(isPositivo ? data.resultado : corteNecessario)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {isPositivo ? "para investir ou reservar" : "para fechar no zero"}
                    </p>
                  </div>
                  <Target className="w-8 h-8 text-orange-500/30" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Barra de progresso: despesas vs receita */}
          {data.receitaInove > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Comprometimento da Receita com Despesas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>0%</span>
                  <span className={cn("font-semibold", data.totalDespesas / data.receitaInove > 1 ? "text-red-500" : "text-foreground")}>
                    {((data.totalDespesas / data.receitaInove) * 100).toFixed(1)}% comprometido
                  </span>
                  <span>100%</span>
                </div>
                <Progress
                  value={Math.min((data.totalDespesas / data.receitaInove) * 100, 100)}
                  className={cn("h-4", data.totalDespesas > data.receitaInove ? "[&>div]:bg-red-500" : "[&>div]:bg-primary")}
                />
                {!isPositivo && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      As despesas superam a receita em <strong>{fmt(corteNecessario)}</strong>.
                      É necessário reduzir custos ou aumentar vendas para fechar no positivo.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Despesas por categoria */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-primary" />
                  Despesas por Categoria — Potencial de Corte
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {despesasOrdenadas.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma despesa registrada para {MESES[selectedMonth - 1]}/{selectedYear}
                  </p>
                )}
                {despesasOrdenadas.map((d, i) => {
                  const pctReceita = data.receitaInove > 0 ? (d.total / data.receitaInove) * 100 : 0;
                  const isAlto = pctReceita > 20;
                  const isMedio = pctReceita > 10 && pctReceita <= 20;
                  const isExpanded = expandedCategoria === d.categoria;

                  return (
                    <div key={d.categoria} className="border border-border/40 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                        onClick={() => setExpandedCategoria(isExpanded ? null : d.categoria)}
                      >
                        <span className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                          isAlto ? "bg-red-100 text-red-700" : isMedio ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
                        )}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate">{d.categoria}</span>
                            <span className="text-sm font-bold ml-2 shrink-0">{fmt(d.total)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-muted rounded-full h-1.5">
                              <div
                                className={cn("h-1.5 rounded-full", isAlto ? "bg-red-500" : isMedio ? "bg-orange-500" : "bg-green-500")}
                                style={{ width: `${Math.min(pctReceita, 100)}%` }}
                              />
                            </div>
                            <span className={cn("text-[11px] shrink-0", isAlto ? "text-red-600 font-semibold" : "text-muted-foreground")}>
                              {pctReceita.toFixed(1)}% da receita
                            </span>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0 bg-muted/20 border-t border-border/30 space-y-2">
                          <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                            <div className="text-center">
                              <p className="text-muted-foreground">Total</p>
                              <p className="font-semibold">{fmt(d.total)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-muted-foreground">Pago</p>
                              <p className="font-semibold text-green-600">{fmt(d.pago)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-muted-foreground">Pendente</p>
                              <p className="font-semibold text-orange-600">{fmt(d.pendente)}</p>
                            </div>
                          </div>
                          {isAlto && (
                            <div className="flex items-start gap-1.5 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>Esta categoria representa mais de 20% da receita — alta prioridade de revisão.</span>
                            </div>
                          )}
                          {!isPositivo && (
                            <div className="text-xs text-muted-foreground">
                              Reduzir 10% desta categoria economizaria <strong>{fmt(d.total * 0.1)}</strong>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Análise da IA */}
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  Análise e Recomendações da IA
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    <Zap className="w-3 h-3 mr-1" />
                    IA Financeira
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.analiseIA ? (
                  <div className="prose prose-sm max-w-none text-sm leading-relaxed">
                    <Streamdown>{data.analiseIA}</Streamdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Análise indisponível para este período.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Simulador de corte */}
          {!isPositivo && despesasOrdenadas.length > 0 && (
            <Card className="border-orange-500/20 bg-orange-50/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-600" />
                  Simulador: Como fechar no positivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Para cobrir o déficit de <strong className="text-red-600">{fmt(corteNecessario)}</strong>, você precisaria reduzir as seguintes categorias:
                </p>
                <div className="space-y-2">
                  {despesasOrdenadas.slice(0, 5).map((d) => {
                    const corte10 = d.total * 0.1;
                    const corte20 = d.total * 0.2;
                    return (
                      <div key={d.categoria} className="flex items-center gap-3 text-sm">
                        <span className="w-40 truncate text-muted-foreground">{d.categoria}</span>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-[11px] text-orange-700 border-orange-300">
                            −10% = {fmt(corte10)}
                          </Badge>
                          <Badge variant="outline" className="text-[11px] text-red-700 border-red-300">
                            −20% = {fmt(corte20)}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Separator className="my-4" />
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Reduzindo 10% nas 3 maiores categorias:</span>
                  <strong className="text-green-600">
                    {fmt(despesasOrdenadas.slice(0, 3).reduce((s, d) => s + d.total * 0.1, 0))} de economia
                  </strong>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Custos fixos cadastrados */}
          {data.custosFixos.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Custos Cadastrados — Fixos vs Variáveis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-xs text-blue-600 font-medium">Custos Fixos Mensais</p>
                    <p className="text-lg font-bold text-blue-700">{fmt(data.totalCustosFixosCadastrados)}</p>
                    <p className="text-[11px] text-blue-500">Comprometidos independente da receita</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
                    <p className="text-xs text-purple-600 font-medium">Custos Variáveis</p>
                    <p className="text-lg font-bold text-purple-700">{fmt(data.totalCustosVariaveisCadastrados)}</p>
                    <p className="text-[11px] text-purple-500">Podem ser ajustados conforme vendas</p>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {data.custosFixos.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={c.type === "fixed" ? "secondary" : "outline"} className="text-[10px]">
                          {c.type === "fixed" ? "Fixo" : "Variável"}
                        </Badge>
                        <span className="text-muted-foreground">{c.name}</span>
                      </div>
                      <span className="font-medium">{fmt(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
