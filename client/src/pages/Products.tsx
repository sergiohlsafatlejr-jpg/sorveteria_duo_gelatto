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
  ChevronUp,
  Edit,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
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

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Products() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockProductId, setStockProductId] = useState<number | null>(null);
  const [stockForm, setStockForm] = useState<StockForm>(emptyStockForm);

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

  function openStock(productId: number) {
    setStockProductId(productId);
    setStockForm({ ...emptyStockForm, purchaseDate: new Date().toISOString().split("T")[0] });
    setStockOpen(true);
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
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Produto
          </Button>
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
            <TabsTrigger value="products" className="gap-2">
              <Package className="h-4 w-4" />
              Produtos Cadastrados
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Relatório de Compras
            </TabsTrigger>
          </TabsList>

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
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Registrar entrada" onClick={() => openStock(p.id)}>
                              <ArrowUp className="h-3.5 w-3.5 text-green-600" />
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
