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
import { trpc } from "@/lib/trpc";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type SaleItem = {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

const paymentLabels: Record<string, string> = {
  cash: "Dinheiro",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  pix: "PIX",
  other: "Outro",
};

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-yellow-100 text-yellow-700",
};

export default function Sales() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit_card" | "debit_card" | "pix" | "other">("cash");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [pointsRedeemed, setPointsRedeemed] = useState("0");

  const utils = trpc.useUtils();
  const { data: sales, isLoading } = trpc.sales.list.useQuery({});
  const { data: products } = trpc.products.list.useQuery({});
  const { data: customers } = trpc.customers.list.useQuery({});

  const createSale = trpc.sales.create.useMutation({
    onSuccess: () => {
      utils.sales.list.invalidate();
      utils.dashboard.metrics.invalidate();
      toast.success("Venda registrada com sucesso!");
      setOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setItems([]);
    setCustomerId("");
    setPaymentMethod("cash");
    setDiscount("0");
    setNotes("");
    setPointsRedeemed("0");
  }

  function addItem(productId: string) {
    const product = products?.find((p) => p.id === parseInt(productId));
    if (!product) return;
    const existing = items.find((i) => i.productId === product.id);
    if (existing) {
      setItems((prev) =>
        prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unitPrice }
            : i
        )
      );
    } else {
      const price = parseFloat(String(product.salePrice));
      setItems((prev) => [
        ...prev,
        { productId: product.id, productName: product.name, quantity: 1, unitPrice: price, subtotal: price },
      ]);
    }
  }

  function updateQty(productId: number, delta: number) {
    setItems((prev) =>
      prev
        .map((i) =>
          i.productId === productId
            ? { ...i, quantity: i.quantity + delta, subtotal: (i.quantity + delta) * i.unitPrice }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  }

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const discountVal = parseFloat(discount) || 0;
  const finalTotal = Math.max(0, subtotal - discountVal);

  // Calculate points earned (1 point per R$10)
  const pointsEarned = Math.floor(finalTotal / 10);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      toast.error("Adicione pelo menos um produto.");
      return;
    }
    createSale.mutate({
      customerId: customerId ? parseInt(customerId) : undefined,
      total: subtotal,
      discount: discountVal,
      finalTotal,
      paymentMethod,
      pointsEarned,
      pointsRedeemed: parseInt(pointsRedeemed) || 0,
      notes: notes || undefined,
      items,
    });
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-primary" />
              Vendas
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {sales?.length ?? 0} venda(s) registrada(s)
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Venda
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="animate-pulse"><CardContent className="p-4 h-16 bg-muted/30 rounded-lg" /></Card>
            ))}
          </div>
        ) : sales?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nenhuma venda registrada.</p>
              <Button onClick={() => setOpen(true)} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Registrar primeira venda
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sales!.map((s) => (
              <Card key={s.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">Venda #{s.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[s.status]}`}>
                        {s.status === "completed" ? "Concluída" : s.status === "cancelled" ? "Cancelada" : "Reembolsada"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(s.createdAt).toLocaleString("pt-BR")} · {paymentLabels[s.paymentMethod]}
                      {s.pointsEarned > 0 && ` · +${s.pointsEarned} pts`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-base">{formatCurrency(parseFloat(String(s.finalTotal)))}</p>
                    {parseFloat(String(s.discount)) > 0 && (
                      <p className="text-xs text-muted-foreground line-through">
                        {formatCurrency(parseFloat(String(s.total)))}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Nova Venda Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Venda</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cliente (opcional)</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um cliente..." /></SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.fullName} — {c.totalPoints} pts
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Forma de Pagamento *</Label>
                <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(paymentLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Adicionar Produto</Label>
              <Select onValueChange={addItem}>
                <SelectTrigger><SelectValue placeholder="Selecione um produto para adicionar..." /></SelectTrigger>
                <SelectContent>
                  {products?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} — {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(String(p.salePrice)))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {items.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Itens da Venda</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.map((item) => (
                    <div key={item.productId} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <span className="text-sm font-medium truncate flex-1">{item.productName}</span>
                      <div className="flex items-center gap-2 ml-2">
                        <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(item.productId, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm w-6 text-center">{item.quantity}</span>
                        <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(item.productId, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm font-medium w-20 text-right">
                          {formatCurrency(item.subtotal)}
                        </span>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setItems((prev) => prev.filter((i) => i.productId !== item.productId))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Desconto (R$)</Label>
                <Input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div>
                <Label>Pontos a Resgatar</Label>
                <Input type="number" min="0" value={pointsRedeemed} onChange={(e) => setPointsRedeemed(e.target.value)} />
              </div>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discountVal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="text-red-500">-{formatCurrency(discountVal)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-1.5">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(finalTotal)}</span>
              </div>
              {customerId && pointsEarned > 0 && (
                <p className="text-xs text-green-600 text-right">+{pointsEarned} pontos para o cliente</p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancelar</Button>
              <Button type="submit" disabled={createSale.isPending || items.length === 0}>
                Finalizar Venda
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
