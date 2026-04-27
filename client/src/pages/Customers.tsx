import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ChevronDown, ChevronUp, Copy, Edit, Gift, Link2, Plus, Search, ShoppingBag, ShoppingCart, TrendingUp, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Utilitário: exibe data sem conversão de fuso ────────────────────────────
function formatBirthDate(raw: Date | string | null | undefined): string {
  if (!raw) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

// ─── Componente de stats de compras (lazy, só carrega ao expandir) ────────────
function CustomerStats({ customerId, totalPurchases }: { customerId: number; totalPurchases: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: stats, isLoading: statsLoading } = trpc.customers.purchaseStatsFromTable.useQuery(
    { customerId },
    { enabled: expanded }
  );
  const { data: history, isLoading: histLoading } = trpc.customers.purchaseHistory.useQuery(
    { customerId, limit: 10 },
    { enabled: expanded }
  );

  const isLoading = statsLoading || histLoading;

  const fmt = (v: number | string) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      typeof v === "string" ? parseFloat(v) : v
    );

  const paymentLabel: Record<string, string> = {
    cash: "Dinheiro",
    credit_card: "Crédito",
    debit_card: "Débito",
    pix: "Pix",
    other: "Outro",
  };

  const paymentColor: Record<string, string> = {
    cash: "bg-green-100 text-green-700",
    credit_card: "bg-blue-100 text-blue-700",
    debit_card: "bg-indigo-100 text-indigo-700",
    pix: "bg-purple-100 text-purple-700",
    other: "bg-gray-100 text-gray-700",
  };

  const hasHistory = (history?.length ?? 0) > 0;
  const hasStats = stats && (stats.visitCount > 0);

  return (
    <div className="mt-2">
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <ShoppingBag className="h-3 w-3" />
        <span>Total compras: <strong className="text-foreground">{fmt(totalPurchases)}</strong></span>
        {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg border bg-muted/30 p-3 space-y-3 text-xs">
          {isLoading ? (
            <p className="text-muted-foreground animate-pulse">Carregando histórico...</p>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-background border p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Visitas</p>
                  <p className="font-bold text-sm text-foreground">{stats?.visitCount ?? 0}</p>
                </div>
                <div className="rounded-md bg-background border p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ticket Médio</p>
                  <p className="font-bold text-sm text-foreground">{fmt(stats?.avgPurchase ?? 0)}</p>
                </div>
                <div className="rounded-md bg-background border p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Gasto</p>
                  <p className="font-bold text-sm text-foreground">{fmt(stats?.totalSpent ?? 0)}</p>
                </div>
              </div>

              {/* Última visita */}
              {stats?.lastVisitDate && (
                <p className="text-muted-foreground text-[10px]">
                  Última visita: <strong className="text-foreground">{new Date(stats.lastVisitDate).toLocaleDateString("pt-BR")}</strong>
                </p>
              )}

              {/* Histórico de compras */}
              {hasHistory ? (
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Histórico de compras</p>
                  {history!.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 py-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${paymentColor[p.paymentMethod] ?? "bg-gray-100 text-gray-700"}`}>
                          {paymentLabel[p.paymentMethod] ?? p.paymentMethod}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                        {p.pointsEarned > 0 && (
                          <span className="text-amber-600 shrink-0">+{p.pointsEarned}pts</span>
                        )}
                      </div>
                      <strong className="shrink-0">{fmt(p.amount)}</strong>
                    </div>
                  ))}
                </div>
              ) : !hasStats ? (
                <p className="text-muted-foreground text-center py-2">Nenhuma compra registrada ainda.</p>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
type CustomerForm = {
  fullName: string;
  birthDate: string;
  cep: string;
  phone: string;
  email: string;
  notes: string;
};

const emptyForm: CustomerForm = {
  fullName: "",
  birthDate: "",
  cep: "",
  phone: "",
  email: "",
  notes: "",
};

export default function Customers() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);

  // ── Registro de compra ──
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseCustomerId, setPurchaseCustomerId] = useState<number | null>(null);
  const [purchaseCustomerName, setPurchaseCustomerName] = useState("");
  const [purchaseForm, setPurchaseForm] = useState({ amount: "", paymentMethod: "pix" as const, notes: "" });

  const utils = trpc.useUtils();
  const { data: customers, isLoading } = trpc.customers.list.useQuery({ search: search || undefined });

  const createMutation = trpc.customers.create.useMutation({
    onSuccess: () => {
      utils.customers.list.invalidate();
      toast.success("Cliente cadastrado com sucesso!");
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.customers.update.useMutation({
    onSuccess: () => {
      utils.customers.list.invalidate();
      toast.success("Cliente atualizado!");
      setOpen(false);
      setEditId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const registerPurchaseMutation = trpc.customers.registerPurchase.useMutation({
    onSuccess: (data) => {
      utils.customers.list.invalidate();
      utils.customers.getStats.invalidate();
      utils.customers.purchaseHistory.invalidate();
      utils.customers.purchaseStatsFromTable.invalidate();
      toast.success(`Compra registrada! ${data.pointsEarned > 0 ? `+${data.pointsEarned} pontos` : ""}`);
      setPurchaseOpen(false);
      setPurchaseForm({ amount: "", paymentMethod: "pix", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.customers.delete.useMutation({
    onSuccess: () => {
      utils.customers.list.invalidate();
      toast.success("Cliente removido.");
    },
    onError: (e) => toast.error(e.message),
  });

  function openRegisterPurchase(c: NonNullable<typeof customers>[0]) {
    setPurchaseCustomerId(c.id);
    setPurchaseCustomerName(c.fullName);
    setPurchaseForm({ amount: "", paymentMethod: "pix", notes: "" });
    setPurchaseOpen(true);
  }

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(c: NonNullable<typeof customers>[0]) {
    setEditId(c.id);
    setForm({
      fullName: c.fullName,
      // Usa UTC para não perder 1 dia por fuso
      birthDate: c.birthDate
        ? (() => {
            const d = c.birthDate instanceof Date ? c.birthDate : new Date(c.birthDate);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, "0");
            const day = String(d.getUTCDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
          })()
        : "",
      cep: c.cep ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      notes: c.notes ?? "",
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editId) {
      updateMutation.mutate({ id: editId, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleCepBlur() {
    const cep = form.cep.replace(/\D/g, "");
    if (cep.length === 8) {
      fetch(`https://viacep.com.br/ws/${cep}/json/`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.erro) {
            toast.info(`CEP: ${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`);
          }
        })
        .catch(() => {});
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/dashboard" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Clientes
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {customers?.length ?? 0} cliente(s) cadastrado(s)
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Cliente
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4 h-28 bg-muted/30 rounded-lg" />
              </Card>
            ))}
          </div>
        ) : customers?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
              <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Cadastrar primeiro cliente
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customers!.map((c) => (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.fullName}</p>
                      <p className="text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-pink-600 hover:text-pink-700"
                        title="Copiar link de fidelidade"
                        onClick={async () => {
                          try {
                            const result = await utils.points.getPublicToken.fetch({ customerId: c.id });
                            if (result) {
                              const url = `${window.location.origin}/fidelidade/${result}`;
                              await navigator.clipboard.writeText(url);
                              toast.success(`Link copiado! Cole no WhatsApp para ${c.fullName}`);
                            }
                          } catch {
                            toast.error("Erro ao gerar link de fidelidade");
                          }
                        }}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-green-600 hover:text-green-700"
                        title="Registrar compra"
                        onClick={() => openRegisterPurchase(c)}
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Remover este cliente?")) deleteMutation.mutate({ id: c.id });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Gift className="h-3 w-3" />
                      {c.totalPoints} pts
                    </Badge>
                    {c.birthDate && (
                      <Badge variant="outline" className="text-xs">
                        🎂 {formatBirthDate(c.birthDate)}
                      </Badge>
                    )}
                    {c.cep && (
                      <Badge variant="outline" className="text-xs">
                        📍 {c.cep}
                      </Badge>
                    )}
                  </div>
                  {/* Stats expandíveis com últimas compras e média */}
                  <CustomerStats customerId={c.id} totalPurchases={String(c.totalPurchases)} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <Label htmlFor="fullName">Nome Completo *</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="Nome completo do cliente"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="birthDate">Data de Nascimento</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  value={form.cep}
                  onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Observações sobre o cliente..."
                rows={2}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editId ? "Salvar Alterações" : "Cadastrar Cliente"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* ── Modal Registrar Compra ── */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-green-600" />
              Registrar Compra
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">Cliente: <strong>{purchaseCustomerName}</strong></p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!purchaseCustomerId) return;
              registerPurchaseMutation.mutate({
                customerId: purchaseCustomerId,
                amount: parseFloat(purchaseForm.amount),
                paymentMethod: purchaseForm.paymentMethod,
                notes: purchaseForm.notes || undefined,
              });
            }}
            className="space-y-4 mt-2"
          >
            <div>
              <Label htmlFor="purchaseAmount">Valor da Compra (R$) *</Label>
              <Input
                id="purchaseAmount"
                type="number"
                step="0.01"
                min="0.01"
                value={purchaseForm.amount}
                onChange={(e) => setPurchaseForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
                required
              />
            </div>
            <div>
              <Label htmlFor="purchasePayment">Forma de Pagamento *</Label>
              <select
                id="purchasePayment"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={purchaseForm.paymentMethod}
                onChange={(e) => setPurchaseForm((f) => ({ ...f, paymentMethod: e.target.value as any }))}
              >
                <option value="pix">PIX</option>
                <option value="cash">Dinheiro</option>
                <option value="debit_card">Cartão Débito</option>
                <option value="credit_card">Cartão Crédito</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <Label htmlFor="purchaseNotes">Observações</Label>
              <Input
                id="purchaseNotes"
                value={purchaseForm.notes}
                onChange={(e) => setPurchaseForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ex: Sorvete de morango, 2kg..."
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setPurchaseOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-green-600 hover:bg-green-700"
                disabled={registerPurchaseMutation.isPending}
              >
                {registerPurchaseMutation.isPending ? "Registrando..." : "Registrar Compra"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
