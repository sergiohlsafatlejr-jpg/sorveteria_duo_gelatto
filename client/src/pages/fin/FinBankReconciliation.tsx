import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  RefreshCw, Download, Search, SlidersHorizontal
} from "lucide-react";
import * as XLSX from "xlsx";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: Date | string) => {
  const dt = typeof d === "string" ? new Date(d + (d.length === 10 ? "T12:00:00" : "")) : d;
  return dt.toLocaleDateString("pt-BR");
};

type Status = "conciliado" | "divergente" | "sem_venda" | "sem_inove";

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: React.ReactNode }> = {
  conciliado: {
    label: "Conciliado",
    color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  },
  divergente: {
    label: "Divergente",
    color: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
  },
  sem_venda: {
    label: "Sem venda INOVE",
    color: "bg-red-500/10 text-red-700 border-red-500/30",
    icon: <XCircle className="w-4 h-4 text-red-600" />,
  },
  sem_inove: {
    label: "INOVE indisponível",
    color: "bg-slate-500/10 text-slate-600 border-slate-500/30",
    icon: <HelpCircle className="w-4 h-4 text-slate-500" />,
  },
};

function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=dom
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0]!;
  return { from: fmt(mon), to: fmt(sun) };
}

function getMonthRange(offset = 0) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0]!;
  return { from: fmt(first), to: fmt(last) };
}

export default function FinBankReconciliation() {
  const today = new Date().toISOString().split("T")[0]!;
  const [dateFrom, setDateFrom] = useState(() => getWeekRange().from);
  const [dateTo, setDateTo] = useState(() => getWeekRange().to);
  const [tolerance, setTolerance] = useState(5);
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, refetch } = trpc.inove.reconcileWithBank.useQuery(
    { dateFrom, dateTo, tolerance },
    { enabled, staleTime: 0 }
  );

  const handleBuscar = () => {
    if (!enabled) setEnabled(true);
    else refetch();
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.items.filter(item => {
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const desc = item.bankEntry.description.toLowerCase();
        const dia = fmtDate(item.bankEntry.date);
        if (!desc.includes(q) && !dia.includes(q)) return false;
      }
      return true;
    });
  }, [data, filterStatus, search]);

  const exportExcel = () => {
    if (!data) return;
    const rows = data.items.map(item => ({
      Data: fmtDate(item.bankEntry.date),
      "Descrição Banco": item.bankEntry.description,
      "Valor Banco (R$)": item.bankEntry.amount,
      "Tipo": item.bankEntry.type === "credit" ? "Crédito" : "Débito",
      "Forma Pagto": item.bankEntry.paymentMethod ?? "",
      "Vendas INOVE (R$)": item.inoveSales?.total ?? "",
      "Qtd Vendas INOVE": item.inoveSales?.vendas ?? "",
      "Diferença (R$)": item.diff ?? "",
      "Status": STATUS_CONFIG[item.status as Status]?.label ?? item.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conciliação");
    XLSX.writeFile(wb, `conciliacao_${dateFrom}_${dateTo}.xlsx`);
    toast.success("Excel exportado!");
  };

  const summary = data?.summary;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-primary" />
            Conciliação Bancária
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cruza lançamentos bancários com as vendas do INOVE por data e valor
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <SlidersHorizontal className="w-4 h-4" />
          Filtros do período
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Data Início</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data Fim</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tolerância (%)</Label>
            <Input
              type="number" min={0} max={50} value={tolerance}
              onChange={e => setTolerance(Number(e.target.value))}
              className="w-24"
            />
          </div>
          <Button onClick={handleBuscar} disabled={isLoading} className="gap-2">
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Conciliar
          </Button>
        </div>
        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Esta semana", fn: () => { const r = getWeekRange(); setDateFrom(r.from); setDateTo(r.to); } },
            { label: "Semana passada", fn: () => { const r = getWeekRange(-1); setDateFrom(r.from); setDateTo(r.to); } },
            { label: "Este mês", fn: () => { const r = getMonthRange(); setDateFrom(r.from); setDateTo(r.to); } },
            { label: "Mês passado", fn: () => { const r = getMonthRange(-1); setDateFrom(r.from); setDateTo(r.to); } },
            { label: "Hoje", fn: () => { setDateFrom(today); setDateTo(today); } },
          ].map(p => (
            <button
              key={p.label}
              onClick={p.fn}
              className="text-xs px-3 py-1 rounded-full border border-border hover:bg-muted transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: summary.total, color: "text-foreground" },
            { label: "✅ Conciliados", value: summary.conciliado, color: "text-emerald-600" },
            { label: "⚠️ Divergentes", value: summary.divergente, color: "text-amber-600" },
            { label: "❌ Sem venda INOVE", value: (summary as Record<string, number>).sem_venda ?? 0, color: "text-red-600" },
          ].map(k => (
            <div key={k.label} className="rounded-xl border bg-card p-4 text-center">
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabela */}
      {data && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Barra de busca e filtros */}
          <div className="flex flex-wrap gap-3 items-center p-4 border-b">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição ou data..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["all", "conciliado", "divergente", "sem_venda", "sem_inove"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    filterStatus === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {s === "all" ? "Todos" : STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2 ml-auto">
              <Download className="w-4 h-4" />
              Excel
            </Button>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Nenhum item encontrado</p>
              <p className="text-sm mt-1">Ajuste os filtros ou clique em "Conciliar" para iniciar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição Banco</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor Banco</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Vendas INOVE</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Diferença</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => {
                    const cfg = STATUS_CONFIG[item.status as Status];
                    const rowBg =
                      item.status === "conciliado" ? "hover:bg-emerald-50/30" :
                      item.status === "divergente" ? "hover:bg-amber-50/30" :
                      item.status === "sem_venda" ? "hover:bg-red-50/30" :
                      "hover:bg-muted/30";
                    return (
                      <tr key={idx} className={`border-b last:border-0 transition-colors ${rowBg}`}>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                          {fmtDate(item.bankEntry.date)}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="truncate">{item.bankEntry.description}</div>
                          {item.bankEntry.paymentMethod && (
                            <span className="text-xs text-muted-foreground uppercase">
                              {item.bankEntry.paymentMethod}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                          {item.bankEntry.amount > 0 ? (
                            <span className={item.bankEntry.type === "credit" ? "text-emerald-600" : "text-red-600"}>
                              {item.bankEntry.type === "debit" ? "- " : ""}{fmtBRL(item.bankEntry.amount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">sem lançamento</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {item.inoveSales ? (
                            <div>
                              <div className="font-medium">{fmtBRL(item.inoveSales.total)}</div>
                              <div className="text-xs text-muted-foreground">{item.inoveSales.vendas} vendas</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {item.diff !== null ? (
                            <span className={Math.abs(item.diff) < 0.01 ? "text-emerald-600" : item.diff > 0 ? "text-blue-600" : "text-red-600"}>
                              {item.diff > 0 ? "+" : ""}{fmtBRL(item.diff)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={`gap-1 text-xs ${cfg?.color}`} variant="outline">
                            {cfg?.icon}
                            {cfg?.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!data && !isLoading && (
        <div className="py-16 text-center text-muted-foreground rounded-xl border bg-card">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Pronto para conciliar</p>
          <p className="text-sm mt-1">Selecione o período e clique em <strong>Conciliar</strong> para cruzar os dados.</p>
        </div>
      )}
    </div>
  );
}
