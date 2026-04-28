import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Database,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  Settings,
  History,
  Wifi,
  WifiOff,
  TrendingUp,
  Users,
  ShoppingCart,
  Star,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function InoveConnector() {
  const [formData, setFormData] = useState({
    host: "duo-urias.safatle.net.br",
    port: 55444,
    database: "DUOGELATTO",
    username: "sa",
    password: "",
    syncIntervalMinutes: 5,
  });
  const [syncConfig, setSyncConfig] = useState({
    hoursBack: 24,
    pointsPerReal: 1,
    minAmount: 5,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [tables, setTables] = useState<string[]>([]);

  const { data: config, refetch: refetchConfig } = trpc.inove.getConfig.useQuery();
  const { data: syncHistory, refetch: refetchHistory } = trpc.inove.getSyncHistory.useQuery();
  const { data: stats } = trpc.inove.getStats.useQuery();

  const saveConfig = trpc.inove.saveConfig.useMutation({
    onSuccess: () => { toast.success("Configuração salva!"); refetchConfig(); },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = trpc.inove.toggleActive.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); refetchConfig(); },
    onError: (e) => toast.error(e.message),
  });

  const testConnection = trpc.inove.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        if (data.tables) setTables(data.tables.slice(0, 20));
      } else {
        toast.error(data.message);
      }
      refetchConfig();
    },
    onError: (e) => toast.error(e.message),
  });

  const syncSales = trpc.inove.syncSales.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Sincronização concluída! ${data.salesProcessed}/${data.salesFound} vendas, ${data.pointsGranted} pontos lançados, ${data.customersLinked} clientes criados.`
      );
      refetchHistory();
      refetchConfig();
    },
    onError: (e) => toast.error(`Erro na sincronização: ${e.message}`),
  });

  const handleSave = () => {
    if (!formData.host || !formData.database || !formData.username || !formData.password) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    saveConfig.mutate(formData);
  };

  const statusColor = config?.lastSyncStatus === "success"
    ? "text-green-600" : config?.lastSyncStatus === "error"
    ? "text-red-600" : "text-yellow-600";

  const inoStats = stats as {
    total_vendas?: number;
    finalizadas?: number;
    com_cliente?: number;
    faturado_total?: number;
    primeira_venda?: string;
    ultima_venda?: string;
    total_clientes?: number;
    error?: string;
  } | null;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Database className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Conector INOVE PDV</h1>
              <p className="text-sm text-gray-500">
                Integração com SQL Server — banco <strong>DUOGELATTO</strong>
              </p>
            </div>
          </div>
          {config && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{config.active ? "Ativo" : "Inativo"}</span>
              <Switch
                checked={config.active}
                onCheckedChange={(v) => toggleActive.mutate({ active: v })}
              />
              {config.active
                ? <Wifi className="w-5 h-5 text-green-500" />
                : <WifiOff className="w-5 h-5 text-gray-400" />}
            </div>
          )}
        </div>

        {/* KPIs do banco INOVE */}
        {inoStats && !inoStats.error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-0 bg-blue-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-blue-600 font-medium">Vendas Finalizadas</span>
                </div>
                <p className="text-2xl font-bold text-blue-700">
                  {(inoStats.finalizadas ?? 0).toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-blue-500 mt-1">de {(inoStats.total_vendas ?? 0).toLocaleString("pt-BR")} total</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-green-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-green-600 font-medium">Faturamento Total</span>
                </div>
                <p className="text-2xl font-bold text-green-700">
                  R$ {((inoStats.faturado_total ?? 0) / 1000).toFixed(0)}k
                </p>
                <p className="text-xs text-green-500 mt-1">desde {inoStats.primeira_venda ? new Date(inoStats.primeira_venda).toLocaleDateString("pt-BR") : "—"}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-purple-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span className="text-xs text-purple-600 font-medium">Clientes no INOVE</span>
                </div>
                <p className="text-2xl font-bold text-purple-700">
                  {(inoStats.total_clientes ?? 0).toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-purple-500 mt-1">cadastrados no PDV</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-orange-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-orange-600" />
                  <span className="text-xs text-orange-600 font-medium">Vendas c/ Cliente</span>
                </div>
                <p className="text-2xl font-bold text-orange-700">
                  {(inoStats.com_cliente ?? 0).toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-orange-500 mt-1">vinculadas ao PDV</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Status atual */}
        {config && (
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Servidor</p>
                  <p className="font-medium">{config.host}:{config.port}</p>
                </div>
                <div>
                  <p className="text-gray-500">Banco</p>
                  <p className="font-medium">{config.database}</p>
                </div>
                <div>
                  <p className="text-gray-500">Última sincronização</p>
                  <p className="font-medium">
                    {config.lastSyncAt
                      ? new Date(config.lastSyncAt).toLocaleString("pt-BR")
                      : "Nunca"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <p className={`font-medium text-xs ${statusColor}`}>
                    {config.lastSyncMessage ?? "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuração de conexão */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="w-4 h-4" />
                Configuração da Conexão (SQL Server)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Host / IP do Servidor *</Label>
                  <Input
                    placeholder="duo-urias.safatle.net.br"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Porta</Label>
                  <Input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Nome do Banco de Dados *</Label>
                <Input
                  placeholder="DUOGELATTO"
                  value={formData.database}
                  onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Usuário *</Label>
                  <Input
                    placeholder="sa"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Senha *</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-2 text-xs text-gray-400 hover:text-gray-600"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "ocultar" : "mostrar"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Intervalo de sincronização automática</Label>
                <Select
                  value={String(formData.syncIntervalMinutes)}
                  onValueChange={(v) => setFormData({ ...formData, syncIntervalMinutes: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">A cada 1 minuto</SelectItem>
                    <SelectItem value="5">A cada 5 minutos</SelectItem>
                    <SelectItem value="10">A cada 10 minutos</SelectItem>
                    <SelectItem value="30">A cada 30 minutos</SelectItem>
                    <SelectItem value="60">A cada 1 hora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={saveConfig.isPending}
                >
                  {saveConfig.isPending ? "Salvando..." : "Salvar Configuração"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => testConnection.mutate()}
                  disabled={testConnection.isPending}
                >
                  {testConnection.isPending
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <Wifi className="w-4 h-4" />}
                  Testar
                </Button>
              </div>
              {tables.length > 0 && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg">
                  <p className="text-xs font-medium text-green-700 mb-1">
                    Tabelas encontradas no banco DUOGELATTO:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {["VENDAS", "ITENS_VENDAS", "PAGAMENTOS_VENDAS", "PESSOAS", "CLIENTES"].map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs bg-green-100 text-green-700">
                        ✓ {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Configuração de sincronização */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="w-4 h-4" />
                Sincronização de Pontos de Fidelidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 space-y-1">
                <p className="font-medium">Como funciona:</p>
                <p>• Busca vendas finalizadas no INOVE (tabela VENDAS)</p>
                <p>• Vincula ao cliente via CPF ou telefone (tabela PESSOAS)</p>
                <p>• Lança pontos automaticamente no sistema de fidelidade</p>
                <p>• Envia WhatsApp de confirmação se configurado</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Sincronizar últimas N horas</Label>
                <Select
                  value={String(syncConfig.hoursBack)}
                  onValueChange={(v) => setSyncConfig({ ...syncConfig, hoursBack: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Última 1 hora</SelectItem>
                    <SelectItem value="6">Últimas 6 horas</SelectItem>
                    <SelectItem value="24">Últimas 24 horas</SelectItem>
                    <SelectItem value="48">Últimas 48 horas</SelectItem>
                    <SelectItem value="168">Última semana</SelectItem>
                    <SelectItem value="720">Último mês</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Pontos por R$ 1,00</Label>
                  <Input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.5"
                    value={syncConfig.pointsPerReal}
                    onChange={(e) => setSyncConfig({ ...syncConfig, pointsPerReal: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor mínimo (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={syncConfig.minAmount}
                    onChange={(e) => setSyncConfig({ ...syncConfig, minAmount: Number(e.target.value) })}
                  />
                </div>
              </div>

              <Button
                className="w-full mt-2"
                onClick={() => syncSales.mutate(syncConfig)}
                disabled={syncSales.isPending || !config?.active}
              >
                {syncSales.isPending
                  ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Sincronizando...</>
                  : <><Play className="w-4 h-4 mr-2" />Sincronizar Agora</>}
              </Button>
              {!config?.active && (
                <p className="text-xs text-center text-amber-600">
                  Ative o conector acima para sincronizar
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Histórico de sincronizações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="w-4 h-4" />
              Histórico de Sincronizações
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!syncHistory || syncHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma sincronização realizada ainda</p>
                <p className="text-xs mt-1">Configure a conexão, ative o conector e clique em "Sincronizar Agora"</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Processadas</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncHistory.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {new Date(log.syncedAt).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {log.status === "success" ? (
                          <span className="flex items-center gap-1 text-green-600 text-sm">
                            <CheckCircle className="w-4 h-4" /> Sucesso
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600 text-sm">
                            <XCircle className="w-4 h-4" /> Erro
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{log.salesFound}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">{log.salesProcessed}</TableCell>
                      <TableCell className="text-right font-medium text-blue-600">{log.customersLinked}</TableCell>
                      <TableCell className="text-sm text-gray-500 max-w-xs truncate">
                        {log.errorMessage ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Instruções */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 space-y-1">
                <p className="font-medium">Estrutura do banco DUOGELATTO (SQL Server):</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li><strong>VENDAS</strong>: 69.590 vendas — campo CLIENTE vincula ao cadastro</li>
                  <li><strong>PESSOAS</strong>: 77 clientes cadastrados no PDV (nome, CPF, telefone)</li>
                  <li><strong>CLIENTES</strong>: dados comerciais (desconto, limite, etc.)</li>
                  <li><strong>ITENS_VENDAS</strong>: 156.697 itens de venda</li>
                  <li><strong>PAGAMENTOS_VENDAS</strong>: 67.417 pagamentos</li>
                </ul>
                <p className="text-blue-600 mt-2">
                  A sincronização busca vendas finalizadas (VEN_SITUACAO=2) com cliente vinculado,
                  cruza pelo CPF ou telefone com a base de clientes do sistema e lança os pontos automaticamente.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
