import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Package, Plus, Minus, History, AlertTriangle, PackagePlus, RefreshCw, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function BoxesControl() {
  const utils = trpc.useUtils();
  const { data: boxes = [], isLoading } = trpc.boxStock.list.useQuery();
  const { data: movements = [] } = trpc.boxStock.getMovements.useQuery({ limit: 30 });
  const { data: monthlyData = [] } = trpc.boxStock.getMonthlyConsumption.useQuery({ months: 6 });
  const syncCosts = trpc.boxStock.syncCosts.useMutation({
    onSuccess: (res) => { utils.boxStock.list.invalidate(); toast.success(res.message); },
    onError: (e: any) => toast.error(e.message),
  });
  const addEntry = trpc.boxStock.addEntry.useMutation({
    onSuccess: () => { utils.boxStock.list.invalidate(); utils.boxStock.getMovements.invalidate(); toast.success("Entrada registrada!"); },
    onError: (e) => toast.error(e.message),
  });
  const addExit = trpc.boxStock.addExit.useMutation({
    onSuccess: () => { utils.boxStock.list.invalidate(); utils.boxStock.getMovements.invalidate(); toast.success("Saída registrada!"); },
    onError: (e) => toast.error(e.message),
  });
  const createBox = trpc.boxStock.create.useMutation({
    onSuccess: () => { utils.boxStock.list.invalidate(); toast.success("Caixa cadastrada!"); setShowAdd(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteBox = trpc.boxStock.delete.useMutation({
    onSuccess: () => { utils.boxStock.list.invalidate(); toast.success("Caixa removida!"); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newMin, setNewMin] = useState("2");
  const [newInitial, setNewInitial] = useState("0");
  const [entryQty, setEntryQty] = useState<Record<number, number>>({});
  const [exitQty, setExitQty] = useState<Record<number, number>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const totalCaixas = boxes.reduce((s, b) => s + b.currentStock, 0);
  const alertas = boxes.filter(b => b.currentStock <= b.minStock);

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
        <BackButton to="/dashboard" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6 text-blue-600" />
              Controle de Caixas 10L
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Entrada e saída de caixas de sorvete 10 litros
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowHistory(!showHistory)}>
              <History className="w-4 h-4 mr-1" /> Histórico
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowChart(!showChart)}>
              <BarChart2 className="w-4 h-4 mr-1" /> Consumo
            </Button>
            <Button size="sm" variant="outline" onClick={() => syncCosts.mutate()} disabled={syncCosts.isPending}>
              <RefreshCw className={`w-4 h-4 mr-1 ${syncCosts.isPending ? "animate-spin" : ""}`} /> Custos
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <PackagePlus className="w-4 h-4 mr-1" /> Nova Caixa
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total em Estoque</p>
              <p className="text-2xl font-bold text-blue-600">{totalCaixas}</p>
              <p className="text-xs text-muted-foreground">caixas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Sabores</p>
              <p className="text-2xl font-bold">{boxes.length}</p>
              <p className="text-xs text-muted-foreground">cadastrados</p>
            </CardContent>
          </Card>
          <Card className={alertas.length > 0 ? "border-red-300 bg-red-50/50" : ""}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Estoque Baixo</p>
              <p className={`text-2xl font-bold ${alertas.length > 0 ? "text-red-500" : "text-green-600"}`}>{alertas.length}</p>
              <p className="text-xs text-muted-foreground">alertas</p>
            </CardContent>
          </Card>
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm">
              <strong>Atenção:</strong> {alertas.map(a => a.name).join(", ")} — estoque abaixo do mínimo!
            </span>
          </div>
        )}

        {/* Lista de Caixas */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : boxes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma caixa cadastrada.</p>
              <p className="text-sm mt-1">Clique em "Nova Caixa" para começar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {boxes.map(box => (
              <Card key={box.id} className={box.currentStock <= box.minStock ? "border-red-300" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-sm">{box.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        Custo: {box.costPrice ? fmt(Number(box.costPrice)) : "—"} | Mín: {box.minStock}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-bold ${box.currentStock <= box.minStock ? "text-red-500" : "text-green-600"}`}>
                        {box.currentStock}
                      </span>
                      <p className="text-xs text-muted-foreground">cx</p>
                    </div>
                  </div>

                  {/* Botões de entrada/saída rápida */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        type="number"
                        min={1}
                        value={entryQty[box.id] || ""}
                        onChange={e => setEntryQty(prev => ({ ...prev, [box.id]: parseInt(e.target.value) || 0 }))}
                        placeholder="Qtd"
                        className="h-8 w-16 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-green-600 border-green-300 hover:bg-green-50"
                        disabled={!entryQty[box.id] || entryQty[box.id] < 1}
                        onClick={() => {
                          addEntry.mutate({ boxId: box.id, quantity: entryQty[box.id] });
                          setEntryQty(prev => ({ ...prev, [box.id]: 0 }));
                        }}
                      >
                        <Plus className="w-3 h-3 mr-0.5" /> Entrada
                      </Button>
                    </div>
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        type="number"
                        min={1}
                        max={box.currentStock}
                        value={exitQty[box.id] || ""}
                        onChange={e => setExitQty(prev => ({ ...prev, [box.id]: parseInt(e.target.value) || 0 }))}
                        placeholder="Qtd"
                        className="h-8 w-16 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-600 border-red-300 hover:bg-red-50"
                        disabled={!exitQty[box.id] || exitQty[box.id] < 1 || box.currentStock === 0}
                        onClick={() => {
                          addExit.mutate({ boxId: box.id, quantity: exitQty[box.id] });
                          setExitQty(prev => ({ ...prev, [box.id]: 0 }));
                        }}
                      >
                        <Minus className="w-3 h-3 mr-0.5" /> Saída
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Gráfico de Consumo Mensal */}
        {showChart && monthlyData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Consumo Mensal de Caixas (Saídas)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={(() => {
                  const months = Array.from(new Set(monthlyData.map((d: any) => d.month))).sort();
                  return months.map(m => {
                    const entry: any = { month: m };
                    boxes.forEach(b => {
                      const found = monthlyData.find((d: any) => d.boxId === b.id && d.month === m);
                      entry[b.name] = found ? found.totalQty : 0;
                    });
                    return entry;
                  });
                })()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {boxes.slice(0, 8).map((b, i) => (
                    <Bar key={b.id} dataKey={b.name} fill={["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"][i % 8]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Histórico de Movimentações */}
        {showHistory && movements.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Últimas Movimentações</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3">Data</th>
                      <th className="text-left py-2 px-3">Caixa</th>
                      <th className="text-center py-2 px-3">Tipo</th>
                      <th className="text-right py-2 px-3">Qtd</th>
                      <th className="text-right py-2 px-3">Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => {
                      const box = boxes.find(b => b.id === m.boxId);
                      return (
                        <tr key={m.id} className="border-b">
                          <td className="py-2 px-3">{new Date(m.createdAt).toLocaleDateString("pt-BR")}</td>
                          <td className="py-2 px-3 font-medium">{box?.name ?? `#${m.boxId}`}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant={m.type === "entrada" ? "default" : "destructive"} className="text-xs">
                              {m.type === "entrada" ? "↑ Entrada" : "↓ Saída"}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{m.quantity}</td>
                          <td className="py-2 px-3 text-right font-mono">{m.previousStock} → {m.newStock}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dialog Nova Caixa */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar Nova Caixa 10L</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {/* Busca INOVE */}
              <div>
                <label className="text-sm font-medium">Buscar no INOVE</label>
                <div className="flex gap-2 mt-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar produto 10L no INOVE..."
                      value={inoveSearch}
                      onChange={e => { setInoveSearch(e.target.value); setShowInove(true); }}
                      onFocus={() => setShowInove(true)}
                      className="pl-8"
                    />
                  </div>
                </div>
                {showInove && inoveProducts?.items && inoveProducts.items.length > 0 && (
                  <div className="mt-1 max-h-[150px] overflow-y-auto border rounded-md bg-background">
                    {inoveProducts.items.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-0 flex justify-between items-center"
                        onClick={() => {
                          setNewName(p.nome);
                          setNewCost(p.preco_custo?.toFixed(2) || "0");
                          setShowInove(false);
                        }}
                      >
                        <span className="font-medium truncate">{p.nome}</span>
                        <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                          Custo: {fmt(p.preco_custo || 0)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <hr className="border-dashed" />
              <div>
                <label className="text-sm font-medium">Nome do Sabor *</label>
                <Input placeholder="Ex: Pistache 10LT" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Custo (R$)</label>
                  <Input type="number" step="0.01" placeholder="0.00" value={newCost} onChange={e => setNewCost(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Estoque Mín.</label>
                  <Input type="number" min={0} value={newMin} onChange={e => setNewMin(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Estoque Inicial</label>
                  <Input type="number" min={0} value={newInitial} onChange={e => setNewInitial(e.target.value)} />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!newName.trim()}
                onClick={() => {
                  createBox.mutate({
                    name: newName.trim(),
                    costPrice: newCost || "0",
                    minStock: parseInt(newMin) || 0,
                    currentStock: parseInt(newInitial) || 0,
                  });
                  setNewName(""); setNewCost(""); setNewMin("2"); setNewInitial("0");
                }}
              >
                Cadastrar Caixa
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
import { Search } from "lucide-react";
  const [inoveSearch, setInoveSearch] = useState("10");
  const [showInove, setShowInove] = useState(false);
  const { data: inoveProducts } = trpc.inove.getStock.useQuery(
    { search: inoveSearch, page: 1, pageSize: 20 },
    { enabled: showInove && inoveSearch.length >= 2 }
  );
