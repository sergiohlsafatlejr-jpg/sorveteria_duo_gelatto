import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart2, Download, Package, Search, ShoppingCart, Target, TrendingUp, Users, Sun, CloudRain, ShoppingBag, AlertCircle, Sparkles, Award, Activity } from "lucide-react";
import { useMemo, useState } from "react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

// ── Aba: Relatórios INOVE ─────────────────────────────────────────────────────
function InoveTab() {
  const [days, setDays] = useState(30);
  const { data: byDay = [], isLoading: l1 } = trpc.inove.getSalesByDay.useQuery({ days });
  const { data: byHour = [], isLoading: l2 } = trpc.inove.getSalesByHour.useQuery({ days });
  const { data: byPayment = [], isLoading: l3 } = trpc.inove.getSalesByPaymentType.useQuery({ days });
  const { data: topProds = [], isLoading: l4 } = trpc.inove.getTopProducts.useQuery({ days, limit: 10 });
  const { data: kpis } = trpc.inove.getKpis.useQuery();
  const chartDay = byDay.map(d => ({
    data: new Date(d.dia + "T00:00:00-03:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }),
    total: Number(d.total), qtd: d.qtd,
  }));
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">Período:</span>
        {[7,15,30,60,90].map(d => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d} dias</Button>
        ))}
      </div>
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm bg-violet-50 dark:bg-violet-950/20"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Vendas Hoje</p><p className="text-xl font-bold text-violet-700">{formatCurrency(kpis.vendas_hoje.total)}</p><p className="text-xs text-muted-foreground">{kpis.vendas_hoje.qtd} transações</p></CardContent></Card>
          <Card className="border-0 shadow-sm bg-pink-50 dark:bg-pink-950/20"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Vendas do Mês</p><p className="text-xl font-bold text-pink-700">{formatCurrency(kpis.vendas_mes.total)}</p><p className="text-xs text-muted-foreground">{kpis.vendas_mes.qtd} transações</p></CardContent></Card>
          <Card className="border-0 shadow-sm bg-cyan-50 dark:bg-cyan-950/20"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ticket Médio</p><p className="text-xl font-bold text-cyan-700">{formatCurrency(kpis.ticket_medio)}</p><p className="text-xs text-muted-foreground">por venda</p></CardContent></Card>
          <Card className="border-0 shadow-sm bg-emerald-50 dark:bg-emerald-950/20"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Clientes PDV</p><p className="text-xl font-bold text-emerald-700">{kpis.vendas_mes.qtd}</p><p className="text-xs text-muted-foreground">cadastrados</p></CardContent></Card>
        </div>
      )}
      <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-violet-600" />Vendas por Dia — PDV INOVE<Badge variant="outline" className="text-xs ml-auto">Últimos {days} dias</Badge></CardTitle></CardHeader>
        <CardContent>{l1 ? <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartDay}>
              <defs><linearGradient id="gVendas" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="data" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Area type="monotone" dataKey="total" stroke="#8b5cf6" fill="url(#gVendas)" strokeWidth={2} name="Faturamento" />
            </AreaChart>
          </ResponsiveContainer>
        )}</CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Vendas por Hora</CardTitle></CardHeader>
          <CardContent>{l2 ? <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Carregando...</div> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byHour.map(h => ({ hora: `${h.hora}h`, qtd: h.qtd_vendas, total: Number(h.total) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="hora" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, n: string) => n === "total" ? formatCurrency(v) : v} />
                <Bar dataKey="qtd" fill="#8b5cf6" name="Vendas" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}</CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Por Forma de Pagamento</CardTitle></CardHeader>
          <CardContent>{l3 ? <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Carregando...</div> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={byPayment.slice(0,6).map(p => ({ name: p.forma, value: Number(p.total) }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: { name: string; percent: number }) => `${name.slice(0,8)} ${(percent*100).toFixed(0)}%`}>
                {byPayment.slice(0,6).map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip formatter={(v: number) => formatCurrency(v)} /></PieChart>
            </ResponsiveContainer>
          )}</CardContent>
        </Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Produtos Mais Vendidos</CardTitle></CardHeader>
        <CardContent>{l4 ? <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">Carregando...</div> : (
          <div className="space-y-2">{topProds.map((p, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted-foreground w-5">{i+1}</span>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{p.nome}</p>
                <div className="h-1.5 bg-muted rounded-full mt-1"><div className="h-1.5 bg-violet-500 rounded-full" style={{ width: `${(p.qtd / topProds[0].qtd) * 100}%` }} /></div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{p.qtd} un</span>
              <span className="text-xs font-semibold whitespace-nowrap">{formatCurrency(p.total)}</span>
            </div>
          ))}</div>
        )}</CardContent>
      </Card>
    </div>
  );
}

