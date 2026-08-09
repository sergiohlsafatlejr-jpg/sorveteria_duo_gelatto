import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Package, ShoppingCart, Store, ClipboardList, BarChart3, Plus, Search,
  AlertTriangle, ArrowDown, ArrowUp, Minus, Edit, Trash2, Check, X,
  TrendingDown, RefreshCw, FileText, Phone, ChevronRight,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  limpeza: { label: "Limpeza", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Package },
  guloseimas: { label: "Guloseimas", color: "bg-pink-500/10 text-pink-600 border-pink-500/20", icon: Package },
  caldas: { label: "Caldas", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Package },
  descartaveis: { label: "Descartáveis", color: "bg-slate-500/10 text-slate-600 border-slate-500/20", icon: Package },
  embalagens: { label: "Embalagens", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: Package },
  manutencao: { label: "Manutenção", color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: Package },
  insumos: { label: "Insumos", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: Package },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Rascunho", color: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
  requested: { label: "Solicitado", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  approved: { label: "Aprovado", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  rejected: { label: "Rejeitado", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  purchased: { label: "Comprado", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  delivered: { label: "Entregue", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
};

function formatCurrency(value: number | string | null | undefined) {
  if (value == null) return "R$ 0,00";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function formatDate(dateStr: string | Date | null | undefined) {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dateStr));
}

export default function Purchases() {
  const utils = trpc.useContext();
  const [activeTab, setActiveTab] = useState("resumo");

  // Dashboard Data
  const { data: dashboard } = trpc.purchases.dashboard.useQuery(undefined, { enabled: activeTab === 'resumo' });
  
  // Items Data
  const [itemSearch, setItemSearch] = useState("");
  const [itemCategory, setItemCategory] = useState("all");
  const { data: items = [] } = trpc.purchases.items.list.useQuery();
  const { data: lowStockItems = [] } = trpc.purchases.items.lowStock.useQuery();
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(itemSearch.toLowerCase()) && 
    (itemCategory === "all" || item.category === itemCategory)
  );

  // Orders Data
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const { data: orders = [] } = trpc.purchases.orders.list.useQuery();
  const filteredOrders = orders.filter(o => orderStatusFilter === "all" || o.status === orderStatusFilter);

  // Stock Movements Data
  const { data: movements = [] } = trpc.purchases.stock.movements.useQuery();

  // Suppliers Data
  const { data: suppliers = [] } = trpc.purchases.suppliers.list.useQuery();

  // Templates Data
  const { data: templates = [] } = trpc.purchases.templates.list.useQuery();

  // --- Mutations ---
  const registerConsumptionMutation = trpc.purchases.stock.registerConsumption.useMutation({
    onSuccess: () => {
      toast.success("Baixa registrada com sucesso!");
      utils.purchases.invalidate();
    },
    onError: (e) => toast.error(`Erro ao registrar baixa: ${e.message}`)
  });

  const createItemMutation = trpc.purchases.items.create.useMutation({
    onSuccess: () => {
      toast.success("Item criado com sucesso!");
      utils.purchases.invalidate();
    },
    onError: (e) => toast.error(`Erro ao criar item: ${e.message}`)
  });

  const createSupplierMutation = trpc.purchases.suppliers.create.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor criado com sucesso!");
      utils.purchases.invalidate();
    },
    onError: (e) => toast.error(`Erro ao criar fornecedor: ${e.message}`)
  });

  const createOrderMutation = trpc.purchases.orders.create.useMutation({
    onSuccess: () => {
      toast.success("Pedido criado com sucesso!");
      utils.purchases.invalidate();
    },
    onError: (e) => toast.error(`Erro ao criar pedido: ${e.message}`)
  });

  const orderMutationOpts = {
    onSuccess: () => {
      toast.success("Status do pedido atualizado!");
      utils.purchases.invalidate();
    },
    onError: (e: any) => toast.error(`Erro ao atualizar pedido: ${e.message}`)
  };
  const requestOrderMutation = trpc.purchases.orders.request.useMutation(orderMutationOpts);
  const approveOrderMutation = trpc.purchases.orders.approve.useMutation(orderMutationOpts);
  const rejectOrderMutation = trpc.purchases.orders.reject.useMutation(orderMutationOpts);
  const markPurchasedMutation = trpc.purchases.orders.markPurchased.useMutation(orderMutationOpts);
  const deliverOrderMutation = trpc.purchases.orders.deliver.useMutation(orderMutationOpts);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-6 max-w-7xl mx-auto w-full">
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-6 mb-8 h-auto p-1 bg-slate-100 dark:bg-slate-800">
            <TabsTrigger value="resumo" className="py-2"><BarChart3 className="w-4 h-4 mr-2"/> Resumo</TabsTrigger>
            <TabsTrigger value="almoxarifado" className="py-2"><Package className="w-4 h-4 mr-2"/> Almoxarifado</TabsTrigger>
            <TabsTrigger value="pedidos" className="py-2"><ShoppingCart className="w-4 h-4 mr-2"/> Pedidos</TabsTrigger>
            <TabsTrigger value="baixas" className="py-2"><TrendingDown className="w-4 h-4 mr-2"/> Baixas</TabsTrigger>
            <TabsTrigger value="fornecedores" className="py-2"><Store className="w-4 h-4 mr-2"/> Fornecedores</TabsTrigger>
            <TabsTrigger value="templates" className="py-2"><ClipboardList className="w-4 h-4 mr-2"/> Templates</TabsTrigger>
          </TabsList>

          {/* TAB: RESUMO */}
          <TabsContent value="resumo" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Itens em Falta</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{dashboard?.lowStockItems || 0}</div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-yellow-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Pedidos Pendentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{dashboard?.pendingOrders || 0}</div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Gasto do Mês</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(dashboard?.monthlySpend?.reduce((s: number, r: any) => s + Number(r.total || 0), 0) || 0)}</div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Total de Itens</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{items.length}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><AlertTriangle className="w-5 h-5 mr-2 text-yellow-500"/> Itens com Estoque Baixo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="px-4 py-3">Nome</th>
                          <th className="px-4 py-3">Categoria</th>
                          <th className="px-4 py-3 text-right">Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStockItems?.map((item: any) => (
                          <tr key={item.id} className="border-b">
                            <td className="px-4 py-3 font-medium">{item.name}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={CATEGORY_LABELS[item.category]?.color}>
                                {CATEGORY_LABELS[item.category]?.label || item.category}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-red-600 font-bold">{item.currentStock}</span>
                              <span className="text-slate-500 ml-1 text-xs">/ {item.minStock} {item.unit}</span>
                            </td>
                          </tr>
                        ))}
                        {(!lowStockItems || lowStockItems.length === 0) && (
                          <tr><td colSpan={3} className="text-center py-4 text-slate-500">Nenhum item em falta.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><RefreshCw className="w-5 h-5 mr-2 text-blue-500"/> Últimas Movimentações</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {dashboard?.recentMovements?.map((mov: any) => (
                      <div key={mov.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-800">
                            {mov.type === 'in' && <ArrowDown className="w-4 h-4 text-green-500"/>}
                            {mov.type === 'consumption' && <ArrowUp className="w-4 h-4 text-red-500"/>}
                            {mov.type === 'loss' && <AlertTriangle className="w-4 h-4 text-yellow-500"/>}
                            {mov.type === 'adjustment' && <RefreshCw className="w-4 h-4 text-blue-500"/>}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{mov.item?.name || 'Item desconhecido'}</p>
                            <p className="text-xs text-slate-500">{mov.reason || 'Sem motivo'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold text-sm ${mov.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                            {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                          </p>
                          <p className="text-xs text-slate-400">{formatDate(mov.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB: ALMOXARIFADO */}
          <TabsContent value="almoxarifado" className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex w-full sm:w-auto space-x-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                  <Input 
                    placeholder="Buscar itens..." 
                    className="pl-9" 
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                </div>
                <Select value={itemCategory} onValueChange={setItemCategory}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-2"/> Novo Item</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo Item Operacional</DialogTitle>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    createItemMutation.mutate({
                      name: formData.get('name') as string,
                      category: formData.get('category') as any,
                      unit: formData.get('unit') as string,
                      minStock: String(formData.get('minStock') || '0'),
                      currentStock: String(formData.get('currentStock') || '0'),
                      referencePrice: String(formData.get('referencePrice') || '0'),
                    });
                  }}>
                    <div className="space-y-2">
                      <Label>Nome do Item</Label>
                      <Input name="name" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Categoria</Label>
                        <Select name="category" defaultValue="limpeza">
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Unidade de Medida</Label>
                        <Select name="unit" defaultValue="un">
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="un">Unidade (un)</SelectItem>
                            <SelectItem value="kg">Quilo (kg)</SelectItem>
                            <SelectItem value="l">Litro (l)</SelectItem>
                            <SelectItem value="cx">Caixa (cx)</SelectItem>
                            <SelectItem value="pct">Pacote (pct)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Estoque Mín.</Label>
                        <Input type="number" step="0.01" name="minStock" required />
                      </div>
                      <div className="space-y-2">
                        <Label>Estoque Atual</Label>
                        <Input type="number" step="0.01" name="currentStock" defaultValue={0} />
                      </div>
                      <div className="space-y-2">
                        <Label>Preço Ref. (R$)</Label>
                        <Input type="number" step="0.01" name="referencePrice" defaultValue={0} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createItemMutation.isPending}>Salvar</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {filteredItems.map(item => (
                <Card key={item.id} className="overflow-hidden">
                  <div className={`h-1 w-full ${Number(item.currentStock) <= Number(item.minStock) ? 'bg-red-500' : Number(item.currentStock) <= Number(item.minStock) * 2 ? 'bg-yellow-400' : 'bg-green-500'}`} />
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <Badge variant="outline" className={CATEGORY_LABELS[item.category]?.color}>
                        {CATEGORY_LABELS[item.category]?.label || item.category}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-end mb-4">
                      <div>
                        <p className="text-sm text-slate-500 mb-1">Estoque</p>
                        <div className="flex items-baseline space-x-1">
                          <span className={`text-2xl font-bold ${item.currentStock <= item.minStock ? 'text-red-600' : ''}`}>
                            {item.currentStock}
                          </span>
                          <span className="text-sm text-slate-500">/ {item.minStock} {item.unit}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Ref.</p>
                        <p className="font-medium">{formatCurrency(item.referencePrice)}</p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="flex-1" size="sm"><Minus className="w-3 h-3 mr-2"/> Baixa</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Registrar Baixa - {item.name}</DialogTitle>
                          </DialogHeader>
                          <form className="space-y-4" onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            registerConsumptionMutation.mutate({
                              itemId: item.id,
                              quantity: Number(formData.get('quantity')),
                              type: formData.get('type') as 'consumption' | 'loss',
                              reason: formData.get('reason') as string,
                            });
                          }}>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Quantidade ({item.unit})</Label>
                                <Input type="number" step="0.01" name="quantity" max={item.currentStock} required />
                              </div>
                              <div className="space-y-2">
                                <Label>Tipo</Label>
                                <Select name="type" defaultValue="consumption">
                                  <SelectTrigger><SelectValue/></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="consumption">Consumo</SelectItem>
                                    <SelectItem value="loss">Perda/Descarte</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Motivo / Observação</Label>
                              <Input name="reason" placeholder="Ex: Uso diário, Vencido..." />
                            </div>
                            <DialogFooter>
                              <Button type="submit" disabled={registerConsumptionMutation.isPending}>Confirmar Baixa</Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500"><Edit className="w-4 h-4"/></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* TAB: PEDIDOS */}
          <TabsContent value="pedidos" className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex space-x-2 overflow-x-auto pb-2">
                <Button variant={orderStatusFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setOrderStatusFilter("all")}>Todos</Button>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <Button key={k} variant={orderStatusFilter === k ? "default" : "outline"} size="sm" onClick={() => setOrderStatusFilter(k)}>
                    {v.label}
                  </Button>
                ))}
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-2"/> Novo Pedido</Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Novo Pedido de Compra</DialogTitle>
                  </DialogHeader>
                  <div className="p-4 border rounded-md bg-slate-50 dark:bg-slate-900 text-center">
                     <p className="text-slate-500 mb-4">Funcionalidade de criação detalhada em desenvolvimento.</p>
                     <Button type="button" onClick={() => {
                        createOrderMutation.mutate({
                          supplierId: suppliers[0]?.id || 1, // fallback
                          notes: "Pedido gerado via sistema",
                          items: [
                             { itemId: items[0]?.id || 1, quantity: 10, estimatedUnitPrice: 50.00, unit: 'un' }
                          ]
                        });
                     }}>Criar Pedido de Teste</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800 border-b">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Fornecedor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3 text-right">Total Est.</th>
                      <th className="px-4 py-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order: any) => (
                      <tr key={order.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="px-4 py-3 font-medium">{order.code}</td>
                        <td className="px-4 py-3">{order.supplier?.name || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={STATUS_LABELS[order.status]?.color || ''}>
                            {STATUS_LABELS[order.status]?.label || order.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{formatDate(order.createdAt)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(order.totalEstimated)}</td>
                        <td className="px-4 py-3 text-center">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">Ver Detalhes <ChevronRight className="w-4 h-4 ml-1"/></Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle className="flex justify-between items-center pr-6">
                                  <span>Pedido {order.code}</span>
                                  <Badge variant="outline" className={STATUS_LABELS[order.status]?.color || ''}>{STATUS_LABELS[order.status]?.label}</Badge>
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <p className="text-slate-500">Fornecedor</p>
                                    <p className="font-medium">{order.supplier?.name || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500">Data de Criação</p>
                                    <p className="font-medium">{formatDate(order.createdAt)}</p>
                                  </div>
                                </div>
                                <div>
                                  <h4 className="font-medium mb-2 border-b pb-1">Itens do Pedido</h4>
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-slate-500">
                                        <th className="text-left font-normal py-1">Item</th>
                                        <th className="text-right font-normal py-1">Qtd</th>
                                        <th className="text-right font-normal py-1">Preço Est.</th>
                                        <th className="text-right font-normal py-1">Subtotal</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {/* Simplified for demo, assume items are populated */}
                                      <tr><td colSpan={4} className="py-2 text-center text-slate-500 italic">Itens carregados aqui...</td></tr>
                                    </tbody>
                                    <tfoot>
                                      <tr className="font-bold border-t">
                                        <td colSpan={3} className="text-right py-2">Total Estimado:</td>
                                        <td className="text-right py-2">{formatCurrency(order.totalEstimated)}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                              <DialogFooter className="flex space-x-2">
                                {order.status === 'draft' && (
                                  <Button onClick={() => requestOrderMutation.mutate({ id: order.id })}>
                                    Solicitar Aprovação
                                  </Button>
                                )}
                                {order.status === 'requested' && (
                                  <>
                                    <Button variant="destructive" onClick={() => rejectOrderMutation.mutate({ id: order.id, reason: 'Rejeitado pelo gestor' })}>Rejeitar</Button>
                                    <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approveOrderMutation.mutate({ id: order.id })}>Aprovar</Button>
                                  </>
                                )}
                                {order.status === 'approved' && (
                                  <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => markPurchasedMutation.mutate({ id: order.id, items: [] })}>
                                    Marcar como Comprado
                                  </Button>
                                )}
                                {order.status === 'purchased' && (
                                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => deliverOrderMutation.mutate({ id: order.id, items: [] })}>
                                    Confirmar Entrega
                                  </Button>
                                )}
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </td>
                      </tr>
                    ))}
                    {filteredOrders.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-500">Nenhum pedido encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* TAB: BAIXAS */}
          <TabsContent value="baixas" className="space-y-6">
            <Card className="bg-slate-50 dark:bg-slate-900 border-dashed">
              <CardContent className="pt-6">
                <form className="flex flex-col md:flex-row gap-4 items-end" onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  registerConsumptionMutation.mutate({
                    itemId: Number(formData.get('itemId')),
                    quantity: Number(formData.get('quantity')),
                    type: formData.get('type') as 'consumption' | 'loss',
                    reason: formData.get('reason') as string,
                  });
                  (e.target as HTMLFormElement).reset();
                }}>
                  <div className="space-y-2 flex-1 w-full">
                    <Label>Item</Label>
                    <Select name="itemId" required>
                      <SelectTrigger><SelectValue placeholder="Selecione um item..."/></SelectTrigger>
                      <SelectContent>
                        {items.map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name} (Est: {i.currentStock} {i.unit})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 w-full md:w-32">
                    <Label>Quantidade</Label>
                    <Input type="number" step="0.01" name="quantity" required />
                  </div>
                  <div className="space-y-2 w-full md:w-48">
                    <Label>Tipo</Label>
                    <Select name="type" defaultValue="consumption">
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consumption">Consumo</SelectItem>
                        <SelectItem value="loss">Perda/Descarte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 flex-1 w-full">
                    <Label>Motivo</Label>
                    <Input name="reason" placeholder="Opcional..." />
                  </div>
                  <Button type="submit" disabled={registerConsumptionMutation.isPending} className="w-full md:w-auto"><Minus className="w-4 h-4 mr-2"/> Registrar Baixa</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Histórico de Baixas</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800 border-b">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3 text-right">Qtd</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.filter((m: any) => m.type === 'consumption' || m.type === 'loss').map((m: any) => (
                      <tr key={m.id} className="border-b">
                        <td className="px-4 py-3">{formatDate(m.createdAt)}</td>
                        <td className="px-4 py-3 font-medium">{m.item?.name}</td>
                        <td className="px-4 py-3 text-right text-red-600 font-bold">-{m.quantity}</td>
                        <td className="px-4 py-3">
                          {m.type === 'consumption' ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">Consumo</Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Perda</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{m.reason || '-'}</td>
                      </tr>
                    ))}
                    {movements.filter((m: any) => m.type === 'consumption' || m.type === 'loss').length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-500">Nenhuma baixa registrada.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: FORNECEDORES */}
          <TabsContent value="fornecedores" className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input placeholder="Buscar fornecedor..." className="pl-9" />
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-2"/> Novo Fornecedor</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo Fornecedor</DialogTitle>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    createSupplierMutation.mutate({
                      name: formData.get('name') as string,
                      phone: formData.get('phone') as string,
                      email: formData.get('email') as string,
                      cnpj: formData.get('cnpj') as string,
                      categories: "geral",
                      deliveryDays: Number(formData.get('deliveryDays') || 0) || undefined,
                      paymentTerms: formData.get('paymentTerms') as string,
                    });
                  }}>
                    <div className="space-y-2">
                      <Label>Nome / Razão Social</Label>
                      <Input name="name" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Telefone / WhatsApp</Label>
                        <Input name="phone" />
                      </div>
                      <div className="space-y-2">
                        <Label>CNPJ</Label>
                        <Input name="cnpj" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" name="email" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Dias de Entrega</Label>
                        <Input name="deliveryDays" placeholder="Ex: Terça e Quinta" />
                      </div>
                      <div className="space-y-2">
                        <Label>Condições de Pag.</Label>
                        <Input name="paymentTerms" placeholder="Ex: Boleto 15/30d" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createSupplierMutation.isPending}>Salvar Fornecedor</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map((sup: any) => (
                <Card key={sup.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{sup.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sup.phone && (
                      <div className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                        <Phone className="w-4 h-4 mr-2" /> {sup.phone}
                      </div>
                    )}
                    <div className="text-sm">
                      <span className="text-slate-500">Entrega: </span> {sup.deliveryDays || '-'}
                    </div>
                    <div className="text-sm">
                      <span className="text-slate-500">Pagamento: </span> {sup.paymentTerms || '-'}
                    </div>
                    <div className="flex space-x-2 pt-2 border-t">
                      <Button variant="ghost" size="sm" className="flex-1"><Edit className="w-4 h-4 mr-2"/> Editar</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {suppliers.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500 border rounded-lg bg-slate-50 dark:bg-slate-900">
                  Nenhum fornecedor cadastrado.
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB: TEMPLATES */}
          <TabsContent value="templates" className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Modelos de Pedidos Recorrentes</h3>
              <Button><Plus className="w-4 h-4 mr-2"/> Novo Template</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tpl: any) => (
                <Card key={tpl.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center"><FileText className="w-4 h-4 mr-2 text-blue-500"/> {tpl.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-500 mb-4">{tpl.description}</p>
                    <Button className="w-full" variant="outline"><ShoppingCart className="w-4 h-4 mr-2"/> Gerar Pedido</Button>
                  </CardContent>
                </Card>
              ))}
              {templates.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500 border rounded-lg bg-slate-50 dark:bg-slate-900">
                  Nenhum template cadastrado. Crie um template para agilizar pedidos frequentes.
                </div>
              )}
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </DashboardLayout>
  );
}
