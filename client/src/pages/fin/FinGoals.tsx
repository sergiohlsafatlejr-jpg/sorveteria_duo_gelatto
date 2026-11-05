import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ArrowLeft, Target, Plus, Trash2, Edit2, Check, X, TrendingUp,
  DollarSign, AlertCircle, CheckCircle2, Calculator, CalendarDays, Copy, Share2,
  MessageSquare, Users, Save
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
  const [customTargetTicket, setCustomTargetTicket] = useState<string>("31.50");
  const { data: weeklyTeamPlan, isLoading: loadingWeeklyPlan } = trpc.fin.intelligence.weeklyTeamGoals.useQuery({
    month,
    targetTicket: parseFloat(customTargetTicket) || 31.5,
  });

  // Estado para Análise Gerencial, Informações para Funcionários e Edição de Metas Semanais
  const [monthlyAnalysisText, setMonthlyAnalysisText] = useState<string>("");
  const [teamGeneralNoticeText, setTeamGeneralNoticeText] = useState<string>("");
  const [monthlyGoalOverrideInput, setMonthlyGoalOverrideInput] = useState<string>("");
  const [editingWeekIdx, setEditingWeekIdx] = useState<number | null>(null);
  const [weekEditForm, setWeekEditForm] = useState<{
    customGoal: string;
    customTakeHomePotes: string;
    managerAnalysis: string;
    employeeNote: string;
  }>({
    customGoal: "",
    customTakeHomePotes: "",
    managerAnalysis: "",
    employeeNote: "",
  });

  useEffect(() => {
    if (weeklyTeamPlan) {
      setMonthlyAnalysisText(weeklyTeamPlan.monthlyAnalysis ?? "");
      setTeamGeneralNoticeText(weeklyTeamPlan.teamGeneralNotice ?? "");
      setMonthlyGoalOverrideInput(
        weeklyTeamPlan.targetMonthlyRevenue ? String(weeklyTeamPlan.targetMonthlyRevenue) : "",
      );
    }
  }, [weeklyTeamPlan?.month, weeklyTeamPlan?.monthlyAnalysis, weeklyTeamPlan?.teamGeneralNotice, weeklyTeamPlan?.targetMonthlyRevenue]);

  const saveTeamConfigMutation = trpc.fin.intelligence.saveWeeklyTeamGoalsConfig.useMutation({
    onSuccess: () => {
      utils.fin.intelligence.weeklyTeamGoals.invalidate();
      setEditingWeekIdx(null);
      toast.success("Análise, informações da equipe e metas atualizadas com sucesso!");
    },
    onError: (e) => toast.error(`Erro ao salvar configuração: ${e.message}`),
  });

  const handleSaveGeneralTeamConfig = () => {
    const parsedMonthlyGoal = parseFloat(monthlyGoalOverrideInput);
    const parsedTicket = parseFloat(customTargetTicket);
    saveTeamConfigMutation.mutate({
      month,
      monthlyAnalysis: monthlyAnalysisText,
      teamGeneralNotice: teamGeneralNoticeText,
      targetMonthlyRevenueOverride: !isNaN(parsedMonthlyGoal) && parsedMonthlyGoal > 0 ? parsedMonthlyGoal : null,
      targetTicketOverride: !isNaN(parsedTicket) && parsedTicket > 0 ? parsedTicket : null,
    });
  };

  const openWeekEditor = (w: NonNullable<typeof weeklyTeamPlan>["weeks"][0]) => {
    setEditingWeekIdx(w.weekIndex);
    setWeekEditForm({
      customGoal: String(w.recoveryGoal),
      customTakeHomePotes: String(w.takeHomePotesTarget),
      managerAnalysis: w.managerAnalysis ?? "",
      employeeNote: w.employeeNote ?? "",
    });
  };

  const handleSaveWeekEdit = (weekIndex: number) => {
    const parsedGoal = parseFloat(weekEditForm.customGoal);
    const parsedPotes = parseInt(weekEditForm.customTakeHomePotes, 10);
    const parsedMonthlyGoal = parseFloat(monthlyGoalOverrideInput);
    const parsedTicket = parseFloat(customTargetTicket);
    saveTeamConfigMutation.mutate({
      month,
      monthlyAnalysis: monthlyAnalysisText,
      teamGeneralNotice: teamGeneralNoticeText,
      targetMonthlyRevenueOverride: !isNaN(parsedMonthlyGoal) && parsedMonthlyGoal > 0 ? parsedMonthlyGoal : null,
      targetTicketOverride: !isNaN(parsedTicket) && parsedTicket > 0 ? parsedTicket : null,
      weekIndex,
      weekOverride: {
        customGoal: !isNaN(parsedGoal) && parsedGoal > 0 ? parsedGoal : null,
        customTakeHomePotes: !isNaN(parsedPotes) && parsedPotes > 0 ? parsedPotes : null,
        managerAnalysis: weekEditForm.managerAnalysis,
        employeeNote: weekEditForm.employeeNote,
      },
    });
  };

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createGoal = trpc.fin.goals.create.useMutation({
    onSuccess: () => { utils.fin.goals.list.invalidate(); utils.fin.intelligence.weeklyTeamGoals.invalidate(); setNewGoal({ label: "", targetRevenue: "", salary: "" }); setAddingGoal(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateGoal = trpc.fin.goals.update.useMutation({
    onSuccess: () => { utils.fin.goals.list.invalidate(); utils.fin.intelligence.weeklyTeamGoals.invalidate(); setEditingId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteGoal = trpc.fin.goals.delete.useMutation({
    onSuccess: () => { utils.fin.goals.list.invalidate(); utils.fin.intelligence.weeklyTeamGoals.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const createExtra = trpc.fin.goals.createExtraCost.useMutation({
    onSuccess: () => { utils.fin.goals.listExtraCosts.invalidate(); utils.fin.goals.summary.invalidate(); utils.fin.intelligence.weeklyBreakEven.invalidate(); setNewExtra({ description: "", amount: "" }); setAddingExtra(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteExtra = trpc.fin.goals.deleteExtraCost.useMutation({
    onSuccess: () => { utils.fin.goals.listExtraCosts.invalidate(); utils.fin.goals.summary.invalidate(); utils.fin.intelligence.weeklyBreakEven.invalidate(); },
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
      utils.fin.forecastCalendar.getGoalForecasts.invalidate();
      utils.fin.revenueForecast.list.invalidate();
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
    <DashboardLayout>
    <div className="space-y-6">
      {/* Barra de Navegação Rápida do Financeiro */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2">
          Módulos Financeiros:
        </span>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("/fin/dashboard")}>
          Painel Financeiro
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => navigate("/fin/payables")}>
          💸 Contas a Pagar
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs border-amber-200 text-amber-800 hover:bg-amber-50" onClick={() => navigate("/fin/weekday-report")}>
          📊 Break-Even Semanal & ABC
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => navigate("/fin/receivables")}>
          💳 Contas a Receber & Liquidez
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => navigate("/fin/forecast")}>
          🌤️ Previsão & Clima
        </Button>
        <Button size="sm" variant="default" className="h-8 text-xs" onClick={() => navigate("/fin/goals")}>
          🎯 Meta de Gerência
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fin/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Meta de Gerência & Plano da Equipe
          </h1>
          <p className="text-sm text-muted-foreground">Cenários de faturamento, análise gerencial, comunicados para os funcionários e metas semanais editáveis</p>
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

          {/* ─── PAINEL DE METAS SEMANAIS DA EQUIPE (CLIMA + BALCÃO + WHATSAPP + ANÁLISE & COMUNICADOS) ─── */}
          <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-card to-indigo-500/5">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-5 w-5 text-emerald-500" />
                    Metas Semanais da Equipe, Análise Gerencial & Informações para Funcionários
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Altere as metas mensais ou de cada semana, registre sua análise gerencial e escreva orientações/avisos para os funcionários (incluídos automaticamente ao copiar para o WhatsApp).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Meta Mensal Equipe (R$):</span>
                  <Input
                    type="number"
                    step="100"
                    value={monthlyGoalOverrideInput}
                    onChange={(e) => setMonthlyGoalOverrideInput(e.target.value)}
                    placeholder="Ex: 55000"
                    className="w-28 h-8 text-xs font-bold"
                  />
                  <span className="text-muted-foreground">Ticket Alvo (R$):</span>
                  <Input
                    type="number"
                    step="0.50"
                    value={customTargetTicket}
                    onChange={(e) => setCustomTargetTicket(e.target.value)}
                    className="w-20 h-8 text-xs font-bold"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveGeneralTeamConfig}
                    disabled={saveTeamConfigMutation.isPending}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Salvar Metas & Avisos
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingWeeklyPlan ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Calculando plano semanal da equipe...</div>
              ) : weeklyTeamPlan ? (
                <>
                  {/* Mural de Análise da Gerência & Informações para os Funcionários */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 rounded-xl border border-indigo-500/25 bg-card/90 p-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wide text-indigo-600 flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Análise da Gerência (Estratégia & Observações do Mês)
                      </label>
                      <Textarea
                        rows={3}
                        placeholder="Registre aqui sua análise do mês: motivo de ajuste das metas, foco em redução de desperdício, avaliação de turno, clima esperado..."
                        value={monthlyAnalysisText}
                        onChange={(e) => setMonthlyAnalysisText(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wide text-emerald-600 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Informações / Comunicado Geral para os Funcionários (vai no WhatsApp)
                      </label>
                      <Textarea
                        rows={3}
                        placeholder="Escreva avisos e incentivos para a equipe (ex: 'Premiação de R$ 100 para o turno que bater a meta de Potes 1L nesta semana! Caprichem na abordagem no caixa!')"
                        value={teamGeneralNoticeText}
                        onChange={(e) => setTeamGeneralNoticeText(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <div className="lg:col-span-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50"
                        onClick={handleSaveGeneralTeamConfig}
                        disabled={saveTeamConfigMutation.isPending}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saveTeamConfigMutation.isPending ? "Salvando..." : "Salvar Análise, Comunicado e Meta Mensal"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card/80 p-3">
                      <p className="text-[11px] text-muted-foreground uppercase">Meta Mensal de Referência</p>
                      <p className="text-lg font-bold text-primary">{fmt(weeklyTeamPlan.targetMonthlyRevenue)}</p>
                    </div>
                    <div className="rounded-lg border bg-card/80 p-3">
                      <p className="text-[11px] text-muted-foreground uppercase">Realizado no Mês até Agora</p>
                      <p className="text-lg font-bold text-emerald-600">
                        {fmt(weeklyTeamPlan.realizedMonthlySoFar)} ({weeklyTeamPlan.monthlyProgressPct}%)
                      </p>
                    </div>
                    <div className="rounded-lg border bg-card/80 p-3">
                      <p className="text-[11px] text-muted-foreground uppercase">Saldo a Realizar nas Semanas Restantes</p>
                      <p className="text-lg font-bold text-amber-600">{fmt(weeklyTeamPlan.remainingMonthlyTarget)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {weeklyTeamPlan.weeks.map((w) => (
                      <div
                        key={w.weekIndex}
                        className={`rounded-xl border p-4 space-y-3 bg-card ${
                          w.isCurrentWeek ? "ring-2 ring-emerald-500 border-emerald-500/50" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-base">{w.weekLabel}</span>
                            <span className="ml-2 text-xs text-muted-foreground">({w.dateRange})</span>
                            {w.isCurrentWeek && (
                              <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                                Semana Atual
                              </span>
                            )}
                            {w.hasCustomGoal && (
                              <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600">
                                Meta Editada
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() =>
                                editingWeekIdx === w.weekIndex ? setEditingWeekIdx(null) : openWeekEditor(w)
                              }
                            >
                              <Edit2 className="h-3 w-3" />
                              {editingWeekIdx === w.weekIndex ? "Fechar Edição" : "Alterar Meta / Avisos"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                              onClick={() => {
                                navigator.clipboard.writeText(w.whatsappSummaryText);
                                toast.success(`Resumo da ${w.weekLabel} copiado! Cole no WhatsApp da equipe.`);
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              WhatsApp
                            </Button>
                          </div>
                        </div>

                        {/* Painel inline para editar meta da semana, análise e recado p/ funcionários */}
                        {editingWeekIdx === w.weekIndex && (
                          <div className="rounded-lg border-2 border-indigo-400/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-3 text-xs">
                            <p className="font-bold text-indigo-700 dark:text-indigo-300">
                              ✏️ Personalizar {w.weekLabel} ({w.dateRange})
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] font-medium text-muted-foreground">
                                  Meta da Semana (R$)
                                </label>
                                <Input
                                  type="number"
                                  step="50"
                                  value={weekEditForm.customGoal}
                                  onChange={(e) =>
                                    setWeekEditForm((prev) => ({ ...prev, customGoal: e.target.value }))
                                  }
                                  className="h-8 text-xs mt-0.5 bg-background"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-medium text-muted-foreground">
                                  Meta Potes "Leve p/ Casa" (un)
                                </label>
                                <Input
                                  type="number"
                                  step="1"
                                  value={weekEditForm.customTakeHomePotes}
                                  onChange={(e) =>
                                    setWeekEditForm((prev) => ({ ...prev, customTakeHomePotes: e.target.value }))
                                  }
                                  className="h-8 text-xs mt-0.5 bg-background"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-muted-foreground">
                                Análise da Gerência sobre esta Semana
                              </label>
                              <Textarea
                                rows={2}
                                placeholder="Ex: Semana com feriado na sexta, reforçar estoque de açaí e casquinha..."
                                value={weekEditForm.managerAnalysis}
                                onChange={(e) =>
                                  setWeekEditForm((prev) => ({ ...prev, managerAnalysis: e.target.value }))
                                }
                                className="text-xs mt-0.5 bg-background"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-emerald-700">
                                Orientação / Informação para os Funcionários nesta Semana (vai no WhatsApp)
                              </label>
                              <Textarea
                                rows={2}
                                placeholder="Ex: Equipe, foco em oferecer adicionais de Nutella e cobertura quente após as 18h!"
                                value={weekEditForm.employeeNote}
                                onChange={(e) =>
                                  setWeekEditForm((prev) => ({ ...prev, employeeNote: e.target.value }))
                                }
                                className="text-xs mt-0.5 bg-background"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setEditingWeekIdx(null)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1"
                                disabled={saveTeamConfigMutation.isPending}
                                onClick={() => handleSaveWeekEdit(w.weekIndex)}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Salvar Semana
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2.5 text-xs">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Meta Original</p>
                            <p className="font-semibold">{fmt(w.originalGoal)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">
                              {w.hasCustomGoal ? "Meta Definida" : "Meta c/ Recuperação"}
                            </p>
                            <p className="font-bold text-primary">{fmt(w.recoveryGoal)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Realizado ({w.progressPct}%)</p>
                            <p className="font-bold text-emerald-600">{fmt(w.realized)}</p>
                          </div>
                        </div>

                        {/* Barra de progresso da semana */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Progresso da Semana: {w.progressPct}%</span>
                            <span>Ritmo até hoje (Pace): <strong>{w.pacePct}%</strong></span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                w.pacePct >= 95 ? "bg-emerald-500" : w.pacePct >= 80 ? "bg-amber-500" : "bg-rose-500"
                              }`}
                              style={{ width: `${Math.min(100, w.progressPct)}%` }}
                            />
                          </div>
                        </div>

                        {/* Metas Táticas de Balcão */}
                        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                          <div className="rounded-lg border p-2.5 bg-muted/15">
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">🎫 Meta Ticket & Fluxo</p>
                            <p className="font-bold text-sm mt-0.5">{fmt(w.targetTicket)} / cliente</p>
                            <p className="text-[11px] text-muted-foreground">~{w.targetTicketsCount} atendimentos na semana</p>
                          </div>
                          <div className="rounded-lg border p-2.5 bg-muted/15">
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">🏠 Meta "Leve p/ Casa"</p>
                            <p className="font-bold text-sm mt-0.5 text-indigo-600">{w.takeHomePotesTarget} Potes / Combos</p>
                            <p className="text-[11px] text-muted-foreground">
                              {fmt(w.takeHomeRevenueTarget)} ({w.takeHomeShareTargetPct}% da semana)
                            </p>
                          </div>
                        </div>

                        {/* Foco Tático por Clima */}
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">⛅ Estratégia de Balcão da Semana: </span>
                          {w.tacticalFocus}
                        </div>

                        {/* Exibição da Análise da Gerência e Informação para Funcionários se preenchidas */}
                        {w.managerAnalysis && (
                          <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/25 p-2.5 text-xs">
                            <span className="font-bold text-indigo-700 dark:text-indigo-300">📊 Análise da Gerência: </span>
                            <span className="text-foreground">{w.managerAnalysis}</span>
                          </div>
                        )}
                        {w.employeeNote && (
                          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs">
                            <span className="font-bold text-emerald-700 dark:text-emerald-300">📣 Recado para os Funcionários: </span>
                            <span className="text-foreground">{w.employeeNote}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
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
    </DashboardLayout>
  );
}
