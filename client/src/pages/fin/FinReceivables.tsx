import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FinFilterBar, FinFilters } from "@/components/fin/FinFilterBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Edit2, Plus, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR");

type ReceivableForm = {
  description: string;
  amount: string;
  dueDate: string;
  typeId: string;
  isReceived: boolean;
  receivedDate: string;
  notes: string;
};

export default function FinReceivables() {
  const [filters, setFilters] = useState<FinFilters>({ status: "all" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<{ id: number } & ReceivableForm | null>(null);

  const utils = trpc.useUtils();
  const { data: types = [] } = trpc.fin.receivableTypes.list.useQuery();
  const { data: rawData = [], isLoading } = trpc.fin.receivables.list.useQuery({
    typeId: filters.categoryId ?? undefined,
    isReceived: filters.status === "paid" ? true : filters.status === "pending" ? false : undefined,
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
  });

  const now = new Date();
  const data = rawData.filter(r => {
    if (filters.status === "overdue") return !r.isReceived && new Date(r.dueDate) < now;
    if (filters.search) return r.description.toLowerCase().includes(filters.search.toLowerCase());
    return true;
  });

  const createMut = trpc.fin.receivables.create.useMutation({
    onSuccess: () => { utils.fin.receivables.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Conta a receber criada!"); setModalOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.fin.receivables.update.useMutation({
    onSuccess: () => { utils.fin.receivables.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Atualizado!"); setModalOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.fin.receivables.delete.useMutation({
    onSuccess: () => { utils.fin.receivables.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Excluído!"); },
  });
  const markReceivedMut = trpc.fin.receivables.markReceived.useMutation({
    onSuccess: () => { utils.fin.receivables.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Marcado como recebido!"); },
  });
  const markPendingMut = trpc.fin.receivables.markPending.useMutation({
    onSuccess: () => { utils.fin.receivables.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Marcado como pendente!"); },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<ReceivableForm>({
    defaultValues: { description: "", amount: "", dueDate: "", typeId: "", isReceived: false, receivedDate: "", notes: "" },
  });

  const openCreate = () => { reset(); setEditItem(null); setModalOpen(true); };
  const openEdit = (r: typeof data[0]) => {
    const form = {
      id: r.id,
      description: r.description,
      amount: String(r.amount),
      dueDate: new Date(r.dueDate).toISOString().split("T")[0],
      typeId: r.typeId?.toString() ?? "",
      isReceived: r.isReceived,
      receivedDate: r.receivedDate ? new Date(r.receivedDate).toISOString().split("T")[0] : "",
      notes: r.notes ?? "",
    };
    setEditItem(form);
    reset(form);
    setModalOpen(true);
  };

  const onSubmit = (form: ReceivableForm) => {
    const payload = {
      description: form.description,
      amount: Number(form.amount),
      dueDate: new Date(form.dueDate),
      typeId: form.typeId ? Number(form.typeId) : undefined,
      isReceived: form.isReceived,
      receivedDate: form.receivedDate ? new Date(form.receivedDate) : undefined,
      notes: form.notes || undefined,
    };
    if (editItem) updateMut.mutate({ id: editItem.id, ...payload });
    else createMut.mutate(payload);
  };

  const totalPending = data.filter(r => !r.isReceived).reduce((s, r) => s + Number(r.amount), 0);
  const totalReceived = data.filter(r => r.isReceived).reduce((s, r) => s + Number(r.amount), 0);
  const totalOverdue = data.filter(r => !r.isReceived && new Date(r.dueDate) < now).reduce((s, r) => s + Number(r.amount), 0);
  const typeMap = new Map(types.map(t => [t.id, t.description]));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contas a Receber</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus recebimentos e cobranças</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Recebimento
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "A Receber", value: totalPending, color: "text-blue-500" },
          { label: "Recebido", value: totalReceived, color: "text-emerald-500" },
          { label: "Vencido", value: totalOverdue, color: "text-destructive" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn("text-xl font-bold", s.color)}>{fmtBRL(s.value)}</p>
          </div>
        ))}
      </div>

      <FinFilterBar
        filters={filters}
        onChange={setFilters}
        categories={types.map(t => ({ id: t.id, name: t.description }))}
        showBank={false}
        showStatus
      />

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Vencimento</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Recebimento</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td></tr>
              ))
            ) : data.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Nenhum recebimento encontrado</td></tr>
            ) : data.map(r => {
              const isOverdue = !r.isReceived && new Date(r.dueDate) < now;
              return (
                <tr key={r.id} className={cn("hover:bg-muted/20 transition-colors", isOverdue && "bg-destructive/5")}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.description}</div>
                    {r.notes && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {r.typeId ? typeMap.get(r.typeId) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-600">{fmtBRL(Number(r.amount))}</td>
                  <td className="px-4 py-3 text-center text-xs">
                    <span className={cn(isOverdue && "text-destructive font-medium")}>{fmtDate(r.dueDate)}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                    {r.receivedDate ? fmtDate(r.receivedDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.isReceived ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">Recebido</Badge>
                    ) : isOverdue ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">Vencido</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-xs">Pendente</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {r.isReceived ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markPendingMut.mutate({ id: r.id })} title="Marcar como pendente">
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markReceivedMut.mutate({ id: r.id })} title="Marcar como recebido">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate({ id: r.id })}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={modalOpen} onOpenChange={v => { setModalOpen(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Editar Recebimento" : "Novo Recebimento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input {...register("description", { required: true })} placeholder="Ex: Venda de sorvetes" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <Input {...register("amount", { required: true })} type="number" step="0.01" placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label>Vencimento *</Label>
                <Input {...register("dueDate", { required: true })} type="date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={watch("typeId")} onValueChange={v => setValue("typeId", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem tipo</SelectItem>
                  {types.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.description}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="isReceived" {...register("isReceived")} className="rounded" />
              <Label htmlFor="isReceived">Já foi recebido?</Label>
              {watch("isReceived") && (
                <div className="flex-1">
                  <Input {...register("receivedDate")} type="date" className="h-8 text-xs" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea {...register("notes")} placeholder="Notas adicionais..." rows={2} />
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
