import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Trash2, Copy, Target } from "lucide-react";
import { Link } from "wouter";

export default function FinProductGoals() {

  const [selectedMonth, setSelectedMonth] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7)
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<number | null>(null);

  // Form state
  const [formProductName, setFormProductName] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formTargetQty, setFormTargetQty] = useState("");
  const [formTargetRevenue, setFormTargetRevenue] = useState("");
  const [formIcon, setFormIcon] = useState("🎯");

  const utils = trpc.useUtils();
  const { data: goals = [], isLoading } = trpc.productGoals.listAll.useQuery({ month: selectedMonth });

  // Buscar produtos do INOVE para preview de matching
  const { data: topProducts = [] } = trpc.inove.getTopProducts.useQuery(
    { days: new Date().getDate(), limit: 50 },
    { staleTime: 5 * 60 * 1000 }
  );

  const createMut = trpc.productGoals.create.useMutation({
    onSuccess: () => {
      utils.productGoals.listAll.invalidate();
      utils.productGoals.list.invalidate();
      setShowCreateDialog(false);
      resetForm();
      toast.success("Meta criada com sucesso!");
    },
    onError: (err) => toast.error(`Erro ao criar meta: ${err.message}`),
  });

  const updateMut = trpc.productGoals.update.useMutation({
    onSuccess: () => {
      utils.productGoals.listAll.invalidate();
      utils.productGoals.list.invalidate();
      setEditingGoal(null);
      resetForm();
      toast.success("Meta atualizada!");
    },
    onError: (err) => toast.error(`Erro ao atualizar meta: ${err.message}`),
  });

  const deleteMut = trpc.productGoals.delete.useMutation({
    onSuccess: () => {
      utils.productGoals.listAll.invalidate();
      utils.productGoals.list.invalidate();
      toast.success("Meta removida!");
    },
    onError: (err) => toast.error(`Erro ao remover meta: ${err.message}`),
  });

  const copyMut = trpc.productGoals.copyFromPreviousMonth.useMutation({
    onSuccess: (data) => {
      utils.productGoals.listAll.invalidate();
      utils.productGoals.list.invalidate();
      toast.success(`${data.copied} meta(s) copiada(s) do mês anterior!`);
    },
    onError: (err) => toast.error(`Erro ao copiar metas: ${err.message}`),
  });

  function resetForm() {
    setFormProductName("");
    setFormKeywords("");
    setFormTargetQty("");
    setFormTargetRevenue("");
    setFormIcon("🎯");
  }

  function handleCreate() {
    if (!formProductName || !formKeywords || !formTargetQty) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    createMut.mutate({
      productName: formProductName,
      searchKeywords: formKeywords,
      targetQuantity: parseInt(formTargetQty),
      targetRevenue: formTargetRevenue ? parseFloat(formTargetRevenue) : 0,
      month: selectedMonth,
      icon: formIcon,
    });
  }

  function handleUpdate(id: number) {
    updateMut.mutate({
      id,
      productName: formProductName || undefined,
      searchKeywords: formKeywords || undefined,
      targetQuantity: formTargetQty ? parseInt(formTargetQty) : undefined,
      targetRevenue: formTargetRevenue ? parseFloat(formTargetRevenue) : undefined,
      icon: formIcon || undefined,
    });
  }

  function startEdit(goal: typeof goals[0]) {
    setEditingGoal(goal.id);
    setFormProductName(goal.productName);
    setFormKeywords(goal.searchKeywords || "");
    setFormTargetQty(goal.targetQuantity.toString());
    setFormTargetRevenue(goal.targetRevenue?.toString() || "");
    setFormIcon(goal.icon || "🎯");
  }

  // Preview: quantos produtos do INOVE matcham as keywords
  const matchPreview = useMemo(() => {
    if (!formKeywords) return [];
    const keywords = formKeywords.split(",").map(k => k.trim().toUpperCase());
    return topProducts.filter(p => {
      const nome = p.nome.toUpperCase();
      return keywords.some(kw => nome.includes(kw));
    });
  }, [formKeywords, topProducts]);

  // Calcular realizado para cada meta
  const goalsWithProgress = useMemo(() => {
    return goals.map(goal => {
      const keywords = (goal.searchKeywords || "").split(",").map(k => k.trim().toUpperCase());
      const matched = topProducts.filter(p => {
        const nome = p.nome.toUpperCase();
        return keywords.some(kw => nome.includes(kw));
      });
      const realQty = matched.reduce((sum, p) => sum + p.qtd, 0);
      const realRevenue = matched.reduce((sum, p) => sum + p.total, 0);
      const percentQty = goal.targetQuantity > 0 ? (realQty / goal.targetQuantity) * 100 : 0;
      return { ...goal, realQty, realRevenue, percentQty, matchedProducts: matched };
    });
  }, [goals, topProducts]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/fin/forecast">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-6 w-6 text-purple-600" />
              Metas de Produtos
            </h1>
            <p className="text-muted-foreground text-sm">Configure metas mensais para produtos específicos (Açaí 1,5L, Pote Sorvete, etc)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-40"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyMut.mutate({ targetMonth: selectedMonth })}
            disabled={copyMut.isPending}
          >
            <Copy className="h-4 w-4 mr-1" /> Copiar mês anterior
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetForm}>
                <Plus className="h-4 w-4 mr-1" /> Nova Meta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nova Meta de Produto</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-[auto_1fr] gap-4 items-center">
                  <Label>Ícone</Label>
                  <Input value={formIcon} onChange={(e) => setFormIcon(e.target.value)} placeholder="🍨" className="w-20" />
                </div>
                <div>
                  <Label>Nome do Produto</Label>
                  <Input value={formProductName} onChange={(e) => setFormProductName(e.target.value)} placeholder="Ex: Açaí 1,5L" />
                </div>
                <div>
                  <Label>Palavras-chave (separadas por vírgula)</Label>
                  <Input value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} placeholder="Ex: ACAI,AÇAÍ,AÇAI,1.5,1,5" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Usadas para buscar automaticamente no INOVE. Separe por vírgula.
                  </p>
                </div>
                {matchPreview.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded p-2">
                    <p className="text-xs font-medium text-green-700 mb-1">
                      ✅ {matchPreview.length} produto(s) encontrado(s) no INOVE:
                    </p>
                    <ul className="text-xs text-green-600 space-y-0.5">
                      {matchPreview.slice(0, 5).map((p, i) => (
                        <li key={i}>• {p.nome} ({p.qtd} un, R$ {p.total.toFixed(2)})</li>
                      ))}
                      {matchPreview.length > 5 && <li>... e mais {matchPreview.length - 5}</li>}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Meta (unidades/mês)</Label>
                    <Input type="number" value={formTargetQty} onChange={(e) => setFormTargetQty(e.target.value)} placeholder="100" />
                  </div>
                  <div>
                    <Label>Meta faturamento (R$, opcional)</Label>
                    <Input type="number" value={formTargetRevenue} onChange={(e) => setFormTargetRevenue(e.target.value)} placeholder="5000" />
                  </div>
                </div>
                <Button onClick={handleCreate} disabled={createMut.isPending} className="w-full">
                  {createMut.isPending ? "Criando..." : "Criar Meta"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabela de metas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Metas de {selectedMonth}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : goalsWithProgress.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Target className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">Nenhuma meta cadastrada para {selectedMonth}</p>
              <p className="text-sm text-muted-foreground">Clique em "Nova Meta" ou "Copiar mês anterior" para começar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead className="text-center">Meta (un)</TableHead>
                  <TableHead className="text-center">Realizado</TableHead>
                  <TableHead className="text-center">%</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goalsWithProgress.map((goal) => (
                  <TableRow key={goal.id}>
                    <TableCell className="text-xl">{goal.icon}</TableCell>
                    <TableCell className="font-medium">
                      {editingGoal === goal.id ? (
                        <Input value={formProductName} onChange={(e) => setFormProductName(e.target.value)} className="h-8" />
                      ) : (
                        goal.productName
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                      {editingGoal === goal.id ? (
                        <Input value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} className="h-8" />
                      ) : (
                        goal.searchKeywords
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {editingGoal === goal.id ? (
                        <Input type="number" value={formTargetQty} onChange={(e) => setFormTargetQty(e.target.value)} className="h-8 w-20 mx-auto" />
                      ) : (
                        goal.targetQuantity
                      )}
                    </TableCell>
                    <TableCell className="text-center font-medium">{Math.round(goal.realQty)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              goal.percentQty >= 100 ? "bg-green-500" :
                              goal.percentQty >= 80 ? "bg-yellow-500" : "bg-red-400"
                            }`}
                            style={{ width: `${Math.min(goal.percentQty, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-10">{Math.round(goal.percentQty)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {goal.percentQty >= 100 ? (
                        <Badge className="bg-green-100 text-green-700">Atingida</Badge>
                      ) : goal.percentQty >= 80 ? (
                        <Badge className="bg-yellow-100 text-yellow-700">Quase</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700">Abaixo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingGoal === goal.id ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => handleUpdate(goal.id)}>Salvar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingGoal(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(goal)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteMut.mutate({ id: goal.id })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dica */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4">
          <p className="text-sm text-blue-700">
            <strong>💡 Dica:</strong> As metas cadastradas aqui aparecem automaticamente no Dashboard principal como KPIs com barra de progresso.
            Use palavras-chave amplas para capturar variações do nome do produto no INOVE (ex: "ACAI,AÇAÍ,AÇAI" para Açaí).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
