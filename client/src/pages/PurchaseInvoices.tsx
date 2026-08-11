import DashboardLayout from "@/components/DashboardLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  PackageCheck,
  Pencil,
  RefreshCw,
  Search,
  Upload,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const STATUS = {
  pending: { label: "Pendente", color: "bg-slate-100 text-slate-700", icon: Clock3 },
  processing: { label: "Processando", color: "bg-blue-100 text-blue-700", icon: Loader2 },
  extracted: { label: "Extraído", color: "bg-emerald-100 text-emerald-700", icon: FileCheck2 },
  review_required: { label: "Revisar", color: "bg-amber-100 text-amber-800", icon: AlertTriangle },
  confirmed: { label: "Confirmado", color: "bg-violet-100 text-violet-700", icon: CheckCircle2 },
  error: { label: "Erro", color: "bg-red-100 text-red-700", icon: XCircle },
} as const;

const CATEGORIES = [
  ["limpeza", "Material de limpeza"],
  ["guloseimas", "Guloseimas"],
  ["caldas", "Caldas"],
  ["descartaveis", "Descartáveis"],
  ["embalagens", "Embalagens"],
  ["manutencao", "Manutenção"],
  ["insumos", "Insumos"],
  ["outros", "Outros itens"],
] as const;

type ReviewItem = {
  id: number;
  supplierCode: string | null;
  description: string;
  category: typeof CATEGORIES[number][0];
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
};

function money(value: string | number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
}

