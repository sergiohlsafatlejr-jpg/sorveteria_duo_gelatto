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
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function InoveConnector() {
  const [formData, setFormData] = useState({
    host: "",
    port: 3306,
    database: "",
    username: "",
    password: "",
    syncIntervalMinutes: 5,
  });
  const [syncConfig, setSyncConfig] = useState({
    salesTableName: "vendas",
    dateField: "data_venda",
    amountField: "valor_total",
    cpfField: "cpf_cliente",
    phoneField: "telefone_cliente",
    customerNameField: "nome_cliente",
    hoursBack: 24,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [tables, setTables] = useState<string[]>([]);

  const { data: config, refetch: refetchConfig } = trpc.inove.getConfig.useQuery();
  const { data: syncHistory, refetch: refetchHistory } = trpc.inove.getSyncHistory.useQuery();

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
        if (data.tables) setTables(data.tables);
      } else {
        toast.error(data.message);
      }
      refetchConfig();
    },
    onError: (e) => toast.error(e.message),
  });

  const listTables = trpc.inove.listTables.useQuery(undefined, { enabled: false });

  const syncSales = trpc.inove.syncSales.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronização concluída! ${data.salesProcessed}/${data.salesFound} vendas processadas, ${data.customersLinked} clientes criados.`);
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
              <p className="text-sm text-gray-500">Integração direta com o banco de dados do sistema INOVE</p>
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
                  <p className={`font-medium ${statusColor}`}>
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
                Configuração da Conexão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Host / IP do Servidor *</Label>
                  <Input
                    placeholder="192.168.1.10 ou servidor.ddns.net"
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
                  placeholder="inove_db"
                  value={formData.database}
                  onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Usuário *</Label>
                  <Input
                    placeholder="root"
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
                  {testConnection.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  Testar
                </Button>
              </div>
              {tables.length > 0 && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg">
                  <p className="text-xs font-medium text-green-700 mb-1">Tabelas encontradas no INOVE:</p>
                  <div className="flex flex-wrap gap-1">
                    {tables.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
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
                Mapeamento de Campos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-gray-500">Informe os nomes das colunas na tabela de vendas do INOVE:</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tabela de Vendas</Label>
                  <Input
                    placeholder="vendas"
                    value={syncConfig.salesTableName}
                    onChange={(e) => setSyncConfig({ ...syncConfig, salesTableName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Campo de Data</Label>
                  <Input
                    placeholder="data_venda"
                    value={syncConfig.dateField}
                    onChange={(e) => setSyncConfig({ ...syncConfig, dateField: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Campo de Valor Total</Label>
                  <Input
                    placeholder="valor_total"
                    value={syncConfig.amountField}
                    onChange={(e) => setSyncConfig({ ...syncConfig, amountField: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Campo de CPF</Label>
                  <Input
                    placeholder="cpf_cliente"
                    value={syncConfig.cpfField}
                    onChange={(e) => setSyncConfig({ ...syncConfig, cpfField: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Campo de Telefone</Label>
                  <Input
                    placeholder="telefone_cliente"
                    value={syncConfig.phoneField}
                    onChange={(e) => setSyncConfig({ ...syncConfig, phoneField: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Campo de Nome</Label>
                  <Input
                    placeholder="nome_cliente"
                    value={syncConfig.customerNameField}
                    onChange={(e) => setSyncConfig({ ...syncConfig, customerNameField: e.target.value })}
                  />
                </div>
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
                  </SelectContent>
                </Select>
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
                <p className="text-xs mt-1">Configure a conexão e clique em "Sincronizar Agora"</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Vendas Encontradas</TableHead>
                    <TableHead className="text-right">Processadas</TableHead>
                    <TableHead className="text-right">Clientes Criados</TableHead>
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
                <p className="font-medium">Como obter as credenciais do INOVE:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700">
                  <li>Entre em contato com o suporte do INOVE: <strong>(79) 99898-5004</strong> ou <strong>atendimento@inovesystem.com</strong></li>
                  <li>Solicite: <em>"Preciso do host, porta, nome do banco, usuário e senha do MySQL para integração com sistema externo"</em></li>
                  <li>Se o INOVE estiver na mesma rede local, use o IP interno (ex: 192.168.1.10)</li>
                  <li>Se precisar de acesso remoto, solicite ao INOVE a liberação de acesso externo ou configure um DDNS</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
