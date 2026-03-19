import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare, Settings, Send, History, CheckCircle, XCircle,
  Wifi, WifiOff, Plus, Trash2, Play, Users, RefreshCw, TestTube2
} from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  all: "Todos os clientes",
  with_points: "Clientes com pontos",
  no_points: "Clientes sem pontos",
  near_goal: "Próximos da meta (80%+)",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sending: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  scheduled: "bg-yellow-100 text-yellow-700",
};

export default function WhatsApp() {
  const utils = trpc.useUtils();

  // ── Config state ─────────────────────────────────────────────────────────────
  const { data: config, isLoading: configLoading } = trpc.whatsapp.getConfig.useQuery();
  const { data: connectionStatus, refetch: recheckConnection } = trpc.whatsapp.testConnection.useQuery(undefined, {
    enabled: false,
  });
  const { data: defaultTemplates } = trpc.whatsapp.getDefaultTemplates.useQuery();

  const [configForm, setConfigForm] = useState({
    instanceId: "",
    token: "",
    active: false,
    notifyOnPoints: true,
    notifyOnGoalNear: true,
    notifyOnGoalReached: true,
    msgPointsEarned: "",
    msgGoalNear: "",
    msgGoalReached: "",
    msgPromotion: "",
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load config into form when available
  if (config && !configLoaded) {
    setConfigLoaded(true);
    setConfigForm({
      instanceId: config.instanceId ?? "",
      token: "", // Never prefill token for security
      active: config.active ?? false,
      notifyOnPoints: config.notifyOnPoints ?? true,
      notifyOnGoalNear: config.notifyOnGoalNear ?? true,
      notifyOnGoalReached: config.notifyOnGoalReached ?? true,
      msgPointsEarned: config.msgPointsEarned ?? "",
      msgGoalNear: config.msgGoalNear ?? "",
      msgGoalReached: config.msgGoalReached ?? "",
      msgPromotion: config.msgPromotion ?? "",
    });
  }

  const saveConfigMut = trpc.whatsapp.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva! Integração WhatsApp atualizada.");
      utils.whatsapp.getConfig.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const testMut = trpc.whatsapp.sendTest.useMutation({
    onSuccess: (r) => {
      if (r.success) toast.success("Mensagem de teste enviada com sucesso!");
      else toast.error(r.error ?? "Falha no envio");
    },
  });

  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("Olá! Esta é uma mensagem de teste da Duo Gelatto. 🍦");

  // ── Campaigns state ───────────────────────────────────────────────────────────
  const { data: campaigns, isLoading: campaignsLoading } = trpc.whatsapp.getCampaigns.useQuery();
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState<{ name: string; message: string; segment: "all" | "with_points" | "no_points" | "near_goal" }>({ name: "", message: "", segment: "all" });

  const createCampaignMut = trpc.whatsapp.createCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campanha criada!");
      utils.whatsapp.getCampaigns.invalidate();
      setShowNewCampaign(false);
      setNewCampaign({ name: "", message: "", segment: "all" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCampaignMut = trpc.whatsapp.deleteCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campanha removida.");
      utils.whatsapp.getCampaigns.invalidate();
    },
  });

  const sendCampaignMut = trpc.whatsapp.sendCampaign.useMutation({
    onSuccess: (r) => {
      toast.success(`Campanha enviada! ${r.sent} enviadas, ${r.failed} falhas de ${r.total} destinatários.`);
      utils.whatsapp.getCampaigns.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Logs ─────────────────────────────────────────────────────────────────────
  const { data: logs } = trpc.whatsapp.getLogs.useQuery({ limit: 50 });

  // ── Recipients count for selected segment ─────────────────────────────────
  const { data: recipientCount } = trpc.whatsapp.countRecipients.useQuery(
    { segment: newCampaign.segment },
    { enabled: showNewCampaign }
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-green-600" />
            WhatsApp
          </h1>
          <p className="text-muted-foreground text-sm">Notificações automáticas e campanhas via Z-API</p>
        </div>
        <div className="ml-auto">
          {config?.active ? (
            <Badge className="bg-green-100 text-green-700 gap-1"><Wifi className="w-3 h-3" /> Ativo</Badge>
          ) : (
            <Badge variant="secondary" className="gap-1"><WifiOff className="w-3 h-3" /> Inativo</Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="config">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="config"><Settings className="w-4 h-4 mr-1" />Configuração</TabsTrigger>
          <TabsTrigger value="campaigns"><Send className="w-4 h-4 mr-1" />Campanhas</TabsTrigger>
          <TabsTrigger value="logs"><History className="w-4 h-4 mr-1" />Histórico</TabsTrigger>
        </TabsList>

        {/* ── CONFIG TAB ─────────────────────────────────────────────────────── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Credenciais Z-API</CardTitle>
              <CardDescription>
                Crie uma conta em <a href="https://www.z-api.io" target="_blank" rel="noreferrer" className="text-primary underline">z-api.io</a>, crie uma instância e cole o ID e Token abaixo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ID da Instância</Label>
                  <Input
                    placeholder="Ex: 3C8A2B1D4E5F..."
                    value={configForm.instanceId}
                    onChange={e => setConfigForm(f => ({ ...f, instanceId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Token {config?.tokenSet && <Badge variant="outline" className="ml-1 text-xs">Já configurado</Badge>}</Label>
                  <Input
                    type="password"
                    placeholder={config?.tokenSet ? "••••••••••••••••" : "Cole o token aqui"}
                    value={configForm.token}
                    onChange={e => setConfigForm(f => ({ ...f, token: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Switch
                  checked={configForm.active}
                  onCheckedChange={v => setConfigForm(f => ({ ...f, active: v }))}
                />
                <div>
                  <p className="font-medium text-sm">Integração ativa</p>
                  <p className="text-xs text-muted-foreground">Quando desativado, nenhuma mensagem será enviada</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => saveConfigMut.mutate({
                    instanceId: configForm.instanceId,
                    token: configForm.token || "KEEP",
                    active: configForm.active,
                    notifyOnPoints: configForm.notifyOnPoints,
                    notifyOnGoalNear: configForm.notifyOnGoalNear,
                    notifyOnGoalReached: configForm.notifyOnGoalReached,
                    msgPointsEarned: configForm.msgPointsEarned || undefined,
                    msgGoalNear: configForm.msgGoalNear || undefined,
                    msgGoalReached: configForm.msgGoalReached || undefined,
                    msgPromotion: configForm.msgPromotion || undefined,
                  })}
                  disabled={saveConfigMut.isPending}
                >
                  {saveConfigMut.isPending ? "Salvando..." : "Salvar Configuração"}
                </Button>
                <Button variant="outline" onClick={() => recheckConnection()} className="gap-2">
                  <RefreshCw className="w-4 h-4" /> Testar Conexão
                </Button>
              </div>

              {connectionStatus && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${connectionStatus.connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {connectionStatus.connected
                    ? <><CheckCircle className="w-4 h-4" /> Conectado! {connectionStatus.phone && `(${connectionStatus.phone})`}</>
                    : <><XCircle className="w-4 h-4" /> {connectionStatus.error ?? "Não conectado"}</>
                  }
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notificações Automáticas</CardTitle>
              <CardDescription>Configure quando e como enviar mensagens automáticas ao pontuar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "notifyOnPoints", label: "Ao ganhar pontos", desc: "Enviado sempre que o cliente pontuar", msgKey: "msgPointsEarned", defaultKey: "pointsEarned" },
                { key: "notifyOnGoalNear", label: "Próximo da meta (80%+)", desc: "Alerta quando faltam poucos pontos", msgKey: "msgGoalNear", defaultKey: "goalNear" },
                { key: "notifyOnGoalReached", label: "Meta atingida!", desc: "Parabéns ao completar a meta", msgKey: "msgGoalReached", defaultKey: "goalReached" },
              ].map(({ key, label, desc, msgKey, defaultKey }) => (
                <div key={key} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={configForm[key as keyof typeof configForm] as boolean}
                      onCheckedChange={v => setConfigForm(f => ({ ...f, [key]: v }))}
                    />
                    <div>
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">Mensagem</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-6"
                        onClick={() => setConfigForm(f => ({
                          ...f,
                          [msgKey]: defaultTemplates?.[defaultKey as keyof typeof defaultTemplates] ?? "",
                        }))}
                      >
                        Usar padrão
                      </Button>
                    </div>
                    <Textarea
                      rows={4}
                      placeholder={`Variáveis: {{nome}}, {{pontos}}, {{saldo}}, {{meta}}, {{faltam}}, {{recompensa}}`}
                      value={configForm[msgKey as keyof typeof configForm] as string}
                      onChange={e => setConfigForm(f => ({ ...f, [msgKey]: e.target.value }))}
                      className="text-sm font-mono"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TestTube2 className="w-4 h-4" /> Enviar Mensagem de Teste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Número (com DDD)</Label>
                  <Input placeholder="Ex: 62999999999" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Mensagem</Label>
                <Textarea rows={3} value={testMsg} onChange={e => setTestMsg(e.target.value)} />
              </div>
              <Button
                onClick={() => testMut.mutate({ phone: testPhone, message: testMsg })}
                disabled={testMut.isPending || !testPhone}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                {testMut.isPending ? "Enviando..." : "Enviar Teste"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CAMPAIGNS TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="campaigns" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{campaigns?.length ?? 0} campanha(s) criada(s)</p>
            <Button onClick={() => setShowNewCampaign(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Nova Campanha
            </Button>
          </div>

          {campaignsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : campaigns?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Send className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Nenhuma campanha criada</p>
                <p className="text-sm text-muted-foreground mt-1">Crie campanhas para enviar promoções em massa para seus clientes</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {campaigns?.map(c => (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{c.name}</span>
                          <Badge className={STATUS_COLORS[c.status] ?? ""}>{c.status}</Badge>
                          <Badge variant="outline" className="text-xs">
                            <Users className="w-3 h-3 mr-1" />{SEGMENT_LABELS[c.segment] ?? c.segment}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.message}</p>
                        {c.status === "sent" && (
                          <p className="text-xs text-muted-foreground mt-1">
                            ✓ {c.totalSent} enviadas · ✗ {c.totalFailed} falhas · Total: {c.totalRecipients}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {(c.status === "draft" || c.status === "failed") && (
                          <Button
                            size="sm"
                            className="gap-1"
                            disabled={sendCampaignMut.isPending}
                            onClick={() => sendCampaignMut.mutate({ campaignId: c.id })}
                          >
                            <Play className="w-3 h-3" /> Enviar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteCampaignMut.mutate({ id: c.id })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── LOGS TAB ──────────────────────────────────────────────────────── */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Mensagens</CardTitle>
              <CardDescription>Últimas 50 mensagens enviadas pelo sistema</CardDescription>
            </CardHeader>
            <CardContent>
              {!logs || logs.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">Nenhuma mensagem enviada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border text-sm">
                      {log.status === "sent"
                        ? <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">{log.phone}</span>
                          <Badge variant="outline" className="text-xs">{log.type}</Badge>
                          {log.status === "failed" && log.errorMessage && (
                            <span className="text-xs text-red-500">{log.errorMessage}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{log.message}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString("pt-BR") : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── NEW CAMPAIGN DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da campanha</Label>
              <Input
                placeholder="Ex: Promoção de Verão"
                value={newCampaign.name}
                onChange={e => setNewCampaign(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Segmento de clientes</Label>
              <Select value={newCampaign.segment} onValueChange={v => setNewCampaign(f => ({ ...f, segment: v as "all" | "with_points" | "no_points" | "near_goal" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {recipientCount !== undefined && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> {recipientCount} cliente(s) neste segmento
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                rows={5}
                placeholder="Use {{nome}} para personalizar. Ex: Olá {{nome}}, temos uma promoção especial para você! 🍦"
                value={newCampaign.message}
                onChange={e => setNewCampaign(f => ({ ...f, message: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Variáveis: {"{{nome}}"}, {"{{pontos}}"}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCampaign(false)}>Cancelar</Button>
            <Button
              onClick={() => createCampaignMut.mutate(newCampaign)}
              disabled={createCampaignMut.isPending || !newCampaign.name || !newCampaign.message}
            >
              {createCampaignMut.isPending ? "Criando..." : "Criar Campanha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
