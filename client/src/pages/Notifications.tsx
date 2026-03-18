import DashboardLayout from "@/components/DashboardLayout";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Bell, Edit, MessageCircle, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type NotifType = "birthday" | "points_milestone" | "promotion" | "custom";
type NotifChannel = "whatsapp" | "instagram" | "meta" | "email";

type TemplateForm = {
  name: string;
  type: NotifType;
  channel: NotifChannel;
  subject: string;
  message: string;
};

const emptyTemplate: TemplateForm = {
  name: "", type: "birthday", channel: "whatsapp", subject: "", message: "",
};

const typeLabels: Record<string, string> = {
  birthday: "Aniversário",
  points_milestone: "Meta de Pontos",
  promotion: "Promoção",
  custom: "Personalizada",
};

const channelLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  meta: "Meta Ads",
  email: "E-mail",
};

const channelColors: Record<string, string> = {
  whatsapp: "bg-green-100 text-green-700",
  instagram: "bg-pink-100 text-pink-700",
  meta: "bg-blue-100 text-blue-700",
  email: "bg-gray-100 text-gray-700",
};

const statusColors: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
};

export default function Notifications() {
  const [templateOpen, setTemplateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyTemplate);
  const [sendForm, setSendForm] = useState({
    templateId: "",
    customerId: "",
    channel: "whatsapp",
    message: "",
  });

  const utils = trpc.useUtils();
  const { data: templates } = trpc.notifications.getTemplates.useQuery();
  const { data: logs } = trpc.notifications.getLogs.useQuery({ limit: 50 });
  const { data: customers } = trpc.customers.list.useQuery({});

  const createTemplate = trpc.notifications.createTemplate.useMutation({
    onSuccess: () => { utils.notifications.getTemplates.invalidate(); toast.success("Template criado!"); setTemplateOpen(false); setForm(emptyTemplate); },
    onError: (e) => toast.error(e.message),
  });

  const updateTemplate = trpc.notifications.updateTemplate.useMutation({
    onSuccess: () => { utils.notifications.getTemplates.invalidate(); toast.success("Template atualizado!"); setTemplateOpen(false); setEditId(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteTemplate = trpc.notifications.deleteTemplate.useMutation({
    onSuccess: () => { utils.notifications.getTemplates.invalidate(); toast.success("Template removido."); },
    onError: (e) => toast.error(e.message),
  });

  const sendNotification = trpc.notifications.send.useMutation({
    onSuccess: () => {
      utils.notifications.getLogs.invalidate();
      toast.success("Notificação enviada!");
      setSendOpen(false);
      setSendForm({ templateId: "", customerId: "", channel: "whatsapp", message: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  function openEdit(t: NonNullable<typeof templates>[0]) {
    setEditId(t.id);
    setForm({ name: t.name, type: t.type, channel: t.channel, subject: t.subject ?? "", message: t.message });
    setTemplateOpen(true);
  }

  function handleTemplateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editId) updateTemplate.mutate({ id: editId, ...form });
    else createTemplate.mutate(form);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendNotification.mutate({
      templateId: sendForm.templateId ? parseInt(sendForm.templateId) : undefined,
      customerId: sendForm.customerId ? parseInt(sendForm.customerId) : undefined,
      channel: sendForm.channel as any,
      message: sendForm.message,
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />
              Notificações e Marketing
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              WhatsApp, Instagram e Meta — envie mensagens para seus clientes
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setEditId(null); setForm(emptyTemplate); setTemplateOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Template
            </Button>
            <Button onClick={() => setSendOpen(true)} className="gap-2">
              <Send className="h-4 w-4" />
              Enviar Mensagem
            </Button>
          </div>
        </div>

        {/* Channel Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: "💬", label: "WhatsApp Business", desc: "Envie mensagens diretas aos clientes via WhatsApp API", color: "border-green-200 bg-green-50" },
            { icon: "📸", label: "Instagram", desc: "Publique stories e posts promocionais automaticamente", color: "border-pink-200 bg-pink-50" },
            { icon: "📢", label: "Meta Ads", desc: "Crie campanhas segmentadas no Facebook e Instagram", color: "border-blue-200 bg-blue-50" },
          ].map((ch) => (
            <Card key={ch.label} className={`border ${ch.color}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <span className="text-2xl">{ch.icon}</span>
                <div>
                  <p className="font-semibold text-sm">{ch.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ch.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="logs">Histórico de Envios</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="mt-4">
            {!templates?.length ? (
              <Card>
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <MessageCircle className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">Nenhum template criado ainda.</p>
                  <Button onClick={() => { setEditId(null); setForm(emptyTemplate); setTemplateOpen(true); }} variant="outline" className="mt-3 gap-2">
                    <Plus className="h-4 w-4" />
                    Criar primeiro template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((t) => (
                  <Card key={t.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="truncate">{t.name}</span>
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${channelColors[t.channel]}`}>
                            {channelLabels[t.channel]}
                          </span>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm("Remover template?")) deleteTemplate.mutate({ id: t.id }); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant="outline" className="text-xs mb-2">{typeLabels[t.type]}</Badge>
                      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{t.message}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Variáveis: <code className="bg-muted px-1 rounded">{"{{nome}}"}</code>{" "}
                        <code className="bg-muted px-1 rounded">{"{{pontos}}"}</code>{" "}
                        <code className="bg-muted px-1 rounded">{"{{recompensa}}"}</code>
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            {!logs?.length ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhuma notificação enviada ainda.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <Card key={log.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${channelColors[log.channel]}`}>
                            {channelLabels[log.channel]}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[log.status]}`}>
                            {log.status === "sent" ? "Enviado" : log.status === "failed" ? "Falhou" : "Pendente"}
                          </span>
                          <span className="text-sm">{log.customerName ?? "Sem destinatário"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{log.message}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {new Date(log.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Template Dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Template" : "Novo Template"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTemplateSubmit} className="space-y-3 mt-2">
            <div>
              <Label>Nome do Template *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as NotifType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Canal *</Label>
                <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v as NotifChannel }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(channelLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Assunto (para e-mail)</Label>
              <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
            <div>
              <Label>Mensagem *</Label>
              <Textarea
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                rows={4}
                placeholder={"Olá {{nome}}! 🎂 Feliz aniversário! Você tem {{pontos}} pontos acumulados..."}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use: <code className="bg-muted px-1 rounded">{"{{nome}}"}</code>{" "}
                <code className="bg-muted px-1 rounded">{"{{pontos}}"}</code>{" "}
                <code className="bg-muted px-1 rounded">{"{{recompensa}}"}</code>
              </p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setTemplateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createTemplate.isPending || updateTemplate.isPending}>
                {editId ? "Salvar" : "Criar Template"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Send Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Enviar Notificação
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSend} className="space-y-3 mt-2">
            <div>
              <Label>Canal *</Label>
              <Select value={sendForm.channel} onValueChange={(v) => setSendForm((f) => ({ ...f, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(channelLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template (opcional)</Label>
              <Select value={sendForm.templateId} onValueChange={(v) => {
                const t = templates?.find((t) => String(t.id) === v);
                setSendForm((f) => ({ ...f, templateId: v, message: t?.message ?? f.message }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione um template..." /></SelectTrigger>
                <SelectContent>
                  {templates?.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cliente (opcional)</Label>
              <Select value={sendForm.customerId} onValueChange={(v) => setSendForm((f) => ({ ...f, customerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Todos os clientes ou selecione..." /></SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mensagem *</Label>
              <Textarea
                value={sendForm.message}
                onChange={(e) => setSendForm((f) => ({ ...f, message: e.target.value }))}
                rows={4}
                placeholder="Digite a mensagem..."
                required
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setSendOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={sendNotification.isPending} className="gap-2">
                <Send className="h-4 w-4" />
                Enviar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