// ── Aba: Previsão de Faturamento ──────────────────────────────────────────────
function ForecastTab() {
  const { data: medias } = trpc.inove.getMediasHistoricas.useQuery();
  const chartData = useMemo(() => {
    if (!medias) return [];
    const byMonth: Record<number, number[]> = {};
    medias.forEach(m => { if (!byMonth[m.mes]) byMonth[m.mes] = []; byMonth[m.mes].push(Number(m.total)); });
    const avgByMonth: Record<number, number> = {};
    Object.entries(byMonth).forEach(([mes, vals]) => { avgByMonth[Number(mes)] = vals.reduce((a,b) => a+b,0)/vals.length; });
    const hoje = new Date();
    const result = [];
    for (let i = -3; i <= 6; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      const mes = d.getMonth() + 1; const ano = d.getFullYear();
      const real = medias.find(m => m.mes === mes && m.ano === ano);
      result.push({ label: `${MESES[mes-1]}/${String(ano).slice(2)}`, realizado: real ? Number(real.total) : null, previsto: avgByMonth[mes] ?? null });
    }
    return result;
  }, [medias]);
  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-400"><strong>Metodologia:</strong> Previsão baseada na média histórica de cada mês nos últimos 3 anos do PDV INOVE.</p>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600" />Realizado vs. Previsto</CardTitle></CardHeader>
        <CardContent>{!medias ? <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} /><Legend />
              <Bar dataKey="realizado" fill="#8b5cf6" name="Realizado" radius={[3,3,0,0]} />
              <Bar dataKey="previsto" fill="#e5e7eb" name="Previsto" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}</CardContent>
      </Card>
      {medias && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Média Histórica por Mês</CardTitle></CardHeader>
          <CardContent><div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
              const vals = medias.filter(m => m.mes === mes).map(m => Number(m.total));
              const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
              return (<div key={mes} className="text-center p-3 bg-muted/40 rounded-lg"><p className="text-xs font-semibold text-muted-foreground">{MESES[mes-1]}</p><p className="text-sm font-bold mt-1">{formatCurrency(avg)}</p><p className="text-xs text-muted-foreground">{vals.length} anos</p></div>);
            })}
          </div></CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Aba: Meta de Gerência ─────────────────────────────────────────────────────
function GoalsTab() {
  const { data: kpis } = trpc.inove.getKpis.useQuery();
  const { data: medias } = trpc.inove.getMediasHistoricas.useQuery();
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1; const anoAtual = hoje.getFullYear();
  const mediasMesAtual = useMemo(() => {
    if (!medias) return null;
    const vals = medias.filter(m => m.mes === mesAtual && m.ano !== anoAtual).map(m => Number(m.total));
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  }, [medias, mesAtual, anoAtual]);
  const realizado = kpis?.vendas_mes.total ?? 0;
  const meta = mediasMesAtual ? mediasMesAtual * 1.1 : 0;
  const pct = meta > 0 ? Math.min((realizado / meta) * 100, 100) : 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-violet-50 dark:bg-violet-950/20"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Realizado no Mês</p><p className="text-2xl font-bold text-violet-700 mt-1">{formatCurrency(realizado)}</p><p className="text-xs text-muted-foreground mt-1">{kpis?.vendas_mes.qtd ?? 0} transações</p></CardContent></Card>
        <Card className="border-0 shadow-sm bg-amber-50 dark:bg-amber-950/20"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Meta do Mês (+10% histórico)</p><p className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(meta)}</p><p className="text-xs text-muted-foreground mt-1">Baseado na média histórica</p></CardContent></Card>
        <Card className={`border-0 shadow-sm ${pct >= 100 ? "bg-green-50 dark:bg-green-950/20" : "bg-rose-50 dark:bg-rose-950/20"}`}><CardContent className="p-5"><p className="text-sm text-muted-foreground">Progresso</p><p className={`text-2xl font-bold mt-1 ${pct >= 100 ? "text-green-700" : "text-rose-700"}`}>{fmtPct(pct)}</p><p className="text-xs text-muted-foreground mt-1">{pct >= 100 ? "Meta atingida! 🎉" : `Faltam ${formatCurrency(meta - realizado)}`}</p></CardContent></Card>
      </div>
      <Card><CardContent className="p-5">
        <div className="flex justify-between text-sm mb-2"><span className="font-medium">Progresso da Meta — {MESES[mesAtual-1]}/{anoAtual}</span><span className="text-muted-foreground">{fmtPct(pct)}</span></div>
        <div className="h-4 bg-muted rounded-full overflow-hidden"><div className={`h-4 rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} /></div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>R$ 0</span><span>{formatCurrency(meta)}</span></div>
      </CardContent></Card>
      {medias && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Histórico de Desempenho Mensal</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={220}>
            <BarChart data={medias.slice(-12).map(m => ({ label: `${MESES[m.mes-1]}/${String(m.ano).slice(2)}`, total: Number(m.total) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="total" fill="#8b5cf6" name="Faturamento" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer></CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Aba: Relatórios Gerenciais ────────────────────────────────────────────────
function GerencialTab() {
  const { data: medias } = trpc.inove.getMediasHistoricas.useQuery();
  const comparativo = useMemo(() => {
    if (!medias) return [];
    const anosSet = new Set(medias.map(m => m.ano));
    const anos = Array.from(anosSet).sort().slice(-3);
    return Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const row: Record<string, number | string> = { mes: MESES[i] };
      anos.forEach(ano => { const found = medias.find(m => m.mes === mes && m.ano === ano); row[String(ano)] = found ? Number(found.total) : 0; });
      return row;
    });
  }, [medias]);
  const anos = medias ? Array.from(new Set(medias.map(m => m.ano))).sort().slice(-3) : [];
  const anoColors = ["#8b5cf6", "#ec4899", "#06b6d4"];
  return (
    <div className="space-y-6">
      <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BarChart2 className="h-4 w-4" />Comparativo Anual por Mês</CardTitle></CardHeader>
        <CardContent>{!medias ? <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={comparativo}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="mes" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} /><Legend />
              {anos.map((ano, i) => <Bar key={ano} dataKey={String(ano)} fill={anoColors[i]} name={String(ano)} radius={[2,2,0,0]} />)}
            </BarChart>
          </ResponsiveContainer>
        )}</CardContent>
      </Card>
      {medias && anos.length >= 2 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Crescimento Ano a Ano</CardTitle></CardHeader>
          <CardContent><div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
              const anoAtual = medias.find(m => m.mes === mes && m.ano === anos[anos.length-1]);
              const anoAnt = medias.find(m => m.mes === mes && m.ano === anos[anos.length-2]);
              if (!anoAtual || !anoAnt) return null;
              const crescimento = ((Number(anoAtual.total) - Number(anoAnt.total)) / Number(anoAnt.total)) * 100;
              return (<div key={mes} className="p-3 bg-muted/40 rounded-lg"><p className="text-xs font-semibold text-muted-foreground">{MESES[mes-1]}</p>
                <div className={`flex items-center gap-1 mt-1 ${crescimento >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {crescimento >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  <span className="text-sm font-bold">{fmtPct(Math.abs(crescimento))}</span>
                </div><p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(Number(anoAtual.total))}</p>
              </div>);
            }).filter(Boolean)}
          </div></CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Aba: Custo e Margem ───────────────────────────────────────────────────────
