import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ArrowLeft, Plus, Pencil, Trash2, Copy, Target, Search } from "lucide-react";
import { Link } from "wouter";

export default function FinProductGoals() {

  const [selectedMonth, setSelectedMonth] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7)
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<number | null>(null);

  // Form state
  const [formProductName, setFormProductName] = useState("");
  const [formTargetQty, setFormTargetQty] = useState("");
  const [formTargetRevenue, setFormTargetRevenue] = useState("");
  const [formIcon, setFormIcon] = useState("🎯");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const utils = trpc.useUtils();
  const { data: goals = [], isLoading } = trpc.productGoals.listAll.useQuery({ month: selectedMonth });

  // Buscar produtos do INOVE (lista completa para seleção)
  const { data: topProducts = [] } = trpc.inove.getTopProducts.useQuery(
    { days: new Date().getDate(), limit: 200 },
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
    setFormTargetQty("");
    setFormTargetRevenue("");
    setFormIcon("🎯");
    setSelectedProducts([]);
    setProductSearch("");
  }

  // Gerar keywords a partir dos produtos selecionados (usa | como separador para evitar conflito com nomes como "1,5L")
  function getKeywordsFromSelected(): string {
    return selectedProducts.join("|");
  }

  function handleCreate() {
    if (!formProductName || selectedProducts.length === 0 || !formTargetQty) {
      toast.error("Preencha o nome, selecione pelo menos 1 produto e defina a meta");
      return;
    }
    createMut.mutate({
      productName: formProductName,
      searchKeywords: getKeywordsFromSelected(),
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
      searchKeywords: selectedProducts.length > 0 ? getKeywordsFromSelected() : undefined,
      targetQuantity: formTargetQty ? parseInt(formTargetQty) : undefined,
      targetRevenue: formTargetRevenue ? parseFloat(formTargetRevenue) : undefined,
      icon: formIcon || undefined,
    });
  }

  function startEdit(goal: typeof goals[0]) {
    setEditingGoal(goal.id);
    setFormProductName(goal.productName);
    setFormTargetQty(goal.targetQuantity.toString());
    setFormTargetRevenue(goal.targetRevenue?.toString() || "");
    setFormIcon(goal.icon || "🎯");
    // Parsear keywords existentes para pré-selecionar produtos (suporta | e , como separador)
    const sep = (goal.searchKeywords || "").includes("|") ? "|" : ",";
    const existingKeywords = (goal.searchKeywords || "").split(sep).map(k => k.trim());
    setSelectedProducts(existingKeywords.filter(k => k.length > 0));
    setProductSearch("");
  }

  function toggleProduct(productName: string) {
    setSelectedProducts(prev =>
      prev.includes(productName)
        ? prev.filter(p => p !== productName)
        : [...prev, productName]
    );
  }

  // Filtrar produtos pela busca
  const filteredProducts = useMemo(() => {
    if (!productSearch) return topProducts;
    const search = productSearch.toUpperCase();
    return topProducts.filter(p => p.nome.toUpperCase().includes(search));
  }, [productSearch, topProducts]);

  // Calcular realizado para cada meta
  const goalsWithProgress = useMemo(() => {
    return goals.map(goal => {
      const sep = (goal.searchKeywords || "").includes("|") ? "|" : ",";
      const keywords = (goal.searchKeywords || "").split(sep).map(k => k.trim().toUpperCase());
      const matched = topProducts.filter(p => {
        const nome = p.nome.toUpperCase();
        return keywords.some(kw => kw.length > 0 && nome === kw);
      });
      const realQty = matched.reduce((sum, p) => sum + p.qtd, 0);
      const realRevenue = matched.reduce((sum, p) => sum + p.total, 0);
      const percentQty = goal.targetQuantity > 0 ? (realQty / goal.targetQuantity) * 100 : 0;
      return { ...goal, realQty, realRevenue, percentQty, matchedProducts: matched };
    });
  }, [goals, topProducts]);

  // Componente de seleção de produtos com checkboxes
  function ProductSelector() {
    return (
      <div className="space-y-3">
        <Label>Selecione os produtos do INOVE</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="pl-9"
          />
        </div>

        {/* Produtos selecionados */}
        {selectedProducts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedProducts.map((name) => (
              <Badge
                key={name}
                variant="secondary"
                className="cursor-pointer hover:bg-destructive/20 transition-colors"
                onClick={() => toggleProduct(name)}
              >
                {name} ✕
              </Badge>
            ))}
          </div>
        )}

        {/* Lista de produtos com checkboxes */}
        <div className="border rounded-md max-h-[250px] overflow-y-auto">
          {filteredProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {topProducts.length === 0 ? "Nenhum produto encontrado no INOVE" : "Nenhum resultado para a busca"}
            </p>
          ) : (
            <div className="divide-y">
              {filteredProducts.map((product, idx) => {
                const isSelected = selectedProducts.includes(product.nome);
                return (
                  <label
                    key={idx}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${
                      isSelected ? "bg-primary/5" : ""
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleProduct(product.nome)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{product.nome}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs text-muted-foreground">{product.qtd} un</span>
                      <span className="text-xs text-muted-foreground ml-2">R$ {product.total.toFixed(0)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedProducts.length} produto(s) selecionado(s) — a meta será calculada somando as vendas de todos os itens marcados.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
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
        <div className="flex items-center gap-2 flex-wrap">
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
          <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Nova Meta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nova Meta de Produto</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-[auto_1fr] gap-4 items-center">
                  <Label>Ícone</Label>
                  <Input value={formIcon} onChange={(e) => setFormIcon(e.target.value)} placeholder="🍨" className="w-20" />
                </div>
                <div>
                  <Label>Nome da Meta</Label>
                  <Input value={formProductName} onChange={(e) => setFormProductName(e.target.value)} placeholder="Ex: Açaí 1,5L" />
                </div>

                {/* Seleção de produtos com checkboxes */}
                <ProductSelector />

                <div>
                  <Label>Meta (unidades/mês)</Label>
                  <Input type="number" value={formTargetQty} onChange={(e) => setFormTargetQty(e.target.value)} placeholder="100" />
                  <p className="text-xs text-muted-foreground mt-1">A meta de faturamento geral é a mesma configurada no Forecast.</p>
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
                  <TableHead>Itens Selecionados</TableHead>
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
                    <TableCell className="font-medium">{goal.productName}</TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {(goal.searchKeywords || "").split(",").filter(k => k.trim()).slice(0, 3).map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                            {kw.trim()}
                          </Badge>
                        ))}
                        {(goal.searchKeywords || "").split(",").filter(k => k.trim()).length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            +{(goal.searchKeywords || "").split(",").filter(k => k.trim()).length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{goal.targetQuantity}</TableCell>
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
                      <div className="flex gap-1 justify-end">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(goal)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Editar Meta: {goal.productName}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-[auto_1fr] gap-4 items-center">
                                <Label>Ícone</Label>
                                <Input value={formIcon} onChange={(e) => setFormIcon(e.target.value)} className="w-20" />
                              </div>
                              <div>
                                <Label>Nome da Meta</Label>
                                <Input value={formProductName} onChange={(e) => setFormProductName(e.target.value)} />
                              </div>

                              {/* Seleção de produtos com checkboxes */}
                              <ProductSelector />

                              <div>
                                <Label>Meta (unidades/mês)</Label>
                                <Input type="number" value={formTargetQty} onChange={(e) => setFormTargetQty(e.target.value)} />
                                <p className="text-xs text-muted-foreground mt-1">A meta de faturamento geral é a mesma configurada no Forecast.</p>
                              </div>
                              <Button onClick={() => handleUpdate(goal.id)} disabled={updateMut.isPending} className="w-full">
                                {updateMut.isPending ? "Salvando..." : "Salvar Alterações"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteMut.mutate({ id: goal.id })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
            <strong>💡 Dica:</strong> Marque os produtos que deseja incluir na meta usando os checkboxes.
            A meta será calculada somando as vendas de todos os itens selecionados. As metas aparecem automaticamente no Dashboard.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
