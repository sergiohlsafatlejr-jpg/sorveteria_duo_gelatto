import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ClipboardList, Shield, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  attendant: "Atendente",
  user: "Usuário",
};

const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  attendant: "bg-green-100 text-green-700",
  user: "bg-gray-100 text-gray-600",
};

const modules = [
  { key: "customers", label: "Clientes" },
  { key: "points", label: "Programa de Pontos" },
  { key: "products", label: "Estoque" },
  { key: "sales", label: "Vendas" },
  { key: "finance", label: "Financeiro" },
  { key: "notifications", label: "Notificações" },
  { key: "connector", label: "Conector Externo" },
];

export default function Users() {
  const { user: currentUser } = useAuth();
  const [permOpen, setPermOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();
  const { data: permissions } = trpc.users.getPermissions.useQuery(
    { userId: selectedUserId! },
    { enabled: !!selectedUserId }
  );
  const { data: auditLogs } = trpc.users.auditLogs.useQuery({ limit: 50 });

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); toast.success("Função atualizada!"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = trpc.users.toggleActive.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); toast.success("Status atualizado!"); },
    onError: (e) => toast.error(e.message),
  });

  const setPermission = trpc.users.setPermission.useMutation({
    onSuccess: () => { if (selectedUserId) utils.users.getPermissions.invalidate({ userId: selectedUserId }); toast.success("Permissão atualizada!"); },
    onError: (e) => toast.error(e.message),
  });

  function getPermission(module: string) {
    return permissions?.find((p) => p.module === module);
  }

  function handlePermChange(module: string, field: "canView" | "canCreate" | "canEdit" | "canDelete", value: boolean) {
    if (!selectedUserId) return;
    const current = getPermission(module);
    setPermission.mutate({
      userId: selectedUserId,
      module,
      canView: field === "canView" ? value : current?.canView ?? false,
      canCreate: field === "canCreate" ? value : current?.canCreate ?? false,
      canEdit: field === "canEdit" ? value : current?.canEdit ?? false,
      canDelete: field === "canDelete" ? value : current?.canDelete ?? false,
    });
  }

  if (currentUser?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <Shield className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold">Acesso Restrito</h2>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Você não tem permissão para acessar o módulo de usuários. Entre em contato com um administrador.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" />
            Usuários e Permissões
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie funções, acessos e permissões dos usuários
          </p>
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="audit">Log de Auditoria</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="animate-pulse"><CardContent className="p-4 h-16 bg-muted/30 rounded-lg" /></Card>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {users?.map((u) => (
                  <Card key={u.id} className={`${!u.active ? "opacity-60" : ""}`}>
                    <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {u.name?.charAt(0).toUpperCase() ?? "U"}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{u.name ?? "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{u.email ?? "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[u.role]}`}>
                          {roleLabels[u.role]}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={u.active}
                            onCheckedChange={(v) => toggleActive.mutate({ userId: u.id, active: v })}
                            disabled={u.id === currentUser?.id}
                          />
                          <span className="text-xs text-muted-foreground">{u.active ? "Ativo" : "Inativo"}</span>
                        </div>
                        <Select
                          value={u.role}
                          onValueChange={(v: any) => updateRole.mutate({ userId: u.id, role: v })}
                          disabled={u.id === currentUser?.id}
                        >
                          <SelectTrigger className="w-36 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="manager">Gerente</SelectItem>
                            <SelectItem value="attendant">Atendente</SelectItem>
                            <SelectItem value="user">Usuário</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={() => { setSelectedUserId(u.id); setPermOpen(true); }}
                        >
                          <Shield className="h-3 w-3" />
                          Permissões
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Registro de Auditoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!auditLogs?.length ? (
                  <p className="text-muted-foreground text-sm text-center py-8">Nenhum registro encontrado.</p>
                ) : (
                  <div className="space-y-1.5">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="flex items-start justify-between py-2 border-b last:border-0 text-sm">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">{log.action}</Badge>
                            <span className="text-xs text-muted-foreground">{log.module}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {log.userName} · {log.details}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {new Date(log.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Permissions Dialog */}
      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Permissões do Usuário
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground mb-3 px-2">
              <span className="col-span-1">Módulo</span>
              <span className="text-center">Visualizar</span>
              <span className="text-center">Criar</span>
              <span className="text-center">Editar</span>
              <span className="text-center">Excluir</span>
            </div>
            <div className="space-y-2">
              {modules.map((mod) => {
                const perm = getPermission(mod.key);
                return (
                  <div key={mod.key} className="grid grid-cols-5 gap-2 items-center bg-muted/30 rounded-lg px-3 py-2.5">
                    <span className="text-sm font-medium col-span-1">{mod.label}</span>
                    {(["canView", "canCreate", "canEdit", "canDelete"] as const).map((field) => (
                      <div key={field} className="flex justify-center">
                        <Checkbox
                          checked={perm?.[field] ?? false}
                          onCheckedChange={(v) => handlePermChange(mod.key, field, !!v)}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setPermOpen(false)}>Fechar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
