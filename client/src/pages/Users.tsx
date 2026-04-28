import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
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
import {
  ClipboardList,
  Shield,
  UserCog,
  CheckSquare,
  XSquare,
  Users as UsersIcon,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Definição de perfis pré-definidos ──────────────────────────────────────
const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  attendant: "Funcionário",
  user: "Funcionário",
};

const roleDescriptions: Record<string, string> = {
  admin: "Acesso total ao sistema",
  manager: "Vendas, estoque, pontos e financeiro básico",
  attendant: "Apenas vendas e cadastro de clientes",
  user: "Apenas vendas e cadastro de clientes",
};

const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  attendant: "bg-green-100 text-green-700",
  user: "bg-gray-100 text-gray-600",
};

// ─── Grupos de módulos com todos os itens do sistema ────────────────────────
const MODULE_GROUPS = [
  {
    group: "Vendas",
    color: "text-orange-600",
    modules: [
      { key: "sales", label: "Vendas (PDV)" },
      { key: "sales-import", label: "Importação de Vendas" },
    ],
  },
  {
    group: "Estoque",
    color: "text-blue-600",
    modules: [
      { key: "products", label: "Cadastro de Produtos" },
      { key: "products-stock", label: "Controle de Estoque" },
      { key: "giro-estoque", label: "Giro Semanal" },
      { key: "reports", label: "Relatórios de Estoque" },
    ],
  },
  {
    group: "Clientes & Pontos",
    color: "text-pink-600",
    modules: [
      { key: "customers", label: "Cadastro de Clientes" },
      { key: "points", label: "Programa de Pontos" },
      { key: "points-rules", label: "Regras de Pontos" },
    ],
  },
  {
    group: "Financeiro",
    color: "text-emerald-600",
    modules: [
      { key: "fin-dashboard", label: "Dashboard Financeiro" },
      { key: "fin-payables", label: "Contas a Pagar" },
      { key: "fin-receivables", label: "Contas a Receber" },
      { key: "fin-cashflow", label: "Fluxo de Caixa" },
      { key: "fin-dre", label: "DRE" },
      { key: "fin-forecast", label: "Previsão Financeira" },
      { key: "fin-goals", label: "Metas Financeiras" },
      { key: "fin-costs", label: "Custos" },
      { key: "fin-banks", label: "Bancos e Contas" },
    ],
  },
  {
    group: "Marketing & Social",
    color: "text-violet-600",
    modules: [
      { key: "whatsapp", label: "WhatsApp" },
      { key: "instagram", label: "Instagram + Meta Ads" },
      { key: "meta-ads", label: "Campanhas Meta Ads" },
      { key: "ad-library", label: "Anúncios Concorrentes" },
      { key: "notifications", label: "Notificações" },
    ],
  },
  {
    group: "Relatórios INOVE",
    color: "text-teal-600",
    modules: [
      { key: "inove-product-sales", label: "Vendas por Produto" },
      { key: "inove-cost-margin", label: "Custo x Margem" },
      { key: "inove-managerial", label: "Relatórios Gerenciais" },
    ],
  },
  {
    group: "Administração",
    color: "text-red-600",
    modules: [
      { key: "users", label: "Usuários e Permissões" },
      { key: "connector", label: "Conector Externo" },
    ],
  },
];

const ALL_MODULES = MODULE_GROUPS.flatMap((g) => g.modules.map((m) => m.key));

