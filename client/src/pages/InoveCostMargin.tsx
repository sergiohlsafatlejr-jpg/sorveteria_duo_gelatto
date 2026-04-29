import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { TrendingUp, Package, DollarSign, AlertTriangle, Search, Download } from "lucide-react";

function fmt(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtQty(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
function fmtPct(v: number | null | undefined) {
  return `${Number(v || 0).toFixed(1)}%`;
}

function marginColor(m: number) {
  if (m >= 50) return "#10b981"; // verde
  if (m >= 25) return "#f59e0b"; // amarelo
  return "#ef4444"; // vermelho
}

function marginBadge(m: number) {
  if (m >= 50) return "bg-green-500/15 text-green-700 border-green-500/30";
  if (m >= 25) return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
  return "bg-red-500/15 text-red-700 border-red-500/30";
}

export default function InoveCostMargin() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"revenue" | "margin" | "profit" | "qty">("revenue");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading, error } = trpc.inove.getCostMarginFull.useQuery(
    { search: debouncedSearch || undefined, sortBy },
    { retry: false }
  );

  const top10Chart = useMemo(() => {
    if (!data?.items) return [];
    return data.items
      .filter(i => !i.semCusto)
      .slice(0, 10)
      .map(i => ({
        nome: i.nome.length > 14 ? i.nome.substring(0, 14) + "…" : i.nome,
        nomeCompleto: i.nome,
        margem: parseFloat(i.margem.toFixed(1)),
      }));
  }, [data]);

  function handleSearch() {
    setDebouncedSearch(search);
  }

  function exportCsv() {
    if (!data?.items) return;
    const header = "Produto,Cód PDV,Qtd,Preço Médio,Custo Unit.,CMV,Receita,Lucro Bruto,Margem %\n";
    const rows = data.items.map(i =>
      `"${i.nome}","${i.codPdv}",${i.qtd.toFixed(2)},${i.precoMedio.toFixed(2)},${i.custo.toFixed(2)},${i.cmv.toFixed(2)},${i.receita.toFixed(2)},${i.lucroBruto.toFixed(2)},${i.margem.toFixed(1)}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custo_margem_inove.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-green-600" />
              Relatório de Custo x Margem
            </h1>
            <p className="text-sm text-muted-foreground">
              Análise de custo, CMV e margem bruta — últimos 12 meses (PDV INOVE)
            </p>
          </div>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 text-red-700 text-sm">
              ⚠️ {error.message.includes("Failed to fetch") ? "Não foi possível conectar ao servidor. Tente novamente." : error.message}
            </CardContent>
          </Card>
        )}
        {data && (data as any).fonte === "local" && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-3 text-blue-700 text-sm flex items-start gap-2">
              <span className="mt-0.5">ℹ️</span>
              <span>Exibindo dados das <strong>importações confirmadas</strong> no sistema local. O conector INOVE SQL Server está inativo ou inacessível. Os custos unitários vêm do cadastro de produtos.</span>
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Receita Total</p>
                  <p className="text-2xl font-bold mt-1">{isLoading ? "..." : fmt(data?.totalReceita)}</p>
                </div>
                <div className="p-2 rounded-lg bg-green-500"><TrendingUp className="w-5 h-5 text-white" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">CMV Total</p>
                  <p className="text-2xl font-bold mt-1">{isLoading ? "..." : fmt(data?.totalCmv)}</p>
                  {data && data.totalReceita > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {fmtPct((data.totalCmv / data.totalReceita) * 100)} da receita
                    </p>
                  )}
                </div>
                <div className="p-2 rounded-lg bg-orange-500"><Package className="w-5 h-5 text-white" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Lucro Bruto</p>
                  <p className="text-2xl font-bold mt-1">{isLoading ? "..." : fmt(data?.totalLucro)}</p>
                  {data && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Margem {fmtPct(data.margemGeral)}
                    </p>
                  )}
                </div>
                <div className="p-2 rounded-lg bg-blue-500"><DollarSign className="w-5 h-5 text-white" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Sem custo cadastrado</p>
                  <p className="text-2xl font-bold mt-1">{isLoading ? "..." : data?.semCustoCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">produtos — margem não calculada</p>
                </div>
                <div className="p-2 rounded-lg bg-red-400"><AlertTriangle className="w-5 h-5 text-white" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico Top 10 Margem */}
        {top10Chart.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 10 — Margem Bruta por Produto (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={top10Chart} margin={{ bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="nome"
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(1)}%`, "Margem"]}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.nomeCompleto ?? _label}
                  />
                  <Bar dataKey="margem" radius={[3, 3, 0, 0]}>
                    {top10Chart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={marginColor(entry.margem)} />
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
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">
                Detalhamento por Produto {data ? `(${data.items.length})` : ""}
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    className="pl-8 w-52"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Por Receita</SelectItem>
                    <SelectItem value="margin">Por Margem</SelectItem>
                    <SelectItem value="profit">Por Lucro</SelectItem>
                    <SelectItem value="qty">Por Qtd</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
                  <Download className="h-4 w-4 mr-1" /> Exportar CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando dados do INOVE...</div>
            ) : !data || data.items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhum dado encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Produto</th>
                      <th className="text-right p-3 font-medium">Qtd</th>
                      <th className="text-right p-3 font-medium">Preço Médio</th>
                      <th className="text-right p-3 font-medium">Custo Unit.</th>
                      <th className="text-right p-3 font-medium">Receita</th>
                      <th className="text-right p-3 font-medium">CMV</th>
                      <th className="text-right p-3 font-medium">Lucro Bruto</th>
                      <th className="text-center p-3 font-medium">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.produtoId} className="border-t hover:bg-muted/20">
                        <td className="p-3">
                          <p className="font-medium">{item.nome}</p>
                          {item.semCusto && (
                            <p className="text-xs text-orange-500">sem custo cadastrado</p>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">{fmtQty(item.qtd)}</td>
                        <td className="p-3 text-right tabular-nums">{fmt(item.precoMedio)}</td>
                        <td className="p-3 text-right tabular-nums">
                          {item.semCusto ? (
                            <span className="text-muted-foreground">—</span>
                          ) : fmt(item.custo)}
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold text-green-600">
                          {fmt(item.receita)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-orange-600">
                          {item.semCusto ? <span className="text-muted-foreground">—</span> : fmt(item.cmv)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {item.semCusto ? <span className="text-muted-foreground">—</span> : fmt(item.lucroBruto)}
                        </td>
                        <td className="p-3 text-center">
                          {item.semCusto ? (
                            <Badge variant="outline" className="text-xs">N/A</Badge>
                          ) : (
                            <Badge className={`text-xs ${marginBadge(item.margem)}`}>
                              {fmtPct(item.margem)}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
