import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, BarChart2 } from "lucide-react";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function getMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    options.push({ value: `${y}-${m}`, label: `${MONTHS[d.getMonth()]} ${y}` });
  }
  return options;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function VarianceBadge({ v1, v2 }: { v1: number; v2: number }) {
  if (v1 === 0 && v2 === 0) return <span className="text-gray-400 text-xs">—</span>;
  const diff = v2 - v1;
  const pct = v1 !== 0 ? ((diff / v1) * 100).toFixed(1) : "∞";
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-red-400 text-xs font-semibold">
        <TrendingUp className="w-3 h-3" />+{fmt(diff)} ({pct}%)
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-green-400 text-xs font-semibold">
        <TrendingDown className="w-3 h-3" />{fmt(diff)} ({pct}%)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
      <Minus className="w-3 h-3" />Igual
    </span>
  );
}

export default function FinMonthlyComparison() {
  const [, setLocation] = useLocation();
  const monthOptions = useMemo(() => getMonthOptions(), []);

  const now = new Date();
  const defaultM2 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultM1 = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const [month1, setMonth1] = useState(defaultM1);
  const [month2, setMonth2] = useState(defaultM2);

  const { data, isLoading } = trpc.fin.monthlyComparison.compare.useQuery(
    { month1, month2 },
    { enabled: !!month1 && !!month2 }
  );

  const month1Label = monthOptions.find(o => o.value === month1)?.label ?? month1;
  const month2Label = monthOptions.find(o => o.value === month2)?.label ?? month2;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/fin/dashboard")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-purple-400" />
            Comparativo Mensal
          </h1>
          <p className="text-sm text-gray-400">Compare despesas por categoria entre dois meses</p>
        </div>
      </div>

      {/* Month Selectors */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-400 mb-1">Mês Base</label>
              <select
                value={month1}
                onChange={e => setMonth1(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {monthOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-400 mb-1">Mês Comparado</label>
              <select
                value={month2}
                onChange={e => setMonth2(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {monthOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">{month1Label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white">{fmt(data.month1Total)}</p>
              <p className="text-xs text-gray-400 mt-1">{data.categories.length} categorias</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">{month2Label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white">{fmt(data.month2Total)}</p>
              <p className="text-xs text-gray-400 mt-1">{data.categories.length} categorias</p>
            </CardContent>
          </Card>
          <Card className={`border ${data.month2Total > data.month1Total ? "bg-red-900/20 border-red-700" : "bg-green-900/20 border-green-700"}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">Variação Total</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${data.month2Total > data.month1Total ? "text-red-400" : "text-green-400"}`}>
                {data.month2Total >= data.month1Total ? "+" : ""}{fmt(data.month2Total - data.month1Total)}
              </p>
              {data.month1Total > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {(((data.month2Total - data.month1Total) / data.month1Total) * 100).toFixed(1)}% vs mês base
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Comparison Table */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Comparativo por Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-10 text-gray-400">Carregando...</div>
          ) : !data || data.categories.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              Nenhum lançamento encontrado nos períodos selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Categoria</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">{month1Label}</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">{month2Label}</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((cat, idx) => {
                    const v1 = data.month1[cat] ?? 0;
                    const v2 = data.month2[cat] ?? 0;
                    const isHigher = v2 > v1;
                    const isLower = v2 < v1;
                    return (
                      <tr
                        key={cat}
                        className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${idx % 2 === 0 ? "bg-gray-800" : "bg-gray-800/50"}`}
                      >
                        <td className="py-3 px-4 text-white font-medium">{cat}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{v1 > 0 ? fmt(v1) : <span className="text-gray-500">—</span>}</td>
                        <td className={`py-3 px-4 text-right font-medium ${isHigher ? "text-red-400" : isLower ? "text-green-400" : "text-gray-300"}`}>
                          {v2 > 0 ? fmt(v2) : <span className="text-gray-500">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <VarianceBadge v1={v1} v2={v2} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-600 bg-gray-700/50">
                    <td className="py-3 px-4 text-white font-bold">TOTAL</td>
                    <td className="py-3 px-4 text-right text-white font-bold">{fmt(data.month1Total)}</td>
                    <td className="py-3 px-4 text-right text-white font-bold">{fmt(data.month2Total)}</td>
                    <td className="py-3 px-4 text-right">
                      <VarianceBadge v1={data.month1Total} v2={data.month2Total} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bar Chart Visual */}
      {data && data.categories.length > 0 && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Visualização por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.categories.map(cat => {
                const v1 = data.month1[cat] ?? 0;
                const v2 = data.month2[cat] ?? 0;
                const maxVal = Math.max(data.month1Total, data.month2Total, 1);
                const bar1Pct = (v1 / maxVal) * 100;
                const bar2Pct = (v2 / maxVal) * 100;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span className="font-medium text-white">{cat}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-400 w-24 text-right">{v1 > 0 ? fmt(v1) : "—"}</span>
                      <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${bar1Pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-purple-400 w-24 text-right">{v2 > 0 ? fmt(v2) : "—"}</span>
                      <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${v2 > v1 ? "bg-red-500" : "bg-purple-500"}`}
                          style={{ width: `${bar2Pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />{month1Label}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-500 inline-block" />{month2Label}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