// ─── Perfis pré-definidos ────────────────────────────────────────────────────
const PRESET_PROFILES: Record<string, { label: string; description: string; modules: string[]; canCreate?: string[]; canEdit?: string[]; canDelete?: string[] }> = {
  manager: {
    label: "Gerente",
    description: "Vendas, estoque, clientes, pontos e financeiro básico",
    modules: ["sales", "sales-import", "products", "products-stock", "giro-estoque", "reports", "customers", "points", "points-rules", "fin-forecast", "fin-goals", "notifications", "whatsapp", "instagram"],
    canCreate: ["sales", "customers", "points"],
    canEdit: ["sales", "products", "products-stock", "customers", "points", "points-rules"],
    canDelete: [],
  },
  attendant: {
    label: "Funcionário",
    description: "Apenas vendas e cadastro de clientes",
    modules: ["sales", "customers", "points"],
    canCreate: ["sales", "customers"],
    canEdit: ["customers"],
    canDelete: [],
  },
  marketing: {
    label: "Marketing",
    description: "Instagram, Meta Ads, WhatsApp e notificações",
    modules: ["whatsapp", "instagram", "meta-ads", "ad-library", "notifications"],
    canCreate: ["notifications"],
    canEdit: ["instagram", "meta-ads"],
    canDelete: [],
  },
  financeiro: {
    label: "Financeiro",
    description: "Acesso completo ao módulo financeiro",
    modules: ["fin-dashboard", "fin-payables", "fin-receivables", "fin-cashflow", "fin-dre", "fin-forecast", "fin-goals", "fin-costs", "fin-banks"],
    canCreate: ["fin-payables", "fin-receivables", "fin-costs", "fin-banks"],
    canEdit: ["fin-payables", "fin-receivables", "fin-costs", "fin-banks", "fin-goals"],
    canDelete: ["fin-payables", "fin-receivables"],
  },
};

