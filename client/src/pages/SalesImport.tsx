import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Clock,
  Link2, Trash2, ChevronDown, ChevronUp, Package, CreditCard,
  TrendingUp, ShoppingCart, ArrowLeft, RefreshCw, Eye, Sparkles
} from "lucide-react";
import { Link } from "wouter";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmt(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ParsedItem {
  external_code: string;
  external_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  // Campos adicionados pelo matching automático no backend
  productId?: number | null;
  productName?: string | null;
  matchScore?: number;
  linkStatus?: "linked" | "pending" | "ignored";
}

interface ParsedPayment {
  method: string;
  total: number;
  count: number;
}

interface ParsedData {
  caixa: {
    transactions: unknown[];
    payments_summary: ParsedPayment[];
    daily_summary: Array<{ date: string; total: number; transactions: number; payments: Record<string, number> }>;
    total_revenue: number;
    total_transactions: number;
  };
  produtos: {
    items: ParsedItem[];
    total_revenue: number;
    total_items: number;
    total_units: number;
  };
}

// ─── Componente: Apenas Caixa ────────────────────────────────────────────────────────────────────────
function CaixaOnlyStep({ onBack }: { onBack: () => void }) {
  const [caixaFile, setCaixaFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { daysInserted: number; daysUpdated: number; total: number; message: string; dailySummary: Array<{ date: string; total: number; transactions: number }> }>(null);
  const [dragOver, setDragOver] = useState(false);
  const caixaRef = useRef<HTMLInputElement>(null);

  const confirmMut = trpc.salesImport.confirmCaixa.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpload = async () => {
    if (!caixaFile) {
      toast.error("Selecione o arquivo de caixa");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("caixa", caixaFile);
      const res = await fetch("/api/sales-import/upload-caixa", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || "Erro ao processar arquivo de caixa");
        return;
      }
      const data = json.data;
      // Confirmar automaticamente (popular fin_daily_revenue)
      const confirmResult = await confirmMut.mutateAsync({ dailySummary: data.daily_summary });
      setResult({ ...confirmResult, dailySummary: data.daily_summary });
    } catch (err) {
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-semibold text-green-700">Caixa importado com sucesso!</p>
                <p className="text-sm text-muted-foreground">{result.message}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Data</th>
                    <th className="text-right p-2 font-medium">Total (R$)</th>
                    <th className="text-right p-2 font-medium">Transações</th>
                  </tr>
                </thead>
                <tbody>
                  {result.dailySummary.map((d) => (
                    <tr key={d.date} className="border-t">
                      <td className="p-2">{new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                      <td className="p-2 text-right font-medium">{fmt(d.total)}</td>
                      <td className="p-2 text-right text-muted-foreground">{d.transactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Button variant="outline" onClick={onBack} className="w-full">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Histórico
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Importar Apenas Caixa</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Importe o arquivo de movimentação de caixa para popular automaticamente a
            <strong> Previsão de Faturamento</strong> com os valores reais por dia.
          </p>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
                : caixaFile
                ? "border-green-400 bg-green-50 dark:bg-green-950/20"
                : "border-muted-foreground/30 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/10"
            }`}
            onClick={() => caixaRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setCaixaFile(f); }}
          >
            <input
              ref={caixaRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={(e) => setCaixaFile(e.target.files?.[0] ?? null)}
            />
            <CreditCard className={`h-10 w-10 mx-auto mb-3 ${caixaFile ? "text-green-500" : "text-muted-foreground"}`} />
            <p className="text-sm font-medium">
              {caixaFile ? caixaFile.name : "Arraste ou clique para selecionar o arquivo de caixa"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {caixaFile ? "Arquivo selecionado ✓" : "Formato XLS/XLSX — Relatório de Movimentação de Recebimentos"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!caixaFile || loading}
          className="flex-2 min-w-[200px] bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? (
            <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Processando...</>
          ) : (
            <><Upload className="h-4 w-4 mr-2" />Importar Caixa → Previsão</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Componente: Upload de Arquivos ─────────────────────────────────────────────────────
function UploadStep({
  onParsed,
}: {
  onParsed: (data: ParsedData, month: string, mode: "monthly" | "daily", saleDate?: string) => void;
}) {
  const [caixaFile, setCaixaFile] = useState<File | null>(null);
  const [produtosFile, setProdutosFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"monthly" | "daily">("monthly");
  const [saleDate, setSaleDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [referenceMonth, setReferenceMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState<"caixa" | "produtos" | null>(null);

  const caixaRef = useRef<HTMLInputElement>(null);
  const produtosRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent, type: "caixa" | "produtos") => {
      e.preventDefault();
      setDragOver(null);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (type === "caixa") setCaixaFile(file);
      else setProdutosFile(file);
    },
    []
  );

  const handleSubmit = async () => {
    if (!produtosFile) {
      toast.error("Selecione ao menos o arquivo de Produtos Vendidos");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      if (caixaFile) formData.append("caixa", caixaFile);
      formData.append("produtos", produtosFile);

      const res = await fetch("/api/sales-import/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || "Erro ao processar arquivos");
        return;
      }
      // Para modo diário, derivar o referenceMonth da data selecionada
      const effectiveMonth = importMode === "daily" ? saleDate.slice(0, 7) : referenceMonth;
      onParsed(json.data, effectiveMonth, importMode, importMode === "daily" ? saleDate : undefined);
    } catch (err) {
      toast.error("Erro de conexão ao fazer upload");
    } finally {
      setLoading(false);
    }
  };

  const year = parseInt(referenceMonth.split("-")[0]);
  const month = parseInt(referenceMonth.split("-")[1]);

  return (
    <div className="space-y-6">
      {/* Seletor de modo: Mensal ou Diário */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Tipo de Importação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <Button
              variant={importMode === "monthly" ? "default" : "outline"}
              size="sm"
              onClick={() => setImportMode("monthly")}
            >
              📅 Por Mês
            </Button>
            <Button
              variant={importMode === "daily" ? "default" : "outline"}
              size="sm"
              onClick={() => setImportMode("daily")}
            >
              🗓️ Por Dia
            </Button>
          </div>

          {importMode === "monthly" && (
            <div className="flex gap-3 mt-3">
              <Select
                value={String(month)}
                onValueChange={(v) =>
                  setReferenceMonth(`${year}-${String(v).padStart(2, "0")}`)
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(year)}
                onValueChange={(v) =>
                  setReferenceMonth(`${v}-${String(month).padStart(2, "0")}`)
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {importMode === "daily" && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">Selecione a data das vendas:</p>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-48"
                max={new Date().toISOString().slice(0, 10)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Mês de referência: <strong>{saleDate.slice(0, 7)}</strong> (derivado da data)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload dos arquivos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Arquivo Caixa */}
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver === "caixa"
              ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
              : caixaFile
              ? "border-green-400 bg-green-50 dark:bg-green-950/20"
              : "border-muted-foreground/30 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/10"
          }`}
          onClick={() => caixaRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver("caixa"); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => handleDrop(e, "caixa")}
        >
          <input
            ref={caixaRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => setCaixaFile(e.target.files?.[0] ?? null)}
          />
          <CreditCard className={`h-8 w-8 mx-auto mb-2 ${caixaFile ? "text-green-500" : "text-muted-foreground"}`} />
          <p className="text-sm font-medium">
            {caixaFile ? caixaFile.name : "Vendas por Caixa (opcional)"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {caixaFile ? "Arquivo selecionado ✓" : "Opcional: XLS de movimentação de recebimentos por forma de pagamento"}
          </p>
        </div>

        {/* Arquivo Produtos */}
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver === "produtos"
              ? "border-purple-400 bg-purple-50 dark:bg-purple-950/20"
              : produtosFile
              ? "border-green-400 bg-green-50 dark:bg-green-950/20"
              : "border-muted-foreground/30 hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/10"
          }`}
          onClick={() => produtosRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver("produtos"); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => handleDrop(e, "produtos")}
        >
          <input
            ref={produtosRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => setProdutosFile(e.target.files?.[0] ?? null)}
          />
          <Package className={`h-8 w-8 mx-auto mb-2 ${produtosFile ? "text-green-500" : "text-muted-foreground"}`} />
          <p className="text-sm font-medium">
            {produtosFile ? produtosFile.name : "Vendas por Produto"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {produtosFile ? "Arquivo selecionado ✓" : "Arraste ou clique para selecionar o XLS de produtos vendidos"}
          </p>
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!produtosFile || loading}
        className="w-full"
      >
        {loading ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Processando arquivos...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            Processar Arquivos
          </>
        )}
      </Button>
    </div>
  );
}
// ─── Componente: Revisão e Vinculação ───────────────────────────────────────────────
function ReviewStep({
  data,
  referenceMonth,
  importMode = "monthly",
  saleDate,
  onConfirm,
  onBack,
}: {
  data: ParsedData;
  referenceMonth: string;
  importMode?: "monthly" | "daily";
  saleDate?: string;
  onConfirm: (importId: number) => void;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: stockProducts } = trpc.salesImport.getProductsForLinking.useQuery();
  const createMut = trpc.salesImport.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Importação criada! ${result.linkedCount} produtos vinculados, ${result.pendingCount} pendentes.`);
      utils.salesImport.list.invalidate();
      onConfirm(result.importId);
    },
    onError: (err) => toast.error(err.message),
  });

  // Estado local de vinculação — inicializado com os vínculos automáticos do backend
  const [linkMap, setLinkMap] = useState<Record<string, { productId: number | null; status: "linked" | "pending" | "ignored" }>>(() => {
    const initial: Record<string, { productId: number | null; status: "linked" | "pending" | "ignored" }> = {};
    for (const item of data.produtos.items) {
      if (item.productId && item.linkStatus === "linked") {
        initial[item.external_code] = { productId: item.productId, status: "linked" };
      }
    }
    return initial;
  });
  const [showAll, setShowAll] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "linked" | "pending" | "ignored">("all");

  const aiSuggestMut = trpc.salesImport.suggestLinksFromParsed.useMutation({
    onSuccess: (result) => {
      // Aplicar sugestões com confiança >= 0.7 ao linkMap local
      const newLinks: Record<string, { productId: number | null; status: "linked" | "pending" | "ignored" }> = {};
      for (const sug of result.suggestions) {
        if (sug.productId && sug.confidence >= 0.7) {
          newLinks[sug.externalCode] = { productId: sug.productId, status: "linked" };
        }
      }
      setLinkMap((prev) => ({ ...prev, ...newLinks }));
      toast.success(result.message);
    },
    onError: (err) => toast.error(`Erro na IA: ${err.message}`),
  });

  const items = data.produtos.items;
  const payments = data.caixa.payments_summary;

  const getItemStatus = (item: ParsedItem) => {
    return linkMap[item.external_code]?.status ?? "pending";
  };

  const filteredItems = items.filter((item) => {
    const status = getItemStatus(item);
    if (filterStatus === "all") return true;
    return status === filterStatus;
  });

  const displayedItems = showAll ? filteredItems : filteredItems.slice(0, 20);
  const linkedCount = items.filter((i) => getItemStatus(i) === "linked").length;
  const pendingCount = items.filter((i) => getItemStatus(i) === "pending").length;
  const ignoredCount = items.filter((i) => getItemStatus(i) === "ignored").length;

  const handleConfirm = () => {
    // Merge dos itens com os vínculos locais feitos pelo usuário
    const mergedItems = items.map((item) => ({
      ...item,
      productId: linkMap[item.external_code]?.productId ?? null,
      linkStatus: linkMap[item.external_code]?.status ?? "pending",
    }));

    createMut.mutate({
      referenceMonth,
      importMode,
      saleDate,
      items: mergedItems,
      payments,
      totalRevenue: data.caixa.total_revenue,
      totalTransactions: data.caixa.total_transactions,
      dailySummary: data.caixa.daily_summary,
    });
  };

  const [year, month] = referenceMonth.split("-").map(Number);
  const monthLabel = `${MONTHS[month - 1]}/${year}`;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Faturamento Total</p>
          <p className="text-lg font-bold text-green-600">{fmt(data.caixa.total_revenue)}</p>
          <p className="text-xs text-muted-foreground">{data.caixa.total_transactions} transações</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Produtos Distintos</p>
          <p className="text-lg font-bold">{items.length}</p>
          <p className="text-xs text-muted-foreground">{(data.produtos.total_units ?? 0).toLocaleString("pt-BR")} unidades</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Vinculados ao Estoque</p>
          <p className="text-lg font-bold text-blue-600">{linkedCount}</p>
          <p className="text-xs text-muted-foreground">{Math.round((linkedCount / items.length) * 100)}% dos produtos</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Pendentes de Vínculo</p>
          <p className="text-lg font-bold text-amber-600">{pendingCount}</p>
          <p className="text-xs text-muted-foreground">Vincule manualmente abaixo</p>
        </Card>
      </div>

      {/* Formas de pagamento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-blue-500" />
            Formas de Pagamento — {monthLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {payments.map((p) => (
              <div key={p.method} className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-xs font-medium">{p.method}</p>
                <p className="text-sm font-bold">{fmt(p.total)}</p>
                <p className="text-xs text-muted-foreground">{p.count} transações</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabela de produtos */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-purple-500" />
              Produtos Vendidos ({items.length})
            </CardTitle>
            <div className="flex gap-2">
              {(["all", "linked", "pending", "ignored"] as const).map((s) => (
                <Button
                  key={s}
                  variant={filterStatus === s ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setFilterStatus(s)}
                >
                  {s === "all" ? "Todos" : s === "linked" ? `Vinculados (${linkedCount})` : s === "pending" ? `Pendentes (${pendingCount})` : `Ignorados (${ignoredCount})`}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Cód. PDV</th>
                  <th className="text-left p-2 font-medium">Produto PDV</th>
                  <th className="text-right p-2 font-medium">Qtd</th>
                  <th className="text-right p-2 font-medium">Total</th>
                  <th className="text-left p-2 font-medium">Vínculo no Estoque</th>
                  <th className="text-center p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayedItems.map((item) => {
                  const status = getItemStatus(item);
                  const linked = linkMap[item.external_code];
                  const linkedProduct = stockProducts?.find((p) => p.id === linked?.productId);

                  return (
                    <tr key={item.external_code} className="border-t hover:bg-muted/20">
                      <td className="p-2 font-mono text-muted-foreground">{item.external_code}</td>
                      <td className="p-2 font-medium max-w-[200px] truncate" title={item.external_name}>
                        {item.external_name}
                      </td>
                      <td className="p-2 text-right">{(item.quantity ?? 0).toLocaleString("pt-BR")}</td>
                      <td className="p-2 text-right font-medium">{fmt(item.total_price)}</td>
                      <td className="p-2 min-w-[200px]">
                        {status === "ignored" ? (
                          <span className="text-muted-foreground italic">Ignorado</span>
                        ) : (
                          <Select
                            value={linked?.productId ? String(linked.productId) : "__none__"}
                            onValueChange={(v) => {
                              if (v === "__none__") {
                                setLinkMap((prev) => ({
                                  ...prev,
                                  [item.external_code]: { productId: null, status: "pending" },
                                }));
                              } else {
                                setLinkMap((prev) => ({
                                  ...prev,
                                  [item.external_code]: { productId: Number(v), status: "linked" },
                                }));
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Selecionar produto..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Não vincular —</SelectItem>
                              {stockProducts?.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.name} (Estoque: {p.currentStock})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {status === "linked" ? (
                            <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs px-1.5">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Vinculado
                            </Badge>
                          ) : status === "ignored" ? (
                            <Badge variant="outline" className="text-muted-foreground text-xs px-1.5">
                              Ignorado
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs px-1.5">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Pendente
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-rose-500"
                            onClick={() =>
                              setLinkMap((prev) => ({
                                ...prev,
                                [item.external_code]: {
                                  productId: null,
                                  status: status === "ignored" ? "pending" : "ignored",
                                },
                              }))
                            }
                            title={status === "ignored" ? "Restaurar" : "Ignorar este produto"}
                          >
                            {status === "ignored" ? <RefreshCw className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredItems.length > 20 && (
            <div className="p-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(!showAll)}
                className="text-xs"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Mostrar menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Ver todos os {filteredItems.length} produtos
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ações */}
      <div className="flex gap-3 flex-wrap">
        <Button variant="outline" onClick={onBack} className="flex-1 min-w-[120px]">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Button
          variant="outline"
          onClick={() => aiSuggestMut.mutate({ products: items.map(i => ({ external_code: i.external_code, external_name: i.external_name })) })}
          disabled={aiSuggestMut.isPending}
          className="flex-1 min-w-[160px] text-purple-600 border-purple-500/30 hover:bg-purple-500/10"
        >
          {aiSuggestMut.isPending ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              IA analisando... ({items.length} produtos)
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Sugerir com IA ({pendingCount} pendentes)
            </>
          )}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={createMut.isPending}
          className="flex-2 min-w-[200px] bg-green-600 hover:bg-green-700 text-white"
        >
          {createMut.isPending ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Salvar Importação ({linkedCount} vinculados)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Componente: Detalhe de Importação ────────────────────────────────────────
function ImportDetail({ importId, onClose }: { importId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.salesImport.detail.useQuery({ importId });
  const { data: stockProducts } = trpc.salesImport.getProductsForLinking.useQuery();

  const linkMut = trpc.salesImport.linkItem.useMutation({
    onSuccess: () => utils.salesImport.detail.invalidate({ importId }),
    onError: (err) => toast.error(err.message),
  });

  const confirmMut = trpc.salesImport.confirm.useMutation({
    onSuccess: (result) => {
      toast.success(`Importação confirmada! ${result.stockUpdated} produtos com estoque atualizado.`);
      utils.salesImport.list.invalidate();
      utils.salesImport.detail.invalidate({ importId });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.salesImport.delete.useMutation({
    onSuccess: () => {
      toast.success("Importação excluída.");
      utils.salesImport.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const aiSuggestMut = trpc.salesImport.suggestLinksWithAI.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      utils.salesImport.detail.invalidate({ importId });
    },
    onError: (err) => toast.error(`Erro na IA: ${err.message}`),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="p-8 text-center text-muted-foreground">Importação não encontrada</div>;

  const { header, items, payments } = data;
  const [year, month] = header.referenceMonth.split("-").map(Number);
  const monthLabel = `${MONTHS[month - 1]}/${year}`;
  const isPending = header.status === "pending";

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Importação — {monthLabel}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              className={
                header.status === "confirmed"
                  ? "bg-green-500/15 text-green-600 border-green-500/30"
                  : header.status === "cancelled"
                  ? "bg-rose-500/15 text-rose-600 border-rose-500/30"
                  : "bg-amber-500/15 text-amber-600 border-amber-500/30"
              }
            >
              {header.status === "confirmed" ? "Confirmada" : header.status === "cancelled" ? "Cancelada" : "Pendente"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {header.linkedItems} vinculados · {header.pendingItems} pendentes
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {isPending && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-purple-600 border-purple-500/30 hover:bg-purple-500/10"
                onClick={() => aiSuggestMut.mutate({ importId })}
                disabled={aiSuggestMut.isPending}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                {aiSuggestMut.isPending ? "IA analisando..." : "Sugerir com IA"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
                onClick={() => {
                  if (confirm("Excluir esta importação?")) deleteMut.mutate({ importId });
                }}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Excluir
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => confirmMut.mutate({ importId })}
                disabled={confirmMut.isPending}
              >
                {confirmMut.isPending ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                )}
                Confirmar e Descontar Estoque
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pagamentos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Formas de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
            {payments.map((p) => (
              <div key={p.paymentMethod} className="bg-muted/40 rounded-lg p-2 text-center">
                <p className="text-xs font-medium truncate">{p.paymentMethod}</p>
                <p className="text-sm font-bold">{fmt(p.totalAmount)}</p>
                <p className="text-xs text-muted-foreground">{p.transactionCount}x</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Itens */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Produtos ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Cód. PDV</th>
                  <th className="text-left p-2 font-medium">Produto PDV</th>
                  <th className="text-right p-2 font-medium">Qtd</th>
                  <th className="text-right p-2 font-medium">Total</th>
                  <th className="text-left p-2 font-medium">Produto no Estoque</th>
                  <th className="text-center p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-muted/20">
                    <td className="p-2 font-mono text-muted-foreground">{item.externalCode}</td>
                    <td className="p-2 font-medium max-w-[180px] truncate" title={item.externalName}>
                      {item.externalName}
                    </td>
                    <td className="p-2 text-right">{Number(item.quantity).toLocaleString("pt-BR")}</td>
                    <td className="p-2 text-right font-medium">{fmt(item.totalPrice)}</td>
                    <td className="p-2 min-w-[180px]">
                      {isPending ? (
                        <Select
                          value={item.productId ? String(item.productId) : "__none__"}
                          onValueChange={(v) => {
                            const productId = v === "__none__" ? null : Number(v);
                            linkMut.mutate({
                              itemId: item.id,
                              productId,
                              linkStatus: productId ? "linked" : "pending",
                              saveExternalCode: !!productId,
                            });
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Selecionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Não vincular —</SelectItem>
                            {stockProducts?.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={item.productName ? "text-foreground" : "text-muted-foreground italic"}>
                          {item.productName ?? "Não vinculado"}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {item.linkStatus === "linked" ? (
                        <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs px-1.5">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Vinculado
                        </Badge>
                      ) : item.linkStatus === "ignored" ? (
                        <Badge variant="outline" className="text-muted-foreground text-xs px-1.5">
                          Ignorado
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs px-1.5">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Pendente
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function SalesImport() {
  const [step, setStep] = useState<"upload" | "review" | "history" | "caixa-only">("history");
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [referenceMonth, setReferenceMonth] = useState("");
  const [importMode, setImportMode] = useState<"monthly" | "daily">("monthly");
  const [saleDate, setSaleDate] = useState<string | undefined>(undefined);
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: imports, isLoading } = trpc.salesImport.list.useQuery();

  const handleParsed = (data: ParsedData, month: string, mode: "monthly" | "daily", date?: string) => {
    setParsedData(data);
    setReferenceMonth(month);
    setImportMode(mode);
    setSaleDate(date);
    setStep("review");
  };

  const handleImportCreated = (importId: number) => {
    setSelectedImportId(importId);
    setStep("history");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-green-600" />
            Importação de Vendas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importe os relatórios XLS do PDV para vincular vendas ao estoque
          </p>
        </div>
        {step === "history" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("caixa-only")} className="border-blue-500/40 text-blue-600 hover:bg-blue-500/10">
              <CreditCard className="h-4 w-4 mr-2" />
              Importar Caixa
            </Button>
            <Button onClick={() => setStep("upload")} className="bg-green-600 hover:bg-green-700 text-white">
              <Upload className="h-4 w-4 mr-2" />
              Nova Importação
            </Button>
          </div>
        )}
        {(step === "upload" || step === "review" || step === "caixa-only") && (
          <Button variant="outline" onClick={() => setStep("history")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Histórico
          </Button>
        )}
      </div>

      {/* Conteúdo por step */}
      {step === "caixa-only" && (
        <CaixaOnlyStep onBack={() => setStep("history")} />
      )}

      {step === "upload" && (
        <UploadStep onParsed={handleParsed} />
      )}

      {step === "review" && parsedData && (
        <ReviewStep
          data={parsedData}
          referenceMonth={referenceMonth}
          importMode={importMode}
          saleDate={saleDate}
          onConfirm={handleImportCreated}
          onBack={() => setStep("upload")}
        />
      )}

      {step === "history" && (
        <div className="space-y-4">
          {/* Detalhe selecionado */}
          {selectedImportId && (
            <Card>
              <CardContent className="pt-4">
                <ImportDetail
                  importId={selectedImportId}
                  onClose={() => setSelectedImportId(null)}
                />
              </CardContent>
            </Card>
          )}

          {/* Lista de importações */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Histórico de Importações</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Carregando...</div>
              ) : !imports?.length ? (
                <div className="p-12 text-center">
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">Nenhuma importação realizada ainda.</p>
                  <Button
                    className="mt-4 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setStep("upload")}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Fazer Primeira Importação
                  </Button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Mês de Referência</th>
                      <th className="text-right p-3 font-medium">Faturamento</th>
                      <th className="text-right p-3 font-medium">Transações</th>
                      <th className="text-right p-3 font-medium">Produtos</th>
                      <th className="text-center p-3 font-medium">Vinculados</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-center p-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imports.map((imp) => {
                      const [y, m] = imp.referenceMonth.split("-").map(Number);
                      const isDaily = imp.importMode === "daily";
                      const dateLabel = isDaily && imp.saleDate
                        ? new Date(imp.saleDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                        : `${MONTHS[m - 1]}/${y}`;
                      return (
                        <tr
                          key={imp.id}
                          className={`border-t hover:bg-muted/20 cursor-pointer ${selectedImportId === imp.id ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                          onClick={() => setSelectedImportId(selectedImportId === imp.id ? null : imp.id)}
                        >
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              {dateLabel}
                              {isDaily && (
                                <Badge className="text-xs bg-blue-500/15 text-blue-600 border-blue-500/30 h-4 px-1">
                                  Diário
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right font-medium text-green-600">
                            {fmt(imp.totalRevenue)}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {(imp.totalTransactions ?? 0).toLocaleString("pt-BR")}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {imp.totalItems}
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-green-600 font-medium">{imp.linkedItems}</span>
                            <span className="text-muted-foreground">/{imp.totalItems}</span>
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              className={
                                imp.status === "confirmed"
                                  ? "bg-green-500/15 text-green-600 border-green-500/30"
                                  : imp.status === "cancelled"
                                  ? "bg-rose-500/15 text-rose-600 border-rose-500/30"
                                  : "bg-amber-500/15 text-amber-600 border-amber-500/30"
                              }
                            >
                              {imp.status === "confirmed" ? "Confirmada" : imp.status === "cancelled" ? "Cancelada" : "Pendente"}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedImportId(selectedImportId === imp.id ? null : imp.id);
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {selectedImportId === imp.id ? "Fechar" : "Ver"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
