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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Gift, Plus, Settings, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Points() {
  const [ruleOpen, setRuleOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [ruleForm, setRuleForm] = useState({
    name: "",
    description: "",
    purchaseAmount: "",
    pointsEarned: "",
    rewardThreshold: "",
    rewardValue: "",
  });
  const [addForm, setAddForm] = useState({
    customerId: "",
    type: "earned" as "earned" | "redeemed" | "manual",
    points: "",
    purchaseAmount: "",
    description: "",
  });

  const utils = trpc.useUtils();
  const { data: rules } = trpc.points.getRules.useQuery();
  const { data: customers } = trpc.customers.list.useQuery({});
  const { data: history } = trpc.points.getHistory.useQuery(
    { customerId: parseInt(selectedCustomerId) },
    { enabled: !!selectedCustomerId }
  );

  const createRule = trpc.points.createRule.useMutation({
    onSuccess: () => {
      utils.points.getRules.invalidate();
      toast.success("Regra criada!");
      setRuleOpen(false);
      setRuleForm({ name: "", description: "", purchaseAmount: "", pointsEarned: "", rewardThreshold: "", rewardValue: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const addPoints = trpc.points.addPoints.useMutation({
    onSuccess: () => {
      utils.customers.list.invalidate();
      if (selectedCustomerId) utils.points.getHistory.invalidate({ customerId: parseInt(selectedCustomerId) });
      toast.success("Pontos registrados!");
      setAddOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const typeLabel: Record<string, string> = {
    earned: "Ganhos",
    redeemed: "Resgatados",
    expired: "Expirados",
    manual: "Manual",
  };
  const typeColor: Record<string, string> = {
    earned: "bg-green-100 text-green-700",
    redeemed: "bg-blue-100 text-blue-700",
    expired: "bg-gray-100 text-gray-600",
    manual: "bg-purple-100 text-purple-700",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/dashboard" />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gift className="h-6 w-6 text-primary" />
              Programa de Pontos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure regras e gerencie pontos dos clientes
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRuleOpen(true)} className="gap-2">
              <Settings className="h-4 w-4" />
              Nova Regra
            </Button>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Pontos
            </Button>
          </div>
        </div>

        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules">Regras de Pontos</TabsTrigger>
            <TabsTrigger value="history">Histórico por Cliente</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-4">
            {!rules?.length ? (
              <Card>
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <Star className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">Nenhuma regra configurada ainda.</p>
                  <Button onClick={() => setRuleOpen(true)} variant="outline" className="mt-3 gap-2">
                    <Plus className="h-4 w-4" />
                    Criar primeira regra
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rules.map((r) => (
                  <Card key={r.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        {r.name}
                        <Badge variant={r.active ? "default" : "secondary"}>
                          {r.active ? "Ativa" : "Inativa"}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="text-muted-foreground">{r.description}</p>
                      <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                        <p>
                          A cada{" "}
                          <span className="font-semibold text-primary">
                            R$ {parseFloat(String(r.purchaseAmount)).toFixed(2)}
                          </span>{" "}
                          em compras = <span className="font-semibold">{r.pointsEarned} ponto(s)</span>
                        </p>
                        <p>
                          Ao atingir{" "}
                          <span className="font-semibold text-primary">{r.rewardThreshold} pontos</span>{" "}
                          → ganhe{" "}
                          <span className="font-semibold text-green-600">
                            R$ {parseFloat(String(r.rewardValue)).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-4">
            <div className="max-w-sm">
              <Label>Selecionar Cliente</Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Escolha um cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.fullName} — {c.totalPoints} pts
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCustomerId && (
              <>
                {!history?.length ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Nenhuma transação de pontos encontrada.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {history.map((t) => (
                      <Card key={t.id}>
                        <CardContent className="p-3 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor[t.type]}`}>
                                {typeLabel[t.type]}
                              </span>
                              <span className="text-sm">{t.description}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(t.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          <span className={`font-bold text-base ${t.type === "earned" || t.type === "manual" ? "text-green-600" : "text-red-500"}`}>
                            {t.type === "earned" || t.type === "manual" ? "+" : "-"}{t.points} pts
                          </span>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Nova Regra Dialog */}
      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Regra de Pontos</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createRule.mutate({
                name: ruleForm.name,
                description: ruleForm.description,
                purchaseAmount: parseFloat(ruleForm.purchaseAmount),
                pointsEarned: parseInt(ruleForm.pointsEarned),
                rewardThreshold: parseInt(ruleForm.rewardThreshold),
                rewardValue: parseFloat(ruleForm.rewardValue),
              });
            }}
            className="space-y-3 mt-2"
          >
            <div>
              <Label>Nome da Regra *</Label>
              <Input value={ruleForm.name} onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={ruleForm.description} onChange={(e) => setRuleForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor da Compra (R$) *</Label>
                <Input type="number" step="0.01" value={ruleForm.purchaseAmount} onChange={(e) => setRuleForm((f) => ({ ...f, purchaseAmount: e.target.value }))} required />
              </div>
              <div>
                <Label>Pontos Ganhos *</Label>
                <Input type="number" value={ruleForm.pointsEarned} onChange={(e) => setRuleForm((f) => ({ ...f, pointsEarned: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pontos para Recompensa *</Label>
                <Input type="number" value={ruleForm.rewardThreshold} onChange={(e) => setRuleForm((f) => ({ ...f, rewardThreshold: e.target.value }))} required />
              </div>
              <div>
                <Label>Valor da Recompensa (R$) *</Label>
                <Input type="number" step="0.01" value={ruleForm.rewardValue} onChange={(e) => setRuleForm((f) => ({ ...f, rewardValue: e.target.value }))} required />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setRuleOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createRule.isPending}>Criar Regra</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adicionar Pontos Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar / Resgatar Pontos</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addPoints.mutate({
                customerId: parseInt(addForm.customerId),
                type: addForm.type,
                points: parseInt(addForm.points),
                purchaseAmount: addForm.purchaseAmount ? parseFloat(addForm.purchaseAmount) : undefined,
                description: addForm.description,
              });
            }}
            className="space-y-3 mt-2"
          >
            <div>
              <Label>Cliente *</Label>
              <Select value={addForm.customerId} onValueChange={(v) => setAddForm((f) => ({ ...f, customerId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.fullName} — {c.totalPoints} pts
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={addForm.type} onValueChange={(v: any) => setAddForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="earned">Ganhos</SelectItem>
                    <SelectItem value="redeemed">Resgatados</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantidade de Pontos *</Label>
                <Input type="number" value={addForm.points} onChange={(e) => setAddForm((f) => ({ ...f, points: e.target.value }))} required />
              </div>
            </div>
            <div>
              <Label>Valor da Compra (R$)</Label>
              <Input type="number" step="0.01" value={addForm.purchaseAmount} onChange={(e) => setAddForm((f) => ({ ...f, purchaseAmount: e.target.value }))} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex: Compra no balcão" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={addPoints.isPending}>Registrar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
