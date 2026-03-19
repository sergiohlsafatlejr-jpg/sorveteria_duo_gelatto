import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag, TrendingUp, TrendingDown } from "lucide-react";
import { useForm } from "react-hook-form";

type CatForm = { name: string; type: "income" | "expense"; color: string };

const COLORS = [
  { label: "Verde", value: "#22c55e" },
  { label: "Azul", value: "#3b82f6" },
  { label: "Roxo", value: "#a855f7" },
  { label: "Rosa", value: "#ec4899" },
  { label: "Laranja", value: "#f97316" },
  { label: "Vermelho", value: "#ef4444" },
  { label: "Amarelo", value: "#eab308" },
  { label: "Ciano", value: "#06b6d4" },
  { label: "Cinza", value: "#6b7280" },
];

export default function FinCategories() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: categories = [], refetch } = trpc.fin.categories.list.useQuery();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CatForm>({
    defaultValues: { name: "", type: "expense", color: "#6b7280" }
  });

  const createMut = trpc.fin.categories.create.useMutation({
    onSuccess: () => { toast.success("Categoria criada!"); refetch(); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.fin.categories.update.useMutation({
    onSuccess: () => { toast.success("Categoria atualizada!"); refetch(); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.fin.categories.delete.useMutation({
    onSuccess: () => { toast.success("Categoria removida!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditId(null);
    reset({ name: "", type: "expense", color: "#6b7280" });
    setModalOpen(true);
  }

  function openEdit(c: typeof categories[0]) {
    setEditId(c.id);
    reset({ name: c.name, type: c.type as "income" | "expense", color: c.color ?? "#6b7280" });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditId(null); }

  function onSubmit(data: CatForm) {
    if (editId) {
      updateMut.mutate({ id: editId, ...data });
    } else {
      createMut.mutate(data);
    }
  }

  const income = categories.filter(c => c.type === "income");
  const expense = categories.filter(c => c.type === "expense");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="w-6 h-6 text-primary" /> Categorias Financeiras</h1>
            <p className="text-muted-foreground text-sm mt-1">Organize receitas e despesas por categoria</p>
          </div>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Nova Categoria</Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total de Categorias</p>
              <p className="text-2xl font-bold">{categories.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Receitas</p>
                <p className="text-2xl font-bold text-green-600">{income.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Despesas</p>
                <p className="text-2xl font-bold text-red-600">{expense.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tables side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Receitas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-600">
                <TrendingUp className="w-4 h-4" /> Categorias de Receita ({income.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cor</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {income.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhuma categoria de receita</TableCell></TableRow>
                  )}
                  {income.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: c.color ?? "#6b7280" }} />
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => { if (confirm("Remover esta categoria?")) deleteMut.mutate({ id: c.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Despesas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-red-600">
                <TrendingDown className="w-4 h-4" /> Categorias de Despesa ({expense.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cor</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expense.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhuma categoria de despesa</TableCell></TableRow>
                  )}
                  {expense.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: c.color ?? "#6b7280" }} />
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => { if (confirm("Remover esta categoria?")) deleteMut.mutate({ id: c.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>Nome da Categoria *</Label>
                <Input {...register("name", { required: "Nome obrigatório" })} placeholder="Ex: Vendas de Sorvete" />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Tipo *</Label>
                <Select value={watch("type")} onValueChange={v => setValue("type", v as "income" | "expense")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Receita (entrada)</SelectItem>
                    <SelectItem value="expense">Despesa (saída)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cor de Identificação</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {COLORS.map(col => (
                    <button
                      key={col.value}
                      type="button"
                      title={col.label}
                      onClick={() => setValue("color", col.value)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${watch("color") === col.value ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: col.value }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: watch("color") }} />
                  <Input type="color" {...register("color")} className="w-16 h-8 p-0.5 cursor-pointer" />
                  <span className="text-xs text-muted-foreground">Ou escolha uma cor personalizada</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1">Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={createMut.isPending || updateMut.isPending}>
                  {editId ? "Salvar" : "Criar Categoria"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
