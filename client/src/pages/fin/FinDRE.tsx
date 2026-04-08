import { useState } from "react";
import BackButton from "@/components/BackButton";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, ShoppingCart } from "lucide-react";
import { Link } from "wouter";

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
  badge?: string;
}

export default function FinDRE() {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(currentYear);

  const dateFrom = new Date(year, month, 1);
  const dateTo = new Date(year, month + 1, 0, 23, 59, 59);

  // Mês no formato YYYY-MM para busca nas vendas PDV
  const referenceMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

  const { data: transactions = [] } = trpc.fin.transactions.list.useQuery({ dateFrom, dateTo });
  const { data: receivables = [] } = trpc.fin.receivables.list.useQuery({ dateFrom, dateTo });
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();

  // Dados de vendas PDV importadas
  const { data: dreVendas } = trpc.reports.dre.useQuery({ referenceMonth });

  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  // ── Receitas Financeiras (Contas a Receber) ───────────────────────────────
  const totalRevenueFin = receivables
    .filter(r => r.isReceived)
    .reduce((s, r) => s + Number(r.amount), 0);
  const pendingRevenueFin = receivables
    .filter(r => !r.isReceived)
    .reduce((s, r) => s + Number(r.amount), 0);

  // ── Receita PDV (Vendas importadas do caixa) ──────────────────────────────
  const totalRevenuePDV = dreVendas?.totalRevenue ?? 0;
  const totalCMV = dreVendas?.totalCMV ?? 0;

  // ── Receita Total Combinada ───────────────────────────────────────────────
  const totalRevenue = totalRevenueFin + totalRevenuePDV;
  const pendingRevenue = pendingRevenueFin;

  // ── Despesas (Contas a Pagar) ─────────────────────────────────────────────
  const expensesByCategory = new Map<string, { paid: number; pending: number }>();
  transactions.forEach(t => {
    const cat = t.categoryId
      ? (categoryMap.get(t.categoryId) ?? "Outros")
      : "Sem categoria";
    const current = expensesByCategory.get(cat) ?? { paid: 0, pending: 0 };
    if (t.isPaid) {
      current.paid += Number(t.amount);
    } else {
      current.pending += Number(t.amount);
    }
    expensesByCategory.set(cat, current);
  });

  const totalExpensesPaid = transactions
    .filter(t => t.isPaid)
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalExpensesPending = transactions
    .filter(t => !t.isPaid)
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = totalExpensesPaid + totalExpensesPending;

  // ── Cálculos do DRE ───────────────────────────────────────────────────────
  // Lucro Bruto = Receita Total - CMV - Despesas Pagas
  const grossProfit = totalRevenue - totalCMV - totalExpensesPaid;
  // Resultado Líquido
  const netResult = (totalRevenue + pendingRevenue) - totalCMV - totalExpenses;
  const margin = (totalRevenue + pendingRevenue) > 0
    ? (netResult / (totalRevenue + pendingRevenue)) * 100
    : 0;

  // ── Linhas do DRE ─────────────────────────────────────────────────────────
  const categoryRows: DRERow[] = Array.from(expensesByCategory.entries()).flatMap(([cat, vals]) => {
    const rows: DRERow[] = [
      { label: cat, value: vals.paid + vals.pending, indent: 2 },
    ];
    if (vals.paid > 0 && vals.pending > 0) {
      rows.push({ label: `${cat} — Pago`, value: vals.paid, indent: 3 });
      rows.push({ label: `${cat} — Pendente`, value: vals.pending, indent: 3 });
    }
    return rows;
  });

  const dreRows: DRERow[] = [
    // Receitas
    { label: "RECEITA BRUTA TOTAL", value: totalRevenue + pendingRevenue, bold: true, positive: true },
    ...(totalRevenuePDV > 0 ? [
      { label: "Vendas PDV (Caixa)", value: totalRevenuePDV, indent: 1, positive: true, badge: "PDV" },
    ] : []),
    ...(totalRevenueFin > 0 || pendingRevenueFin > 0 ? [
      { label: "Receitas Financeiras Recebidas", value: totalRevenueFin, indent: 1, positive: true },
      { label: "Receitas Financeiras Pendentes", value: pendingRevenueFin, indent: 1 },
    ] : []),
    { label: "", value: 0, separator: true },
    // CMV
    ...(totalCMV > 0 ? [
      { label: "(-) CMV — Custo das Mercadorias Vendidas", value: totalCMV, bold: true, negative: true, badge: "PDV" },
      { label: `Margem Bruta PDV: ${totalRevenuePDV > 0 ? (((totalRevenuePDV - totalCMV) / totalRevenuePDV) * 100).toFixed(1) : 0}%`, value: 0, indent: 1 },
      { label: "", value: 0, separator: true },
    ] : []),
    // Despesas
    { label: "(-) DESPESAS OPERACIONAIS", value: totalExpenses, bold: true, negative: true },
    { label: "Despesas Pagas", value: totalExpensesPaid, indent: 1, negative: true },
    { label: "Despesas Pendentes", value: totalExpensesPending, indent: 1 },
    ...categoryRows,
    { label: "", value: 0, separator: true },
    // Resultado
    { label: "LUCRO BRUTO", value: grossProfit, bold: true, positive: grossProfit >= 0, negative: grossProfit < 0 },
    { label: "(Receitas − CMV − Despesas pagas)", value: 0, indent: 1 },
    { label: "", value: 0, separator: true },
    { label: "RESULTADO LÍQUIDO", value: netResult, bold: true, positive: netResult >= 0, negative: netResult < 0 },
    { label: `Margem Líquida: ${margin.toFixed(1)}%`, value: netResult, indent: 1, positive: netResult >= 0, negative: netResult < 0 },
  ];

  return (
    <div className="p-6 space-y-5">
      <BackButton to="/fin/dashboard" />

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

      {/* Banner PDV */}
      {totalRevenuePDV > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-sm">
          <ShoppingCart className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <span className="text-indigo-700 dark:text-indigo-300">
            Vendas PDV de <strong>{MONTHS[month]}/{year}</strong> incluídas: <strong>{fmtBRL(totalRevenuePDV)}</strong>
            {totalCMV > 0 && <> — CMV: <strong>{fmtBRL(totalCMV)}</strong></>}
          </span>
          <Link to="/gerencial" className="ml-auto text-xs text-indigo-500 underline underline-offset-2 hover:text-indigo-700">
            Ver detalhes →
          </Link>
        </div>
      )}

      {totalRevenuePDV === 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 text-sm">
          <ShoppingCart className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">
            Nenhuma venda PDV confirmada para <strong>{MONTHS[month]}/{year}</strong>.
          </span>
          <Link to="/sales-import" className="ml-auto text-xs text-primary underline underline-offset-2">
            Importar vendas →
          </Link>
        </div>
      )}

      {/* Result Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Receita Total", value: totalRevenue + pendingRevenue, color: "text-emerald-500" },
          { label: "CMV (Custo Mercadorias)", value: totalCMV, color: "text-orange-500" },
          { label: "Despesas Totais", value: totalExpenses, color: "text-destructive" },
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
                  row.indent === 3 && "pl-16",
                )}
              >
                <span className={cn(
                  "text-sm flex items-center gap-2",
                  row.bold && "font-semibold",
                  !row.bold && "text-muted-foreground",
                )}>
                  {row.label}
                  {row.badge && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-indigo-400 text-indigo-500">
                      {row.badge}
                    </Badge>
                  )}
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
