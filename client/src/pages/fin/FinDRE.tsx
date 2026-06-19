import { useState, useMemo, useRef } from "react";
import BackButton from "@/components/BackButton";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, ShoppingCart, Zap, FileSpreadsheet, FileText } from "lucide-react";
import { Link } from "wouter";
import * as XLSX from "xlsx";

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
  note?: string;
}

export default function FinDRE() {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(currentYear);
  const printRef = useRef<HTMLDivElement>(null);

  const dateFrom = useMemo(() => new Date(year, month, 1), [year, month]);
  const dateTo = useMemo(() => new Date(year, month + 1, 0, 23, 59, 59), [year, month]);

  const fromStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const toStr = `${year}-${String(month + 1).padStart(2, "0")}-${new Date(year, month + 1, 0).getDate().toString().padStart(2, "0")}`;

  const { data: transactions = [] } = trpc.fin.transactions.list.useQuery({ dateFrom, dateTo });
  const { data: receivables = [] } = trpc.fin.receivables.list.useQuery({ dateFrom, dateTo });
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();

  const { data: inoveData, isLoading: inoveLoading } = trpc.inove.getFinancialSummaryInove.useQuery(
    { from: fromStr, to: toStr },
    { retry: false }
  );

  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  const totalRevenuePDV = inoveData?.totalRevenue ?? 0;
  const fonteInove = inoveData?.fonte === "inove";

  const totalRevenueFin = receivables
    .filter(r => r.isReceived)
    .reduce((s, r) => s + Number(r.amount), 0);
  const pendingRevenueFin = receivables
    .filter(r => !r.isReceived)
    .reduce((s, r) => s + Number(r.amount), 0);

  const totalRevenue = totalRevenuePDV + totalRevenueFin;
  const pendingRevenue = pendingRevenueFin;

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

  const grossProfit = totalRevenue - totalExpensesPaid;
  const netResult = (totalRevenue + pendingRevenue) - totalExpenses;
  const margin = (totalRevenue + pendingRevenue) > 0
    ? (netResult / (totalRevenue + pendingRevenue)) * 100
    : 0;

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
    { label: "RECEITA BRUTA TOTAL", value: totalRevenue + pendingRevenue, bold: true, positive: true },
    ...(totalRevenuePDV > 0 ? [
      {
        label: "Vendas PDV (Caixa)",
        value: totalRevenuePDV,
        indent: 1,
        positive: true,
        note: fonteInove ? "PDV INOVE — tempo real" : "Importado do PDV",
      },
    ] : []),
    ...(totalRevenueFin > 0 || pendingRevenueFin > 0 ? [
      { label: "Receitas Financeiras Recebidas", value: totalRevenueFin, indent: 1, positive: true },
      { label: "Receitas Financeiras Pendentes", value: pendingRevenueFin, indent: 1 },
    ] : []),
    { label: "", value: 0, separator: true },
    { label: "(-) DESPESAS TOTAIS", value: totalExpenses, bold: true, negative: true, note: "Inclui custo de mercadorias" },
    { label: "Despesas Pagas", value: totalExpensesPaid, indent: 1, negative: true },
    { label: "Despesas Pendentes", value: totalExpensesPending, indent: 1 },
    ...categoryRows,
    { label: "", value: 0, separator: true },
    { label: "LUCRO BRUTO", value: grossProfit, bold: true, positive: grossProfit >= 0, negative: grossProfit < 0 },
    { label: "(Receitas recebidas − Despesas pagas)", value: 0, indent: 1 },
    { label: "", value: 0, separator: true },
    { label: "RESULTADO LÍQUIDO", value: netResult, bold: true, positive: netResult >= 0, negative: netResult < 0 },
    { label: `Margem Líquida: ${margin.toFixed(1)}%`, value: netResult, indent: 1, positive: netResult >= 0, negative: netResult < 0 },
  ];

  // ── Exportar Excel ────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const periodo = `${MONTHS[month]} ${year}`;
    const fonte = fonteInove ? "PDV INOVE — tempo real" : "Dados locais";

    const wsData: (string | number)[][] = [
      [`DRE — Demonstrativo de Resultado — ${periodo}`],
      [`Fonte: ${fonte}`],
      [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
      [],
      ["Descrição", "Valor (R$)", "Observação"],
    ];

    dreRows.forEach(row => {
      if (row.separator || !row.label) return;
      const indent = "  ".repeat(row.indent ?? 0);
      const sinal = row.negative ? -Math.abs(row.value) : row.value;
      wsData.push([`${indent}${row.label}`, row.value !== 0 ? sinal : "", row.note ?? ""]);
    });

    wsData.push([]);
    wsData.push(["RESULTADO DO PERÍODO", netResult, netResult >= 0 ? "Lucro" : "Prejuízo"]);
    wsData.push([`Margem Líquida`, `${margin.toFixed(1)}%`, ""]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Largura das colunas
    ws["!cols"] = [{ wch: 45 }, { wch: 18 }, { wch: 30 }];

    // Negrito no título
    if (ws["A1"]) ws["A1"].s = { font: { bold: true, sz: 14 } };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `DRE ${MONTHS[month]} ${year}`);
    XLSX.writeFile(wb, `DRE_${MONTHS[month]}_${year}.xlsx`);
  };

  // ── Exportar PDF (via impressão do browser) ───────────────────────────────
  const handleExportPDF = () => {
    const periodo = `${MONTHS[month]} ${year}`;
    const fonte = fonteInove ? "PDV INOVE — tempo real" : "Dados locais";
    const geradoEm = new Date().toLocaleString("pt-BR");

    const rowsHtml = dreRows
      .filter(r => !r.separator)
      .map(r => {
        if (!r.label) return "";
        const indent = (r.indent ?? 0) * 20;
        const color = r.positive ? "#16a34a" : r.negative ? "#dc2626" : "#1f2937";
        const fontWeight = r.bold ? "bold" : "normal";
        const valStr = r.value !== 0
          ? `${r.negative ? "-" : ""}${fmtBRL(Math.abs(r.value))}`
          : "";
        return `
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:6px 8px;padding-left:${8 + indent}px;font-weight:${fontWeight};color:${color};font-size:12px;">
              ${r.label}${r.note ? ` <span style="font-size:10px;color:#9ca3af;font-style:italic;">(${r.note})</span>` : ""}
            </td>
            <td style="padding:6px 8px;text-align:right;font-weight:${fontWeight};color:${color};font-size:12px;white-space:nowrap;">
              ${valStr}
            </td>
          </tr>`;
      }).join("");

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8"/>
        <title>DRE — ${periodo}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; color: #1f2937; padding: 32px; }
          h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
          .sub { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
          .summary { display: flex; gap: 16px; margin-bottom: 20px; }
          .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
          .card .lbl { font-size: 11px; color: #6b7280; }
          .card .val { font-size: 16px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; }
          thead th { background: #f3f4f6; padding: 8px; text-align: left; font-size: 12px; border-bottom: 2px solid #d1d5db; }
          thead th:last-child { text-align: right; }
          .footer-row td { padding: 10px 8px; font-weight: bold; font-size: 14px; border-top: 2px solid #d1d5db; }
          .footer-row td:last-child { text-align: right; }
          @media print { body { padding: 16px; } }
        </style>
      </head>
      <body>
        <h1>DRE — Demonstrativo de Resultado</h1>
        <div class="sub">Período: ${periodo} &nbsp;|&nbsp; Fonte: ${fonte} &nbsp;|&nbsp; Gerado em: ${geradoEm}</div>

        <div class="summary">
          <div class="card">
            <div class="lbl">Receita Total</div>
            <div class="val" style="color:#16a34a;">${fmtBRL(totalRevenue + pendingRevenue)}</div>
          </div>
          <div class="card">
            <div class="lbl">Despesas Totais</div>
            <div class="val" style="color:#dc2626;">${fmtBRL(totalExpenses)}</div>
          </div>
          <div class="card">
            <div class="lbl">Resultado Líquido</div>
            <div class="val" style="color:${netResult >= 0 ? "#16a34a" : "#dc2626"};">${fmtBRL(netResult)}</div>
          </div>
          <div class="card">
            <div class="lbl">Margem Líquida</div>
            <div class="val" style="color:${margin >= 20 ? "#16a34a" : margin >= 10 ? "#d97706" : "#dc2626"};">${margin.toFixed(1)}%</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th style="text-align:right;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr class="footer-row">
              <td>RESULTADO DO PERÍODO</td>
              <td style="color:${netResult >= 0 ? "#16a34a" : "#dc2626"};">${fmtBRL(netResult)}</td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 500);
  };

  return (
    <div className="p-6 space-y-5" ref={printRef}>
      <BackButton to="/fin/dashboard" />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">DRE — Demonstrativo de Resultado</h1>
          <p className="text-sm text-muted-foreground">Análise financeira do período selecionado</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtros de período */}
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
          {/* Botões de exportação */}
          <div className="space-y-1">
            <Label className="text-xs opacity-0 select-none">Exportar</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs border-green-500/40 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
                onClick={handleExportExcel}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs border-red-500/40 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={handleExportPDF}
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Banner PDV INOVE */}
      {!inoveLoading && totalRevenuePDV > 0 && (
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg text-sm",
          fonteInove
            ? "bg-emerald-500/10 border border-emerald-500/20"
            : "bg-indigo-500/10 border border-indigo-500/20"
        )}>
          {fonteInove ? (
            <Zap className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          ) : (
            <ShoppingCart className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          )}
          <span className={fonteInove ? "text-emerald-700 dark:text-emerald-300" : "text-indigo-700 dark:text-indigo-300"}>
            Vendas PDV de <strong>{MONTHS[month]}/{year}</strong> incluídas: <strong>{fmtBRL(totalRevenuePDV)}</strong>
            {fonteInove && (
              <span className="ml-2 text-xs px-1.5 py-0.5 bg-emerald-500/20 rounded text-emerald-600 dark:text-emerald-400 font-medium">
                PDV INOVE
              </span>
            )}
            {!fonteInove && (
              <span className="text-xs ml-2 opacity-70">(dados locais — INOVE indisponível)</span>
            )}
          </span>
          <Link to="/gerencial" className="ml-auto text-xs text-indigo-500 underline underline-offset-2 hover:text-indigo-700">
            Ver relatório gerencial →
          </Link>
        </div>
      )}

      {!inoveLoading && totalRevenuePDV === 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 text-sm">
          <ShoppingCart className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">
            Nenhuma venda PDV encontrada para <strong>{MONTHS[month]}/{year}</strong>.
          </span>
          <Link to="/sales-import" className="ml-auto text-xs text-primary underline underline-offset-2">
            Importar vendas →
          </Link>
        </div>
      )}

      {/* Result Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Receita Total", value: totalRevenue + pendingRevenue, color: "text-emerald-500" },
          { label: "Despesas Totais", value: totalExpenses, color: "text-destructive", note: "incl. custo mercadorias" },
          { label: "Resultado Líquido", value: netResult, color: netResult >= 0 ? "text-emerald-500" : "text-destructive" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            {s.note && <p className="text-[10px] text-muted-foreground/60">{s.note}</p>}
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
                  {row.note && (
                    <span className="text-[10px] text-muted-foreground/60 italic">({row.note})</span>
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
