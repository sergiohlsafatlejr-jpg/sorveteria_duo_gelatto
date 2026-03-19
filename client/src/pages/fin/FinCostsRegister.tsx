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
import { Plus, Pencil, Trash2, Receipt, RefreshCw, Zap } from "lucide-react";
import { useForm } from "react-hook-form";

type CostForm = {
  name: string;
  type: "fixed" | "variable";
  amount: string;
  categoryId: string;
  recurrence: "monthly" | "weekly" | "yearly" | "once";
  dueDay: string;
};

const RECURRENCE_LABELS: Record<string, string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  yearly: "Anual",
  once: "Único",
};

export default function FinCostsRegister() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<"all" | "fixed" | "variable">("all");

  const { data: costs = [], refetch } = trpc.fin.costs.list.useQuery();
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();
  const expenseCategories = categories.filter(c => c.type === "expense");

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CostForm>({
    defaultValues: { name: "", type: "fixed", amount: "0", categoryId: "none", recurrence: "monthly", dueDay: "1" }
  });

  const createMut = trpc.fin.costs.create.useMutation({
    onSuccess: () => { toast.success("Custo cadastrado!"); refetch(); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.fin.costs.update.useMutation({
    onSuccess: () => { toast.success("Custo atualizado!"); refetch(); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.fin.costs.delete.useMutation({
    onSuccess: () => { toast.success("Custo removido!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditId(null);
    reset({ name: "", type: "fixed", amount: "0", categoryId: "none", recurrence: "monthly", dueDay: "1" });
    setModalOpen(true);
  }

  function openEdit(c: typeof costs[0]) {
    setEditId(c.id);
    reset({
      name: c.name,
      type: c.type as "fixed" | "variable",
      amount: String(c.amount),
      categoryId: c.categoryId ? String(c.categoryId) : "none",
      recurrence: (c.recurrence ?? "monthly") as "monthly" | "weekly" | "yearly" | "once",
      dueDay: String(c.dueDay ?? 1),
    });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditId(null); }

  function onSubmit(data: CostForm) {
    const payload = {
      name: data.name,
      type: data.type,
      amount: parseFloat(data.amount) || 0,
      categoryId: data.categoryId !== "none" ? Number(data.categoryId) : undefined,
      recurrence: data.recurrence,
      dueDay: parseInt(data.dueDay) || 1,
    };
    if (editId) {
      updateMut.mutate({ id: editId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const filtered = costs.filter(c => filterType === "all" || c.type === filterType);
  const totalFixed = costs.filter(c => c.type === "fixed").reduce((s, c) => s + Number(c.amount), 0);
  const totalVariable = costs.filter(c => c.type === "variable").reduce((s, c) => s + Number(c.amount), 0);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6 text-primary" /> Cadastro de Custos</h1>
            <p className="text-muted-foreground text-sm mt-1">Registre custos fixos e variáveis da sorveteria</p>
          </div>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Novo Custo</Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total de Custos</p>
              <p className="text-2xl font-bold">{costs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <RefreshCw className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Custos Fixos / mês</p>
                <p className="text-xl font-bold text-blue-600">{fmt(totalFixed)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <Zap className="w-8 h-8 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">Custos Variáveis / mês</p>
                <p className="text-xl font-bold text-orange-600">{fmt(totalVariable)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {(["all", "fixed", "variable"] as const).map(t => (
            <Button key={t} variant={filterType === t ? "default" : "outline"} size="sm" onClick={() => setFilterType(t)}>
              {t === "all" ? "Todos" : t === "fixed" ? "Fixos" : "Variáveis"}
            </Button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custos Cadastrados ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Recorrência</TableHead>
                    <TableHead className="text-center">Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        Nenhum custo cadastrado
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map(c => {
                    const cat = categories.find(cat => cat.id === c.categoryId);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant={c.type === "fixed" ? "default" : "secondary"}>
                            {c.type === "fixed" ? "Fixo" : "Variável"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cat ? (
                            <span className="flex items-center gap-1.5 text-sm">
                              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: cat.color ?? "#6b7280" }} />
                              {cat.name}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">{RECURRENCE_LABELS[c.recurrence ?? "monthly"] ?? "—"}</TableCell>
                        <TableCell className="text-center text-sm">
                          {c.dueDay ? `Dia ${c.dueDay}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(Number(c.amount))}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => { if (confirm("Remover este custo?")) deleteMut.mutate({ id: c.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Custo" : "Novo Custo"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>Nome do Custo *</Label>
                <Input {...register("name", { required: "Nome obrigatório" })} placeholder="Ex: Aluguel do Ponto" />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tipo *</Label>
                  <Select value={watch("type")} onValueChange={v => setValue("type", v as "fixed" | "variable")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixo</SelectItem>
                      <SelectItem value="variable">Variável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Recorrência</Label>
                  <Select value={watch("recurrence")} onValueChange={v => setValue("recurrence", v as "monthly" | "weekly" | "yearly" | "once")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                      <SelectItem value="once">Único</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={watch("categoryId")} onValueChange={v => setValue("categoryId", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {expenseCategories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" min="0" {...register("amount", { required: true })} />
                </div>
                <div className="space-y-1">
                  <Label>Dia de Vencimento</Label>
                  <Input type="number" min="1" max="31" {...register("dueDay")} placeholder="Ex: 5" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1">Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={createMut.isPending || updateMut.isPending}>
                  {editId ? "Salvar" : "Cadastrar Custo"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