function dateOnly(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function dateTime(value: string | Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function getErrors(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function StatusBadge({ status }: { status: keyof typeof STATUS }) {
  const config = STATUS[status] ?? STATUS.pending;
  const Icon = config.icon;
  return (
    <Badge variant="secondary" className={`${config.color} gap-1.5 border-0`}>
      <Icon className={`h-3.5 w-3.5 ${status === "processing" ? "animate-spin" : ""}`} />
      {config.label}
    </Badge>
  );
}

export default function PurchaseInvoices() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"all" | keyof typeof STATUS>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [header, setHeader] = useState({ supplierName: "", supplierCnpj: "", invoiceNumber: "", issueDate: "", totalAmount: 0 });
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);

  const listInput = useMemo(() => ({ status, search, limit: 100 }), [status, search]);
  const { data: invoices = [], isLoading } = trpc.purchaseInvoices.list.useQuery(listInput);
  const detailInput = useMemo(() => ({ invoiceId: selectedId ?? 0 }), [selectedId]);
  const { data: detail, isLoading: detailLoading } = trpc.purchaseInvoices.getById.useQuery(detailInput, { enabled: selectedId !== null });
  const fileUrlQuery = trpc.purchaseInvoices.getFileUrl.useQuery(detailInput, { enabled: false });

  useEffect(() => {
    if (!detail) return;
    setHeader({
      supplierName: detail.invoice.supplierName ?? "",
      supplierCnpj: detail.invoice.supplierCnpj ?? "",
      invoiceNumber: detail.invoice.invoiceNumber ?? "",
      issueDate: detail.invoice.issueDate ?? "",
      totalAmount: Number(detail.invoice.totalAmount ?? 0),
    });
    setReviewItems(detail.items.map((item) => ({
      id: item.id,
      supplierCode: item.supplierCode,
      description: item.description,
      category: (CATEGORIES.some(([value]) => value === item.category) ? item.category : "outros") as ReviewItem["category"],
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
    })));
    setEditing(false);
  }, [detail]);

  const uploadMutation = trpc.purchaseInvoices.uploadAndExtract.useMutation({
    onSuccess: (result) => {
      const count = result.documentInvoiceCount ?? 1;
      toast.success(
        count > 1
          ? `${count} notas foram separadas do PDF${result.status === "review_required" ? " e enviadas para revisão." : "."}`
          : result.status === "review_required"
            ? "PDF extraído e enviado para revisão."
            : "PDF extraído com sucesso.",
      );
      void utils.purchaseInvoices.invalidate();
      setSelectedId(result.invoiceId);
      if (inputRef.current) inputRef.current.value = "";
    },
    onError: (error) => toast.error(error.message),
  });

  const reprocessMutation = trpc.purchaseInvoices.reprocess.useMutation({
    onSuccess: () => {
      toast.success("Nota reprocessada.");
      void utils.purchaseInvoices.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const saveMutation = trpc.purchaseInvoices.saveReview.useMutation({
    onSuccess: (result) => {
      toast.success(result.status === "extracted" ? "Revisão salva e valores conciliados." : "Revisão salva; ainda há divergências.");
      setEditing(false);
      void utils.purchaseInvoices.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const confirmMutation = trpc.purchaseInvoices.confirm.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.totalItems} item(ns) incorporado(s): ${result.operationalEntries} no almoxarifado e ${result.boxEntries} em Caixas de 10 L.`);
      setConfirmOpen(false);
      void Promise.all([
        utils.purchaseInvoices.invalidate(),
        utils.purchases.invalidate(),
        utils.boxStock.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  function handleFile(file: File) {
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Selecione um arquivo PDF válido.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O PDF deve ter no máximo 15 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => uploadMutation.mutate({ fileName: file.name, mimeType: "application/pdf", base64: String(reader.result) });
    reader.onerror = () => toast.error("Não foi possível ler o arquivo.");
    reader.readAsDataURL(file);
  }

  async function openPdf() {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    const result = await fileUrlQuery.refetch();
    if (result.data?.url) {
      if (popup) popup.location.href = result.data.url;
      else window.open(result.data.url, "_blank", "noopener,noreferrer");
    } else {
      popup?.close();
      toast.error("Não foi possível abrir o PDF.");
    }
  }

  function updateItem(id: number, changes: Partial<ReviewItem>) {
    setReviewItems((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  }

  function saveReview() {
    if (!selectedId) return;
    saveMutation.mutate({
      invoiceId: selectedId,
      ...header,
      supplierCnpj: header.supplierCnpj || null,
      items: reviewItems,
    });
  }

  const counters = useMemo(() => ({
    total: invoices.length,
    review: invoices.filter((invoice) => invoice.status === "review_required").length,
    extracted: invoices.filter((invoice) => invoice.status === "extracted" || invoice.status === "confirmed").length,
    errors: invoices.filter((invoice) => invoice.status === "error").length,
  }), [invoices]);

  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><FileText className="h-4 w-4" /> Compras Internas</div>
            <h1 className="text-3xl font-bold tracking-tight">Notas fiscais em PDF</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Envie a nota, revise cada item extraído pela IA e só depois incorpore os dados aos controles da sorveteria.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setLocation("/nfe-import")}>Importar XML</Button>
            <Button variant="outline" onClick={() => setLocation("/purchases/items")}>Compras por item</Button>
          </div>
        </div>

        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-amber-500/[0.05]">
          <CardContent className="p-5 md:p-7">
            <div
              className={`group cursor-pointer rounded-xl border-2 border-dashed p-7 text-center transition-all ${dragging ? "border-primary bg-primary/10" : "border-primary/25 bg-background/70 hover:border-primary/50 hover:bg-background"}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) handleFile(file); }}
              onClick={() => !uploadMutation.isPending && inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); }} />
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-3"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="font-medium">Armazenando e extraindo todos os itens...</p><p className="text-xs text-muted-foreground">Mantenha esta página aberta até a conclusão.</p></div>
              ) : (
                <div className="flex flex-col items-center gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary transition-transform group-hover:-translate-y-0.5"><Upload className="h-7 w-7" /></div><div><p className="font-semibold">Arraste o PDF da nota fiscal aqui</p><p className="mt-1 text-sm text-muted-foreground">Pode conter uma ou várias notas • máximo de 15 MB</p></div></div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notas exibidas</p><p className="mt-1 text-2xl font-bold">{counters.total}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-amber-700">Aguardando revisão</p><p className="mt-1 text-2xl font-bold text-amber-700">{counters.review}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Extraídas</p><p className="mt-1 text-2xl font-bold text-emerald-700">{counters.extracted}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-red-700">Com erro</p><p className="mt-1 text-2xl font-bold text-red-700">{counters.errors}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><CardTitle>Histórico de processamento</CardTitle><p className="mt-1 text-sm text-muted-foreground">Abra uma nota para conferir o cabeçalho, as divergências e cada produto.</p></div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <div className="relative min-w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Fornecedor, número ou arquivo" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{Object.entries(STATUS).map(([value, config]) => <SelectItem key={value} value={value}>{config.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead><tr className="border-y bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3">Nota / fornecedor</th><th className="px-4 py-3">Emissão</th><th className="px-4 py-3">Itens</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Ação</th></tr></thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={6} className="py-12 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Carregando histórico...</td></tr> : invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b transition-colors hover:bg-muted/20">
                      <td className="px-5 py-4"><p className="font-semibold">{invoice.supplierName || invoice.fileName}</p><p className="text-xs text-muted-foreground">NF {invoice.invoiceNumber || "não identificada"} • enviado {dateTime(invoice.createdAt)}</p></td>
                      <td className="px-4 py-4">{dateOnly(invoice.issueDate)}</td>
                      <td className="px-4 py-4">{invoice.totalItems}</td>
                      <td className="px-4 py-4 text-right font-semibold">{money(invoice.totalAmount)}</td>
                      <td className="px-4 py-4"><StatusBadge status={invoice.status as keyof typeof STATUS} /></td>
                      <td className="px-5 py-4 text-right"><Button size="sm" variant="outline" onClick={() => setSelectedId(invoice.id)}>Ver itens</Button></td>
                    </tr>
                  ))}
                  {!isLoading && invoices.length === 0 && <tr><td colSpan={6} className="py-14 text-center"><FileText className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" /><p className="font-medium">Nenhuma nota encontrada</p><p className="mt-1 text-sm text-muted-foreground">Envie o primeiro PDF ou ajuste os filtros.</p></td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={selectedId !== null} onOpenChange={(open) => { if (!open) { setSelectedId(null); setEditing(false); } }}>
        <DialogContent className="max-h-[92vh] max-w-[96vw] overflow-y-auto lg:max-w-6xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Revisão da nota fiscal</DialogTitle></DialogHeader>
          {detailLoading || !detail ? <div className="py-16 text-center text-muted-foreground"><Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin" />Carregando itens...</div> : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/35 p-4">
                <div className="flex flex-wrap items-center gap-3"><StatusBadge status={detail.invoice.status as keyof typeof STATUS} /><span className="text-sm text-muted-foreground">{detail.invoice.fileName}</span></div>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void openPdf()} disabled={fileUrlQuery.isFetching}><ExternalLink className="mr-2 h-4 w-4" />Abrir PDF</Button>{detail.invoice.status !== "confirmed" && <Button size="sm" variant="outline" onClick={() => reprocessMutation.mutate({ invoiceId: detail.invoice.id })} disabled={reprocessMutation.isPending}><RefreshCw className={`mr-2 h-4 w-4 ${reprocessMutation.isPending ? "animate-spin" : ""}`} />Reprocessar</Button>}{!editing && detail.invoice.status !== "confirmed" && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Editar revisão</Button>}{!editing && detail.invoice.status === "extracted" && <Button size="sm" onClick={() => setConfirmOpen(true)}><PackageCheck className="mr-2 h-4 w-4" />Confirmar entradas</Button>}</div>
              </div>

              {getErrors(detail.invoice.validationErrors).length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Pontos que exigem conferência</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{getErrors(detail.invoice.validationErrors).map((error) => <li key={error}>{error}</li>)}</ul></div>}
              {detail.invoice.errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{detail.invoice.errorMessage}</div>}

              <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-5">
                <div className="md:col-span-2"><Label>Fornecedor</Label>{editing ? <Input className="mt-1.5" value={header.supplierName} onChange={(event) => setHeader({ ...header, supplierName: event.target.value })} /> : <p className="mt-2 font-semibold">{header.supplierName || "—"}</p>}</div>
                <div><Label>CNPJ</Label>{editing ? <Input className="mt-1.5" value={header.supplierCnpj} onChange={(event) => setHeader({ ...header, supplierCnpj: event.target.value })} /> : <p className="mt-2 font-medium">{header.supplierCnpj || "—"}</p>}</div>
                <div><Label>Número</Label>{editing ? <Input className="mt-1.5" value={header.invoiceNumber} onChange={(event) => setHeader({ ...header, invoiceNumber: event.target.value })} /> : <p className="mt-2 font-medium">{header.invoiceNumber || "—"}</p>}</div>
                <div><Label>Data</Label>{editing ? <Input type="date" className="mt-1.5" value={header.issueDate} onChange={(event) => setHeader({ ...header, issueDate: event.target.value })} /> : <p className="mt-2 font-medium">{dateOnly(header.issueDate)}</p>}</div>
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">Itens extraídos ({reviewItems.length})</CardTitle><p className="mt-1 text-xs text-muted-foreground">A soma dos itens deve ser conciliada com o total da nota.</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Total da nota</p>{editing ? <Input type="number" min="0" step="0.01" className="mt-1 w-36 text-right font-bold" value={header.totalAmount} onChange={(event) => setHeader({ ...header, totalAmount: Number(event.target.value) })} /> : <p className="text-lg font-bold text-primary">{money(header.totalAmount)}</p>}</div></CardHeader>
                <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-y bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Produto</th><th className="px-3 py-3">Categoria</th><th className="px-3 py-3 text-right">Qtd.</th><th className="px-3 py-3">Un.</th><th className="px-3 py-3 text-right">Preço unit.</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody>{reviewItems.map((item) => <tr key={item.id} className="border-b align-top"><td className="px-4 py-3">{editing ? <div className="space-y-1.5"><Input value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} /><Input className="h-8 text-xs" placeholder="Código do fornecedor" value={item.supplierCode ?? ""} onChange={(event) => updateItem(item.id, { supplierCode: event.target.value || null })} /></div> : <><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">Cód. {item.supplierCode || "—"}</p></>}</td><td className="px-3 py-3">{editing ? <Select value={item.category} onValueChange={(value) => updateItem(item.id, { category: value as ReviewItem["category"] })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select> : CATEGORIES.find(([value]) => value === item.category)?.[1] ?? item.category}</td><td className="px-3 py-3 text-right">{editing ? <Input type="number" min="0" step="0.001" className="ml-auto w-24 text-right" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })} /> : item.quantity.toLocaleString("pt-BR")}</td><td className="px-3 py-3">{editing ? <Input className="w-20" value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} /> : item.unit}</td><td className="px-3 py-3 text-right">{editing ? <Input type="number" min="0" step="0.0001" className="ml-auto w-28 text-right" value={item.unitPrice} onChange={(event) => updateItem(item.id, { unitPrice: Number(event.target.value) })} /> : money(item.unitPrice)}</td><td className="px-4 py-3 text-right">{editing ? <Input type="number" min="0" step="0.01" className="ml-auto w-28 text-right" value={item.totalPrice} onChange={(event) => updateItem(item.id, { totalPrice: Number(event.target.value) })} /> : <span className="font-semibold">{money(item.totalPrice)}</span>}</td></tr>)}</tbody><tfoot><tr className="bg-muted/30 font-semibold"><td colSpan={5} className="px-4 py-3 text-right">Soma dos itens</td><td className="px-4 py-3 text-right">{money(reviewItems.reduce((sum, item) => sum + item.totalPrice, 0))}</td></tr></tfoot></table></div></CardContent>
              </Card>

              <div className="flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center"><div><p className="text-xs text-muted-foreground">Modelo: {detail.invoice.model || "—"} • duração: {detail.invoice.durationMs ? `${(detail.invoice.durationMs / 1000).toFixed(1)} s` : "—"}</p>{detail.invoice.status === "confirmed" && <p className="mt-1 text-xs font-medium text-emerald-700">Itens já incorporados ao estoque. Reprocessamento e edição foram bloqueados para evitar duplicidade.</p>}</div>{editing && <div className="flex gap-2"><Button variant="outline" onClick={() => { setEditing(false); void utils.purchaseInvoices.getById.invalidate(detailInput); }}>Cancelar</Button><Button onClick={saveReview} disabled={saveMutation.isPending}>{saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar revisão</Button></div>}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar entradas desta nota?</AlertDialogTitle>
            <AlertDialogDescription>
              Os itens comuns serão adicionados ao estoque de Compras Internas. Produtos identificados como caixas de 10 L serão adicionados ao controle específico. Depois disso, a nota ficará bloqueada contra edição e reprocessamento para evitar lançamentos duplicados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmMutation.isPending}>Voltar e revisar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!selectedId || confirmMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (selectedId) confirmMutation.mutate({ invoiceId: selectedId });
              }}
            >
              {confirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar e dar entrada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
