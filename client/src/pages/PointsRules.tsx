import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Gift, Plus, Settings, Star, Trash2, PowerOff, Power, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const fmtBRL = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function PointsRules() {
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    purchaseAmount: "",
    pointsEarned: "",
    rewardThreshold: "",
    rewardValue: "",
  });

  const utils = trpc.useUtils();
  const { data: rules = [], isLoading } = trpc.points.getAllRules.useQuery();

  const createRule = trpc.points.createRule.useMutation({
    onSuccess: () => {
      utils.points.getAllRules.invalidate();
      utils.points.getRules.invalidate();
      toast.success("Regra criada com sucesso!");
      setCreateOpen(false);
      setForm({ name: "", description: "", purchaseAmount: "", pointsEarned: "", rewardThreshold: "", rewardValue: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = trpc.points.toggleRuleActive.useMutation({
    onSuccess: (_, vars) => {
      utils.points.getAllRules.invalidate();
      utils.points.getRules.invalidate();
      toast.success(vars.active ? "Regra ativada!" : "Regra inativada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRule = trpc.points.deleteRule.useMutation({
    onSuccess: () => {
      utils.points.getAllRules.invalidate();
      utils.points.getRules.invalidate();
      toast.success("Regra excluída!");
      setDeleteConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.name || !form.purchaseAmount || !form.pointsEarned || !form.rewardThreshold || !form.rewardValue) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    createRule.mutate({
      name: form.name,
      description: form.description || undefined,
      purchaseAmount: parseFloat(form.purchaseAmount),
      pointsEarned: parseInt(form.pointsEarned),
      rewardThreshold: parseInt(form.rewardThreshold),
      rewardValue: parseFloat(form.rewardValue),
    });
  };

  const activeRules = rules.filter(r => r.active);
  const inactiveRules = rules.filter(r => !r.active);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-1">
        <BackButton to="/points" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6 text-primary" />
              Regras de Pontos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure as regras de acúmulo e resgate de pontos
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Regra
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <p className="text-2xl font-bold text-primary">{rules.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total de Regras</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-500">{activeRules.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Regras Ativas</p>
          </div>
          <div className="rounded-xl border border-muted/50 bg-muted/10 p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{inactiveRules.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Regras Inativas</p>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && rules.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <Star className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="font-medium text-muted-foreground">Nenhuma regra configurada ainda.</p>
              <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
                Crie regras para definir como os clientes acumulam e resgatam pontos.
              </p>
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar primeira regra
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Active Rules */}
        {activeRules.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Regras Ativas ({activeRules.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeRules.map((r) => (
                <Card key={r.id} className="hover:shadow-md transition-shadow border-emerald-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span className="truncate">{r.name}</span>
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 shrink-0">
                        Ativa
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {r.description && (
                      <p className="text-xs text-muted-foreground">{r.description}</p>
                    )}
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">A cada compra de</span>
                        <span className="font-semibold text-primary text-xs">{fmtBRL(r.purchaseAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Pontos ganhos</span>
                        <span className="font-semibold text-xs">{r.pointsEarned} pt(s)</span>
                      </div>
                      <div className="border-t border-border/30 pt-1.5 flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Meta de resgate</span>
                        <span className="font-semibold text-primary text-xs">{r.rewardThreshold} pts</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Recompensa</span>
                        <span className="font-semibold text-emerald-600 text-xs">{fmtBRL(r.rewardValue)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                        onClick={() => toggleActive.mutate({ id: r.id, active: false })}
                        disabled={toggleActive.isPending}
                      >
                        <PowerOff className="h-3.5 w-3.5" />
                        Inativar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setDeleteConfirm(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Inactive Rules */}
        {inactiveRules.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />
              Regras Inativas ({inactiveRules.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inactiveRules.map((r) => (
                <Card key={r.id} className="opacity-60 hover:opacity-80 transition-opacity">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span className="truncate line-through text-muted-foreground">{r.name}</span>
                      <Badge variant="secondary" className="shrink-0">Inativa</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">A cada</span>
                        <span className="text-xs">{fmtBRL(r.purchaseAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Pontos</span>
                        <span className="text-xs">{r.pointsEarned} pt(s)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Meta</span>
                        <span className="text-xs">{r.rewardThreshold} pts → {fmtBRL(r.rewardValue)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                        onClick={() => toggleActive.mutate({ id: r.id, active: true })}
                        disabled={toggleActive.isPending}
                      >
                        <Power className="h-3.5 w-3.5" />
                        Reativar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setDeleteConfirm(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Create Rule Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                Nova Regra de Pontos
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nome da Regra *</Label>
                <Input
                  placeholder="Ex: Regra Padrão"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input
                  placeholder="Descrição opcional"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Valor da Compra (R$) *</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 10.00"
                    value={form.purchaseAmount}
                    onChange={e => setForm(f => ({ ...f, purchaseAmount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Pontos Ganhos *</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 1"
                    value={form.pointsEarned}
                    onChange={e => setForm(f => ({ ...f, pointsEarned: e.target.value }))}
                  />
                </div>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                A cada <strong>R$ {form.purchaseAmount || "?"}</strong> em compras, o cliente ganha <strong>{form.pointsEarned || "?"} ponto(s)</strong>.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Meta de Resgate (pts) *</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 100"
                    value={form.rewardThreshold}
                    onChange={e => setForm(f => ({ ...f, rewardThreshold: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor da Recompensa (R$) *</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 10.00"
                    value={form.rewardValue}
                    onChange={e => setForm(f => ({ ...f, rewardValue: e.target.value }))}
                  />
                </div>
              </div>
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-600">
                Ao atingir <strong>{form.rewardThreshold || "?"} pontos</strong>, o cliente ganha <strong>R$ {form.rewardValue || "?"}</strong> de desconto.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createRule.isPending} className="gap-2">
                <Plus className="h-4 w-4" />
                {createRule.isPending ? "Criando..." : "Criar Regra"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm Dialog */}
        <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Excluir Regra
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Esta ação é permanente e não pode ser desfeita. Tem certeza que deseja excluir esta regra?
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                onClick={() => deleteConfirm !== null && deleteRule.mutate({ id: deleteConfirm })}
                disabled={deleteRule.isPending}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {deleteRule.isPending ? "Excluindo..." : "Excluir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
