import { useState, useRef } from "react";
import BackButton from "@/components/BackButton";
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
import { CheckCircle2, Edit2, Plus, Trash2, XCircle, FileSpreadsheet, Upload, CopyPlus, Square, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: Date | string) => {
  const dt = typeof d === "string" ? new Date(d + (d.length === 10 ? "T12:00:00" : "")) : d;
  return dt.toLocaleDateString("pt-BR");
};

type TransactionForm = {
  description: string;
  amount: string;
  dueDate: string;
  categoryId: string;
  bankId: string;
  costId: string;
  isPaid: boolean;
  paymentDate: string;
  notes: string;
};

export default function FinPayables() {
  const [filters, setFilters] = useState<FinFilters>({ status: "all" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<{ id: number } & TransactionForm | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importCategoryId, setImportCategoryId] = useState("none");
  const [importBankId, setImportBankId] = useState("none");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();
  const { data: banks = [] } = trpc.fin.banks.list.useQuery();
  const { data: costs = [] } = trpc.fin.costs.list.useQuery();
  const { data: rawData = [], isLoading } = trpc.fin.transactions.list.useQuery({
    categoryId: filters.categoryId ?? undefined,
    bankId: filters.bankId ?? undefined,
    isPaid: filters.status === "paid" ? true : filters.status === "pending" || filters.status === "overdue" ? false : undefined,
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
  });

  const now = new Date();
  const data = rawData.filter(t => {
    if (filters.status === "overdue") return !t.isPaid && new Date(t.dueDate) < now;
    if (filters.search) return t.description.toLowerCase().includes(filters.search.toLowerCase());
    return true;
  });

  const createMut = trpc.fin.transactions.create.useMutation({
    onSuccess: () => { utils.fin.transactions.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Lançamento criado!"); setModalOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.fin.transactions.update.useMutation({
    onSuccess: () => { utils.fin.transactions.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Lançamento atualizado!"); setModalOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.fin.transactions.delete.useMutation({
    onSuccess: () => { utils.fin.transactions.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Lançamento excluído!"); },
    onError: (e) => toast.error(e.message),
  });
  const markPaidMut = trpc.fin.transactions.markPaid.useMutation({
    onSuccess: () => { utils.fin.transactions.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Marcado como pago!"); },
  });
  const markUnpaidMut = trpc.fin.transactions.markUnpaid.useMutation({
    onSuccess: () => { utils.fin.transactions.list.invalidate(); utils.fin.dashboard.invalidate(); toast.success("Marcado como pendente!"); },
  });
  const duplicateMut = trpc.fin.transactions.duplicateToNextMonth.useMutation({
    onSuccess: (r) => {
      utils.fin.transactions.list.invalidate();
      toast.success(`${r.created} lançamento(s) duplicado(s) para o próximo mês!`);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === data.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(data.map(t => t.id)));
  };

  const importMut = trpc.fin.transactions.importExcel.useMutation({
    onSuccess: (r) => { utils.fin.transactions.list.invalidate(); toast.success(`Importados: ${r.imported} registros (${r.skipped} ignorados)`); setShowImport(false); },
    onError: (e) => toast.error(e.message),
  });

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      if (!base64) { toast.error("Erro ao ler arquivo"); return; }
      importMut.mutate({
        fileBase64: base64,
        categoryId: importCategoryId !== "none" ? parseInt(importCategoryId) : undefined,
        bankId: importBankId !== "none" ? parseInt(importBankId) : undefined,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<TransactionForm>({
    defaultValues: { description: "", amount: "", dueDate: "", categoryId: "", bankId: "", costId: "", isPaid: false, paymentDate: "", notes: "" },
  });

  const todayDateStr = new Date().toISOString().split("T")[0];
  const openCreate = () => {
    reset({ description: "", amount: "", dueDate: todayDateStr, categoryId: "", bankId: "", costId: "", isPaid: false, paymentDate: "", notes: "" });
    setEditItem(null);
    setModalOpen(true);
  };
  const openEdit = (t: typeof data[0]) => {
    const form = {
      id: t.id,
      description: t.description,
      amount: String(t.amount),
      dueDate: (() => { const dt = new Date(t.dueDate); return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000).toISOString().split("T")[0]; })(),
      categoryId: t.categoryId?.toString() ?? "",
      bankId: t.bankId?.toString() ?? "",
      costId: (t as any).costId?.toString() ?? "",
      isPaid: t.isPaid,
      paymentDate: t.paymentDate ? (() => { const dt = new Date(t.paymentDate!); return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000).toISOString().split("T")[0]; })() : "",
      notes: t.notes ?? "",
    };
    setEditItem(form);
    reset(form);
    setModalOpen(true);
  };

  const onSubmit = (form: TransactionForm) => {
    if (!form.description?.trim()) { toast.error("Informe a descrição"); return; }
    if (!form.amount || isNaN(Number(form.amount))) { toast.error("Informe o valor"); return; }
    if (!form.dueDate) { toast.error("Informe a data de vencimento"); return; }
    const dueDateObj = new Date(form.dueDate + "T12:00:00");
    if (isNaN(dueDateObj.getTime())) { toast.error("Data de vencimento inválida"); return; }
    const payload = {
      description: form.description.trim(),
      amount: Number(form.amount),
      dueDate: dueDateObj,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      bankId: form.bankId ? Number(form.bankId) : undefined,
      costId: form.costId ? Number(form.costId) : undefined,
      isPaid: form.isPaid,
      paymentDate: form.paymentDate ? new Date(form.paymentDate + "T12:00:00") : undefined,
      notes: form.notes || undefined,
    };
    if (editItem) updateMut.mutate({ id: editItem.id, ...payload });
    else createMut.mutate(payload);
  };

  const totalPending = data.filter(t => !t.isPaid).reduce((s, t) => s + Number(t.amount), 0);
  const totalPaid = data.filter(t => t.isPaid).reduce((s, t) => s + Number(t.amount), 0);
  const totalOverdue = data.filter(t => !t.isPaid && new Date(t.dueDate) < now).reduce((s, t) => s + Number(t.amount), 0);

  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  const bankMap = new Map(banks.map(b => [b.id, b.name]));
  const costMap = new Map(costs.map(c => [c.id, c.name]));

  return (
    <div className="p-6 space-y-5">
        <BackButton to="/fin/dashboard" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contas a Pagar</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus lançamentos de despesas</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="outline"
              onClick={() => duplicateMut.mutate({ ids: Array.from(selectedIds) })}
              disabled={duplicateMut.isPending}
              className="gap-2 border-blue-500/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
            >
              <CopyPlus className="h-4 w-4" />
              Duplicar {selectedIds.size} para próximo mês
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Importar Excel
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pendente", value: totalPending, color: "text-amber-500" },
          { label: "Pago", value: totalPaid, color: "text-emerald-500" },
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
        categories={categories}
        banks={banks}
      />

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              <th className="px-4 py-3 w-10">
                <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground transition-colors">
                  {selectedIds.size === data.length && data.length > 0
                    ? <CheckSquare className="h-4 w-4 text-primary" />
                    : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Banco</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Custo</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Vencimento</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-24">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td></tr>
              ))
            ) : data.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Nenhum lançamento encontrado</td></tr>
            ) : data.map(t => {
              const isOverdue = !t.isPaid && new Date(t.dueDate) < now;
              const isSelected = selectedIds.has(t.id);
              return (
                <tr key={t.id} className={cn("hover:bg-muted/20 transition-colors", isOverdue && "bg-destructive/5", isSelected && "bg-blue-50/50 dark:bg-blue-950/20")}>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleSelect(t.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {isSelected
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.description}</div>
                    {t.notes && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{t.notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {t.categoryId ? categoryMap.get(t.categoryId) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {t.bankId ? bankMap.get(t.bankId) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {(t as any).costId
                      ? <Badge variant="outline" className="text-xs">{costMap.get((t as any).costId) ?? "—"}</Badge>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtBRL(Number(t.amount))}</td>
                  <td className="px-4 py-3 text-center text-xs">
                    <span className={cn(isOverdue && "text-destructive font-medium")}>
                      {fmtDate(t.dueDate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {t.isPaid ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">Pago</Badge>
                    ) : isOverdue ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">Vencido</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs">Pendente</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {t.isPaid ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markUnpaidMut.mutate({ id: t.id })} title="Marcar como pendente">
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markPaidMut.mutate({ id: t.id })} title="Marcar como pago">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate({ id: t.id })}>
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

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={v => { setModalOpen(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit, () => toast.error("Preencha todos os campos obrigatórios"))} className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input {...register("description", { required: "Descrição obrigatória" })} placeholder="Ex: Fornecedor de sorvetes" className={errors.description ? "border-destructive" : ""} />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <Input {...register("amount", { required: "Valor obrigatório", min: { value: 0.01, message: "Valor deve ser maior que zero" } })} type="number" step="0.01" placeholder="0,00" className={errors.amount ? "border-destructive" : ""} />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Vencimento *</Label>
                <Input {...register("dueDate", { required: "Data obrigatória" })} type="date" className={errors.dueDate ? "border-destructive" : ""} />
                {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-2">
                <Label>Banco</Label>
                <Select value={watch("bankId") || "none"} onValueChange={v => setValue("bankId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem banco</SelectItem>
                    {banks.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Vincular ao Custo</Label>
              <Select value={watch("costId") || "none"} onValueChange={v => setValue("costId", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o custo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem custo vinculado</SelectItem>
                  {costs.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="isPaid" {...register("isPaid")} className="rounded" />
              <Label htmlFor="isPaid">Já foi pago?</Label>
              {watch("isPaid") && (
                <div className="flex-1">
                  <Input {...register("paymentDate")} type="date" placeholder="Data do pagamento" className="h-8 text-xs" />
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

      {/* Modal Importar Excel */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar Contas via Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium">Colunas reconhecidas na planilha:</p>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside text-xs">
                <li><strong>Descricao / Description / Nome</strong> — obrigatório</li>
                <li><strong>Valor / Amount / Vlr</strong> — valor numérico</li>
                <li><strong>Vencimento / DueDate / Data</strong> — data de vencimento</li>
                <li><strong>Pago / Paid / Status</strong> — "sim"/"não" (opcional)</li>
                <li><strong>Custo / CostId</strong> — ID do custo para vincular (opcional)</li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria padrão</Label>
                <Select value={importCategoryId} onValueChange={setImportCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Banco padrão</Label>
                <Select value={importBankId} onValueChange={setImportBankId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem banco</SelectItem>
                    {banks.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Clique para selecionar o arquivo</p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileImport} />
            </div>
            {importMut.isPending && <p className="text-center text-sm text-muted-foreground animate-pulse">Importando...</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
