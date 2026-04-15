import { useState } from "react";
import BackButton from "@/components/BackButton";
import { trpc } from "@/lib/trpc";
import { FinFilterBar, FinFilters } from "@/components/fin/FinFilterBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Edit2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: Date | string) => {
  const dt = typeof d === "string" ? new Date(d + (d.length === 10 ? "T12:00:00" : "")) : d;
  return dt.toLocaleDateString("pt-BR");
};

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão" },
  { value: "ted", label: "TED" },
  { value: "doc", label: "DOC" },
  { value: "boleto", label: "Boleto" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
  { value: "outros", label: "Outros" },
] as const;

type StatementForm = {
  bankId: string;
  categoryId: string;
  date: string;
  description: string;
  amount: string;
  type: "credit" | "debit";
  reconciled: boolean;
  paymentMethod: string;
};

const emptyForm = (): StatementForm => ({
  bankId: "", categoryId: "", date: new Date().toISOString().split("T")[0],
  description: "", amount: "", type: "debit", reconciled: false, paymentMethod: "",
});

export default function FinBankStatements() {
  const [filters, setFilters] = useState<FinFilters>({ status: "all" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<{ id: number } | null>(null);
  const [form, setForm] = useState<StatementForm>(emptyForm());
  const setField = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const utils = trpc.useUtils();
  const { data: banks = [] } = trpc.fin.banks.list.useQuery();
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();
  const { data: rawData = [], isLoading } = trpc.fin.bankStatements.list.useQuery({
    bankId: filters.bankId ?? undefined,
    categoryId: filters.categoryId ?? undefined,
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom + "T00:00:00") : undefined,
    dateTo: filters.dateTo ? new Date(filters.dateTo + "T23:59:59") : undefined,
  });

  const data = rawData.filter(s => {
    if (filters.search) return s.description.toLowerCase().includes(filters.search.toLowerCase());
    return true;
  });

  const createMut = trpc.fin.bankStatements.create.useMutation({
    onSuccess: () => { utils.fin.bankStatements.list.invalidate(); toast.success("Lançamento criado!"); setModalOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.fin.bankStatements.update.useMutation({
    onSuccess: () => { utils.fin.bankStatements.list.invalidate(); toast.success("Atualizado!"); setModalOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.fin.bankStatements.delete.useMutation({
    onSuccess: () => { utils.fin.bankStatements.list.invalidate(); toast.success("Excluído!"); },
  });

  const openCreate = () => { setForm(emptyForm()); setEditItem(null); setModalOpen(true); };
  const openEdit = (s: typeof data[0]) => {
    setForm({
      bankId: s.bankId?.toString() ?? "",
      categoryId: s.categoryId?.toString() ?? "",
      date: (() => { const dt = new Date(s.date); return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000).toISOString().split("T")[0]; })(),
      description: s.description,
      amount: String(Math.abs(Number(s.amount))),
      type: s.type as "credit" | "debit",
      reconciled: s.reconciled,
      paymentMethod: s.paymentMethod ?? "",
    });
    setEditItem({ id: s.id });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.description?.trim()) { toast.error("Informe a descrição"); return; }
    if (!form.amount || isNaN(Number(form.amount))) { toast.error("Informe o valor"); return; }
    if (!form.date) { toast.error("Informe a data"); return; }
    const payload = {
      bankId: form.bankId ? Number(form.bankId) : undefined,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      date: new Date(form.date + "T12:00:00"),
      description: form.description.trim(),
      amount: Number(form.amount),
      type: form.type,
      reconciled: form.reconciled,
      paymentMethod: form.paymentMethod as typeof PAYMENT_METHODS[number]["value"] | undefined || undefined,
    };
    if (editItem) updateMut.mutate({ id: editItem.id, ...payload });
    else createMut.mutate(payload);
  };

  const totalCredits = data.filter(s => s.type === "credit").reduce((sum, s) => sum + Number(s.amount), 0);
  const totalDebits = data.filter(s => s.type === "debit").reduce((sum, s) => sum + Number(s.amount), 0);
  const balance = totalCredits - totalDebits;

  const bankMap = new Map(banks.map(b => [b.id, b]));
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  return (
    <div className="p-6 space-y-5">
        <BackButton to="/fin/dashboard" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Extratos Bancários</h1>
          <p className="text-sm text-muted-foreground">Controle de movimentações bancárias</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Lançamento
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Entradas", value: totalCredits, color: "text-emerald-500" },
          { label: "Saídas", value: totalDebits, color: "text-destructive" },
          { label: "Saldo", value: balance, color: balance >= 0 ? "text-blue-500" : "text-destructive" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn("text-xl font-bold", s.color)}>{fmtBRL(s.value)}</p>
          </div>
        ))}
      </div>

      {/* Bank balances */}
      {banks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {banks.map(b => (
            <div
              key={b.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card/50"
              style={{ borderLeftColor: b.color ?? "#6366f1", borderLeftWidth: 3 }}
            >
              <span className="text-sm font-medium">{b.name}</span>
              <span className="text-xs text-muted-foreground">{fmtBRL(Number(b.initialBalance ?? 0))}</span>
            </div>
          ))}
        </div>
      )}

      <FinFilterBar
        filters={filters}
        onChange={setFilters}
        categories={categories}
        banks={banks}
        showStatus={false}
      />

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Banco</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Forma</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Tipo</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td></tr>
              ))
            ) : data.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Nenhum lançamento encontrado</td></tr>
            ) : data.map(s => {
              const bank = s.bankId ? bankMap.get(s.bankId) : null;
              return (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(s.date)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.description}</div>
                    {s.reconciled && <span className="text-xs text-emerald-500">✓ Conciliado</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {bank ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: bank.color ?? "#6366f1" }} />
                        {bank.name}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {s.categoryId ? categoryMap.get(s.categoryId) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground uppercase">
                    {s.paymentMethod ?? "—"}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-semibold", s.type === "credit" ? "text-emerald-500" : "text-destructive")}>
                    {s.type === "credit" ? "+" : "-"}{fmtBRL(Math.abs(Number(s.amount)))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.type === "credit" ? (
                      <span className="flex items-center justify-center gap-1 text-emerald-500 text-xs">
                        <ArrowDownCircle className="h-3.5 w-3.5" /> Entrada
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1 text-destructive text-xs">
                        <ArrowUpCircle className="h-3.5 w-3.5" /> Saída
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate({ id: s.id })}>
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
            <DialogTitle>{editItem ? "Editar Lançamento" : "Novo Lançamento Bancário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data *</Label>
                <Input value={form.date} onChange={e => setField("date", e.target.value)} type="date" />
              </div>
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => setField("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Entrada (Crédito)</SelectItem>
                    <SelectItem value="debit">Saída (Débito)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input value={form.description} onChange={e => setField("description", e.target.value)} placeholder="Ex: Pagamento fornecedor" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <Input value={form.amount} onChange={e => setField("amount", e.target.value)} type="number" step="0.01" placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select value={form.paymentMethod || "none"} onValueChange={v => setField("paymentMethod", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Banco</Label>
                <Select value={form.bankId || "none"} onValueChange={v => setField("bankId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem banco</SelectItem>
                    {banks.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.categoryId || "none"} onValueChange={v => setField("categoryId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="reconciled" checked={form.reconciled} onChange={e => setField("reconciled", e.target.checked)} className="rounded" />
              <Label htmlFor="reconciled">Conciliado</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="flex-1">Cancelar</Button>
              <Button type="button" onClick={handleSave} className="flex-1" disabled={createMut.isPending || updateMut.isPending}>
                {editItem ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