function CostMarginTab() {
  const [search, setSearch] = useState("");
  const { data: costReport = [], isLoading } = trpc.inove.getCostMarginReport.useQuery({ search: search || undefined });
  const semCusto = costReport.filter(p => p.custo === 0).length;
  const margemMedia = costReport.length > 0 ? costReport.reduce((a, p) => a + p.margem, 0) / costReport.length : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar produto..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Badge variant="outline">{costReport.length} produtos</Badge>
        {semCusto > 0 && <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{semCusto} sem custo</Badge>}
        <Badge variant="secondary">Margem média: {fmtPct(margemMedia)}</Badge>
      </div>
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr>
            <th className="text-left p-3 font-semibold">Produto</th>
            <th className="text-right p-3 font-semibold">Custo</th>
            <th className="text-right p-3 font-semibold">Venda</th>
            <th className="text-right p-3 font-semibold">Lucro</th>
            <th className="text-right p-3 font-semibold">Margem</th>
            <th className="text-right p-3 font-semibold">Estoque</th>
          </tr></thead>
          <tbody>{isLoading ? <tr><td colSpan={6} className="text-center p-8 text-muted-foreground">Carregando...</td></tr> :
            costReport.slice(0, 100).map((p, i) => (
              <tr key={i} className="border-t hover:bg-muted/20">
                <td className="p-3"><p className="font-medium truncate max-w-xs">{p.nome}</p>{p.barcode && <p className="text-xs text-muted-foreground">{p.barcode}</p>}</td>
                <td className="p-3 text-right">{p.custo > 0 ? formatCurrency(p.custo) : <span className="text-red-500 text-xs">Sem custo</span>}</td>
                <td className="p-3 text-right">{p.venda > 0 ? formatCurrency(p.venda) : <span className="text-muted-foreground text-xs">—</span>}</td>
                <td className={`p-3 text-right font-medium ${p.lucro > 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(p.lucro)}</td>
                <td className="p-3 text-right"><span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${p.margem >= 40 ? "bg-green-100 text-green-700" : p.margem >= 20 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{fmtPct(p.margem)}</span></td>
                <td className={`p-3 text-right ${p.estoque < 0 ? "text-red-600" : p.estoque === 0 ? "text-amber-600" : ""}`}>{p.estoque.toFixed(0)}</td>
              </tr>
            ))
          }</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Aba: Inteligência de Negócios (BI) ────────────────────────────────────────
function BITab() {
  const [activeBiTab, setActiveBiTab] = useState("abc");

  // Querying BI backend endpoints
  const { data: climateData, isLoading: lClimate } = trpc.reports.climateCorrelation.useQuery();
  const { data: loyaltyData, isLoading: lLoyalty } = trpc.reports.loyaltyCohort.useQuery();
  const { data: abcData, isLoading: lAbc } = trpc.reports.abcMatrix.useQuery();
  const { data: purchaseData, isLoading: lPurchase } = trpc.reports.predictivePurchasePlanning.useQuery();
  const { data: channelData, isLoading: lChannel } = trpc.reports.dreByChannel.useQuery({});

  const climate = (climateData || { averages: {}, history: [] }) as any;
  const loyalty = (loyaltyData || { matrix: [], churnRisk: [] }) as any;
  const abc = (abcData || { products: [], counts: {} }) as any;
  const purchase = (purchaseData || { suggestions: [], climateInfo: {} }) as any;
  const channel = (channelData || { delivery: {}, balcao: {} }) as any;

  const formatBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="space-y-6">
      <div className="flex border-b overflow-x-auto gap-2 pb-1">
        {[
          { id: "abc", label: "Matriz ABC (Cardápio)", icon: <Sparkles className="h-4 w-4" /> },
          { id: "climate", label: "Clima x Vendas", icon: <Sun className="h-4 w-4" /> },
          { id: "loyalty", label: "Fidelidade & Churn", icon: <Award className="h-4 w-4" /> },
          { id: "purchase", label: "Compras Preditivas", icon: <ShoppingBag className="h-4 w-4" /> },
          { id: "channel", label: "Delivery vs Balcão", icon: <Activity className="h-4 w-4" /> },
        ].map((t) => (
          <Button
            key={t.id}
            variant={activeBiTab === t.id ? "default" : "ghost"}
            size="sm"
            className="flex items-center gap-1.5 shrink-0"
            onClick={() => setActiveBiTab(t.id)}
          >
            {t.icon}
            {t.label}
          </Button>
        ))}
      </div>

      {/* ────────────────── MATRIZ ABC ────────────────── */}
      {activeBiTab === "abc" && (
        <div className="space-y-6">
          {lAbc ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando dados da Matriz ABC...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Estrelas (Foco/Marketing)", count: abc.counts?.estrela ?? 0, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30" },
                  { label: "Cavalos de Batalha (Giro Alto)", count: abc.counts?.cavalo_batalha ?? 0, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30" },
                  { label: "Quebra-Cabeças (Promover)", count: abc.counts?.quebra_cabeca ?? 0, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30" },
                  { label: "Abacaxis (Revisar Cardápio)", count: abc.counts?.abacaxi ?? 0, color: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30" },
                ].map((c) => (
                  <Card key={c.label} className={c.color}>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold">{c.count}</p>
                      <p className="text-xs font-semibold mt-1 opacity-90">{c.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    Classificação de Produtos (Curva ABC + Margem)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="text-left p-3 font-semibold">Produto</th>
                          <th className="text-right p-3 font-semibold">Qtd. Vendida</th>
                          <th className="text-right p-3 font-semibold">Receita Acumulada</th>
                          <th className="text-right p-3 font-semibold">Margem de Lucro</th>
                          <th className="text-center p-3 font-semibold">Classificação BI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {abc.products?.slice(0, 100).map((p: any) => (
                          <tr key={p.id} className="border-t hover:bg-muted/20">
                            <td className="p-3 font-medium">{p.name}</td>
                            <td className="p-3 text-right">{p.qtySold}</td>
                            <td className="p-3 text-right font-medium text-emerald-600">{formatBRL(p.revenue)}</td>
                            <td className="p-3 text-right">
                              <span className={cn(
                                "font-semibold",
                                p.marginPct >= 40 ? "text-green-600" : p.marginPct >= 20 ? "text-amber-500" : "text-red-500"
                              )}>
                                {p.marginPct}%
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-bold uppercase text-[10px]",
                                  p.matrixCategory === "estrela" ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/20 dark:text-emerald-400" :
                                  p.matrixCategory === "cavalo_batalha" ? "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/20 dark:text-blue-400" :
                                  p.matrixCategory === "quebra_cabeca" ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/20 dark:text-amber-400" :
                                  "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/20 dark:text-rose-400"
                                )}
                              >
                                {p.matrixCategory.replace("_", " ")}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ────────────────── CLIMA X VENDAS ────────────────── */}
      {activeBiTab === "climate" && (
        <div className="space-y-6">
          {lClimate ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando dados climáticos...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: "Calor Extremo (>30°C)", val: climate.averages?.calor_extremo, icon: <Sun className="h-4 w-4 text-amber-500" /> },
                  { label: "Quente (26-30°C)", val: climate.averages?.quente, icon: <Sun className="h-4 w-4 text-orange-400" /> },
                  { label: "Ameno (22-26°C)", val: climate.averages?.ameno, icon: <CloudRain className="h-4 w-4 text-cyan-400" /> },
                  { label: "Frio (<22°C)", val: climate.averages?.frio, icon: <AlertTriangle className="h-4 w-4 text-blue-500" /> },
                  { label: "Dias Limpos", val: climate.averages?.limpo, icon: <Sun className="h-4 w-4 text-amber-400" /> },
                  { label: "Dias Chuvosos", val: climate.averages?.chuvoso, icon: <CloudRain className="h-4 w-4 text-blue-400" /> },
                ].map((item) => (
                  <Card key={item.label}>
                    <CardContent className="p-4 flex flex-col items-center">
                      {item.icon}
                      <p className="text-xs text-muted-foreground mt-2 text-center h-8 flex items-center justify-center">{item.label}</p>
                      <p className="text-lg font-bold text-violet-700 mt-1">{formatBRL(item.val ?? 0)}</p>
                      <span className="text-[10px] text-muted-foreground">média diária</span>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sun className="h-4 w-4 text-amber-500" />
                    Médias de Vendas por Faixa de Temperatura
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={[
                      { name: "Frio (<22°C)", media: climate.averages?.frio ?? 0 },
                      { name: "Ameno (22-26°C)", media: climate.averages?.ameno ?? 0 },
                      { name: "Quente (26-30°C)", media: climate.averages?.quente ?? 0 },
                      { name: "Calor (>30°C)", media: climate.averages?.calor_extremo ?? 0 },
                      { name: "Limpo (Sem Chuva)", media: climate.averages?.limpo ?? 0 },
                      { name: "Chuvoso (>1mm)", media: climate.averages?.chuvoso ?? 0 },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(1)}k`} />
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                      <Bar dataKey="media" name="Média de Faturamento" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                        <Cell fill="#60a5fa" />
                        <Cell fill="#22d3ee" />
                        <Cell fill="#fb923c" />
                        <Cell fill="#f87171" />
                        <Cell fill="#fbbf24" />
                        <Cell fill="#3b82f6" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ────────────────── FIDELIDADE E CHURN (COHORTS) ────────────────── */}
      {activeBiTab === "loyalty" && (
        <div className="space-y-6">
          {lLoyalty ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando análise de retenção...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cohort Matrix */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Award className="h-4 w-4 text-violet-600" />
                      Matriz de Retenção de Clientes (Cohorts)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="text-left p-2 font-semibold">Mês de Entrada</th>
                          <th className="text-center p-2 font-semibold">Membros</th>
                          <th className="text-center p-2 font-semibold">Mês 0</th>
                          <th className="text-center p-2 font-semibold">Mês 1</th>
                          <th className="text-center p-2 font-semibold">Mês 2</th>
                          <th className="text-center p-2 font-semibold">Mês 3</th>
                          <th className="text-center p-2 font-semibold">Mês 4</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loyalty.matrix?.map((row: any) => (
                          <tr key={row.cohortMonth} className="border-t">
                            <td className="p-2 font-bold">{row.cohortMonth}</td>
                            <td className="p-2 text-center font-semibold text-muted-foreground">{row.size}</td>
                            {Array.from({ length: 5 }).map((_, i) => {
                              const r = row.retention?.find((item: any) => item.monthIndex === i);
                              const pct = r?.percentage ?? null;
                              return (
                                <td
                                  key={i}
                                  className="p-2 text-center"
                                  style={{
                                    backgroundColor: pct !== null ? `rgba(139, 92, 246, ${pct / 120})` : "transparent",
                                    color: pct !== null && pct > 40 ? "#fff" : "inherit",
                                    fontWeight: pct !== null ? "bold" : "normal",
                                  }}
                                >
                                  {pct !== null ? `${pct}%` : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Churn Risk */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-rose-500" />
                      Clientes em Risco de Churn (Inativos &gt;30 dias)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!loyalty.churnRisk?.length ? (
                      <p className="text-center text-muted-foreground py-8">Nenhum cliente inativo em risco.</p>
                    ) : (
                      <div className="overflow-y-auto max-h-[350px] space-y-3 pr-2">
                        {loyalty.churnRisk.map((c: any) => (
                          <div key={c.customerId} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 border border-border/40">
                            <div>
                              <p className="font-bold text-sm">{c.fullName}</p>
                              <p className="text-xs text-muted-foreground">{c.phone || "Sem telefone"} • Pontos: {c.totalPoints}</p>
                              <p className="text-xs text-rose-600 font-semibold mt-1">Inativo há {c.daysInactive} dias</p>
                            </div>
                            {c.phone && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1"
                                onClick={() => {
                                  const text = encodeURIComponent(`Olá ${c.fullName}! Tudo bem? Sentimos sua falta aqui na Duo Gelatto! Que tal vir nos visitar e resgatar uma oferta especial? Você tem ${c.totalPoints} pontos acumulados!`);
                                  window.open(`https://wa.me/55${c.phone.replace(/\D/g, "")}?text=${text}`, "_blank");
                                }}
                              >
                                Reativar
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* ────────────────── COMPRAS PREDITIVAS ────────────────── */}
      {activeBiTab === "purchase" && (
        <div className="space-y-6">
          {lPurchase ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando sugestões de compras...</div>
          ) : (
            <>
              {purchase.climateInfo && (
                <Card className={cn(
                  "border-0 shadow-sm",
                  purchase.climateInfo.multiplier > 1.0 ? "bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200" :
                  purchase.climateInfo.multiplier < 1.0 ? "bg-blue-50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200" :
                  "bg-muted/40"
                )}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 bg-white/80 dark:bg-black/20 rounded-full">
                      {purchase.climateInfo.multiplier > 1.0 ? <Sun className="h-5 w-5 text-amber-500" /> : <CloudRain className="h-5 w-5 text-blue-500" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm">Previsão Climática & Demanda Preditiva</p>
                      <p className="text-xs opacity-90 mt-0.5">{purchase.climateInfo.notes}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-violet-600" />
                    Sugestões de Compra Inteligentes para os Próximos 14 Dias
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!purchase.suggestions?.length ? (
                    <p className="text-center text-muted-foreground py-8">Estoque totalmente seguro. Nenhuma compra necessária.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr className="border-b">
                            <th className="text-left p-3 font-semibold">Insumo / Produto</th>
                            <th className="text-right p-3 font-semibold">Estoque Físico</th>
                            <th className="text-right p-3 font-semibold">Giro Semanal (Projetado)</th>
                            <th className="text-right p-3 font-semibold">Cobertura (Dias)</th>
                            <th className="text-right p-3 font-semibold text-violet-600">Sugestão de Compra</th>
                            <th className="text-right p-3 font-semibold">Custo Estimado</th>
                            <th className="text-center p-3 font-semibold">Prioridade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchase.suggestions.map((s: any) => (
                            <tr key={s.productId} className="border-t hover:bg-muted/20">
                              <td className="p-3 font-medium">{s.productName}</td>
                              <td className="p-3 text-right">{s.currentStock}</td>
                              <td className="p-3 text-right">{s.projectedWeeklySales}</td>
                              <td className={cn(
                                "p-3 text-right font-semibold",
                                s.coverageDays <= 3 ? "text-red-500" : s.coverageDays <= 7 ? "text-amber-500" : "text-green-600"
                              )}>
                                {s.coverageDays} dias
                              </td>
                              <td className="p-3 text-right font-bold text-violet-700 text-base">{s.suggestedQty}</td>
                              <td className="p-3 text-right font-medium text-emerald-600">{formatBRL(s.estimatedCost)}</td>
                              <td className="p-3 text-center">
                                <Badge
                                  className={cn(
                                    "uppercase text-[9px] font-bold",
                                    s.status === "crítico" ? "bg-red-100 text-red-700 border-red-300 hover:bg-red-200" : "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
                                  )}
                                >
                                  {s.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ────────────────── DELIVERY VS BALCÃO ────────────────── */}
      {activeBiTab === "channel" && (
        <div className="space-y-6">
          {lChannel ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando canais de vendas...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">DRE Comparativo por Canal</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="text-left p-3 font-semibold">Indicador Financeiro</th>
                          <th className="text-right p-3 font-semibold text-violet-700">Loja Física (Balcão)</th>
                          <th className="text-right p-3 font-semibold text-pink-700">Delivery (iFood/Z-API)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <td className="p-3 font-medium">Receita Bruta (Vendas)</td>
                          <td className="p-3 text-right font-semibold">{formatBRL(channel.balcao?.revenue ?? 0)} ({channel.balcao?.pct}%)</td>
                          <td className="p-3 text-right font-semibold">{formatBRL(channel.delivery?.revenue ?? 0)} ({channel.delivery?.pct}%)</td>
                        </tr>
                        <tr className="border-t">
                          <td className="p-3 font-medium text-muted-foreground">(-) CMV Estimado</td>
                          <td className="p-3 text-right text-red-500">-{formatBRL(channel.balcao?.cmv ?? 0)}</td>
                          <td className="p-3 text-right text-red-500">-{formatBRL(channel.delivery?.cmv ?? 0)}</td>
                        </tr>
                        <tr className="border-t">
                          <td className="p-3 font-medium text-muted-foreground">(-) Taxas de Cartão/Intermediação (Rede)</td>
                          <td className="p-3 text-right text-red-500">-{formatBRL(channel.balcao?.fees ?? 0)}</td>
                          <td className="p-3 text-right text-red-500">-{formatBRL(channel.delivery?.fees ?? 0)}</td>
                        </tr>
                        <tr className="border-t bg-muted/20 font-bold">
                          <td className="p-3">(=) Lucro Bruto Operacional</td>
                          <td className="p-3 text-right text-emerald-600">{formatBRL(channel.balcao?.grossProfit ?? 0)}</td>
                          <td className="p-3 text-right text-emerald-600">{formatBRL(channel.delivery?.grossProfit ?? 0)}</td>
                        </tr>
                        <tr className="border-t font-semibold">
                          <td className="p-3">Margem Operacional do Canal</td>
                          <td className="p-3 text-right text-violet-700">{channel.balcao?.margin}%</td>
                          <td className="p-3 text-right text-pink-700">{channel.delivery?.margin}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Pizza Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base text-center">Faturamento por Canal</CardTitle>
                  </CardHeader>
                  <CardContent className="flex justify-center items-center h-[220px]">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Balcão", value: channel.balcao?.revenue ?? 0 },
                            { name: "Delivery", value: channel.delivery?.revenue ?? 0 },
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          label={({ name, percent }: { name: string; percent: number }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          <Cell fill="#7c3aed" />
                          <Cell fill="#ec4899" />
                        </Pie>
                        <Tooltip formatter={(v: number) => formatBRL(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const COLORS = ["#7c3aed", "#ec4899", "#f97316", "#06b6d4", "#10b981", "#f59e0b"];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function Reports() {
  const [period, setPeriod] = useState("30");

  const { data: dashData } = trpc.dashboard.metrics.useQuery();
  const { data: salesChart } = trpc.dashboard.chartData.useQuery({ days: parseInt(period) });
  const { data: topProducts } = trpc.dashboard.topProducts.useQuery({ limit: 10 });
  const { data: customers } = trpc.customers.list.useQuery({});
  const { data: products } = trpc.products.list.useQuery({});

  // Payment method distribution from sales chart data
  const paymentData = [
    { name: "Dinheiro", value: 0 },
    { name: "Cartão Crédito", value: 0 },
    { name: "Cartão Débito", value: 0 },
    { name: "PIX", value: 0 },
    { name: "Outros", value: 0 },
  ];

  type ChartEntry = { date: string; total: string; count: number };
  const totalRevenue = salesChart?.reduce((sum: number, d: ChartEntry) => sum + (parseFloat(String(d.total)) || 0), 0) ?? 0;
  const totalSales = salesChart?.reduce((sum: number, d: ChartEntry) => sum + (d.count || 0), 0) ?? 0;
  const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

  const lowStockCount = products?.filter((p) => p.currentStock <= p.minStock).length ?? 0;
  const activeCustomers = customers?.filter((c) => c.active).length ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/dashboard" />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-primary" />
              Relatórios e Análises
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visão completa do desempenho da sorveteria
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2" onClick={() => window.print()}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Faturamento no Período",
              value: formatCurrency(totalRevenue),
              icon: <TrendingUp className="h-5 w-5" />,
              color: "bg-violet-600",
              sub: `${totalSales} vendas`,
            },
            {
              label: "Ticket Médio",
              value: formatCurrency(avgTicket),
              icon: <BarChart2 className="h-5 w-5" />,
              color: "bg-pink-500",
              sub: "por venda",
            },
            {
              label: "Clientes Ativos",
              value: String(activeCustomers),
              icon: <Users className="h-5 w-5" />,
              color: "bg-cyan-500",
              sub: "cadastrados",
            },
            {
              label: "Estoque Baixo",
              value: String(lowStockCount),
              icon: <BarChart2 className="h-5 w-5" />,
              color: lowStockCount > 0 ? "bg-orange-500" : "bg-green-500",
              sub: "produtos",
            },
          ].map((kpi) => (
            <Card key={kpi.label} className="overflow-hidden">
              <CardContent className="p-0">
                <div className={`${kpi.color} text-white p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium opacity-90">{kpi.label}</span>
                    {kpi.icon}
                  </div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs opacity-80 mt-0.5">{kpi.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="inove">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="inove" className="flex items-center gap-1.5"><ShoppingCart className="h-3.5 w-3.5" />INOVE PDV</TabsTrigger>
            <TabsTrigger value="bi" className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />Inteligência (BI)</TabsTrigger>
            <TabsTrigger value="forecast" className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" />Previsão</TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" />Meta</TabsTrigger>
            <TabsTrigger value="sales">Vendas</TabsTrigger>
            <TabsTrigger value="gerencial" className="flex items-center gap-1.5"><BarChart2 className="h-3.5 w-3.5" />Gerencial</TabsTrigger>
            <TabsTrigger value="costmargin" className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Custo/Margem</TabsTrigger>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="customers">Clientes</TabsTrigger>
            <TabsTrigger value="stock">Estoque</TabsTrigger>
          </TabsList>

          {/* Sales Tab */}
          <TabsContent value="sales" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Faturamento Diário</CardTitle>
              </CardHeader>
              <CardContent>
                {!salesChart?.length ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    Nenhuma venda no período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={salesChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `R$${v}`} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: number) => formatCurrency(v)}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        name="Faturamento"
                        stroke="#7c3aed"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Número de Vendas por Dia</CardTitle>
              </CardHeader>
              <CardContent>
                {!salesChart?.length ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground">
                    Nenhuma venda no período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={salesChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Vendas" fill="#ec4899" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Produtos Mais Vendidos</CardTitle>
                </CardHeader>
                <CardContent>
                  {!topProducts?.length ? (
                    <div className="h-48 flex items-center justify-center text-muted-foreground">
                      Nenhuma venda registrada.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={topProducts} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="productName" type="category" tick={{ fontSize: 11 }} width={100} />
                        <Tooltip />
                        <Bar dataKey="totalQty" name="Qtd. Vendida" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Receita por Produto</CardTitle>
                </CardHeader>
                <CardContent>
                  {!topProducts?.length ? (
                    <div className="h-48 flex items-center justify-center text-muted-foreground">
                      Nenhuma venda registrada.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={topProducts.slice(0, 6)}
                          dataKey="totalRevenue"
                          nameKey="productName"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }: { name: string; percent: number }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {topProducts.slice(0, 6).map((_: unknown, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Product Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de Produtos</CardTitle>
              </CardHeader>
              <CardContent>
                {!topProducts?.length ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma venda registrada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-muted-foreground">#</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Produto</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Qtd. Vendida</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Receita</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProducts.map((p: { productName: string; totalQty: number; totalRevenue: string }, i: number) => (
                          <tr key={p.productName} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 font-medium">{p.productName}</td>
                            <td className="py-2 text-right">{p.totalQty}</td>
                            <td className="py-2 text-right font-medium text-green-600">
                              {formatCurrency(parseFloat(p.totalRevenue))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Total de Clientes", value: customers?.length ?? 0, color: "text-violet-600" },
                { label: "Clientes Ativos", value: activeCustomers, color: "text-green-600" },
                {
                  label: "Com Pontos Acumulados",
                  value: customers?.filter((c) => (c.totalPoints ?? 0) > 0).length ?? 0,
                  color: "text-orange-500",
                },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-4 text-center">
                    <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clientes com Mais Pontos</CardTitle>
              </CardHeader>
              <CardContent>
                {!customers?.length ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum cliente cadastrado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-muted-foreground">#</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Cliente</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Telefone</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Pontos</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Total Compras</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...customers]
                          .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
                          .slice(0, 10)
                          .map((c, i) => (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2 text-muted-foreground">{i + 1}</td>
                              <td className="py-2 font-medium">{c.fullName}</td>
                              <td className="py-2 text-muted-foreground">{c.phone ?? "—"}</td>
                              <td className="py-2 text-right">
                                <Badge variant="secondary">{c.totalPoints ?? 0} pts</Badge>
                              </td>
                              <td className="py-2 text-right font-medium text-green-600">
                                {formatCurrency(parseFloat(String(c.totalPurchases ?? 0)))}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stock Tab */}
          <TabsContent value="stock" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Total de Produtos", value: products?.length ?? 0, color: "text-violet-600" },
                { label: "Produtos Ativos", value: products?.filter((p) => p.active).length ?? 0, color: "text-green-600" },
                { label: "Estoque Baixo/Crítico", value: lowStockCount, color: lowStockCount > 0 ? "text-red-500" : "text-green-600" },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-4 text-center">
                    <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Situação do Estoque</CardTitle>
              </CardHeader>
              <CardContent>
                {!products?.length ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum produto cadastrado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-muted-foreground">Produto</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Estoque Atual</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Estoque Mínimo</th>
                          <th className="text-center py-2 font-medium text-muted-foreground">Status</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Preço Venda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...products]
                          .sort((a, b) => a.currentStock - a.minStock - (b.currentStock - b.minStock))
                          .map((p) => {
                            const isLow = p.currentStock <= p.minStock;
                            const isCritical = p.currentStock === 0;
                            return (
                              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="py-2 font-medium">{p.name}</td>
                                <td className={`py-2 text-right font-bold ${isCritical ? "text-red-600" : isLow ? "text-orange-500" : "text-green-600"}`}>
                                  {p.currentStock}
                                </td>
                                <td className="py-2 text-right text-muted-foreground">{p.minStock}</td>
                                <td className="py-2 text-center">
                                  <Badge
                                    variant={isCritical ? "destructive" : isLow ? "outline" : "secondary"}
                                    className={isLow && !isCritical ? "border-orange-400 text-orange-600" : ""}
                                  >
                                    {isCritical ? "Sem estoque" : isLow ? "Estoque baixo" : "Normal"}
                                  </Badge>
                                </td>
                                <td className="py-2 text-right">
                                  {formatCurrency(parseFloat(String(p.salePrice)))}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Novas abas INOVE */}
          <TabsContent value="inove" className="mt-4"><InoveTab /></TabsContent>
          <TabsContent value="bi" className="mt-4"><BITab /></TabsContent>
          <TabsContent value="forecast" className="mt-4"><ForecastTab /></TabsContent>
          <TabsContent value="goals" className="mt-4"><GoalsTab /></TabsContent>
          <TabsContent value="gerencial" className="mt-4"><GerencialTab /></TabsContent>
          <TabsContent value="costmargin" className="mt-4"><CostMarginTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
