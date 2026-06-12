import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Bell,
  Database,
  Edit,
  FileText,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Pencil,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type ProductForm = {
  name: string;
  description: string;
  categoryId: string;
  sku: string;
  barcode: string;
  costPrice: string;
  salePrice: string;
  currentStock: string;
  minStock: string;
  unit: string;
};

type StockForm = {
  type: "in" | "out" | "adjustment";
  quantity: string;
  reason: string;
  purchaseDate: string;
  supplier: string;
  unitCost: string;
};

type QuickStockForm = {
  newStock: string;
  reason: string;
};

const emptyForm: ProductForm = {
  name: "", description: "", categoryId: "", sku: "", barcode: "",
  costPrice: "0", salePrice: "0", currentStock: "0", minStock: "5", unit: "un",
};

const emptyStockForm: StockForm = {
  type: "in",
  quantity: "",
  reason: "",
  purchaseDate: new Date().toISOString().split("T")[0],
  supplier: "",
  unitCost: "",
};

// ─── Componente de relatório expandível por produto ───────────────────────────
function PurchaseDetail({ purchases }: {
  purchases: { date: Date | null; quantity: number; unitCost: number | null; supplier: string | null; reason: string | null }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div>
      <button
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Ver detalhes das compras
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 border rounded-lg p-2 bg-muted/20">
          {purchases.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {p.date ? new Date(p.date).toLocaleDateString("pt-BR") : "—"}
                {p.supplier ? ` · ${p.supplier}` : ""}
              </span>
              <span className="font-medium">
                {p.quantity} un
                {p.unitCost ? ` · ${fmt(p.unitCost * p.quantity)}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Aba Estoque INOVE ─────────────────────────────────────────────────────
function AlertButton() {
  const alertMut = trpc.inove.checkLowStockAlert.useMutation({
    onSuccess: (r) => {
      if (r.sent) toast.success(`Alerta enviado! ${r.count} produto(s) com estoque baixo.`);
      else toast.info(r.reason ?? "Nenhum produto com estoque baixo.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 shrink-0 border-amber-500/50 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
      onClick={() => alertMut.mutate({ threshold: 0 })}
      disabled={alertMut.isPending}
    >
      {alertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
      Alertar Estoque Baixo
    </Button>
  );
}

function InoveStockTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [grupo, setGrupo] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const pageSize = 50;

  const utils = trpc.useUtils();

  const { data, isLoading, isFetching } = trpc.inove.getStock.useQuery({
    page,
    pageSize,
    search: search || undefined,
    grupo: grupo || undefined,
    lowStock: lowStock || undefined,
  });

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  const stockColor = (s: number) =>
    s <= 0 ? "text-red-600 bg-red-50" :
    s <= 5 ? "text-amber-600 bg-amber-50" :
    "text-emerald-600 bg-emerald-50";

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto no INOVE..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">Buscar</Button>
        </form>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => utils.inove.getStock.invalidate()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
        <Select value={grupo} onValueChange={(v) => { setGrupo(v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos os grupos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os grupos</SelectItem>
            {(data?.grupos ?? []).map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={lowStock ? "default" : "outline"}
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => { setLowStock(!lowStock); setPage(1); }}
        >
          <AlertTriangle className="h-4 w-4" />
          Estoque baixo
        </Button>
        <AlertButton />
      </div>

      {/* Resumo */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{total.toLocaleString("pt-BR")} produto(s) encontrado(s)</span>
        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs">
          <Database className="h-3 w-3 mr-1" />
          PDV INOVE
        </Badge>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-4 h-24 bg-muted/30" /></Card>
          ))}
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Database className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum produto encontrado no estoque do INOVE.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data!.items.map((p) => (
              <Card key={p.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{p.grupo}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${stockColor(p.saldo_atual)}`}>
                      {p.saldo_atual % 1 === 0 ? p.saldo_atual.toFixed(0) : p.saldo_atual.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Venda</p>
                      <p className="font-medium">{fmt(p.preco_venda)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Custo</p>
                      <p className="font-medium">{fmt(p.preco_custo)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Página {page} de {totalPages || 1}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
function Products() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockProductId, setStockProductId] = useState<number | null>(null);
  const [stockForm, setStockForm] = useState<StockForm>(emptyStockForm);

  // Modal de ajuste rápido de estoque
  const [quickStockOpen, setQuickStockOpen] = useState(false);
  const [quickStockProductId, setQuickStockProductId] = useState<number | null>(null);
  const [quickStockForm, setQuickStockForm] = useState<QuickStockForm>({ newStock: "", reason: "" });

  // Filtro do relatório mensal
  const now = new Date();
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);

  const utils = trpc.useUtils();
  const { data: products, isLoading } = trpc.products.list.useQuery({ search: search || undefined });
  const { data: categories } = trpc.products.categories.useQuery();
  const { data: lowStock } = trpc.products.lowStock.useQuery();
  const { data: purchaseReport, isLoading: reportLoading } = trpc.products.purchaseReport.useQuery(
    { year: reportYear, month: reportMonth }
  );

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); utils.products.lowStock.invalidate(); toast.success("Produto cadastrado!"); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Produto atualizado!"); setOpen(false); setEditId(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Produto removido."); },
    onError: (e) => toast.error(e.message),
  });

  const stockMutation = trpc.products.addStockMovement.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.products.lowStock.invalidate();
      utils.products.purchaseReport.invalidate();
      toast.success("Movimentação registrada!");
      setStockOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() { setEditId(null); setForm(emptyForm); setOpen(true); }

  function openEdit(p: NonNullable<typeof products>[0]) {
    setEditId(p.id);
    setForm({
      name: p.name, description: p.description ?? "", categoryId: p.categoryId ? String(p.categoryId) : "",
      sku: p.sku ?? "", barcode: p.barcode ?? "", costPrice: String(p.costPrice),
      salePrice: String(p.salePrice), currentStock: String(p.currentStock),
      minStock: String(p.minStock), unit: p.unit,
    });
    setOpen(true);
  }

  function openStock(productId: number, type: "in" | "out" = "in") {
    setStockProductId(productId);
    setStockForm({ ...emptyStockForm, type, purchaseDate: new Date().toISOString().split("T")[0] });
    setStockOpen(true);
  }

  function openQuickStock(productId: number) {
    const product = products?.find((p) => p.id === productId);
    setQuickStockProductId(productId);
    setQuickStockForm({ newStock: String(product?.currentStock ?? 0), reason: "Ajuste manual" });
    setQuickStockOpen(true);
  }

  function handleQuickStockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quickStockProductId) return;
    const product = products?.find((p) => p.id === quickStockProductId);
    if (!product) return;
    const newStock = parseInt(quickStockForm.newStock);
    if (isNaN(newStock)) return;
    const diff = newStock - product.currentStock;
    if (diff === 0) { setQuickStockOpen(false); return; }
    stockMutation.mutate(
      {
        productId: quickStockProductId,
        type: "adjustment",
        quantity: Math.abs(diff),
        previousStock: product.currentStock,
        newStock,
        reason: quickStockForm.reason || "Ajuste manual",
      },
      {
        onSuccess: () => {
          setQuickStockOpen(false);
          toast.success(`Estoque atualizado para ${newStock} unidades!`);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name, description: form.description || undefined,
      categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
      sku: form.sku || undefined, barcode: form.barcode || undefined,
      costPrice: parseFloat(form.costPrice), salePrice: parseFloat(form.salePrice),
      currentStock: parseInt(form.currentStock), minStock: parseInt(form.minStock), unit: form.unit,
    };
    if (editId) updateMutation.mutate({ id: editId, ...data });
    else createMutation.mutate(data);
  }

  function handleStockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stockProductId) return;
    const product = products?.find((p) => p.id === stockProductId);
    if (!product) return;
    const qty = parseInt(stockForm.quantity);
    const newStock = stockForm.type === "in" ? product.currentStock + qty : product.currentStock - qty;
    stockMutation.mutate({
      productId: stockProductId,
      type: stockForm.type,
      quantity: qty,
      previousStock: product.currentStock,
      newStock,
      reason: stockForm.reason || undefined,
      purchaseDate: stockForm.purchaseDate || undefined,
      supplier: stockForm.supplier || undefined,
      unitCost: stockForm.unitCost ? parseFloat(stockForm.unitCost) : undefined,
    });
  }

  const formatCurrency = (v: string | number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(String(v)));

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/dashboard" />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              Estoque de Produtos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {products?.length ?? 0} produto(s) cadastrado(s)
              {(lowStock?.length ?? 0) > 0 && (
                <span className="ml-2 text-amber-600 font-medium">
                  · {lowStock!.length} com estoque baixo
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/nfe-import")} className="gap-2">
              <FileText className="h-4 w-4" />
              Importar NF-e
            </Button>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Produto
            </Button>
          </div>
        </div>

        {(lowStock?.length ?? 0) > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="font-semibold text-amber-700 text-sm">Produtos com Estoque Baixo</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStock!.map((p) => (
                <Badge key={p.id} variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                  {p.name}: {p.currentStock}/{p.minStock} {p.unit}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="inove" className="gap-2">
              <Database className="h-4 w-4" />
              Estoque PDV INOVE
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2">
              <Package className="h-4 w-4" />
              Produtos Cadastrados
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Relatório de Compras
            </TabsTrigger>
          </TabsList>

          {/* ── Aba: Estoque INOVE ── */}
          <TabsContent value="inove" className="mt-4">
            <InoveStockTab />
          </TabsContent>

          {/* ── Aba: Produtos ── */}
          <TabsContent value="products" className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse"><CardContent className="p-4 h-32 bg-muted/30 rounded-lg" /></Card>
                ))}
              </div>
            ) : products?.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-16 text-center">
                  <Package className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">Nenhum produto encontrado.</p>
                  <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
                    <Plus className="h-4 w-4" />
                    Cadastrar primeiro produto
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products!.map((p) => {
                  const isLow = p.currentStock <= p.minStock;
                  return (
                    <Card key={p.id} className={`hover:shadow-md transition-shadow ${isLow ? "border-amber-300" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{p.name}</p>
                            {p.sku && <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0 ml-2">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Registrar entrada" onClick={() => openStock(p.id, "in")}>
                              <ArrowUp className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Registrar saída" onClick={() => openStock(p.id, "out")}>
                              <ArrowDown className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Ajustar estoque" onClick={() => openQuickStock(p.id)}>
                              <Pencil className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => { if (confirm("Remover produto?")) deleteMutation.mutate({ id: p.id }); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={isLow ? "destructive" : "secondary"} className="text-xs">
                            Estoque: {p.currentStock} {p.unit}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Custo: {formatCurrency(p.costPrice)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Venda: {formatCurrency(p.salePrice)}
                          </Badge>
                        </div>
                        {isLow && (
                          <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Mínimo: {p.minStock} {p.unit}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Aba: Relatório de Compras ── */}
          <TabsContent value="report" className="space-y-4 mt-4">
            {/* Filtro mês/ano */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Período:</span>
                  <Select value={String(reportMonth)} onValueChange={(v) => setReportMonth(parseInt(v))}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthNames.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(reportYear)} onValueChange={(v) => setReportYear(parseInt(v))}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground ml-auto">
                    {purchaseReport?.length ?? 0} produto(s) comprado(s) no período
                  </span>
                </div>
              </CardContent>
            </Card>

            {reportLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="animate-pulse"><CardContent className="p-4 h-16 bg-muted/30" /></Card>
                ))}
              </div>
            ) : !purchaseReport || purchaseReport.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-16 text-center">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">Nenhuma compra registrada em {monthNames[reportMonth - 1]}/{reportYear}.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Registre entradas de estoque com data de compra para visualizar aqui.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* KPIs do mês */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <ShoppingCart className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Total de Compras</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {purchaseReport.reduce((s, r) => s + r.purchaseCount, 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">pedidos no mês</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Package className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Itens Diferentes</span>
                      </div>
                      <p className="text-2xl font-bold">{purchaseReport.length}</p>
                      <p className="text-xs text-muted-foreground">produtos comprados</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Custo Total</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                          purchaseReport.reduce((s, r) => s + r.totalCost, 0)
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">em compras no mês</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabela de produtos */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Frequência de Compra por Produto</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left p-3 font-medium">Produto</th>
                            <th className="text-center p-3 font-medium">Compras no Mês</th>
                            <th className="text-center p-3 font-medium">Qtd. Total</th>
                            <th className="text-right p-3 font-medium">Custo Total</th>
                            <th className="text-right p-3 font-medium">Última Compra</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchaseReport.map((r) => (
                            <tr key={r.productId} className="border-b hover:bg-muted/20 transition-colors">
                              <td className="p-3">
                                <p className="font-medium">{r.productName}</p>
                                <PurchaseDetail purchases={r.purchases} />
                              </td>
                              <td className="p-3 text-center">
                                <Badge
                                  variant={r.purchaseCount >= 3 ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {r.purchaseCount}x
                                </Badge>
                              </td>
                              <td className="p-3 text-center text-muted-foreground">
                                {r.totalQuantity} un
                              </td>
                              <td className="p-3 text-right font-medium">
                                {r.totalCost > 0
                                  ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.totalCost)
                                  : "—"}
                              </td>
                              <td className="p-3 text-right text-muted-foreground text-xs">
                                {r.lastPurchaseDate
                                  ? new Date(r.lastPurchaseDate).toLocaleDateString("pt-BR")
                                  : "—"}
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
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Modal: Cadastro/Edição de Produto ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 mt-2">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="un">un</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="cx">cx</SelectItem>
                    <SelectItem value="pct">pct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Preço de Custo</Label>
                <Input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} />
              </div>
              <div>
                <Label>Preço de Venda</Label>
                <Input type="number" step="0.01" value={form.salePrice} onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Estoque Atual</Label>
                <Input type="number" value={form.currentStock} onChange={(e) => setForm((f) => ({ ...f, currentStock: e.target.value }))} />
              </div>
              <div>
                <Label>Estoque Mínimo</Label>
                <Input type="number" value={form.minStock} onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SKU / Código</Label>
                <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="Opcional" />
              </div>
              <div>
                <Label>Código de Barras</Label>
                <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editId ? "Salvar" : "Cadastrar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Ajuste Rápido de Estoque ── */}
      <Dialog open={quickStockOpen} onOpenChange={setQuickStockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-blue-500" />
              Ajustar Estoque
            </DialogTitle>
          </DialogHeader>
          {quickStockProductId && (() => {
            const product = products?.find((p) => p.id === quickStockProductId);
            return (
              <form onSubmit={handleQuickStockSubmit} className="space-y-4 mt-2">
                {product && (
                  <div className="bg-muted/30 rounded-lg p-3 text-sm">
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-muted-foreground mt-0.5">
                      Estoque atual: <strong className={product.currentStock <= product.minStock ? "text-amber-600" : "text-emerald-600"}>{product.currentStock} {product.unit}</strong>
                      {product.currentStock <= product.minStock && (
                        <span className="ml-2 text-amber-600 text-xs">(abaixo do mínimo: {product.minStock})</span>
                      )}
                    </p>
                  </div>
                )}
                <div>
                  <Label>Novo valor de estoque *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={quickStockForm.newStock}
                    onChange={(e) => setQuickStockForm((f) => ({ ...f, newStock: e.target.value }))}
                    required
                    autoFocus
                    className="text-lg font-bold mt-1"
                  />
                  {quickStockForm.newStock !== "" && product && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {parseInt(quickStockForm.newStock) > product.currentStock
                        ? <span className="text-green-600">+{parseInt(quickStockForm.newStock) - product.currentStock} unidades</span>
                        : parseInt(quickStockForm.newStock) < product.currentStock
                        ? <span className="text-red-500">-{product.currentStock - parseInt(quickStockForm.newStock)} unidades</span>
                        : <span className="text-muted-foreground">Sem alteração</span>
                      }
                    </p>
                  )}
                </div>
                <div>
                  <Label>Motivo</Label>
                  <Input
                    value={quickStockForm.reason}
                    onChange={(e) => setQuickStockForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="Ex: Contagem física, Ajuste de inventário..."
                  />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button type="button" variant="outline" onClick={() => setQuickStockOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={stockMutation.isPending} className="gap-2">
                    {stockMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                    Salvar Estoque
                  </Button>
                </div>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Movimentação de Estoque ── */}
      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Movimentação de Estoque</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleStockSubmit} className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={stockForm.type} onValueChange={(v: "in" | "out" | "adjustment") => setStockForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Entrada (Compra)</SelectItem>
                    <SelectItem value="out">Saída</SelectItem>
                    <SelectItem value="adjustment">Ajuste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantidade *</Label>
                <Input
                  type="number"
                  value={stockForm.quantity}
                  onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))}
                  required
                  min={1}
                />
              </div>
            </div>

            {/* Campos específicos de entrada de compra */}
            {stockForm.type === "in" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Data da Compra
                    </Label>
                    <Input
                      type="date"
                      value={stockForm.purchaseDate}
                      onChange={(e) => setStockForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Custo Unitário (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={stockForm.unitCost}
                      onChange={(e) => setStockForm((f) => ({ ...f, unitCost: e.target.value }))}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div>
                  <Label>Fornecedor</Label>
                  <Input
                    value={stockForm.supplier}
                    onChange={(e) => setStockForm((f) => ({ ...f, supplier: e.target.value }))}
                    placeholder="Nome do fornecedor"
                  />
                </div>
              </>
            )}

            <div>
              <Label>Motivo / Observação</Label>
              <Input
                value={stockForm.reason}
                onChange={(e) => setStockForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder={stockForm.type === "in" ? "Ex: Compra mensal" : "Ex: Produto vencido"}
              />
            </div>

            {/* Resumo do custo total */}
            {stockForm.type === "in" && stockForm.unitCost && stockForm.quantity && (
              <div className="bg-muted/30 rounded-lg p-3 text-sm">
                <span className="text-muted-foreground">Custo total desta entrada: </span>
                <strong>
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                    parseFloat(stockForm.unitCost) * parseInt(stockForm.quantity || "0")
                  )}
                </strong>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setStockOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={stockMutation.isPending}>Registrar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

export default Products;
