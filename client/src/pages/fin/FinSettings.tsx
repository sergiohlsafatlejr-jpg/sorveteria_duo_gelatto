import { useState } from "react";
import BackButton from "@/components/BackButton";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Edit2, Plus, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const BANK_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
];

export default function FinSettings() {
  const utils = trpc.useUtils();

  // Categories
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();
  const [newCategory, setNewCategory] = useState("");
  const [editCatId, setEditCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");

  const createCatMut = trpc.fin.categories.create.useMutation({
    onSuccess: () => { utils.fin.categories.list.invalidate(); setNewCategory(""); toast.success("Categoria criada!"); },
    onError: (e) => toast.error(e.message),
  });
  const updateCatMut = trpc.fin.categories.update.useMutation({
    onSuccess: () => { utils.fin.categories.list.invalidate(); setEditCatId(null); toast.success("Categoria atualizada!"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCatMut = trpc.fin.categories.delete.useMutation({
    onSuccess: () => { utils.fin.categories.list.invalidate(); toast.success("Categoria excluída!"); },
  });

  // Banks
  const { data: banks = [] } = trpc.fin.banks.list.useQuery();
  const [newBank, setNewBank] = useState({ name: "", color: BANK_COLORS[0], initialBalance: "" });
  const [editBankId, setEditBankId] = useState<number | null>(null);
  const [editBankData, setEditBankData] = useState({ name: "", color: "", initialBalance: "" });

  const createBankMut = trpc.fin.banks.create.useMutation({
    onSuccess: () => { utils.fin.banks.list.invalidate(); setNewBank({ name: "", color: BANK_COLORS[0], initialBalance: "" }); toast.success("Banco criado!"); },
    onError: (e) => toast.error(e.message),
  });
  const updateBankMut = trpc.fin.banks.update.useMutation({
    onSuccess: () => { utils.fin.banks.list.invalidate(); setEditBankId(null); toast.success("Banco atualizado!"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteBankMut = trpc.fin.banks.delete.useMutation({
    onSuccess: () => { utils.fin.banks.list.invalidate(); toast.success("Banco excluído!"); },
  });

  // Receivable Types
  const { data: recTypes = [] } = trpc.fin.receivableTypes.list.useQuery();
  const [newRecType, setNewRecType] = useState("");

  const createRecTypeMut = trpc.fin.receivableTypes.create.useMutation({
    onSuccess: () => { utils.fin.receivableTypes.list.invalidate(); setNewRecType(""); toast.success("Tipo criado!"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRecTypeMut = trpc.fin.receivableTypes.delete.useMutation({
    onSuccess: () => { utils.fin.receivableTypes.list.invalidate(); toast.success("Tipo excluído!"); },
  });

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="p-6 space-y-5">
        <BackButton to="/fin/dashboard" />

      <div>
        <h1 className="text-2xl font-bold">Configurações Financeiras</h1>
        <p className="text-sm text-muted-foreground">Gerencie categorias, bancos e tipos de lançamento</p>
      </div>

      <Tabs defaultValue="categories">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="banks">Bancos</TabsTrigger>
          <TabsTrigger value="types">Tipos</TabsTrigger>
        </TabsList>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nome da categoria..."
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              onKeyDown={e => e.key === "Enter" && newCategory && createCatMut.mutate({ name: newCategory })}
              className="flex-1"
            />
            <Button
              onClick={() => newCategory && createCatMut.mutate({ name: newCategory })}
              disabled={!newCategory || createCatMut.isPending}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          <div className="rounded-xl border border-border/50 overflow-hidden">
            {categories.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Nenhuma categoria cadastrada
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {categories.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20">
                    {editCatId === c.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editCatName}
                          onChange={e => setEditCatName(e.target.value)}
                          className="h-8 flex-1"
                          autoFocus
                        />
                        <Button size="icon" className="h-7 w-7" onClick={() => updateCatMut.mutate({ id: c.id, name: editCatName })}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditCatId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-medium">{c.name}</span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditCatId(c.id); setEditCatName(c.name); }}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCatMut.mutate({ id: c.id })}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Banks Tab */}
        <TabsContent value="banks" className="space-y-4 mt-4">
          <div className="rounded-xl border border-border/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Adicionar Banco/Conta</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input
                  placeholder="Ex: Bradesco, Nubank..."
                  value={newBank.name}
                  onChange={e => setNewBank(b => ({ ...b, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Saldo Inicial (R$)</Label>
                <Input
                  type="number" step="0.01" placeholder="0,00"
                  value={newBank.initialBalance}
                  onChange={e => setNewBank(b => ({ ...b, initialBalance: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {BANK_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewBank(b => ({ ...b, color }))}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-transform",
                      newBank.color === color ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <Button
              onClick={() => newBank.name && createBankMut.mutate({
                name: newBank.name,
                color: newBank.color,
                initialBalance: newBank.initialBalance ? Number(newBank.initialBalance) : 0,
              })}
              disabled={!newBank.name || createBankMut.isPending}
              className="gap-2 w-full"
            >
              <Plus className="h-4 w-4" /> Adicionar Banco
            </Button>
          </div>

          <div className="rounded-xl border border-border/50 overflow-hidden">
            {banks.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Nenhum banco cadastrado</div>
            ) : (
              <div className="divide-y divide-border/30">
                {banks.map(b => (
                  <div key={b.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20">
                    {editBankId === b.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editBankData.name}
                          onChange={e => setEditBankData(d => ({ ...d, name: e.target.value }))}
                          className="h-8 flex-1"
                          autoFocus
                        />
                        <Button size="icon" className="h-7 w-7" onClick={() => updateBankMut.mutate({
                          id: b.id, name: editBankData.name,
                          initialBalance: editBankData.initialBalance ? Number(editBankData.initialBalance) : undefined,
                        })}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditBankId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: b.color ?? "#6366f1" }} />
                          <div>
                            <p className="text-sm font-medium">{b.name}</p>
                            <p className="text-xs text-muted-foreground">Saldo inicial: {fmtBRL(Number(b.initialBalance ?? 0))}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditBankId(b.id);
                            setEditBankData({ name: b.name, color: b.color ?? "", initialBalance: String(b.initialBalance ?? 0) });
                          }}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteBankMut.mutate({ id: b.id })}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Receivable Types Tab */}
        <TabsContent value="types" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Tipo de recebimento (ex: Venda, Serviço)..."
              value={newRecType}
              onChange={e => setNewRecType(e.target.value)}
              onKeyDown={e => e.key === "Enter" && newRecType && createRecTypeMut.mutate({ description: newRecType })}
              className="flex-1"
            />
            <Button
              onClick={() => newRecType && createRecTypeMut.mutate({ description: newRecType })}
              disabled={!newRecType || createRecTypeMut.isPending}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          <div className="rounded-xl border border-border/50 overflow-hidden">
            {recTypes.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Nenhum tipo cadastrado</div>
            ) : (
              <div className="divide-y divide-border/30">
                {recTypes.map(t => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20">
                    <span className="text-sm font-medium">{t.description}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRecTypeMut.mutate({ id: t.id })}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
