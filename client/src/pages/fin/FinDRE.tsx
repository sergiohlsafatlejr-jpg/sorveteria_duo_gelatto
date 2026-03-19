import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1];

interface DRERow {
  label: string;
  value: number;
  indent?: number;
  bold?: boolean;
  positive?: boolean;
  negative?: boolean;
  separator?: boolean;
}

export default function FinDRE() {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(currentYear);

  const dateFrom = new Date(year, month, 1);
  const dateTo = new Date(year, month + 1, 0, 23, 59, 59);

  const { data: transactions = [] } = trpc.fin.transactions.list.useQuery({ dateFrom, dateTo });
  const { data: receivables = [] } = trpc.fin.receivables.list.useQuery({ dateFrom, dateTo });
  const { data: costs = [] } = trpc.fin.costs.list.useQuery();
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();

  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  // Revenue
  const totalRevenue = receivables.filter(r => r.isReceived).reduce((s, r) => s + Number(r.amount), 0);
  const pendingRevenue = receivables.filter(r => !r.isReceived).reduce((s, r) => s + Number(r.amount), 0);

  // Expenses by category
  const expensesByCategory = new Map<string, number>();
  transactions.forEach(t => {
    const cat = t.categoryId ? (categoryMap.get(t.categoryId) ?? "Outros") : "Sem categoria";
    expensesByCategory.set(cat, (expensesByCategory.get(cat) ?? 0) + Number(t.amount));
  });

  const totalExpensesPaid = transactions.filter(t => t.isPaid).reduce((s, t) => s + Number(t.amount), 0);
  const totalExpensesPending = transactions.filter(t => !t.isPaid).reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = totalExpensesPaid + totalExpensesPending;

  // Fixed and variable costs
  const totalFixedCosts = costs.filter(c => c.type === "fixed").reduce((s, c) => s + Number(c.value), 0);
  const totalVariableCosts = costs.filter(c => c.type === "variable").reduce((s, c) => s + Number(c.value), 0);

  // EBITDA and results
  const grossProfit = totalRevenue - totalExpensesPaid;
  const ebitda = grossProfit - totalFixedCosts;
  const netResult = ebitda - totalVariableCosts;
  const margin = totalRevenue > 0 ? (netResult / totalRevenue) * 100 : 0;

  const dreRows: DRERow[] = [
    { label: "RECEITA BRUTA", value: totalRevenue + pendingRevenue, bold: true, positive: true },
    { label: "Receitas Recebidas", value: totalRevenue, indent: 1, positive: true },
    { label: "Receitas Pendentes", value: pendingRevenue, indent: 1 },
    { label: "", value: 0, separator: true },
    { label: "(-) DEDUÇÕES / DESPESAS", value: totalExpenses, bold: true, negative: true },
    { label: "Despesas Pagas", value: totalExpensesPaid, indent: 1, negative: true },
    { label: "Despesas Pendentes", value: totalExpensesPending, indent: 1 },
    ...Array.from(expensesByCategory.entries()).map(([cat, val]) => ({
      label: cat, value: val, indent: 2,
    })),
    { label: "", value: 0, separator: true },
    { label: "LUCRO BRUTO", value: grossProfit, bold: true, positive: grossProfit >= 0, negative: grossProfit < 0 },
    { label: "", value: 0, separator: true },
    { label: "(-) CUSTOS FIXOS", value: totalFixedCosts, bold: true, negative: true },
    { label: "(-) CUSTOS VARIÁVEIS", value: totalVariableCosts, bold: true, negative: true },
    { label: "", value: 0, separator: true },
    { label: "EBITDA", value: ebitda, bold: true, positive: ebitda >= 0, negative: ebitda < 0 },
    { label: "", value: 0, separator: true },
    { label: "RESULTADO LÍQUIDO", value: netResult, bold: true, positive: netResult >= 0, negative: netResult < 0 },
    { label: `Margem Líquida: ${margin.toFixed(1)}%`, value: netResult, indent: 1, positive: netResult >= 0, negative: netResult < 0 },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">DRE — Demonstrativo de Resultado</h1>
          <p className="text-sm text-muted-foreground">Análise financeira do período selecionado</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Mês</Label>
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ano</Label>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Result Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Receita Total", value: totalRevenue + pendingRevenue, color: "text-emerald-500" },
          { label: "Despesas Totais", value: totalExpenses, color: "text-destructive" },
          { label: "Lucro Bruto", value: grossProfit, color: grossProfit >= 0 ? "text-emerald-500" : "text-destructive" },
          { label: "Resultado Líquido", value: netResult, color: netResult >= 0 ? "text-emerald-500" : "text-destructive" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn("text-xl font-bold", s.color)}>{fmtBRL(s.value)}</p>
          </div>
        ))}
      </div>

      {/* DRE Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/20 flex items-center justify-between">
          <h3 className="font-semibold">
            DRE — {MONTHS[month]} / {year}
          </h3>
          <div className="flex items-center gap-2">
            {netResult >= 0 ? (
              <span className="flex items-center gap-1 text-emerald-500 text-sm font-medium">
                <TrendingUp className="h-4 w-4" /> Lucro: {fmtBRL(netResult)}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-destructive text-sm font-medium">
                <TrendingDown className="h-4 w-4" /> Prejuízo: {fmtBRL(Math.abs(netResult))}
              </span>
            )}
          </div>
        </div>
        <div className="divide-y divide-border/20">
          {dreRows.map((row, i) => {
            if (row.separator) return <div key={i} className="h-px bg-border/50 my-1" />;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 transition-colors",
                  row.bold ? "bg-muted/20" : "hover:bg-muted/10",
                  row.indent === 1 && "pl-8",
                  row.indent === 2 && "pl-12",
                )}
              >
                <span className={cn(
                  "text-sm",
                  row.bold && "font-semibold",
                  !row.bold && "text-muted-foreground",
                )}>
                  {row.label}
                </span>
                {row.value !== 0 && (
                  <span className={cn(
                    "text-sm font-medium tabular-nums",
                    row.positive && "text-emerald-500",
                    row.negative && "text-destructive",
                    !row.positive && !row.negative && "text-foreground",
                  )}>
                    {row.negative ? "-" : ""}{fmtBRL(Math.abs(row.value))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className={cn(
          "p-4 border-t border-border/50 flex items-center justify-between",
          netResult >= 0 ? "bg-emerald-500/5" : "bg-destructive/5"
        )}>
          <span className="font-bold text-lg">RESULTADO DO PERÍODO</span>
          <span className={cn(
            "font-bold text-xl",
            netResult >= 0 ? "text-emerald-500" : "text-destructive"
          )}>
            {fmtBRL(netResult)}
          </span>
        </div>
      </div>

      {/* Margin indicator */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Margem Líquida</h3>
          <span className={cn(
            "text-lg font-bold",
            margin >= 20 ? "text-emerald-500" : margin >= 10 ? "text-amber-500" : "text-destructive"
          )}>
            {margin.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-muted/30 rounded-full h-3">
          <div
            className={cn(
              "h-3 rounded-full transition-all duration-500",
              margin >= 20 ? "bg-emerald-500" : margin >= 10 ? "bg-amber-500" : "bg-destructive"
            )}
            style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>0%</span>
          <span className="text-amber-500">10% (mínimo)</span>
          <span className="text-emerald-500">20% (saudável)</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