function buildPermissionsFromPreset(presetKey: string) {
  const preset = PRESET_PROFILES[presetKey];
  if (!preset) return [];
  return ALL_MODULES.map((mod) => ({
    module: mod,
    canView: preset.modules.includes(mod),
    canCreate: (preset.canCreate ?? []).includes(mod),
    canEdit: (preset.canEdit ?? []).includes(mod),
    canDelete: (preset.canDelete ?? []).includes(mod),
  }));
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function Users() {
  const { user: currentUser } = useAuth();
  const [permOpen, setPermOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(MODULE_GROUPS.map((g) => g.group)));
  const [localPerms, setLocalPerms] = useState<Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>>({});
  const [isDirty, setIsDirty] = useState(false);

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();
  const { data: permissions, isLoading: permsLoading } = trpc.users.getPermissions.useQuery(
    { userId: selectedUserId! },
    { enabled: !!selectedUserId }
  );

  // Sincroniza permissões do servidor no estado local quando carregam
  const prevPermissionsRef = useState<typeof permissions>(undefined);
  if (permissions !== prevPermissionsRef[0] && permissions !== undefined) {
    prevPermissionsRef[1](permissions);
    const map: Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }> = {};
    for (const p of permissions) {
      map[p.module] = { canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
    }
    setLocalPerms(map);
    setIsDirty(false);
  }
  const { data: auditLogs } = trpc.users.auditLogs.useQuery({ limit: 100 });

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); toast.success("Função atualizada!"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = trpc.users.toggleActive.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); toast.success("Status atualizado!"); },
    onError: (e) => toast.error(e.message),
  });

  const setAllPermissions = trpc.users.setAllPermissions.useMutation({
    onSuccess: () => {
      if (selectedUserId) utils.users.getPermissions.invalidate({ userId: selectedUserId });
      toast.success("Permissões salvas com sucesso!");
      setIsDirty(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function getLocalPerm(module: string) {
    return localPerms[module] ?? { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  function handlePermChange(module: string, field: "canView" | "canCreate" | "canEdit" | "canDelete", value: boolean) {
    setLocalPerms((prev) => {
      const current = prev[module] ?? { canView: false, canCreate: false, canEdit: false, canDelete: false };
      const updated = { ...current, [field]: value };
      // Se desmarcar visualizar, desmarcar tudo
      if (field === "canView" && !value) {
        updated.canCreate = false;
        updated.canEdit = false;
        updated.canDelete = false;
      }
      // Se marcar criar/editar/excluir, marcar visualizar automaticamente
      if ((field === "canCreate" || field === "canEdit" || field === "canDelete") && value) {
        updated.canView = true;
      }
      return { ...prev, [module]: updated };
    });
    setIsDirty(true);
  }

  function handleSavePermissions() {
    if (!selectedUserId) return;
    const permissions = ALL_MODULES.map((mod) => ({
      module: mod,
      ...getLocalPerm(mod),
    }));
    setAllPermissions.mutate({ userId: selectedUserId, permissions, profileApplied: "custom" });
  }

  function applyPreset(presetKey: string) {
    const perms = buildPermissionsFromPreset(presetKey);
    const map: Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }> = {};
    for (const p of perms) {
      map[p.module] = { canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
    }
    setLocalPerms(map);
    setIsDirty(true);
    toast.info(`Perfil "${PRESET_PROFILES[presetKey]?.label}" aplicado. Clique em Salvar para confirmar.`);
  }

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function toggleGroupView(groupKey: string, value: boolean) {
    const group = MODULE_GROUPS.find((g) => g.group === groupKey);
    if (!group) return;
    setLocalPerms((prev) => {
      const next = { ...prev };
      for (const mod of group.modules) {
        const current = next[mod.key] ?? { canView: false, canCreate: false, canEdit: false, canDelete: false };
        next[mod.key] = value
          ? { ...current, canView: true }
          : { canView: false, canCreate: false, canEdit: false, canDelete: false };
      }
      return next;
    });
    setIsDirty(true);
  }

  function openPermissions(userId: number, userName: string) {
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setLocalPerms({});
    setIsDirty(false);
    setPermOpen(true);
  }

  if (currentUser?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <Shield className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold">Acesso Restrito</h2>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Você não tem permissão para acessar o módulo de usuários.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/dashboard" />

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" />
            Usuários e Permissões
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie funções, acessos e permissões granulares por módulo
          </p>
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users" className="gap-1.5">
              <UsersIcon className="h-3.5 w-3.5" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Log de Auditoria
            </TabsTrigger>
          </TabsList>

          {/* ── Aba Usuários ── */}
          <TabsContent value="users" className="mt-4">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4 h-16 bg-muted/30 rounded-lg" />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {users?.map((u) => (
                  <Card key={u.id} className={`${!u.active ? "opacity-60" : ""}`}>
                    <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                      {/* Avatar + nome */}
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {u.name?.charAt(0).toUpperCase() ?? "U"}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{u.name ?? "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{u.email ?? "—"}</p>
                        </div>
                      </div>

                      {/* Controles */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Badge de papel */}
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[u.role]}`}>
                            {roleLabels[u.role]}
                          </span>
                          <span className="text-[10px] text-muted-foreground max-w-[160px] truncate">
                            {roleDescriptions[u.role]}
                          </span>
                        </div>

                        {/* Toggle ativo */}
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={u.active}
                            onCheckedChange={(v) => toggleActive.mutate({ userId: u.id, active: v })}
                            disabled={u.id === currentUser?.id}
                          />
                          <span className="text-xs text-muted-foreground">{u.active ? "Ativo" : "Inativo"}</span>
                        </div>

                        {/* Seletor de papel */}
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
                            <SelectItem value="attendant">Funcionário</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Botão de permissões granulares */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={() => openPermissions(u.id, u.name ?? "Usuário")}
                          disabled={u.id === currentUser?.id}
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

          {/* ── Aba Auditoria ── */}
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
                  <div className="space-y-1">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="flex items-start justify-between py-2 border-b last:border-0 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs capitalize shrink-0">{log.action}</Badge>
                            <span className="text-xs text-muted-foreground">{log.module}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            <span className="font-medium text-foreground">{log.userName}</span> · {log.details}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ml-3">
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

      {/* ── Modal de Permissões Granulares ── */}
      <Dialog open={permOpen} onOpenChange={(v) => { if (!v && isDirty) { if (!confirm("Há alterações não salvas. Deseja sair?")) return; } setPermOpen(v); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-primary" />
              Permissões — {selectedUserName}
            </DialogTitle>
          </DialogHeader>

          {/* Perfis pré-definidos */}
          <div className="mt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Zap className="h-3 w-3" /> Aplicar Perfil Pré-definido
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PRESET_PROFILES).map(([key, profile]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => applyPreset(key)}
                >
                  {profile.label}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  const map: Record<string, any> = {};
                  for (const mod of ALL_MODULES) map[mod] = { canView: false, canCreate: false, canEdit: false, canDelete: false };
                  setLocalPerms(map);
                  setIsDirty(true);
                  toast.info("Todas as permissões removidas. Clique em Salvar para confirmar.");
                }}
              >
                <XSquare className="h-3 w-3" /> Remover Tudo
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                onClick={() => {
                  const map: Record<string, any> = {};
                  for (const mod of ALL_MODULES) map[mod] = { canView: true, canCreate: true, canEdit: true, canDelete: true };
                  setLocalPerms(map);
                  setIsDirty(true);
                  toast.info("Acesso total aplicado. Clique em Salvar para confirmar.");
                }}
              >
                <CheckSquare className="h-3 w-3" /> Acesso Total
              </Button>
            </div>
          </div>

          <div className="my-3 border-t" />

          {/* Cabeçalho da tabela */}
          <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-1 text-xs font-semibold text-muted-foreground px-3 mb-1">
            <span>Módulo</span>
            <span className="text-center">Ver</span>
            <span className="text-center">Criar</span>
            <span className="text-center">Editar</span>
            <span className="text-center">Excluir</span>
          </div>

          {/* Grupos de módulos */}
          {permsLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {MODULE_GROUPS.map((group) => {
                const isExpanded = expandedGroups.has(group.group);
                const groupModuleKeys = group.modules.map((m) => m.key);
                const allVisible = groupModuleKeys.every((k) => getLocalPerm(k).canView);
                const someVisible = groupModuleKeys.some((k) => getLocalPerm(k).canView);

                return (
                  <div key={group.group} className="border rounded-lg overflow-hidden">
                    {/* Cabeçalho do grupo */}
                    <div
                      className="flex items-center justify-between px-3 py-2 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => toggleGroup(group.group)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={`text-sm font-semibold ${group.color}`}>{group.group}</span>
                        <span className="text-xs text-muted-foreground">({group.modules.length} módulos)</span>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-muted-foreground">Liberar grupo:</span>
                        <Switch
                          checked={allVisible}
                          onCheckedChange={(v) => toggleGroupView(group.group, v)}
                          className="scale-75"
                        />
                        {someVisible && !allVisible && (
                          <span className="text-xs text-amber-600 font-medium">Parcial</span>
                        )}
                      </div>
                    </div>

                    {/* Linhas de módulos */}
                    {isExpanded && (
                      <div className="divide-y">
                        {group.modules.map((mod) => {
                          const perm = getLocalPerm(mod.key);
                          return (
                            <div
                              key={mod.key}
                              className={`grid grid-cols-[1fr_80px_80px_80px_80px] gap-1 items-center px-4 py-2.5 text-sm ${perm.canView ? "bg-background" : "bg-muted/20"}`}
                            >
                              <span className={`font-medium ${!perm.canView ? "text-muted-foreground" : ""}`}>
                                {mod.label}
                              </span>
                              {(["canView", "canCreate", "canEdit", "canDelete"] as const).map((field) => (
                                <div key={field} className="flex justify-center">
                                  <Checkbox
                                    checked={perm[field]}
                                    onCheckedChange={(v) => handlePermChange(mod.key, field, !!v)}
                                    disabled={field !== "canView" && !perm.canView}
                                    className={field === "canView" ? "border-primary" : ""}
                                  />
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Rodapé */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              {isDirty ? (
                <span className="text-amber-600 font-medium">⚠ Alterações não salvas</span>
              ) : (
                <span className="text-green-600">✓ Salvo</span>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPermOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSavePermissions}
                disabled={!isDirty || setAllPermissions.isPending}
                className="gap-1"
              >
                {setAllPermissions.isPending ? "Salvando..." : "Salvar Permissões"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
