import { useState } from "react";
import BackButton from "@/components/BackButton";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Landmark, Wallet, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const BANK_COLORS = [
  { label: "Azul", value: "#3b82f6" },
  { label: "Verde", value: "#22c55e" },
  { label: "Roxo", value: "#8b5cf6" },
  { label: "Laranja", value: "#f97316" },
  { label: "Rosa", value: "#ec4899" },
  { label: "Amarelo", value: "#eab308" },
  { label: "Vermelho", value: "#ef4444" },
  { label: "Ciano", value: "#06b6d4" },
  { label: "Cinza", value: "#6b7280" },
];

type BankForm = {
  name: string;
  color: string;
  initialBalance: string;
};

export default function FinBanks() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: banks = [], refetch, isLoading } = trpc.fin.banks.list.useQuery();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<BankForm>({
    defaultValues: { name: "", color: "#3b82f6", initialBalance: "0" }
  });

  const createMut = trpc.fin.banks.create.useMutation({
    onSuccess: () => { toast.success("Banco criado!"); refetch(); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.fin.banks.update.useMutation({
    onSuccess: () => { toast.success("Banco atualizado!"); refetch(); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.fin.banks.delete.useMutation({
    onSuccess: () => { toast.success("Banco removido!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditId(null);
    reset({ name: "", color: "#3b82f6", initialBalance: "0" });
    setModalOpen(true);
  }

  function openEdit(b: typeof banks[0]) {
    setEditId(b.id);
    reset({
      name: b.name,
      color: b.color ?? "#3b82f6",
      initialBalance: String(b.initialBalance ?? 0),
    });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditId(null); }

  function onSubmit(data: BankForm) {
    const payload = {
      name: data.name,
      color: data.color,
      initialBalance: Number(data.initialBalance) || 0,
    };
    if (editId) {
      updateMut.mutate({ id: editId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const totalBalance = banks.reduce((s, b) => s + Number(b.initialBalance ?? 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/fin/settings" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Landmark className="w-6 h-6 text-primary" /> Cadastro de Bancos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie suas contas bancárias e caixas
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Banco / Caixa
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <Landmark className="w-8 h-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total de Contas</p>
                <p className="text-2xl font-bold">{banks.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <Wallet className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Saldo Total Inicial</p>
                <p className="text-2xl font-bold text-green-600">{fmtBRL(totalBalance)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Contas Ativas</p>
                <p className="text-2xl font-bold text-blue-600">{banks.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Banks Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contas Cadastradas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cor</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Saldo Inicial</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <div className="h-4 bg-muted/30 rounded animate-pulse mx-auto w-48" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && banks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      <Landmark className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>Nenhum banco ou caixa cadastrado</p>
                      <p className="text-xs mt-1">Clique em "Novo Banco / Caixa" para começar</p>
                    </TableCell>
                  </TableRow>
                )}
                {banks.map(b => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: b.color ?? "#3b82f6" }}
                      >
                        <Landmark className="w-4 h-4 text-white" />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {fmtBRL(Number(b.initialBalance ?? 0))}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEdit(b)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-700"
                          onClick={() => {
                            if (confirm(`Remover o banco "${b.name}"?`)) {
                              deleteMut.mutate({ id: b.id });
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Banco / Caixa" : "Novo Banco / Caixa"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input
                  {...register("name", { required: "Nome obrigatório" })}
                  placeholder="Ex: Caixa, Nubank, Itaú, Bradesco..."
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>

              <div className="space-y-1">
                <Label>Saldo Inicial (R$)</Label>
                <Input
                  {...register("initialBalance")}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                />
                <p className="text-xs text-muted-foreground">
                  Informe o saldo atual desta conta para cálculos de fluxo de caixa
                </p>
              </div>

              <div className="space-y-1">
                <Label>Cor de Identificação</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {BANK_COLORS.map(col => (
                    <button
                      key={col.value}
                      type="button"
                      title={col.label}
                      onClick={() => setValue("color", col.value)}
                      className={`w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center ${
                        watch("color") === col.value ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: col.value }}
                    >
                      {watch("color") === col.value && (
                        <span className="text-white text-xs font-bold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div
                    className="w-8 h-8 rounded-lg border flex items-center justify-center"
                    style={{ backgroundColor: watch("color") }}
                  >
                    <Landmark className="w-4 h-4 text-white" />
                  </div>
                  <Input
                    type="color"
                    {...register("color")}
                    className="w-16 h-8 p-0.5 cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground">Ou escolha uma cor personalizada</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1">
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMut.isPending || updateMut.isPending}
                >
                  {editId ? "Salvar" : "Criar Conta"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
