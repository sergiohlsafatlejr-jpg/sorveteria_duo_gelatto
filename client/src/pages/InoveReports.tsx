import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  Clock,
  CreditCard,
  Database,
  RefreshCw,
  TrendingUp,
  Package,
  Loader2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { todayBRT } from "@/lib/dateUtils";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = [
  "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444",
  "#3b82f6", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtCompact = (v: number) =>
  v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : fmt(v);

// ── Tooltip customizado ────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" && p.name.includes("R$") ? fmt(p.value) : p.value.toLocaleString("pt-BR")}
        </p>
      ))}
    </div>
  );
}

// ── Aba: Vendas por Hora ───────────────────────────────────────────────────────
function SalesByHourTab() {
  const today = todayBRT();
  const thirtyDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-"); })();

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [appliedFrom, setAppliedFrom] = useState(thirtyDaysAgo);
  const [appliedTo, setAppliedTo] = useState(today);

  const { data, isLoading } = trpc.inove.getSalesByHour.useQuery({
    dateFrom: appliedFrom,
    dateTo: appliedTo,
  });

  const chartData = useMemo(() =>
    (data ?? []).map(d => ({
      hora: `${String(d.hora).padStart(2, "0")}h`,
      "Qtd Vendas": d.qtd_vendas,
      "Faturamento (R$)": d.total,
      "Ticket Médio (R$)": d.ticket_medio,
    })),
    [data]
  );

  const totalVendas = data?.reduce((s, d) => s + d.qtd_vendas, 0) ?? 0;
  const totalFaturamento = data?.reduce((s, d) => s + d.total, 0) ?? 0;
  const horaPico = data?.reduce((best, d) => d.qtd_vendas > (best?.qtd_vendas ?? 0) ? d : best, data[0]);

  function applyFilter() {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
        </div>
        <Button onClick={applyFilter} size="sm" className="gap-2">
          <RefreshCw className="h-3 w-3" />
          Aplicar
        </Button>
        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs ml-auto">
          <Database className="h-3 w-3 mr-1" />
          PDV INOVE
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total de Vendas</p>
            <p className="text-2xl font-bold text-primary">{totalVendas.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Faturamento Total</p>
            <p className="text-2xl font-bold text-emerald-600">{fmt(totalFaturamento)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Hora de Pico</p>
            <p className="text-2xl font-bold text-violet-600">
              {horaPico ? `${String(horaPico.hora).padStart(2, "0")}h` : "—"}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {horaPico ? `${horaPico.qtd_vendas} vendas` : ""}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de barras — Qtd vendas por hora */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : chartData.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Nenhum dado encontrado para o período selecionado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Quantidade de Vendas por Hora
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Qtd Vendas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Faturamento por Hora (R$)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Faturamento (R$)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Tabela detalhada */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Detalhamento por Hora</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Hora</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Vendas</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Faturamento</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ticket Médio</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">% do Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data ?? []).map((d, i) => (
                      <tr key={i} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 font-medium">{String(d.hora).padStart(2, "0")}:00 — {String(d.hora).padStart(2, "0")}:59</td>
                        <td className="px-4 py-2 text-right">{d.qtd_vendas.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right text-emerald-600 font-medium">{fmt(d.total)}</td>
                        <td className="px-4 py-2 text-right">{fmt(d.ticket_medio)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {totalFaturamento > 0 ? ((d.total / totalFaturamento) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Aba: Vendas por Tipo de Pagamento ─────────────────────────────────────────
function SalesByPaymentTab() {
  const today = todayBRT();
  const thirtyDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-"); })();

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [appliedFrom, setAppliedFrom] = useState(thirtyDaysAgo);
  const [appliedTo, setAppliedTo] = useState(today);

  const { data, isLoading } = trpc.inove.getSalesByPaymentType.useQuery({
    dateFrom: appliedFrom,
    dateTo: appliedTo,
  });

  const totalFaturamento = data?.reduce((s, d) => s + d.total, 0) ?? 0;

  const pieData = useMemo(() =>
    (data ?? []).map(d => ({
      name: d.forma,
      value: d.total,
    })),
    [data]
  );

  function applyFilter() {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
        </div>
        <Button onClick={applyFilter} size="sm" className="gap-2">
          <RefreshCw className="h-3 w-3" />
          Aplicar
        </Button>
        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs ml-auto">
          <Database className="h-3 w-3 mr-1" />
          PDV INOVE
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Nenhum dado encontrado para o período selecionado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gráfico de pizza */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Distribuição por Forma de Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Gráfico de barras */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-violet-600" />
                  Faturamento por Forma de Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(data ?? []).map(d => ({ forma: d.forma, "Faturamento (R$)": d.total, "Qtd Vendas": d.qtd_vendas }))}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={fmtCompact} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="forma" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="Faturamento (R$)" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabela detalhada */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Detalhamento por Forma de Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Forma de Pagamento</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Qtd Vendas</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Faturamento</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ticket Médio</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">% do Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data ?? []).map((d, i) => (
                      <tr key={i} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 font-medium flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          />
                          {d.forma}
                        </td>
                        <td className="px-4 py-2 text-right">{d.qtd_vendas.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right text-emerald-600 font-medium">{fmt(d.total)}</td>
                        <td className="px-4 py-2 text-right">{fmt(d.ticket_medio)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {totalFaturamento > 0 ? ((d.total / totalFaturamento) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/20 font-semibold">
                      <td className="px-4 py-2">TOTAL</td>
                      <td className="px-4 py-2 text-right">{(data ?? []).reduce((s, d) => s + d.qtd_vendas, 0).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2 text-right text-emerald-600">{fmt(totalFaturamento)}</td>
                      <td className="px-4 py-2 text-right">—</td>
                      <td className="px-4 py-2 text-right">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Aba: Sincronizar Estoque ───────────────────────────────────────────────────
function SyncStockTab() {
  const utils = trpc.useUtils();
  const [result, setResult] = useState<{
    synced: number; created: number; costUpdated: number; total: number; errors: string[];
  } | null>(null);

  const syncMutation = trpc.inove.syncStockFromInove.useMutation({
    onSuccess: (data) => {
      setResult(data);
      utils.products.list.invalidate();
      utils.products.lowStock.invalidate();
      toast.success(`Sincronização concluída! ${data.synced} atualizados, ${data.created} criados.`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Sincronizar Estoque INOVE → Sistema Local
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta operação importa todos os produtos do PDV INOVE para o sistema local, atualizando:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Saldo atual de estoque (baseado no último movimento)</li>
            <li>Preço de custo (campo <code className="bg-muted px-1 rounded">PRO_CUSTO</code> do INOVE)</li>
            <li>Preço de venda (campo <code className="bg-muted px-1 rounded">PRO_VENDA</code> do INOVE)</li>
            <li>Produtos novos são criados automaticamente com barcode vinculado</li>
          </ul>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            <strong>Atenção:</strong> O saldo atual do sistema será sobrescrito com o saldo do INOVE. Execute apenas quando quiser sincronizar o estoque físico.
          </div>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="gap-2"
          >
            {syncMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</>
            ) : (
              <><RefreshCw className="h-4 w-4" />Sincronizar Estoque Agora</>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 space-y-3">
            <p className="font-semibold text-emerald-700 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Sincronização Concluída
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600">{result.total}</p>
                <p className="text-xs text-muted-foreground">Produtos INOVE</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{result.synced}</p>
                <p className="text-xs text-muted-foreground">Atualizados</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-violet-600">{result.created}</p>
                <p className="text-xs text-muted-foreground">Criados</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">{result.costUpdated}</p>
                <p className="text-xs text-muted-foreground">Custos atualizados</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-600 mb-1">Erros ({result.errors.length}):</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-500">{e}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function InoveReports() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/dashboard" />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Relatórios PDV INOVE
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Análises de vendas em tempo real do banco de dados INOVE
            </p>
          </div>
          <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
            <Database className="h-3 w-3 mr-1" />
            SQL Server DUOGELATTO
          </Badge>
        </div>

        <Tabs defaultValue="by-hour">
          <TabsList>
            <TabsTrigger value="by-hour" className="gap-2">
              <Clock className="h-4 w-4" />
              Vendas por Hora
            </TabsTrigger>
            <TabsTrigger value="by-payment" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Por Tipo de Pagamento
            </TabsTrigger>
            <TabsTrigger value="sync-stock" className="gap-2">
              <Package className="h-4 w-4" />
              Sincronizar Estoque
            </TabsTrigger>
          </TabsList>

          <TabsContent value="by-hour" className="mt-4">
            <SalesByHourTab />
          </TabsContent>

          <TabsContent value="by-payment" className="mt-4">
            <SalesByPaymentTab />
          </TabsContent>

          <TabsContent value="sync-stock" className="mt-4">
            <SyncStockTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
