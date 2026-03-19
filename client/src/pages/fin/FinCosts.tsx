import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type CostForm = {
  description: string;
  value: string;
  type: "fixed" | "variable";
  categoryId: string;
};

export default function FinCosts() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<{ id: number } & CostForm | null>(null);

  const utils = trpc.useUtils();
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();
  const { data: costs = [], isLoading } = trpc.fin.costs.list.useQuery();

  const createMut = trpc.fin.costs.create.useMutation({
    onSuccess: () => { utils.fin.costs.list.invalidate(); toast.success("Custo criado!"); setModalOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.fin.costs.update.useMutation({
    onSuccess: () => { utils.fin.costs.list.invalidate(); toast.success("Custo atualizado!"); setModalOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.fin.costs.delete.useMutation({
    onSuccess: () => { utils.fin.costs.list.invalidate(); toast.success("Custo excluído!"); },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<CostForm>({
    defaultValues: { description: "", value: "", type: "fixed", categoryId: "" },
  });

  const openCreate = () => { reset(); setEditItem(null); setModalOpen(true); };
  const openEdit = (c: typeof costs[0]) => {
    const form = {
      id: c.id,
      description: c.description,
      value: String(c.value),
      type: c.type as "fixed" | "variable",
      categoryId: c.categoryId?.toString() ?? "",
    };
    setEditItem(form);
    reset(form);
    setModalOpen(true);
  };

  const onSubmit = (form: CostForm) => {
    const payload = {
      description: form.description,
      value: Number(form.value),
      type: form.type,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
    };
    if (editItem) updateMut.mutate({ id: editItem.id, ...payload });
    else createMut.mutate(payload);
  };

  const totalFixed = costs.filter(c => c.type === "fixed").reduce((s, c) => s + Number(c.value), 0);
  const totalVariable = costs.filter(c => c.type === "variable").reduce((s, c) => s + Number(c.value), 0);
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Custos</h1>
          <p className="text-sm text-muted-foreground">Cadastro e controle de custos fixos e variáveis</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Custo
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Custos Fixos", value: totalFixed, color: "text-blue-500", count: costs.filter(c => c.type === "fixed").length },
          { label: "Custos Variáveis", value: totalVariable, color: "text-amber-500", count: costs.filter(c => c.type === "variable").length },
          { label: "Total de Custos", value: totalFixed + totalVariable, color: "text-primary", count: costs.length },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn("text-xl font-bold", s.color)}>{fmtBRL(s.value)}</p>
            <p className="text-xs text-muted-foreground">{s.count} item{s.count !== 1 ? "s" : ""}</p>
          </div>
        ))}
      </div>

      {/* Fixed Costs */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          Custos Fixos
        </h2>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                <tr><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td></tr>
              ) : costs.filter(c => c.type === "fixed").length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">Nenhum custo fixo cadastrado</td></tr>
              ) : costs.filter(c => c.type === "fixed").map(c => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.description}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.categoryId ? categoryMap.get(c.categoryId) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-500">{fmtBRL(Number(c.value))}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate({ id: c.id })}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Variable Costs */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          Custos Variáveis
        </h2>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                <tr><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td></tr>
              ) : costs.filter(c => c.type === "variable").length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">Nenhum custo variável cadastrado</td></tr>
              ) : costs.filter(c => c.type === "variable").map(c => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.description}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.categoryId ? categoryMap.get(c.categoryId) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-500">{fmtBRL(Number(c.value))}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate({ id: c.id })}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={v => { setModalOpen(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? "Editar Custo" : "Novo Custo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input {...register("description", { required: true })} placeholder="Ex: Aluguel, Energia elétrica..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <Input {...register("value", { required: true })} type="number" step="0.01" placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={watch("type")} onValueChange={v => setValue("type", v as "fixed" | "variable")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixo</SelectItem>
                    <SelectItem value="variable">Variável</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={watch("categoryId") || "none"} onValueChange={v => setValue("categoryId", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="flex-1">Cancelar</Button>
              <Button type="submit" className="flex-1" disabled={createMut.isPending || updateMut.isPending}>
                {editItem ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
