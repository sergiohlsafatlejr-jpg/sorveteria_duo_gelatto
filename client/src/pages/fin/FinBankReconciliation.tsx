import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  RefreshCw, Download, Search, SlidersHorizontal, ChevronDown, ChevronRight,
  Upload, File, Loader
} from "lucide-react";
import * as XLSX from "xlsx";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDateStr = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
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
  const day = now.getDay();
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

type GroupItem = {
  key: string;
  label: string;
  bankTotal: number;
  inoveTotal: number;
  qtdVendas: number;
  dias: string[];
  status: string;
  diff: number;
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as Status];
  if (!cfg) return <span className="text-xs text-muted-foreground">{status}</span>;
  return (
    <Badge className={`gap-1 text-xs ${cfg.color}`} variant="outline">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

function GroupTable({ rows, title }: { rows: GroupItem[]; title: string }) {
  if (rows.length === 0) return (
    <div className="py-12 text-center text-muted-foreground">
      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
      <p className="text-sm">Nenhum dado para exibir. Clique em <strong>Conciliar</strong>.</p>
    </div>
  );

  const totalBanco = rows.reduce((s, r) => s + r.bankTotal, 0);
  const totalInove = rows.reduce((s, r) => s + r.inoveTotal, 0);
  const totalDiff = totalBanco - totalInove;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">{title}</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">
              <div>Total Créditos</div>
              <div className="text-xs font-normal opacity-60">(banco)</div>
            </th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">
              <div>Total Vendas</div>
              <div className="text-xs font-normal opacity-60">(INOVE)</div>
            </th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Diferença</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qtd. Vendas</th>
            <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const rowBg =
              row.status === "conciliado" ? "hover:bg-emerald-50/30" :
              row.status === "divergente" ? "hover:bg-amber-50/30" :
              row.status === "sem_venda" ? "hover:bg-red-50/30" :
              "hover:bg-muted/30";
            return (
              <tr key={row.key} className={`border-b transition-colors ${rowBg}`}>
                <td className="px-4 py-3 font-medium">{row.label}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  {row.bankTotal > 0
                    ? <span className="text-emerald-600">{fmtBRL(row.bankTotal)}</span>
                    : <span className="text-muted-foreground text-xs italic">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-right">
                  {row.inoveTotal > 0
                    ? <div>
                        <div className="font-semibold">{fmtBRL(row.inoveTotal)}</div>
                        <div className="text-xs text-muted-foreground">{row.qtdVendas} vendas</div>
                      </div>
                    : <span className="text-muted-foreground text-xs italic">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className={Math.abs(row.diff) < 0.01 ? "text-emerald-600" : row.diff > 0 ? "text-blue-600" : "text-red-600"}>
                    {row.diff > 0 ? "+" : ""}{fmtBRL(row.diff)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                  {row.dias.length} dia{row.dias.length > 1 ? "s" : ""}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 bg-muted/20 font-semibold">
            <td className="px-4 py-3 text-sm">TOTAL</td>
            <td className="px-4 py-3 text-right text-emerald-600">{fmtBRL(totalBanco)}</td>
            <td className="px-4 py-3 text-right">{fmtBRL(totalInove)}</td>
            <td className="px-4 py-3 text-right">
              <span className={Math.abs(totalDiff) < 0.01 ? "text-emerald-600" : totalDiff > 0 ? "text-blue-600" : "text-red-600"}>
                {totalDiff > 0 ? "+" : ""}{fmtBRL(totalDiff)}
              </span>
            </td>
            <td className="px-4 py-3"></td>
            <td className="px-4 py-3"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function FinBankReconciliation() {
  const today = new Date().toISOString().split("T")[0]!;
  const [dateFrom, setDateFrom] = useState(() => getWeekRange().from);
  const [dateTo, setDateTo] = useState(() => getWeekRange().to);
  const [tolerance, setTolerance] = useState(5);
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = trpc.inove.reconcileWithBank.useQuery(
    { dateFrom, dateTo, tolerance },
    { enabled, staleTime: 0 }
  );

  const handleBuscar = () => {
    if (!enabled) setEnabled(true);
    else refetch();
  };

  const toggleDay = (dia: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dia)) next.delete(dia);
      else next.add(dia);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.items.filter((item: { dia: string; status: string; bankEntries: Array<{ description: string }> }) => {
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const dia = fmtDateStr(item.dia);
        const hasDesc = item.bankEntries.some((e: { description: string }) => e.description.toLowerCase().includes(q));
        if (!dia.includes(q) && !hasDesc) return false;
      }
      return true;
    });
  }, [data, filterStatus, search]);

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Aba Diário
    const rowsDia: Record<string, unknown>[] = [];
    for (const item of data.items as Array<{
      dia: string; bankTotal: number; bankEntries: Array<{ description: string; amount: number; type: string; paymentMethod: string | null }>;
      inoveSales: { total: number; vendas: number } | null; diff: number | null; status: string;
    }>) {
      rowsDia.push({
        Data: fmtDateStr(item.dia),
        "Lançamentos banco": item.bankEntries.length,
        "Total Créditos Banco (R$)": item.bankTotal,
        "Vendas INOVE (R$)": item.inoveSales?.total ?? "",
        "Qtd Vendas INOVE": item.inoveSales?.vendas ?? "",
        "Diferença (R$)": item.diff ?? "",
        "Status": STATUS_CONFIG[item.status as Status]?.label ?? item.status,
      });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsDia), "Diário");

    // Aba Semanal
    if (data.weeks) {
      const rowsSem = (data.weeks as GroupItem[]).map(w => ({
        Semana: w.label,
        "Total Créditos Banco (R$)": w.bankTotal,
        "Vendas INOVE (R$)": w.inoveTotal,
        "Qtd Vendas INOVE": w.qtdVendas,
        "Diferença (R$)": w.diff,
        "Dias": w.dias.length,
        "Status": STATUS_CONFIG[w.status as Status]?.label ?? w.status,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsSem), "Semanal");
    }

    // Aba Mensal
    if (data.months) {
      const rowsMes = (data.months as GroupItem[]).map(m => ({
        Mês: m.label,
        "Total Créditos Banco (R$)": m.bankTotal,
        "Vendas INOVE (R$)": m.inoveTotal,
        "Qtd Vendas INOVE": m.qtdVendas,
        "Diferença (R$)": m.diff,
        "Dias": m.dias.length,
        "Status": STATUS_CONFIG[m.status as Status]?.label ?? m.status,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsMes), "Mensal");
    }

    XLSX.writeFile(wb, `conciliacao_${dateFrom}_${dateTo}.xlsx`);
    toast.success("Excel exportado com 3 abas!");
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
            Cruza lançamentos bancários com as vendas do INOVE — visão diária, semanal e mensal
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
            { label: "Total de dias", value: summary.total, color: "text-foreground" },
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

      {/* Abas Diário / Semanal / Mensal */}
      {data ? (
        <Tabs defaultValue="semanal" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <TabsList>
              <TabsTrigger value="diario">📅 Diário</TabsTrigger>
              <TabsTrigger value="semanal">📆 Semanal</TabsTrigger>
              <TabsTrigger value="mensal">🗓️ Mensal</TabsTrigger>
              <TabsTrigger value="rede">🏦 Rede</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2">
              <Download className="w-4 h-4" />
              Exportar Excel (3 abas)
            </Button>
          </div>

          {/* Aba Diário */}
          <TabsContent value="diario">
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex flex-wrap gap-3 items-center p-4 border-b">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por data ou descrição..."
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
              </div>
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Nenhum item encontrado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8"></th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lançamentos banco</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          <div>Total Créditos</div>
                          <div className="text-xs font-normal opacity-60">(banco)</div>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          <div>Total Vendas</div>
                          <div className="text-xs font-normal opacity-60">(INOVE)</div>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Diferença</th>
                        <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(filtered as Array<{
                        dia: string; bankTotal: number;
                        bankEntries: Array<{ id: number; description: string; amount: number; type: string; paymentMethod: string | null }>;
                        inoveSales: { total: number; qtd: number; vendas: number } | null;
                        status: string; diff: number | null;
                      }>).map((item) => {
                        const cfg = STATUS_CONFIG[item.status as Status];
                        const isExpanded = expandedDays.has(item.dia);
                        const rowBg =
                          item.status === "conciliado" ? "hover:bg-emerald-50/30" :
                          item.status === "divergente" ? "hover:bg-amber-50/30" :
                          item.status === "sem_venda" ? "hover:bg-red-50/30" :
                          "hover:bg-muted/30";
                        return (
                          <>
                            <tr
                              key={item.dia}
                              className={`border-b transition-colors cursor-pointer ${rowBg}`}
                              onClick={() => item.bankEntries.length > 0 && toggleDay(item.dia)}
                            >
                              <td className="px-4 py-3 text-muted-foreground">
                                {item.bankEntries.length > 0 && (
                                  isExpanded
                                    ? <ChevronDown className="w-4 h-4" />
                                    : <ChevronRight className="w-4 h-4" />
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs font-medium whitespace-nowrap">
                                {fmtDateStr(item.dia)}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">
                                {item.bankEntries.length > 0
                                  ? `${item.bankEntries.length} lançamento${item.bankEntries.length > 1 ? "s" : ""}`
                                  : <span className="italic">sem lançamento bancário</span>
                                }
                              </td>
                              <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                                {item.bankTotal > 0
                                  ? <span className="text-emerald-600">{fmtBRL(item.bankTotal)}</span>
                                  : <span className="text-muted-foreground text-xs italic">—</span>
                                }
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {item.inoveSales ? (
                                  <div>
                                    <div className="font-semibold">{fmtBRL(item.inoveSales.total)}</div>
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
                            {isExpanded && item.bankEntries.map((e, ei) => (
                              <tr key={`${item.dia}-${ei}`} className="border-b bg-muted/10 text-xs">
                                <td className="px-4 py-2"></td>
                                <td className="px-4 py-2 text-muted-foreground pl-8">└</td>
                                <td className="px-4 py-2 text-muted-foreground max-w-xs truncate" colSpan={2}>
                                  {e.description}
                                  {e.paymentMethod && <span className="ml-2 uppercase text-muted-foreground/60">{e.paymentMethod}</span>}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span className={e.type === "credit" ? "text-emerald-600" : "text-red-600"}>
                                    {e.type === "debit" ? "- " : ""}{fmtBRL(e.amount)}
                                  </span>
                                </td>
                                <td className="px-4 py-2" colSpan={2}></td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Aba Semanal */}
          <TabsContent value="semanal">
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  💡 <strong>Dica:</strong> A visão semanal é mais precisa para maquininha (D+1/D+2) — os créditos da semana no banco tendem a bater com as vendas da semana no INOVE.
                </p>
              </div>
              <GroupTable rows={(data.weeks ?? []) as GroupItem[]} title="Semana" />
            </div>
          </TabsContent>

          {/* Aba Mensal */}
          <TabsContent value="mensal">
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  💡 <strong>Dica:</strong> A visão mensal é a mais precisa — no fechamento do mês todos os recebimentos de maquininha já foram liquidados.
                </p>
              </div>
              <GroupTable rows={(data.months ?? []) as GroupItem[]} title="Mês" />
            </div>
          </TabsContent>
                  {/* Aba Rede */}
          <TabsContent value="rede">
            <RedeTab />
          </TabsContent>
        </Tabs>
      ) : (
        !isLoading && (
          <div className="py-16 text-center text-muted-foreground rounded-xl border bg-card">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Pronto para conciliar</p>
            <p className="text-sm mt-1">Selecione o período e clique em <strong>Conciliar</strong> para cruzar os dados.</p>
          </div>
        )
      )}
    </div>
  );
}

// ─── Componente RedeTab ───────────────────────────────────────────────────────

function RedeTab() {
  const [file, setFile] = useState<File | null>(null);
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [importFileId, setImportFileId] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);

  const importMutation = trpc.rede.importFile.useMutation();
  const reconcileMutation = trpc.rede.reconcile.useMutation();
  const listImports = trpc.rede.listImports.useQuery(undefined);
  const listReconciliations = trpc.rede.listReconciliations.useQuery(undefined);
  const stats = trpc.rede.getStats.useQuery(undefined);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file || !periodStart || !periodEnd) {
      toast.error("Selecione arquivo e período");
      return;
    }

    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = await importMutation.mutateAsync({
        fileBuffer: new Uint8Array(buffer) as any,
        fileName: file.name,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
      });

      setImportFileId(result.importFileId);
      setFile(null);
      toast.success(`${result.totalRecords} vendas importadas`);
      listImports.refetch();
    } catch (error) {
      toast.error(`Erro ao importar: ${error instanceof Error ? error.message : "Desconhecido"}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleReconcile = async () => {
    if (!importFileId) {
      toast.error("Nenhuma importação selecionada");
      return;
    }

    setIsReconciling(true);
    try {
      const result = await reconcileMutation.mutateAsync({
        importFileId,
        toleranceAmount: 0.01,
      });

      toast.success(`Conciliação concluída: ${result.matchPercentage}% de match`);
      listReconciliations.refetch();
      stats.refetch();
    } catch (error) {
      toast.error(`Erro ao conciliar: ${error instanceof Error ? error.message : "Desconhecido"}`);
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Importar Relatório Rede</h3>

        <div className="space-y-4">
          {/* Drag and Drop */}
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Arraste o arquivo Excel aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-1">Formato: .xlsx (Rede Relatório de Vendas)</p>
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="hidden"
              id="rede-file-input"
            />
            <label htmlFor="rede-file-input" className="cursor-pointer">
              <span className="sr-only">Selecionar arquivo</span>
            </label>
          </div>

          {file && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <File className="w-4 h-4 text-emerald-600" />
              <span className="text-sm text-emerald-900">{file.name}</span>
            </div>
          )}

          {/* Period Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Data Início</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Data Fim</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Import Button */}
          <Button
            onClick={handleImport}
            disabled={!file || !periodStart || !periodEnd || isImporting}
            className="w-full gap-2"
          >
            {isImporting ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {isImporting ? "Importando..." : "Importar"}
          </Button>
        </div>
      </div>

      {/* Stats Section */}
      {stats.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "✅ Conciliados", value: stats.data.matched.count, color: "text-emerald-600" },
            { label: "❌ Sem INOVE", value: stats.data.unmatchedRede.count, color: "text-red-600" },
            { label: "⚠️ Divergentes", value: stats.data.divergent.count, color: "text-amber-600" },
            { label: "Total", value: stats.data.matched.count + stats.data.unmatchedRede.count + stats.data.divergent.count, color: "text-foreground" },
          ].map(k => (
            <div key={k.label} className="rounded-xl border bg-card p-4 text-center">
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reconcile Button */}
      {importFileId && (
        <Button
          onClick={handleReconcile}
          disabled={isReconciling}
          className="w-full gap-2"
          variant="default"
        >
          {isReconciling ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isReconciling ? "Conciliando..." : "Conciliar com INOVE"}
        </Button>
      )}

      {/* Reconciliations Table */}
      {listReconciliations.data && listReconciliations.data.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/20">
            <p className="text-sm font-medium">Últimas Conciliações</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left">Data Rede</th>
                  <th className="px-4 py-2 text-right">Valor Rede</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Bandeira</th>
                </tr>
              </thead>
              <tbody>
                {listReconciliations.data.map((rec: any) => (
                  <tr key={rec.id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-2">{new Date(rec.redeDate).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtBRL(parseFloat(rec.redeValue))}</td>
                    <td className="px-4 py-2">
                      <Badge className={rec.status === "matched" ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"}>
                        {rec.status === "matched" ? "✅ Conciliado" : "❌ Não encontrado"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{rec.redeBandeira || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
