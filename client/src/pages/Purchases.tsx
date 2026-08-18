import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { buildPurchaseWarehouseCatalog, SORVETE_CATEGORY_LABELS } from "@/lib/purchase-warehouse";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Package, ShoppingCart, Store, ClipboardList, BarChart3, Plus, Search,
  AlertTriangle, ArrowDown, ArrowUp, Minus, Edit, Trash2, Check, X,
  TrendingDown, RefreshCw, FileText, Phone, ChevronRight, CalendarDays,
  Candy, Droplets, Utensils, Boxes, Wrench, Sparkles, ShoppingBasket,
  ReceiptText, Layers3, Loader2,
  IceCream,
} from "lucide-react";
import { Download, TrendingUp } from "lucide-react";

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  limpeza: { label: "Material de limpeza", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Sparkles },
  guloseimas: { label: "Guloseimas", color: "bg-pink-500/10 text-pink-600 border-pink-500/20", icon: Candy },
  caldas: { label: "Caldas", color: "bg-amber-500/10 text-amber-700 border-amber-500/20", icon: Droplets },
  descartaveis: { label: "Utensílios/Descartáveis", color: "bg-slate-500/10 text-slate-700 border-slate-500/20", icon: Utensils },
  embalagens: { label: "Embalagens", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: Boxes },
  manutencao: { label: "Manutenção", color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: Wrench },
  insumos: { label: "Insumos", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: Package },
  outros: { label: "Outros itens", color: "bg-zinc-500/10 text-zinc-600 border-zinc-500/20", icon: ShoppingBasket },
};

const INTERNAL_PURCHASE_GROUPS: Record<string, string> = {
  limpeza: "Material de limpeza",
  guloseimas: "Guloseimas",
  outros: "Outros itens",
};

