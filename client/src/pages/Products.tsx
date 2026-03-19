import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { AlertTriangle, ArrowDown, ArrowUp, Edit, Package, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

const emptyForm: ProductForm = {
  name: "", description: "", categoryId: "", sku: "", barcode: "",
  costPrice: "0", salePrice: "0", currentStock: "0", minStock: "5", unit: "un",
};

export default function Products() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockProductId, setStockProductId] = useState<number | null>(null);
  const [stockForm, setStockForm] = useState({ type: "in" as "in" | "out" | "adjustment", quantity: "", reason: "" });

  const utils = trpc.useUtils();
  const { data: products, isLoading } = trpc.products.list.useQuery({ search: search || undefined });
  const { data: categories } = trpc.products.categories.useQuery();
  const { data: lowStock } = trpc.products.lowStock.useQuery();

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
    setStockForm({ type: "in", quantity: "", reason: "" });
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
    });
  }

  const formatCurrency = (v: string | number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(String(v)));

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
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openStock(p.id)}>
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
      </div>

      {/* Produto Dialog */}
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
                    <SelectItem value="un">Unidade</SelectItem>
                    <SelectItem value="kg">Kg</SelectItem>
                    <SelectItem value="l">Litro</SelectItem>
                    <SelectItem value="cx">Caixa</SelectItem>
                    <SelectItem value="pct">Pacote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Preço de Custo (R$)</Label>
                <Input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} />
              </div>
              <div>
                <Label>Preço de Venda (R$)</Label>
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
                <Label>SKU</Label>
                <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
              </div>
              <div>
                <Label>Código de Barras</Label>
                <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} />
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

      {/* Movimentação de Estoque Dialog */}
      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Movimentação de Estoque</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleStockSubmit} className="space-y-3 mt-2">
            <div>
              <Label>Tipo *</Label>
              <Select value={stockForm.type} onValueChange={(v: any) => setStockForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Entrada</SelectItem>
                  <SelectItem value="out">Saída</SelectItem>
                  <SelectItem value="adjustment">Ajuste</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade *</Label>
              <Input type="number" value={stockForm.quantity} onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))} required min={1} />
            </div>
            <div>
              <Label>Motivo</Label>
              <Input value={stockForm.reason} onChange={(e) => setStockForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Ex: Compra do fornecedor" />
            </div>
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
