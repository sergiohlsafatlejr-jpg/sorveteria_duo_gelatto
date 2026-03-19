import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Package, AlertTriangle, Tag } from "lucide-react";
import { useForm } from "react-hook-form";

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

const UNITS = ["un", "kg", "g", "L", "ml", "cx", "pct", "par", "m", "cm"];

export default function ProductsRegister() {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");

  const { data: products = [], refetch } = trpc.products.list.useQuery(
    { search: search || undefined, categoryId: filterCategory !== "all" ? Number(filterCategory) : undefined },
    { refetchOnWindowFocus: false }
  );
  const { data: categories = [] } = trpc.products.categories.useQuery();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProductForm>({
    defaultValues: { name: "", description: "", categoryId: "none", sku: "", barcode: "", costPrice: "0", salePrice: "0", currentStock: "0", minStock: "5", unit: "un" }
  });

  const createMut = trpc.products.create.useMutation({
    onSuccess: () => { toast.success("Produto criado com sucesso!"); refetch(); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.products.update.useMutation({
    onSuccess: () => { toast.success("Produto atualizado!"); refetch(); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.products.delete.useMutation({
    onSuccess: () => { toast.success("Produto removido!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditId(null);
    reset({ name: "", description: "", categoryId: "none", sku: "", barcode: "", costPrice: "0", salePrice: "0", currentStock: "0", minStock: "5", unit: "un" });
    setModalOpen(true);
  }

  function openEdit(p: typeof products[0]) {
    setEditId(p.id);
    reset({
      name: p.name,
      description: p.description ?? "",
      categoryId: p.categoryId ? String(p.categoryId) : "none",
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      costPrice: String(p.costPrice),
      salePrice: String(p.salePrice),
      currentStock: String(p.currentStock),
      minStock: String(p.minStock),
      unit: p.unit,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
  }

  function onSubmit(data: ProductForm) {
    const payload = {
      name: data.name,
      description: data.description || undefined,
      categoryId: data.categoryId !== "none" ? Number(data.categoryId) : undefined,
      sku: data.sku || undefined,
      barcode: data.barcode || undefined,
      costPrice: parseFloat(data.costPrice) || 0,
      salePrice: parseFloat(data.salePrice) || 0,
      currentStock: parseInt(data.currentStock) || 0,
      minStock: parseInt(data.minStock) || 5,
      unit: data.unit,
    };
    if (editId) {
      updateMut.mutate({ id: editId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const fmt = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6 text-primary" /> Cadastro de Produtos</h1>
            <p className="text-muted-foreground text-sm mt-1">Gerencie o catálogo de produtos da sorveteria</p>
          </div>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Novo Produto</Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total de Produtos</p>
              <p className="text-2xl font-bold">{products.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Ativos</p>
              <p className="text-2xl font-bold text-green-600">{products.filter(p => p.active).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Estoque Baixo</p>
              <p className="text-2xl font-bold text-red-600">{products.filter(p => p.currentStock <= p.minStock).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Categorias</p>
              <p className="text-2xl font-bold">{categories.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produtos Cadastrados ({products.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>SKU / Código</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Venda</TableHead>
                    <TableHead className="text-center">Estoque</TableHead>
                    <TableHead className="text-center">Mínimo</TableHead>
                    <TableHead className="text-center">Unid.</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                        <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        Nenhum produto cadastrado
                      </TableCell>
                    </TableRow>
                  )}
                  {products.map(p => {
                    const lowStock = p.currentStock <= p.minStock;
                    const cat = categories.find(c => c.id === p.categoryId);
                    return (
                      <TableRow key={p.id} className={lowStock ? "bg-red-50 dark:bg-red-950/10" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {lowStock && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                            <span className="font-medium">{p.name}</span>
                          </div>
                          {p.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description}</p>}
                        </TableCell>
                        <TableCell>
                          {cat ? <Badge variant="outline" className="text-xs">{cat.name}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.sku && <div>SKU: {p.sku}</div>}
                          {p.barcode && <div>Cód: {p.barcode}</div>}
                          {!p.sku && !p.barcode && "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(p.costPrice)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{fmt(p.salePrice)}</TableCell>
                        <TableCell className={`text-center font-bold ${lowStock ? "text-red-600" : "text-green-600"}`}>{p.currentStock}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{p.minStock}</TableCell>
                        <TableCell className="text-center text-xs">{p.unit}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => { if (confirm("Remover este produto?")) deleteMut.mutate({ id: p.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <Label>Nome do Produto *</Label>
                  <Input {...register("name", { required: "Nome obrigatório" })} placeholder="Ex: Sorvete de Morango 500ml" />
                  {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label>Descrição</Label>
                  <Textarea {...register("description")} placeholder="Descrição opcional do produto" rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <Select value={watch("categoryId")} onValueChange={v => setValue("categoryId", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Unidade de Medida</Label>
                  <Select value={watch("unit")} onValueChange={v => setValue("unit", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>SKU (código interno)</Label>
                  <Input {...register("sku")} placeholder="Ex: SOR-MOR-500" />
                </div>
                <div className="space-y-1">
                  <Label>Código de Barras</Label>
                  <Input {...register("barcode")} placeholder="Ex: 7891234567890" />
                </div>
                <div className="space-y-1">
                  <Label>Preço de Custo (R$) *</Label>
                  <Input type="number" step="0.01" min="0" {...register("costPrice", { required: true })} />
                </div>
                <div className="space-y-1">
                  <Label>Preço de Venda (R$) *</Label>
                  <Input type="number" step="0.01" min="0" {...register("salePrice", { required: true })} />
                </div>
                <div className="space-y-1">
                  <Label>Estoque Atual</Label>
                  <Input type="number" min="0" {...register("currentStock")} />
                </div>
                <div className="space-y-1">
                  <Label>Estoque Mínimo (alerta)</Label>
                  <Input type="number" min="0" {...register("minStock")} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1">Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={createMut.isPending || updateMut.isPending}>
                  {editId ? "Salvar Alterações" : "Cadastrar Produto"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