function getInternalPurchaseGroup(category: string): keyof typeof INTERNAL_PURCHASE_GROUPS {
  if (category === "limpeza") return "limpeza";
  if (category === "guloseimas") return "guloseimas";
  return "outros";
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Rascunho", color: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
  requested: { label: "Solicitado", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  approved: { label: "Aprovado", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  rejected: { label: "Rejeitado", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  purchased: { label: "Comprado", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  delivered: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
};

function formatCurrency(value: number | string | null | undefined) {
  if (value == null) return "R$ 0,00";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function formatDate(dateStr: string | Date | null | undefined) {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dateStr));
}

function formatInvoiceDate(dateStr: string | null | undefined) {
  if (!dateStr) return "Sem data";
  const [year, month, day] = dateStr.split("-");
  return year && month && day ? `${day}/${month}/${year}` : dateStr;
}

function formatMonthLabel(month: string | null | undefined) {
  if (!month) return "Mês não informado";
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatQuantity(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(value ?? 0));
}

const CHART_COLORS = [
  "#ec4899", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#6366f1", "#14b8a6", "#f97316",
  "#a855f7", "#22c55e", "#e11d48", "#0ea5e9", "#84cc16",
];

function PriceComparisonCard({ month }: { month: string | null }) {
  const input = useMemo(() => ({ month }), [month]);
  const { data, isLoading } = trpc.purchaseInvoices.priceComparison.useQuery(input, {
    retry: false,
  });

  if (isLoading) return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
        Carregando comparativo de preços...
      </CardContent>
    </Card>
  );

  if (!data || data.items.length === 0) return null;

  const itemsWithSellPrice = data.items.filter(i => i.sellPrice > 0);
  const itemsWithoutSellPrice = data.items.filter(i => i.sellPrice === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          Comparativo Preço de Compra x Preço de Venda
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Margem de lucro por produto — preço médio de compra (notas) vs preço de venda (INOVE).
        </p>
      </CardHeader>
      <CardContent>
        {itemsWithSellPrice.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-y bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-4 py-2 text-right">Preço Compra</th>
                  <th className="px-4 py-2 text-right">Preço Venda</th>
                  <th className="px-4 py-2 text-right">Margem</th>
                  <th className="px-4 py-2 text-right">Qtd. Comprada</th>
                  <th className="px-4 py-2 text-right">Total Gasto</th>
                </tr>
              </thead>
              <tbody>
                {itemsWithSellPrice.map((item) => (
                  <tr key={item.product} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{item.product}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(item.avgCostPrice)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(item.sellPrice)}</td>
                    <td className={`px-4 py-2 text-right font-bold ${item.margin >= 50 ? "text-emerald-600" : item.margin >= 30 ? "text-green-600" : item.margin >= 0 ? "text-amber-600" : "text-red-600"}`}>
                      {item.margin.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right">{item.totalQty.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(item.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {itemsWithoutSellPrice.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              {itemsWithoutSellPrice.length} itens sem preço de venda no INOVE
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/20 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2">Produto</th>
                    <th className="px-4 py-2 text-right">Preço Compra</th>
                    <th className="px-4 py-2 text-right">Qtd.</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsWithoutSellPrice.map((item) => (
                    <tr key={item.product} className="border-b">
                      <td className="px-4 py-2">{item.product}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.avgCostPrice)}</td>
                      <td className="px-4 py-2 text-right">{item.totalQty.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function SorveteCategoryChart() {
  const { data: trendData } = trpc.purchaseInvoices.monthlyCategoryTrend.useQuery();

  if (!trendData || trendData.months.length === 0 || trendData.series.length === 0) return null;

  const chartData = trendData.months.map((month, idx) => {
    const entry: Record<string, string | number> = { month: month.split("-").reverse().join("/") };
    trendData.series.forEach((s) => {
      entry[SORVETE_CATEGORY_LABELS[s.category] ?? s.category] = Number(s.data[idx].toFixed(2));
    });
    return entry;
  });

  const topSeries = trendData.series.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-500" />
          Evolução de Gastos por Categoria — Últimos 6 Meses
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topSeries.map((s, i) => (
                <Bar
                  key={s.category}
                  dataKey={SORVETE_CATEGORY_LABELS[s.category] ?? s.category}
                  stackId="a"
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Purchases() {
  const utils = trpc.useContext();
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    return ["resumo", "almoxarifado", "sorvetes", "pedidos", "baixas", "fornecedores", "templates"].includes(requestedTab ?? "")
      ? requestedTab!
      : "resumo";
  });
  const [purchaseMonth, setPurchaseMonth] = useState<string | null>(null);
  const [expandedPurchaseCategories, setExpandedPurchaseCategories] = useState<Record<string, boolean>>({});

  // Dashboard Data
  const { data: dashboard } = trpc.purchases.dashboard.useQuery(undefined, { enabled: activeTab === 'resumo' });
  const monthlyItemsInput = useMemo(() => ({ month: purchaseMonth }), [purchaseMonth]);
  const {
    data: monthlyItemsSummary,
    isLoading: isMonthlyItemsLoading,
    isError: isMonthlyItemsError,
  } = trpc.purchaseInvoices.monthlyItemsSummary.useQuery(monthlyItemsInput, {
    enabled: activeTab === "resumo" || activeTab === "almoxarifado" || activeTab === "sorvetes" || activeTab === "baixas",
  });
  
  // Items Data
  const [itemSearch, setItemSearch] = useState("");
  const [itemCategory, setItemCategory] = useState("all");
  const { data: items = [] } = trpc.purchases.items.list.useQuery();
  const { data: lowStockItems = [] } = trpc.purchases.items.lowStock.useQuery();
  const warehouseItems = useMemo(
    () => buildPurchaseWarehouseCatalog(monthlyItemsSummary?.categories ?? [], items, "almoxarifado"),
    [monthlyItemsSummary?.categories, items],
  );
  const warehouseItemsSorvetes = useMemo(
    () => buildPurchaseWarehouseCatalog(monthlyItemsSummary?.categories ?? [], [], "duo_gelatto"),
    [monthlyItemsSummary?.categories],
  );
  const priceVariationInput = useMemo(() => ({ month: purchaseMonth }), [purchaseMonth]);
  const { data: priceVariation } = trpc.purchaseInvoices.priceVariation.useQuery(priceVariationInput, {
    enabled: activeTab === "sorvetes",
  });
  const filteredWarehouseItems = warehouseItems.filter(item =>
    item.name.toLowerCase().includes(itemSearch.toLowerCase()) &&
    (itemCategory === "all" || getInternalPurchaseGroup(item.category) === itemCategory)
  );
  const warehousePurchaseSummary = useMemo(() => warehouseItems.reduce((summary, item) => ({
    purchasedProducts: summary.purchasedProducts + (item.purchasedQuantity > 0 ? 1 : 0),
    purchasedQuantity: summary.purchasedQuantity + item.purchasedQuantity,
    purchasedValue: summary.purchasedValue + item.purchasedValue,
    stockConfigured: summary.stockConfigured + (item.stockConfigured ? 1 : 0),
    availableForConsumption: summary.availableForConsumption + (item.stockConfigured && Number(item.currentStock) > 0 ? 1 : 0),
  }), {
    purchasedProducts: 0,
    purchasedQuantity: 0,
    purchasedValue: 0,
    stockConfigured: 0,
    availableForConsumption: 0,
  }), [warehouseItems]);

  // Orders Data
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [sorveteCategoryFilter, setSorveteCategoryFilter] = useState("all");
  const [orderItems, setOrderItems] = useState<Array<{itemId: number; name: string; unit: string; quantity: number; price: number}>>([]);
  const [newOrderItemId, setNewOrderItemId] = useState("");
  const [newOrderQty, setNewOrderQty] = useState("");
  const [newOrderPrice, setNewOrderPrice] = useState("");
  const { data: orders = [] } = trpc.purchases.orders.list.useQuery();
  const filteredOrders = orders.filter(o => orderStatusFilter === "all" || o.status === orderStatusFilter);

  // Stock Movements Data
  const { data: movements = [] } = trpc.purchases.stock.movements.useQuery();

  // Suppliers Data
  const { data: suppliers = [] } = trpc.purchases.suppliers.list.useQuery();

  // Templates Data
  const { data: templates = [] } = trpc.purchases.templates.list.useQuery();

  // --- Mutations ---
  const registerConsumptionMutation = trpc.purchases.stock.registerConsumption.useMutation({
    onSuccess: () => {
      toast.success("Baixa registrada com sucesso!");
      utils.purchases.invalidate();
    },
    onError: (e) => toast.error(`Erro ao registrar baixa: ${e.message}`)
  });

  const createItemMutation = trpc.purchases.items.create.useMutation({
    onSuccess: () => {
      toast.success("Item criado com sucesso!");
      utils.purchases.invalidate();
    },
    onError: (e) => toast.error(`Erro ao criar item: ${e.message}`)
  });

  const createSupplierMutation = trpc.purchases.suppliers.create.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor criado com sucesso!");
      utils.purchases.invalidate();
    },
    onError: (e) => toast.error(`Erro ao criar fornecedor: ${e.message}`)
  });

  const createOrderMutation = trpc.purchases.orders.create.useMutation({
    onSuccess: () => {
      toast.success("Pedido criado com sucesso!");
      utils.purchases.invalidate();
    },
    onError: (e) => toast.error(`Erro ao criar pedido: ${e.message}`)
  });

  const orderMutationOpts = {
    onSuccess: () => {
      toast.success("Status do pedido atualizado!");
      utils.purchases.invalidate();
    },
    onError: (e: any) => toast.error(`Erro ao atualizar pedido: ${e.message}`)
  };
  const requestOrderMutation = trpc.purchases.orders.request.useMutation(orderMutationOpts);
  const approveOrderMutation = trpc.purchases.orders.approve.useMutation(orderMutationOpts);
  const rejectOrderMutation = trpc.purchases.orders.reject.useMutation(orderMutationOpts);
  const markPurchasedMutation = trpc.purchases.orders.markPurchased.useMutation(orderMutationOpts);
  const deliverOrderMutation = trpc.purchases.orders.deliver.useMutation(orderMutationOpts);
  const adjustStockMutation = trpc.purchases.stock.adjust.useMutation({
    onSuccess: () => { toast.success("Estoque ajustado!"); utils.purchases.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-6 max-w-7xl mx-auto w-full">
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-8 grid h-auto grid-cols-2 gap-1 bg-slate-100 p-1 sm:grid-cols-3 lg:grid-cols-6 dark:bg-slate-800">
            <TabsTrigger value="resumo" className="py-2 text-xs sm:text-sm"><BarChart3 className="mr-2 h-4 w-4"/> Resumo</TabsTrigger>
            <TabsTrigger value="almoxarifado" className="py-2 text-xs sm:text-sm"><Package className="mr-2 h-4 w-4"/> Almoxarifado</TabsTrigger>
            <TabsTrigger value="sorvetes" className="py-2 text-xs sm:text-sm"><IceCream className="mr-2 h-4 w-4"/> Sorvetes</TabsTrigger>
            <TabsTrigger value="pedidos" className="py-2 text-xs sm:text-sm"><ShoppingCart className="mr-2 h-4 w-4"/> Pedidos</TabsTrigger>
            <TabsTrigger value="baixas" className="py-2 text-xs sm:text-sm"><TrendingDown className="mr-2 h-4 w-4"/> Baixas</TabsTrigger>
            <TabsTrigger value="fornecedores" className="py-2 text-xs sm:text-sm"><Store className="mr-2 h-4 w-4"/> Fornecedores</TabsTrigger>
            <TabsTrigger value="templates" className="py-2 text-xs sm:text-sm"><ClipboardList className="mr-2 h-4 w-4"/> Templates</TabsTrigger>
          </TabsList>

          {/* TAB: RESUMO */}
          <TabsContent value="resumo" className="space-y-6">
            <Card className="overflow-hidden border-emerald-200/70 shadow-sm dark:border-emerald-900/70">
              <CardHeader className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-amber-50 dark:border-emerald-950 dark:from-emerald-950/50 dark:via-slate-950 dark:to-amber-950/30">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm">
                      <ReceiptText className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Compras encontradas nas notas fiscais</CardTitle>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Quantidades e produtos extraídos dos PDFs, organizados por categoria e nota de origem.
                      </p>
                    </div>
                  </div>
                  <div className="w-full sm:w-[230px]">
                    <Label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" /> Mês de referência
                    </Label>
                    <Select
                      value={purchaseMonth ?? monthlyItemsSummary?.month ?? undefined}
                      onValueChange={setPurchaseMonth}
                    >
                      <SelectTrigger className="bg-white dark:bg-slate-950">
                        <SelectValue placeholder="Selecione o mês" />
                      </SelectTrigger>
                      <SelectContent>
                        {(monthlyItemsSummary?.availableMonths ?? []).map((month) => (
                          <SelectItem key={month} value={month}>{formatMonthLabel(month)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-4 sm:p-6">
                {isMonthlyItemsLoading ? (
                  <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> Consolidando os itens das notas...
                  </div>
                ) : isMonthlyItemsError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Não foi possível carregar o resumo mensal.</div>
                    <p className="mt-1">Tente atualizar a página. As notas e os PDFs permanecem preservados.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatMonthLabel(monthlyItemsSummary?.month)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Considera notas extraídas, em revisão ou confirmadas no mês selecionado.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                        <div className="flex items-center justify-between gap-2 text-emerald-700 dark:text-emerald-300">
                          <span className="text-xs font-semibold uppercase tracking-wide">Unidades compradas</span>
                          <ShoppingBasket className="h-4 w-4" />
                        </div>
                        <p className="mt-2 text-2xl font-bold tabular-nums">{formatQuantity(monthlyItemsSummary?.summary.totalQuantity)}</p>
                        <p className="mt-1 text-xs text-slate-500">Soma das quantidades dos itens</p>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                        <div className="flex items-center justify-between gap-2 text-blue-700 dark:text-blue-300">
                          <span className="text-xs font-semibold uppercase tracking-wide">Produtos distintos</span>
                          <Layers3 className="h-4 w-4" />
                        </div>
                        <p className="mt-2 text-2xl font-bold tabular-nums">{monthlyItemsSummary?.summary.distinctProducts ?? 0}</p>
                        <p className="mt-1 text-xs text-slate-500">Descrições únicas encontradas</p>
                      </div>
                      <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/30">
                        <div className="flex items-center justify-between gap-2 text-violet-700 dark:text-violet-300">
                          <span className="text-xs font-semibold uppercase tracking-wide">Notas do mês</span>
                          <FileText className="h-4 w-4" />
                        </div>
                        <p className="mt-2 text-2xl font-bold tabular-nums">{monthlyItemsSummary?.summary.invoiceCount ?? 0}</p>
                        <p className="mt-1 text-xs text-slate-500">Documentos fiscais considerados</p>
                      </div>
                      <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                        <div className="flex items-center justify-between gap-2 text-amber-700 dark:text-amber-300">
                          <span className="text-xs font-semibold uppercase tracking-wide">Valor dos itens</span>
                          <BarChart3 className="h-4 w-4" />
                        </div>
                        <p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{formatCurrency(monthlyItemsSummary?.summary.totalSpent)}</p>
                        <p className="mt-1 text-xs text-slate-500">Subtotal das linhas das notas</p>
                      </div>
                    </div>

                    {(monthlyItemsSummary?.categories.length ?? 0) === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
                        <FileText className="mx-auto h-9 w-9 text-slate-400" />
                        <p className="mt-3 font-semibold">Nenhum item encontrado neste mês</p>
                        <p className="mt-1 text-sm text-slate-500">Envie ou revise as notas fiscais para que os itens apareçam neste resumo.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Itens por categoria</h3>
                            <p className="text-sm text-slate-500">Abra cada grupo para conferir quantidades, valores e notas de origem.</p>
                          </div>
                          <Badge variant="outline" className="w-fit">
                            {monthlyItemsSummary?.summary.categoryCount ?? 0} categorias
                          </Badge>
                        </div>

                        {monthlyItemsSummary?.categories.map((category, index) => {
                          const categoryInfo = CATEGORY_LABELS[category.category] ?? CATEGORY_LABELS.outros;
                          const CategoryIcon = categoryInfo.icon;
                          const isExpanded = expandedPurchaseCategories[category.category] ?? false;
                          return (
                            <div key={category.category} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                              <button
                                type="button"
                                onClick={() => setExpandedPurchaseCategories((current) => ({
                                  ...current,
                                  [category.category]: !isExpanded,
                                }))}
                                aria-expanded={isExpanded}
                                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900 sm:px-5"
                              >
                                <span className={`rounded-lg border p-2 ${categoryInfo.color}`}>
                                  <CategoryIcon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block font-semibold text-slate-900 dark:text-slate-100">{categoryInfo.label}</span>
                                  <span className="block text-xs text-slate-500">
                                    {category.productCount} produtos em {category.invoiceCount} notas
                                  </span>
                                </span>
                                <span className="hidden text-right sm:block">
                                  <span className="block font-semibold tabular-nums">{formatQuantity(category.totalQuantity)} unidades</span>
                                  <span className="block text-xs text-slate-500">{formatCurrency(category.totalSpent)}</span>
                                </span>
                                <ChevronRight className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                              </button>

                              {isExpanded && (
                                <div className="border-t border-slate-200 dark:border-slate-800">
                                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2 text-xs sm:hidden dark:bg-slate-900">
                                    <span className="font-semibold">{formatQuantity(category.totalQuantity)} unidades</span>
                                    <span className="text-slate-500">{formatCurrency(category.totalSpent)}</span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full min-w-[780px] text-sm">
                                      <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70">
                                        <tr>
                                          <th className="px-4 py-3 sm:px-5">Produto</th>
                                          <th className="px-4 py-3 text-right">Quantidade</th>
                                          <th className="px-4 py-3 text-right">Valor</th>
                                          <th className="px-4 py-3 sm:px-5">Notas de origem</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                                        {category.items.map((item) => (
                                          <tr key={`${category.category}-${item.description}-${item.unit}`} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-900/50">
                                            <td className="px-4 py-3 sm:px-5">
                                              <p className="font-medium text-slate-900 dark:text-slate-100">{item.description}</p>
                                              <p className="mt-0.5 text-xs text-slate-500">Unidade: {item.unit} · preço médio {formatCurrency(item.averageUnitPrice)}</p>
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                              {formatQuantity(item.totalQuantity)} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(item.totalSpent)}</td>
                                            <td className="px-4 py-3 sm:px-5">
                                              <div className="space-y-1.5">
                                                {item.sources.map((source) => (
                                                  <div key={source.invoiceId} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-900">
                                                    <span className="min-w-0">
                                                      <span className="font-semibold text-slate-700 dark:text-slate-200">NF {source.invoiceNumber || `#${source.invoiceId}`}</span>
                                                      <span className="ml-1.5 text-slate-500">· {formatInvoiceDate(source.issueDate)}</span>
                                                      <span className="block truncate text-[11px] text-slate-400">{source.supplierName}</span>
                                                    </span>
                                                    <span className="shrink-0 font-medium tabular-nums">{formatQuantity(source.quantity)} {item.unit}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Compras internas e saldo físico</h2>
              <p className="text-sm text-slate-500">Os itens das notas aparecem imediatamente; o saldo só é exibido quando uma entrada foi conferida.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-fuchsia-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Produtos nas Notas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-fuchsia-600">{warehousePurchaseSummary.purchasedProducts}</div>
                  <p className="mt-1 text-xs text-slate-500">Sem caixas de 10 L</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Unidades Compradas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">{formatQuantity(warehousePurchaseSummary.purchasedQuantity)}</div>
                  <p className="mt-1 text-xs text-slate-500">Em {formatMonthLabel(monthlyItemsSummary?.month)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Valor das Compras</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(warehousePurchaseSummary.purchasedValue)}</div>
                  <p className="mt-1 text-xs text-slate-500">Itens de consumo interno</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Saldos Conferidos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{warehousePurchaseSummary.stockConfigured}</div>
                  <p className="mt-1 text-xs text-slate-500">Itens prontos para movimentação</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><AlertTriangle className="w-5 h-5 mr-2 text-yellow-500"/> Itens com Estoque Baixo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="px-4 py-3">Nome</th>
                          <th className="px-4 py-3">Categoria</th>
                          <th className="px-4 py-3 text-right">Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStockItems?.map((item: any) => (
                          <tr key={item.id} className="border-b">
                            <td className="px-4 py-3 font-medium">{item.name}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={CATEGORY_LABELS[item.category]?.color}>
                                {CATEGORY_LABELS[item.category]?.label || item.category}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-red-600 font-bold">{item.currentStock}</span>
                              <span className="text-slate-500 ml-1 text-xs">/ {item.minStock} {item.unit}</span>
                            </td>
                          </tr>
                        ))}
                        {(!lowStockItems || lowStockItems.length === 0) && (
                          <tr><td colSpan={3} className="text-center py-4 text-slate-500">Nenhum item em falta.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><RefreshCw className="w-5 h-5 mr-2 text-blue-500"/> Últimas Movimentações</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {dashboard?.recentMovements?.map((mov: any) => (
                      <div key={mov.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-800">
                            {mov.type === 'in' && <ArrowDown className="w-4 h-4 text-green-500"/>}
                            {mov.type === 'consumption' && <ArrowUp className="w-4 h-4 text-red-500"/>}
                            {mov.type === 'loss' && <AlertTriangle className="w-4 h-4 text-yellow-500"/>}
                            {mov.type === 'adjustment' && <RefreshCw className="w-4 h-4 text-blue-500"/>}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{mov.item?.name || 'Item desconhecido'}</p>
                            <p className="text-xs text-slate-500">{mov.reason || 'Sem motivo'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold text-sm ${mov.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                            {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                          </p>
                          <p className="text-xs text-slate-400">{formatDate(mov.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB: ALMOXARIFADO */}
          <TabsContent value="almoxarifado" className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex w-full sm:w-auto space-x-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                  <Input 
                    placeholder="Buscar itens..." 
                    className="pl-9" 
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                </div>
                <Select value={itemCategory} onValueChange={setItemCategory}>
                  <SelectTrigger className="w-[210px]">
                    <SelectValue placeholder="Grupo de compra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os grupos</SelectItem>
                    {Object.entries(INTERNAL_PURCHASE_GROUPS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-2"/> Novo Item</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo Item Operacional</DialogTitle>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    createItemMutation.mutate({
                      name: formData.get('name') as string,
                      category: formData.get('category') as any,
                      unit: formData.get('unit') as string,
                      minStock: String(formData.get('minStock') || '0'),
                      currentStock: String(formData.get('currentStock') || '0'),
                      referencePrice: String(formData.get('referencePrice') || '0'),
                    });
                  }}>
                    <div className="space-y-2">
                      <Label>Nome do Item</Label>
                      <Input name="name" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Categoria</Label>
                        <Select name="category" defaultValue="limpeza">
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Unidade de Medida</Label>
                        <Select name="unit" defaultValue="un">
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="un">Unidade (un)</SelectItem>
                            <SelectItem value="kg">Quilo (kg)</SelectItem>
                            <SelectItem value="l">Litro (l)</SelectItem>
                            <SelectItem value="cx">Caixa (cx)</SelectItem>
                            <SelectItem value="pct">Pacote (pct)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Estoque Mín.</Label>
                        <Input type="number" step="0.01" name="minStock" required />
                      </div>
                      <div className="space-y-2">
                        <Label>Estoque Atual</Label>
                        <Input type="number" step="0.01" name="currentStock" defaultValue={0} />
                      </div>
                      <div className="space-y-2">
                        <Label>Preço Ref. (R$)</Label>
                        <Input type="number" step="0.01" name="referencePrice" defaultValue={0} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createItemMutation.isPending}>Salvar</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredWarehouseItems.map(item => {
                const currentStock = Number(item.currentStock ?? 0);
                const minStock = Number(item.minStock ?? 0);
                const stockLow = item.stockConfigured && minStock > 0 && currentStock <= minStock;
                return (
                <Card key={item.key} className="overflow-hidden">
                  <div className={`h-1 w-full ${!item.stockConfigured ? 'bg-cyan-500' : stockLow ? 'bg-red-500' : currentStock <= minStock * 2 ? 'bg-yellow-400' : 'bg-green-500'}`} />
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start gap-3">
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant="outline" className={CATEGORY_LABELS[item.category]?.color}>
                          {CATEGORY_LABELS[item.category]?.label || item.category}
                        </Badge>
                        <Badge variant="secondary" className={!item.stockConfigured ? "bg-cyan-50 text-cyan-700" : ""}>
                          {item.stockConfigured ? "Saldo conferido" : "Encontrado nas notas"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                      <div>
                        <p className="mb-1 text-xs text-slate-500">Comprado no período</p>
                        <p className="text-xl font-bold">{formatQuantity(item.purchasedQuantity)} <span className="text-xs font-medium text-slate-500">{item.unit}</span></p>
                        <p className="mt-1 text-xs text-slate-500">{item.invoiceCount} nota(s) · {formatCurrency(item.purchasedValue)}</p>
                      </div>
                      <div className="border-l pl-3">
                        <p className="mb-1 text-xs text-slate-500">Saldo físico atual</p>
                        {item.stockConfigured ? (
                          <>
                            <p className={`text-xl font-bold ${stockLow ? 'text-red-600' : ''}`}>{formatQuantity(currentStock)} <span className="text-xs font-medium text-slate-500">{item.unit}</span></p>
                            <p className="mt-1 text-xs text-slate-500">Mínimo: {formatQuantity(minStock)}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-cyan-700">Aguardando conferência</p>
                            <p className="mt-1 text-xs text-slate-500">Não calculado pelas notas históricas</p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Preço de referência</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(item.referencePrice)}</span>
                    </div>
                    <div className="flex space-x-2">
                      {item.operationalItemId ? <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="flex-1" size="sm" disabled={currentStock <= 0}><Minus className="w-3 h-3 mr-2"/> Registrar baixa</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Registrar Baixa - {item.name}</DialogTitle>
                          </DialogHeader>
                          <form className="space-y-4" onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            registerConsumptionMutation.mutate({
                              itemId: item.operationalItemId!,
                              quantity: Number(formData.get('quantity')),
                              type: formData.get('type') as 'consumption' | 'loss',
                              reason: formData.get('reason') as string,
                            });
                          }}>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Quantidade ({item.unit})</Label>
                                <Input type="number" step="0.01" name="quantity" max={currentStock} required />
                              </div>
                              <div className="space-y-2">
                                <Label>Tipo</Label>
                                <Select name="type" defaultValue="consumption">
                                  <SelectTrigger><SelectValue/></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="consumption">Consumo</SelectItem>
                                    <SelectItem value="loss">Perda/Descarte</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Motivo / Observação</Label>
                              <Input name="reason" placeholder="Ex: Uso diário, Vencido..." />
                            </div>
                            <DialogFooter>
                              <Button type="submit" disabled={registerConsumptionMutation.isPending}>Confirmar Baixa</Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog> : (
                        <Button asChild variant="outline" className="flex-1" size="sm">
                          <a href="/purchases/invoices"><ReceiptText className="mr-2 h-3 w-3"/> Conferir entrada</a>
                        </Button>
                      )}
                      {item.operationalItemId && <Dialog><DialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" title="Ajustar estoque"><Edit className="w-4 h-4"/></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Ajustar Estoque - {item.name}</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const qty = Number(new FormData(e.currentTarget).get("qty")); adjustStockMutation.mutate({ itemId: item.operationalItemId!, quantity: qty, reason: "Contagem física" }); }}><div className="space-y-2"><Label>Quantidade atual em estoque ({item.unit})</Label><Input type="number" step="0.01" name="qty" defaultValue={currentStock} required /><p className="text-xs text-muted-foreground">Informe a quantidade real que você tem hoje.</p></div><DialogFooter><Button type="submit" disabled={adjustStockMutation.isPending}>Salvar</Button></DialogFooter></form></DialogContent></Dialog>}
                    </div>
                  </CardContent>
                </Card>
              )})}
              {filteredWarehouseItems.length === 0 && (
                <Card className="md:col-span-2 xl:col-span-3">
                  <CardContent className="py-12 text-center text-slate-500">Nenhum item encontrado para os filtros selecionados.</CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* TAB: PEDIDOS */}
          <TabsContent value="sorvetes" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><IceCream className="h-5 w-5 text-pink-500" />Sorvetes — Itens da Duo Gelatto</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Itens comprados da Duo Gelatto (apenas visualização — controle pelo INOVE).</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {warehouseItemsSorvetes.length > 0 && (
                      <Select value={sorveteCategoryFilter} onValueChange={setSorveteCategoryFilter}>
                        <SelectTrigger className="w-[180px] h-9">
                          <SelectValue placeholder="Todas categorias" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas categorias</SelectItem>
                          {Array.from(new Set(warehouseItemsSorvetes.map(i => i.category))).sort().map(cat => (
                            <SelectItem key={cat} value={cat}>{SORVETE_CATEGORY_LABELS[cat] ?? cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {warehouseItemsSorvetes.length > 0 && (
                    <Button variant="outline" size="sm" className="h-9" onClick={async () => {
                      const XLSX = await import("xlsx");
                      const itemsToExport = sorveteCategoryFilter === "all" ? warehouseItemsSorvetes : warehouseItemsSorvetes.filter(i => i.category === sorveteCategoryFilter);
                      const data = itemsToExport.map((item) => ({
                        "Produto": item.name,
                        "Categoria": SORVETE_CATEGORY_LABELS[item.category] ?? item.category,
                        "Qtd. Comprada": item.purchasedQuantity,
                        "Unidade": item.unit,
                        "Qtd. Unidades": item.totalUnits,
                        "Valor Total": Number(item.purchasedValue.toFixed(2)),
                        "Preço Médio": Number(item.referencePrice.toFixed(2)),
                      }));
                      const ws = XLSX.utils.json_to_sheet(data);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Sorvetes Duo Gelatto");
                      XLSX.writeFile(wb, `sorvetes_duo_gelatto_${purchaseMonth ?? new Date().toISOString().slice(0, 7)}.xlsx`);
                      toast.success("Excel exportado com sucesso!");
                    }}>
                      <Download className="mr-2 h-4 w-4" />Exportar Excel
                    </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {warehouseItemsSorvetes.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <IceCream className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" />
                    <p className="font-medium">Nenhum item de sorvete encontrado</p>
                    <p className="mt-1 text-sm">Importe notas da Duo Gelatto para ver os itens aqui.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Totalização por categoria */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {Object.entries(
                        warehouseItemsSorvetes.reduce<Record<string, { total: number; count: number }>>((acc, item) => {
                          const cat = SORVETE_CATEGORY_LABELS[item.category] ?? item.category;
                          if (!acc[cat]) acc[cat] = { total: 0, count: 0 };
                          acc[cat].total += item.purchasedValue;
                          acc[cat].count += item.totalUnits;
                          return acc;
                        }, {})
                      ).sort((a, b) => b[1].total - a[1].total).map(([cat, data]) => (
                        <div key={cat} className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs font-medium text-muted-foreground truncate">{cat}</p>
                          <p className="text-sm font-bold">{formatCurrency(data.total)}</p>
                          <p className="text-xs text-muted-foreground">{data.count.toLocaleString("pt-BR")} un</p>
                        </div>
                      ))}
                    </div>
                    {/* Tabela de itens */}
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead><tr className="border-y bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3">Produto</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3 text-right">Qtd. Comprada</th><th className="px-4 py-3 text-right">Qtd. Unidades</th><th className="px-4 py-3 text-right">Valor Total</th><th className="px-5 py-3 text-right">Preço Médio</th></tr></thead>
                      <tbody>
                        {warehouseItemsSorvetes.filter(item => sorveteCategoryFilter === "all" || item.category === sorveteCategoryFilter).map((item) => (
                          <tr key={item.key} className="border-b hover:bg-muted/20">
                            <td className="px-5 py-3 font-medium">{item.name}</td>
                            <td className="px-4 py-3"><Badge variant="outline">{SORVETE_CATEGORY_LABELS[item.category] ?? item.category}</Badge></td>
                            <td className="px-4 py-3 text-right">{item.purchasedQuantity.toLocaleString("pt-BR")} {item.unit}</td>
                            <td className="px-4 py-3 text-right font-medium text-primary">{item.totalUnits.toLocaleString("pt-BR")} un</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.purchasedValue)}</td>
                            <td className="px-5 py-3 text-right">{formatCurrency(item.referencePrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </div>
                )}
             </CardContent>
           </Card>
            {/* Alertas de variação de preço */}
            {(priceVariation?.variations?.length ?? 0) > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-700">
                    <TrendingUp className="h-5 w-5" />
                    Alertas de Variação de Preço
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Itens com variação superior a 10% em relação ao mês anterior ({priceVariation?.previousMonth?.split("-").reverse().join("/")}).
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px] text-sm">
                      <thead>
                        <tr className="border-y bg-amber-100/50 text-left text-xs uppercase tracking-wide text-amber-800">
                          <th className="px-4 py-2">Produto</th>
                          <th className="px-4 py-2 text-right">Preço Anterior</th>
                          <th className="px-4 py-2 text-right">Preço Atual</th>
                          <th className="px-4 py-2 text-right">Variação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceVariation?.variations.map((v) => (
                          <tr key={v.product} className="border-b">
                            <td className="px-4 py-2 font-medium">{v.product}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(v.previousPrice)}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(v.currentPrice)}</td>
                            <td className={`px-4 py-2 text-right font-bold ${v.variation > 0 ? "text-red-600" : "text-green-600"}`}>
                              {v.variation > 0 ? "+" : ""}{v.variation.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Gráfico comparativo mensal */}
            <SorveteCategoryChart />
            {/* Comparativo preço de compra x venda */}
            <PriceComparisonCard month={purchaseMonth} />
          </TabsContent>
          <TabsContent value="pedidos" className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex space-x-2 overflow-x-auto pb-2">
                <Button variant={orderStatusFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setOrderStatusFilter("all")}>Todos</Button>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <Button key={k} variant={orderStatusFilter === k ? "default" : "outline"} size="sm" onClick={() => setOrderStatusFilter(k)}>
                    {v.label}
                  </Button>
                ))}
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-2"/> Novo Pedido</Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Novo Pedido de Compra</DialogTitle>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const supplierId = Number(formData.get('supplierId'));
                    const notes = formData.get('notes') as string || '';
                    if (!supplierId) { toast.error('Selecione um fornecedor'); return; }
                    if (orderItems.length === 0) { toast.error('Adicione pelo menos um item'); return; }
                    createOrderMutation.mutate({
                      supplierId,
                      notes,
                      items: orderItems.map(oi => ({
                        itemId: oi.itemId,
                        quantity: oi.quantity,
                        estimatedUnitPrice: oi.price,
                        unit: oi.unit,
                      })),
                    });
                    setOrderItems([]);
                  }}>
                    <div className="space-y-2">
                      <Label>Fornecedor</Label>
                      <Select name="supplierId">
                        <SelectTrigger><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                        <SelectContent>
                          {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Itens do Pedido</Label>
                      <div className="flex gap-2">
                        <Select value={newOrderItemId} onValueChange={setNewOrderItemId}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione item" /></SelectTrigger>
                          <SelectContent>
                            {items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.unit})</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input type="number" placeholder="Qtd" className="w-20" value={newOrderQty} onChange={(e) => setNewOrderQty(e.target.value)} />
                        <Input type="number" step="0.01" placeholder="Preço" className="w-24" value={newOrderPrice} onChange={(e) => setNewOrderPrice(e.target.value)} />
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          if (!newOrderItemId || !newOrderQty) return;
                          const item = items.find(i => i.id === Number(newOrderItemId));
                          if (!item) return;
                          setOrderItems(prev => [...prev, { itemId: item.id, name: item.name, unit: item.unit, quantity: Number(newOrderQty), price: Number(newOrderPrice) || 0 }]);
                          setNewOrderItemId(''); setNewOrderQty(''); setNewOrderPrice('');
                        }}><Plus className="h-4 w-4" /></Button>
                      </div>
                      {orderItems.length > 0 && (
                        <div className="border rounded-md divide-y text-sm">
                          {orderItems.map((oi, idx) => (
                            <div key={idx} className="flex justify-between items-center px-3 py-2">
                              <span>{oi.name} — {oi.quantity} {oi.unit} × R$ {oi.price.toFixed(2)}</span>
                              <Button type="button" variant="ghost" size="sm" onClick={() => setOrderItems(prev => prev.filter((_, i) => i !== idx))}>✕</Button>
                            </div>
                          ))}
                          <div className="px-3 py-2 font-semibold bg-slate-50 dark:bg-slate-900">
                            Total estimado: R$ {orderItems.reduce((s, oi) => s + oi.quantity * oi.price, 0).toFixed(2)}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Observações</Label>
                      <Input name="notes" placeholder="Observações do pedido (opcional)" />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createOrderMutation.isPending}>
                        {createOrderMutation.isPending ? "Criando..." : "Criar Pedido"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            {lowStockItems.length > 0 && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-4 w-4" /> Sugestão de Pedido — {lowStockItems.length} item(ns) com estoque baixo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-amber-200 dark:divide-amber-800">
                    {lowStockItems.slice(0, 5).map((item: any) => (
                      <div key={item.id} className="flex justify-between items-center py-2 text-sm">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-amber-700 dark:text-amber-400">Estoque: {Number(item.currentStock)} / Mín: {Number(item.minStock)}</span>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="mt-3 border-amber-400 text-amber-700 hover:bg-amber-100" onClick={() => {
                    setOrderItems(lowStockItems.map((item: any) => ({
                      itemId: item.id,
                      name: item.name,
                      unit: item.unit || "un",
                      quantity: Math.max(1, Number(item.minStock) - Number(item.currentStock)),
                      price: Number(item.referencePrice) || 0,
                    })));
                    toast.info("Itens adicionados ao formulário de pedido. Clique em Novo Pedido para finalizar.");
                  }}>Gerar pedido sugerido</Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800 border-b">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Fornecedor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3 text-right">Total Est.</th>
                      <th className="px-4 py-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order: any) => (
                      <tr key={order.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="px-4 py-3 font-medium">{order.code}</td>
                        <td className="px-4 py-3">{order.supplier?.name || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={STATUS_LABELS[order.status]?.color || ''}>
                            {STATUS_LABELS[order.status]?.label || order.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{formatDate(order.createdAt)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(order.totalEstimated)}</td>
                        <td className="px-4 py-3 text-center">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">Ver Detalhes <ChevronRight className="w-4 h-4 ml-1"/></Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle className="flex justify-between items-center pr-6">
                                  <span>Pedido {order.code}</span>
                                  <Badge variant="outline" className={STATUS_LABELS[order.status]?.color || ''}>{STATUS_LABELS[order.status]?.label}</Badge>
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <p className="text-slate-500">Fornecedor</p>
                                    <p className="font-medium">{order.supplier?.name || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500">Data de Criação</p>
                                    <p className="font-medium">{formatDate(order.createdAt)}</p>
                                  </div>
                                </div>
                                <div>
                                  <h4 className="font-medium mb-2 border-b pb-1">Itens do Pedido</h4>
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-slate-500">
                                        <th className="text-left font-normal py-1">Item</th>
                                        <th className="text-right font-normal py-1">Qtd</th>
                                        <th className="text-right font-normal py-1">Preço Est.</th>
                                        <th className="text-right font-normal py-1">Subtotal</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {/* Simplified for demo, assume items are populated */}
                                      <tr><td colSpan={4} className="py-2 text-center text-slate-500 italic">Itens carregados aqui...</td></tr>
                                    </tbody>
                                    <tfoot>
                                      <tr className="font-bold border-t">
                                        <td colSpan={3} className="text-right py-2">Total Estimado:</td>
                                        <td className="text-right py-2">{formatCurrency(order.totalEstimated)}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                              <DialogFooter className="flex space-x-2">
                                {order.status === 'draft' && (
                                  <Button onClick={() => requestOrderMutation.mutate({ id: order.id })}>
                                    Solicitar Aprovação
                                  </Button>
                                )}
                                {order.status === 'requested' && (
                                  <>
                                    <Button variant="destructive" onClick={() => rejectOrderMutation.mutate({ id: order.id, reason: 'Rejeitado pelo gestor' })}>Rejeitar</Button>
                                    <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approveOrderMutation.mutate({ id: order.id })}>Aprovar</Button>
                                  </>
                                )}
                                {order.status === 'approved' && (
                                  <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => markPurchasedMutation.mutate({ id: order.id, items: [] })}>
                                    Marcar como Comprado
                                  </Button>
                                )}
                                {order.status === 'purchased' && (
                                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => deliverOrderMutation.mutate({ id: order.id, items: [] })}>
                                    Confirmar Entrega
                                  </Button>
                                )}
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </td>
                      </tr>
                    ))}
                    {filteredOrders.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-500">Nenhum pedido encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* TAB: BAIXAS */}
          <TabsContent value="baixas" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="border-l-4 border-l-fuchsia-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Produtos de Consumo Interno</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-fuchsia-600">{warehousePurchaseSummary.purchasedProducts}</div>
                  <p className="mt-1 text-xs text-slate-500">Encontrados nas notas de {formatMonthLabel(monthlyItemsSummary?.month)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Unidades Compradas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">{formatQuantity(warehousePurchaseSummary.purchasedQuantity)}</div>
                  <p className="mt-1 text-xs text-slate-500">Compras internas, sem caixas de 10 L</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Disponíveis para Baixa</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{warehousePurchaseSummary.availableForConsumption}</div>
                  <p className="mt-1 text-xs text-slate-500">Itens com saldo físico positivo</p>
                </CardContent>
              </Card>
            </div>

            {warehousePurchaseSummary.purchasedProducts > 0 && warehousePurchaseSummary.availableForConsumption === 0 && (
              <Card className="border-cyan-200 bg-cyan-50/70 dark:border-cyan-900 dark:bg-cyan-950/20">
                <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
                    <div>
                      <p className="font-semibold text-cyan-950 dark:text-cyan-100">As compras foram encontradas, mas o saldo físico ainda não foi conferido</p>
                      <p className="mt-1 text-sm text-cyan-800 dark:text-cyan-300">As notas históricas aparecem no Almoxarifado sem virar estoque automaticamente. Confirme uma entrada antes de registrar consumo ou perda.</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="shrink-0 border-cyan-300 bg-white/80 text-cyan-800 hover:bg-white dark:bg-cyan-950">
                    <a href="/purchases/invoices"><ReceiptText className="mr-2 h-4 w-4" /> Conferir notas</a>
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="bg-slate-50 dark:bg-slate-900 border-dashed">
              <CardContent className="pt-6">
                <form className="flex flex-col md:flex-row gap-4 items-end" onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  registerConsumptionMutation.mutate({
                    itemId: Number(formData.get('itemId')),
                    quantity: Number(formData.get('quantity')),
                    type: formData.get('type') as 'consumption' | 'loss',
                    reason: formData.get('reason') as string,
                  });
                  (e.target as HTMLFormElement).reset();
                }}>
                  <div className="space-y-2 flex-1 w-full">
                    <Label>Item</Label>
                    <Select name="itemId" required disabled={warehousePurchaseSummary.availableForConsumption === 0}>
                      <SelectTrigger><SelectValue placeholder="Selecione um item..."/></SelectTrigger>
                      <SelectContent>
                        {items.filter(i => Number(i.currentStock) > 0).map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name} (Est: {i.currentStock} {i.unit})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 w-full md:w-32">
                    <Label>Quantidade</Label>
                    <Input type="number" step="0.01" name="quantity" required disabled={warehousePurchaseSummary.availableForConsumption === 0} />
                  </div>
                  <div className="space-y-2 w-full md:w-48">
                    <Label>Tipo</Label>
                    <Select name="type" defaultValue="consumption" disabled={warehousePurchaseSummary.availableForConsumption === 0}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consumption">Consumo</SelectItem>
                        <SelectItem value="loss">Perda/Descarte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 flex-1 w-full">
                    <Label>Motivo</Label>
                    <Input name="reason" placeholder="Opcional..." disabled={warehousePurchaseSummary.availableForConsumption === 0} />
                  </div>
                  <Button type="submit" disabled={registerConsumptionMutation.isPending || warehousePurchaseSummary.availableForConsumption === 0} className="w-full md:w-auto"><Minus className="w-4 h-4 mr-2"/> Registrar Baixa</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Histórico de Baixas</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800 border-b">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3 text-right">Qtd</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.filter((m: any) => m.type === 'consumption' || m.type === 'loss').map((m: any) => (
                      <tr key={m.id} className="border-b">
                        <td className="px-4 py-3">{formatDate(m.createdAt)}</td>
                        <td className="px-4 py-3 font-medium">{m.item?.name}</td>
                        <td className="px-4 py-3 text-right text-red-600 font-bold">-{m.quantity}</td>
                        <td className="px-4 py-3">
                          {m.type === 'consumption' ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">Consumo</Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Perda</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{m.reason || '-'}</td>
                      </tr>
                    ))}
                    {movements.filter((m: any) => m.type === 'consumption' || m.type === 'loss').length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-500">Nenhuma baixa registrada.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: FORNECEDORES */}
          <TabsContent value="fornecedores" className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input placeholder="Buscar fornecedor..." className="pl-9" />
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-2"/> Novo Fornecedor</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo Fornecedor</DialogTitle>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    createSupplierMutation.mutate({
                      name: formData.get('name') as string,
                      phone: formData.get('phone') as string,
                      email: formData.get('email') as string,
                      cnpj: formData.get('cnpj') as string,
                      categories: "geral",
                      deliveryDays: Number(formData.get('deliveryDays') || 0) || undefined,
                      paymentTerms: formData.get('paymentTerms') as string,
                    });
                  }}>
                    <div className="space-y-2">
                      <Label>Nome / Razão Social</Label>
                      <Input name="name" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Telefone / WhatsApp</Label>
                        <Input name="phone" />
                      </div>
                      <div className="space-y-2">
                        <Label>CNPJ</Label>
                        <Input name="cnpj" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" name="email" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Dias de Entrega</Label>
                        <Input name="deliveryDays" placeholder="Ex: Terça e Quinta" />
                      </div>
                      <div className="space-y-2">
                        <Label>Condições de Pag.</Label>
                        <Input name="paymentTerms" placeholder="Ex: Boleto 15/30d" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createSupplierMutation.isPending}>Salvar Fornecedor</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map((sup: any) => (
                <Card key={sup.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{sup.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sup.phone && (
                      <div className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                        <Phone className="w-4 h-4 mr-2" /> {sup.phone}
                      </div>
                    )}
                    <div className="text-sm">
                      <span className="text-slate-500">Entrega: </span> {sup.deliveryDays || '-'}
                    </div>
                    <div className="text-sm">
                      <span className="text-slate-500">Pagamento: </span> {sup.paymentTerms || '-'}
                    </div>
                    <div className="flex space-x-2 pt-2 border-t">
                      <Button variant="ghost" size="sm" className="flex-1"><Edit className="w-4 h-4 mr-2"/> Editar</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {suppliers.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500 border rounded-lg bg-slate-50 dark:bg-slate-900">
                  Nenhum fornecedor cadastrado.
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB: TEMPLATES */}
          <TabsContent value="templates" className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Modelos de Pedidos Recorrentes</h3>
              <Button><Plus className="w-4 h-4 mr-2"/> Novo Template</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tpl: any) => (
                <Card key={tpl.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center"><FileText className="w-4 h-4 mr-2 text-blue-500"/> {tpl.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-500 mb-4">{tpl.description}</p>
                    <Button className="w-full" variant="outline"><ShoppingCart className="w-4 h-4 mr-2"/> Gerar Pedido</Button>
                  </CardContent>
                </Card>
              ))}
              {templates.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500 border rounded-lg bg-slate-50 dark:bg-slate-900">
                  Nenhum template cadastrado. Crie um template para agilizar pedidos frequentes.
                </div>
              )}
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </DashboardLayout>
  );
}
