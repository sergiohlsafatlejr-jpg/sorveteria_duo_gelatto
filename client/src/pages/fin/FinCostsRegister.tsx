import { useState } from "react";
import BackButton from "@/components/BackButton";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Receipt, RefreshCw, Zap,
  ChevronDown, ChevronRight, Link2, Unlink, DollarSign
} from "lucide-react";
import { useForm } from "react-hook-form";

type CostForm = {
  name: string;
  type: "fixed" | "variable";
  costCategory: "administrative" | "operational" | "commercial" | "financial" | "other";
  amount: string;
  categoryId: string;
  recurrence: "monthly" | "weekly" | "yearly" | "once";
  dueDay: string;
  description: string;
};

const RECURRENCE_LABELS: Record<string, string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  yearly: "Anual",
  once: "Único",
};

const COST_CATEGORY_LABELS: Record<string, string> = {
  administrative: "Administrativo",
  operational: "Operacional",
  commercial: "Comercial",
  financial: "Financeiro",
  other: "Outro",
};

const COST_CATEGORY_COLORS: Record<string, string> = {
  administrative: "bg-blue-100 text-blue-700 border-blue-200",
  operational: "bg-green-100 text-green-700 border-green-200",
  commercial: "bg-purple-100 text-purple-700 border-purple-200",
  financial: "bg-orange-100 text-orange-700 border-orange-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function FinCostsRegister() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<"all" | "fixed" | "variable">("all");
  const [filterCostCategory, setFilterCostCategory] = useState<string>("all");
  // Painel de despesas vinculadas
  const [expandedCostId, setExpandedCostId] = useState<number | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkingCostId, setLinkingCostId] = useState<number | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>("none");

  const utils = trpc.useUtils();
  const { data: costs = [], refetch } = trpc.fin.costs.list.useQuery();
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();
  const expenseCategories = categories.filter(c => c.type === "expense");

  // Despesas vinculadas ao custo expandido
  const { data: linkedTransactions = [], refetch: refetchLinked } = trpc.fin.costs.getLinkedTransactions.useQuery(
    { costId: expandedCostId! },
    { enabled: expandedCostId !== null }
  );
  // Despesas disponíveis para vincular (sem custo vinculado)
  const { data: unlinkedTransactions = [] } = trpc.fin.costs.getUnlinkedTransactions.useQuery(
    undefined,
    { enabled: linkModalOpen }
  );

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CostForm>({
    defaultValues: {
      name: "", type: "fixed", costCategory: "operational", amount: "0",
      categoryId: "none", recurrence: "monthly", dueDay: "1", description: ""
    }
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
  const linkMut = trpc.fin.costs.linkTransaction.useMutation({
    onSuccess: () => {
      toast.success("Despesa vinculada!");
      refetchLinked();
      utils.fin.costs.getUnlinkedTransactions.invalidate();
      setLinkModalOpen(false);
      setSelectedTransactionId("none");
    },
    onError: (e) => toast.error(e.message),
  });
  const unlinkMut = trpc.fin.costs.unlinkTransaction.useMutation({
    onSuccess: () => {
      toast.success("Vínculo removido!");
      refetchLinked();
      utils.fin.costs.getUnlinkedTransactions.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditId(null);
    reset({ name: "", type: "fixed", costCategory: "operational", amount: "0", categoryId: "none", recurrence: "monthly", dueDay: "1", description: "" });
    setModalOpen(true);
  }

  function openEdit(c: typeof costs[0]) {
    setEditId(c.id);
    reset({
      name: c.name,
      type: c.type as "fixed" | "variable",
      costCategory: ((c as any).costCategory ?? "operational") as CostForm["costCategory"],
      amount: String(c.amount),
      categoryId: c.categoryId ? String(c.categoryId) : "none",
      recurrence: (c.recurrence ?? "monthly") as CostForm["recurrence"],
      dueDay: String(c.dueDay ?? 1),
      description: (c as any).description ?? "",
    });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditId(null); }

  function onSubmit(data: CostForm) {
    const payload = {
      name: data.name,
      type: data.type,
      costCategory: data.costCategory,
      amount: parseFloat(data.amount) || 0,
      categoryId: data.categoryId !== "none" ? Number(data.categoryId) : undefined,
      recurrence: data.recurrence,
      dueDay: parseInt(data.dueDay) || 1,
      description: data.description || undefined,
    };
    if (editId) {
      updateMut.mutate({ id: editId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  function toggleExpand(costId: number) {
    setExpandedCostId(prev => prev === costId ? null : costId);
  }

  function openLinkModal(costId: number) {
    setLinkingCostId(costId);
    setSelectedTransactionId("none");
    setLinkModalOpen(true);
  }

  function handleLink() {
    if (!linkingCostId || selectedTransactionId === "none") { toast.error("Selecione uma despesa"); return; }
    linkMut.mutate({ transactionId: parseInt(selectedTransactionId), costId: linkingCostId });
  }

  const filtered = costs.filter(c => {
    const matchType = filterType === "all" || c.type === filterType;
    const matchCat = filterCostCategory === "all" || (c as any).costCategory === filterCostCategory;
    return matchType && matchCat;
  });

  const totalFixed = costs.filter(c => c.type === "fixed").reduce((s, c) => s + Number(c.amount), 0);
  const totalVariable = costs.filter(c => c.type === "variable").reduce((s, c) => s + Number(c.amount), 0);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/fin/costs" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="w-6 h-6 text-primary" /> Cadastro de Custos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Registre e gerencie custos fixos e variáveis da sorveteria
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Custo
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total de Custos</p>
              <p className="text-2xl font-bold">{costs.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{costs.filter(c => c.type === "fixed").length} fixos · {costs.filter(c => c.type === "variable").length} variáveis</p>
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

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            {(["all", "fixed", "variable"] as const).map(t => (
              <Button key={t} variant={filterType === t ? "default" : "outline"} size="sm" onClick={() => setFilterType(t)}>
                {t === "all" ? "Todos" : t === "fixed" ? "Fixos" : "Variáveis"}
              </Button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            {(["all", "administrative", "operational", "commercial", "financial", "other"] as const).map(cat => (
              <Button key={cat} variant={filterCostCategory === cat ? "secondary" : "ghost"} size="sm" onClick={() => setFilterCostCategory(cat)}>
                {cat === "all" ? "Todas categorias" : COST_CATEGORY_LABELS[cat]}
              </Button>
            ))}
          </div>
        </div>

        {/* Tabela com expansão */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custos Cadastrados ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Classificação</TableHead>
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
                      <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                        <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        Nenhum custo cadastrado
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map(c => {
                    const cat = categories.find(cat => cat.id === c.categoryId);
                    const isExpanded = expandedCostId === c.id;
                    const costCat = (c as any).costCategory ?? "other";
                    return (
                      <>
                        <TableRow key={c.id} className={isExpanded ? "bg-muted/30" : ""}>
                          <TableCell>
                            <Button
                              size="icon" variant="ghost" className="h-6 w-6"
                              onClick={() => toggleExpand(c.id)}
                            >
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />
                              }
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">
                            {c.name}
                            {(c as any).description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{(c as any).description}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.type === "fixed" ? "default" : "secondary"}>
                              {c.type === "fixed" ? "Fixo" : "Variável"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${COST_CATEGORY_COLORS[costCat]}`}>
                              {COST_CATEGORY_LABELS[costCat] ?? costCat}
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
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7 text-blue-500 hover:text-blue-700"
                                title="Vincular despesa"
                                onClick={() => openLinkModal(c.id)}
                              >
                                <Link2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700"
                                onClick={() => { if (confirm("Remover este custo?")) deleteMut.mutate({ id: c.id }); }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Painel expansível: despesas vinculadas */}
                        {isExpanded && (
                          <TableRow key={`expanded-${c.id}`}>
                            <TableCell colSpan={9} className="bg-muted/20 p-0">
                              <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-semibold flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-primary" />
                                    Despesas vinculadas a "{c.name}"
                                  </h4>
                                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => openLinkModal(c.id)}>
                                    <Link2 className="w-3 h-3" /> Vincular despesa
                                  </Button>
                                </div>
                                {linkedTransactions.length === 0 ? (
                                  <p className="text-sm text-muted-foreground py-2 text-center">
                                    Nenhuma despesa vinculada a este custo ainda.
                                  </p>
                                ) : (
                                  <div className="rounded-lg border border-border/50 overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead className="bg-muted/50">
                                        <tr>
                                          <th className="text-left p-2 font-medium">Descrição</th>
                                          <th className="text-right p-2 font-medium">Valor</th>
                                          <th className="text-center p-2 font-medium">Vencimento</th>
                                          <th className="text-center p-2 font-medium">Status</th>
                                          <th className="text-center p-2 font-medium">Desvincular</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {linkedTransactions.map(t => (
                                          <tr key={t.id} className="border-t border-border/30 hover:bg-muted/30">
                                            <td className="p-2">{t.description}</td>
                                            <td className="p-2 text-right font-semibold text-red-600">{fmt(Number(t.amount))}</td>
                                            <td className="p-2 text-center text-muted-foreground">{fmtDate(t.dueDate)}</td>
                                            <td className="p-2 text-center">
                                              {t.isPaid
                                                ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Pago</Badge>
                                                : <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">Pendente</Badge>
                                              }
                                            </td>
                                            <td className="p-2 text-center">
                                              <Button
                                                size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-red-500"
                                                title="Desvincular"
                                                onClick={() => unlinkMut.mutate({ transactionId: t.id })}
                                              >
                                                <Unlink className="w-3 h-3" />
                                              </Button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                {linkedTransactions.length > 0 && (
                                  <div className="flex justify-end text-xs text-muted-foreground">
                                    Total vinculado: <span className="font-semibold ml-1 text-foreground">
                                      {fmt(linkedTransactions.reduce((s, t) => s + Number(t.amount), 0))}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Modal Criar/Editar Custo */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-lg">
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
                  <Label>Classificação</Label>
                  <Select value={watch("costCategory")} onValueChange={v => setValue("costCategory", v as CostForm["costCategory"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="administrative">Administrativo</SelectItem>
                      <SelectItem value="operational">Operacional</SelectItem>
                      <SelectItem value="commercial">Comercial</SelectItem>
                      <SelectItem value="financial">Financeiro</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Recorrência</Label>
                  <Select value={watch("recurrence")} onValueChange={v => setValue("recurrence", v as CostForm["recurrence"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                      <SelectItem value="once">Único</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Categoria Financeira</Label>
                  <Select value={watch("categoryId")} onValueChange={v => setValue("categoryId", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {expenseCategories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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

              <div className="space-y-1">
                <Label>Descrição / Observações</Label>
                <Textarea
                  {...register("description")}
                  placeholder="Descreva o custo, fornecedor, condições de pagamento..."
                  rows={2}
                />
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

        {/* Modal Vincular Despesa */}
        <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Vincular Despesa ao Custo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Selecione uma despesa (Conta a Pagar) sem custo vinculado para associar a este custo.
              </p>
              <div className="space-y-2">
                <Label>Despesa disponível</Label>
                <Select value={selectedTransactionId} onValueChange={setSelectedTransactionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a despesa..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione...</SelectItem>
                    {unlinkedTransactions.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.description} — {Number(t.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {unlinkedTransactions.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma despesa disponível para vincular.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setLinkModalOpen(false)}>Cancelar</Button>
                <Button
                  className="flex-1"
                  disabled={selectedTransactionId === "none" || linkMut.isPending}
                  onClick={handleLink}
                >
                  <Link2 className="w-4 h-4 mr-2" /> Vincular
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
