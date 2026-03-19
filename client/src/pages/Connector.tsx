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
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { CheckCircle, Database, Edit, Loader2, Plus, RefreshCw, Shield, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ConnectorForm = {
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
};

const emptyForm: ConnectorForm = {
  name: "", host: "localhost", port: "3306", database: "", username: "root", password: "",
};

export default function Connector() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ConnectorForm>(emptyForm);
  const [testingId, setTestingId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: connectors, isLoading } = trpc.connector.list.useQuery();

  const createMutation = trpc.connector.create.useMutation({
    onSuccess: () => { utils.connector.list.invalidate(); toast.success("Conector criado!"); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.connector.update.useMutation({
    onSuccess: () => { utils.connector.list.invalidate(); toast.success("Conector atualizado!"); setOpen(false); setEditId(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.connector.delete.useMutation({
    onSuccess: () => { utils.connector.list.invalidate(); toast.success("Conector removido."); },
    onError: (e) => toast.error(e.message),
  });

  const testMutation = trpc.connector.testConnection.useMutation({
    onSuccess: (data) => {
      setTestingId(null);
      utils.connector.list.invalidate();
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
    },
    onError: (e) => { setTestingId(null); toast.error(e.message); },
  });

  function openCreate() { setEditId(null); setForm(emptyForm); setOpen(true); }
  function openEdit(c: NonNullable<typeof connectors>[0]) {
    setEditId(c.id);
    setForm({ name: c.name, host: c.host, port: String(c.port), database: c.database, username: c.username, password: c.password });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = { ...form, port: parseInt(form.port) };
    if (editId) updateMutation.mutate({ id: editId, ...data });
    else createMutation.mutate(data);
  }

  const statusIcon = (status: string | null) => {
    if (status === "connected") return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
    return <Database className="h-4 w-4 text-muted-foreground" />;
  };

  if (user?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <Shield className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold">Acesso Restrito</h2>
          <p className="text-muted-foreground mt-2">Apenas administradores podem configurar conectores externos.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/dashboard" />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-6 w-6 text-primary" />
              Conector de Banco Externo
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Integre com bancos de dados MySQL da sua loja física
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Conector
          </Button>
        </div>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Database className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold">Como funciona o conector?</p>
                <p className="mt-1 text-blue-700">
                  Configure a conexão com o banco de dados MySQL instalado na máquina da sua loja.
                  O sistema irá sincronizar dados de vendas, clientes e estoque automaticamente.
                  Certifique-se de que o banco de dados está acessível na rede.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i} className="animate-pulse"><CardContent className="p-4 h-36 bg-muted/30 rounded-lg" /></Card>
            ))}
          </div>
        ) : connectors?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <Database className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nenhum conector configurado.</p>
              <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Configurar primeiro conector
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connectors!.map((c) => (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusIcon(c.syncStatus)}
                      {c.name}
                    </div>
                    <Badge variant={c.active ? "default" : "secondary"}>
                      {c.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono space-y-1">
                    <p><span className="text-muted-foreground">Host:</span> {c.host}:{c.port}</p>
                    <p><span className="text-muted-foreground">Banco:</span> {c.database}</p>
                    <p><span className="text-muted-foreground">Usuário:</span> {c.username}</p>
                  </div>
                  {c.lastSync && (
                    <p className="text-xs text-muted-foreground">
                      Última sincronização: {new Date(c.lastSync).toLocaleString("pt-BR")}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 flex-1"
                      disabled={testingId === c.id}
                      onClick={() => { setTestingId(c.id); testMutation.mutate({ id: c.id }); }}
                    >
                      {testingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Testar Conexão
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm("Remover conector?")) deleteMutation.mutate({ id: c.id }); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Conector" : "Novo Conector MySQL"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 mt-2">
            <div>
              <Label>Nome do Conector *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Loja Principal" required />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Host / IP *</Label>
                <Input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="192.168.1.100" required />
              </div>
              <div>
                <Label>Porta</Label>
                <Input type="number" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Nome do Banco *</Label>
              <Input value={form.database} onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))} placeholder="nome_do_banco" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Usuário *</Label>
                <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
              </div>
              <div>
                <Label>Senha *</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editId ? "Salvar" : "Criar Conector"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
