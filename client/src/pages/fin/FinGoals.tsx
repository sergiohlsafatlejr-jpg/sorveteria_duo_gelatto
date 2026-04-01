import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ArrowLeft, Target, Plus, Trash2, Edit2, Check, X, TrendingUp,
  DollarSign, AlertCircle, CheckCircle2, Calculator, CalendarDays
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export default function FinGoals() {
  const [, navigate] = useLocation();
  const [month, setMonth] = useState(currentMonth());
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: summary, isLoading: loadingSummary } = trpc.fin.goals.summary.useQuery({ month });
  const { data: goals = [], isLoading: loadingGoals } = trpc.fin.goals.list.useQuery({ month });
  const { data: extraCosts = [], isLoading: loadingExtra } = trpc.fin.goals.listExtraCosts.useQuery({ month });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createGoal = trpc.fin.goals.create.useMutation({
    onSuccess: () => { utils.fin.goals.list.invalidate(); setNewGoal({ label: "", targetRevenue: "", salary: "" }); setAddingGoal(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateGoal = trpc.fin.goals.update.useMutation({
    onSuccess: () => { utils.fin.goals.list.invalidate(); setEditingId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteGoal = trpc.fin.goals.delete.useMutation({
    onSuccess: () => utils.fin.goals.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const createExtra = trpc.fin.goals.createExtraCost.useMutation({
    onSuccess: () => { utils.fin.goals.listExtraCosts.invalidate(); utils.fin.goals.summary.invalidate(); setNewExtra({ description: "", amount: "" }); setAddingExtra(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteExtra = trpc.fin.goals.deleteExtraCost.useMutation({
    onSuccess: () => { utils.fin.goals.listExtraCosts.invalidate(); utils.fin.goals.summary.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // ── Local state ───────────────────────────────────────────────────────────────
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ label: "", targetRevenue: "", salary: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ label: "", targetRevenue: "", salary: "", notes: "" });

  const [addingExtra, setAddingExtra] = useState(false);
  const [newExtra, setNewExtra] = useState({ description: "", amount: "" });

  // ── Populate forecast state ───────────────────────────────────────────────────
  const [populateConfirm, setPopulateConfirm] = useState<{ goalId: number; label: string; revenue: number } | null>(null);
  const [overwrite, setOverwrite] = useState(false);

  const populateForecast = trpc.fin.goals.populateForecast.useMutation({
    onSuccess: (result) => {
      toast.success(`Previsão populada! ${result.populated} dia(s) preenchido(s)${result.skipped > 0 ? `, ${result.skipped} ignorado(s)` : ""}.`);
      setPopulateConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Computed ──────────────────────────────────────────────────────────────────
  const totalFixed = (summary?.totalPayables ?? 0) + (summary?.totalExtraCosts ?? 0);

  const goalsWithCalc = useMemo(() =>
    goals.map(g => {
      const revenue = parseFloat(String(g.targetRevenue) || "0");
      const salary = parseFloat(String(g.salary) || "0");
      const profit = revenue - totalFixed - salary;
      const coverageRatio = totalFixed > 0 ? revenue / totalFixed : 0;
      return { ...g, revenue, salary, profit, coverageRatio };
    }), [goals, totalFixed]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleAddGoal = () => {
    if (!newGoal.label.trim()) return;
    createGoal.mutate({
      month,
      label: newGoal.label,
      targetRevenue: parseFloat(newGoal.targetRevenue) || 0,
      salary: parseFloat(newGoal.salary) || 0,
    });
  };

  const startEdit = (g: typeof goalsWithCalc[0]) => {
    setEditingId(g.id);
    setEditForm({ label: g.label, targetRevenue: String(g.revenue), salary: String(g.salary), notes: g.notes ?? "" });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    updateGoal.mutate({
      id: editingId,
      label: editForm.label,
      targetRevenue: parseFloat(editForm.targetRevenue) || 0,
      salary: parseFloat(editForm.salary) || 0,
      notes: editForm.notes || undefined,
    });
  };

  const handleAddExtra = () => {
    if (!newExtra.description.trim()) return;
    createExtra.mutate({
      month,
      description: newExtra.description,
      amount: parseFloat(newExtra.amount) || 0,
    });
  };

  const prevMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const loading = loadingSummary || loadingGoals || loadingExtra;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fin/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Meta de Gerência
          </h1>
          <p className="text-sm text-muted-foreground">Cenários de faturamento e salário por mês</p>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" onClick={prevMonth}>‹</Button>
        <span className="text-lg font-semibold capitalize min-w-[180px] text-center">
          {monthLabel(month)}
        </span>
        <Button variant="outline" size="sm" onClick={nextMonth}>›</Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-1">Contas a Pagar (total)</p>
                <p className="text-xl font-bold text-red-500">{fmt(summary?.totalPayables ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmt(summary?.totalPaid ?? 0)} pago · {fmt(summary?.totalPending ?? 0)} pendente
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-1">Custos Extras (manual)</p>
                <p className="text-xl font-bold text-orange-500">{fmt(summary?.totalExtraCosts ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">{extraCosts.length} item(s) lançado(s)</p>
              </CardContent>
            </Card>
            <Card className="col-span-2 border-primary/30 bg-primary/5">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Calculator className="h-3 w-3" /> Total de Custos Fixos (base dos cenários)
                </p>
                <p className="text-2xl font-bold text-primary">{fmt(totalFixed)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Contas a pagar + custos extras manuais
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Extra costs manual */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-orange-500" />
                  Custos Extras Manuais
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setAddingExtra(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {extraCosts.length === 0 && !addingExtra && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Nenhum custo extra lançado. Adicione valores que não estão nas Contas a Pagar.
                </p>
              )}
              <div className="space-y-2">
                {extraCosts.map(ec => (
                  <div key={ec.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <span className="text-sm">{ec.description}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-orange-600">{fmt(parseFloat(String(ec.amount)))}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={() => deleteExtra.mutate({ id: ec.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {addingExtra && (
                  <div className="flex gap-2 pt-2">
                    <Input placeholder="Descrição (ex: Pró-labore)" value={newExtra.description}
                      onChange={e => setNewExtra(p => ({ ...p, description: e.target.value }))} className="flex-1 h-8 text-sm" />
                    <Input placeholder="R$ 0,00" type="number" value={newExtra.amount}
                      onChange={e => setNewExtra(p => ({ ...p, amount: e.target.value }))} className="w-32 h-8 text-sm" />
                    <Button size="sm" onClick={handleAddExtra} disabled={createExtra.isPending}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingExtra(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Scenarios */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Cenários de Faturamento
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setAddingGoal(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Novo Cenário
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {goalsWithCalc.length === 0 && !addingGoal && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum cenário criado. Clique em "Novo Cenário" para começar.
                </p>
              )}

              {/* Table header */}
              {goalsWithCalc.length > 0 && (
                <div className="hidden md:grid grid-cols-5 gap-3 text-xs font-medium text-muted-foreground pb-2 border-b mb-2">
                  <span>Cenário</span>
                  <span className="text-right">Faturamento Alvo</span>
                  <span className="text-right">Salário</span>
                  <span className="text-right">Resultado</span>
                  <span className="text-right">Ações</span>
                </div>
              )}

              <div className="space-y-3">
                {goalsWithCalc.map(g => (
                  <div key={g.id}>
                    {editingId === g.id ? (
                      /* Edit row */
                      <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Nome do cenário</label>
                            <Input value={editForm.label} onChange={e => setEditForm(p => ({ ...p, label: e.target.value }))}
                              className="h-8 text-sm mt-0.5" />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Faturamento Alvo (R$)</label>
                            <Input type="number" value={editForm.targetRevenue}
                              onChange={e => setEditForm(p => ({ ...p, targetRevenue: e.target.value }))}
                              className="h-8 text-sm mt-0.5" />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Salário (R$)</label>
                            <Input type="number" value={editForm.salary}
                              onChange={e => setEditForm(p => ({ ...p, salary: e.target.value }))}
                              className="h-8 text-sm mt-0.5" />
                          </div>
                        </div>
                        <Input placeholder="Observações (opcional)" value={editForm.notes}
                          onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                          className="h-8 text-sm" />
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" onClick={handleSaveEdit} disabled={updateGoal.isPending}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Salvar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Display row */
                      <div className={`border rounded-lg p-3 ${g.profit >= 0 ? "border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900" : "border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900"}`}>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                          {/* Label */}
                          <div>
                            <p className="font-semibold text-sm">{g.label}</p>
                            {g.notes && <p className="text-xs text-muted-foreground mt-0.5">{g.notes}</p>}
                          </div>
                          {/* Revenue */}
                          <div className="md:text-right">
                            <p className="text-xs text-muted-foreground">Faturamento Alvo</p>
                            <p className="font-bold text-blue-600 dark:text-blue-400">{fmt(g.revenue)}</p>
                          </div>
                          {/* Salary */}
                          <div className="md:text-right">
                            <p className="text-xs text-muted-foreground">Salário</p>
                            <p className="font-medium">{fmt(g.salary)}</p>
                          </div>
                          {/* Result */}
                          <div className="md:text-right">
                            <p className="text-xs text-muted-foreground">Resultado</p>
                            <p className={`font-bold ${g.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {fmt(g.profit)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {g.profit >= 0
                                ? <span className="flex items-center gap-1 justify-end md:justify-end"><CheckCircle2 className="h-3 w-3 text-green-500" /> Cobre os custos</span>
                                : <span className="flex items-center gap-1 justify-end md:justify-end"><AlertCircle className="h-3 w-3 text-red-500" /> Déficit</span>
                              }
                            </p>
                          </div>
                          {/* Actions */}
                          <div className="flex gap-1 md:justify-end flex-wrap">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => { setPopulateConfirm({ goalId: g.id, label: g.label, revenue: g.revenue }); setOverwrite(false); }}
                              title="Popular Previsão de Faturamento com este cenário">
                              <CalendarDays className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Popular Previsão</span>
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(g)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                              onClick={() => deleteGoal.mutate({ id: g.id })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {/* Breakdown */}
                        <div className="mt-2 pt-2 border-t border-dashed grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                          <span>Custos fixos: <strong className="text-foreground">{fmt(totalFixed)}</strong></span>
                          <span>Salário: <strong className="text-foreground">{fmt(g.salary)}</strong></span>
                          <span>Sobra: <strong className={g.profit >= 0 ? "text-green-600" : "text-red-600"}>{fmt(g.profit)}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add new goal row */}
                {addingGoal && (
                  <div className="border-2 border-dashed border-primary/40 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-primary">Novo Cenário</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Nome do cenário</label>
                        <Input placeholder="Ex: Cenário Conservador" value={newGoal.label}
                          onChange={e => setNewGoal(p => ({ ...p, label: e.target.value }))}
                          className="h-8 text-sm mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Faturamento Alvo (R$)</label>
                        <Input type="number" placeholder="0,00" value={newGoal.targetRevenue}
                          onChange={e => setNewGoal(p => ({ ...p, targetRevenue: e.target.value }))}
                          className="h-8 text-sm mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Salário (R$)</label>
                        <Input type="number" placeholder="0,00" value={newGoal.salary}
                          onChange={e => setNewGoal(p => ({ ...p, salary: e.target.value }))}
                          className="h-8 text-sm mt-0.5" />
                      </div>
                    </div>
                    {/* Live preview */}
                    {(parseFloat(newGoal.targetRevenue) > 0 || parseFloat(newGoal.salary) > 0) && (
                      <div className="bg-muted/50 rounded p-2 text-xs grid grid-cols-3 gap-2">
                        <span>Custos fixos: <strong>{fmt(totalFixed)}</strong></span>
                        <span>Salário: <strong>{fmt(parseFloat(newGoal.salary) || 0)}</strong></span>
                        <span>Resultado: <strong className={(parseFloat(newGoal.targetRevenue) - totalFixed - (parseFloat(newGoal.salary) || 0)) >= 0 ? "text-green-600" : "text-red-600"}>
                          {fmt(parseFloat(newGoal.targetRevenue) - totalFixed - (parseFloat(newGoal.salary) || 0))}
                        </strong></span>
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" onClick={handleAddGoal} disabled={createGoal.isPending || !newGoal.label.trim()}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Adicionar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingGoal(false)}>
                        <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Legend */}
              {totalFixed > 0 && (
                <div className="mt-4 p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1 flex items-center gap-1">
                    <Calculator className="h-3.5 w-3.5" /> Como é calculado:
                  </p>
                  <p>Resultado = Faturamento Alvo − Custos Fixos ({fmt(totalFixed)}) − Salário</p>
                  <p className="mt-1">Custos Fixos = Contas a Pagar ({fmt(summary?.totalPayables ?? 0)}) + Custos Extras ({fmt(summary?.totalExtraCosts ?? 0)})</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* Populate forecast confirm dialog */}
      <AlertDialog open={!!populateConfirm} onOpenChange={(open) => !open && setPopulateConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Popular Previsão de Faturamento
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  O cenário <strong>{populateConfirm?.label}</strong> ({fmt(populateConfirm?.revenue ?? 0)}) será distribuído
                  pelos dias de <strong className="capitalize">{monthLabel(month)}</strong> usando os pesos de
                  Dia de Semana, Sábado e Domingo/Feriado configurados na Previsão de Faturamento.
                </p>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={e => setOverwrite(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Sobrescrever dias que já têm valor lançado</span>
                </label>
                {!overwrite && (
                  <p className="text-xs text-muted-foreground">
                    Dias com faturamento real já lançado serão ignorados.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!populateConfirm) return;
                populateForecast.mutate({
                  month,
                  targetRevenue: populateConfirm.revenue,
                  overwrite,
                });
              }}
              disabled={populateForecast.isPending}
            >
              {populateForecast.isPending ? "Populando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
