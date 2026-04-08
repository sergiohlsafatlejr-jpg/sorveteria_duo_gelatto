import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Link2,
  Package,
  Plus,
  RefreshCw,
  Upload,
  XCircle,
  Files,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ParsedItem = {
  nItem: number;
  cProd: string;
  xProd: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  matchedProductId: number | null;
  matchedProductName: string | null;
  isNew: boolean;
  stockUnit: string;
  conversionFactor: number;
  stockQty: number;
};

type NfeInfo = {
  nNF: string;
  dhEmi: string;
  chNFe: string;
  emitCnpj: string;
  emitNome: string;
  destCnpj: string;
  destNome: string;
  vNF: number;
};

// Status de cada arquivo na fila de lote
type BatchFileStatus = "pending" | "processing" | "success" | "duplicate" | "error";

type BatchFile = {
  id: string;
  name: string;
  content: string;
  status: BatchFileStatus;
  result?: { imported: number; created: number };
  errorMsg?: string;
  nNF?: string;
  emitNome?: string;
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function NfeImport() {
  const [, navigate] = useLocation();

  // ── Modo: "single" (revisão detalhada) ou "batch" (lote automático) ──
  const [mode, setMode] = useState<"single" | "batch">("single");

  // ── Estado modo único ──
  const [isDragging, setIsDragging] = useState(false);
  const [nfeInfo, setNfeInfo] = useState<NfeInfo | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [doneResult, setDoneResult] = useState<{ imported: number; created: number } | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Estado modo lote ──
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDone, setBatchDone] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  const { data: productsList } = trpc.nfe.productsList.useQuery();
  const parseMutation = trpc.nfe.parse.useMutation({
    onSuccess: (data) => {
      setNfeInfo(data.info as NfeInfo);
      setItems(data.items as ParsedItem[]);
      setIsDuplicate(!!data.isDuplicate);
      if (data.isDuplicate && data.duplicateInfo) {
        const d = new Date(data.duplicateInfo.createdAt);
        setDuplicateDate(d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }));
      } else {
        setDuplicateDate(null);
      }
      setStep("review");
    },
    onError: (e) => toast.error(`Erro ao processar XML: ${e.message}`),
  });

  const confirmMutation = trpc.nfe.confirm.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.imported} produto(s) importado(s)${data.created > 0 ? `, ${data.created} criado(s) automaticamente` : ""}!`);
      setDoneResult(data);
      setStep("done");
    },
    onError: (e) => toast.error(`Erro ao importar: ${e.message}`),
  });

  const utils = trpc.useUtils();

  // ── Modo único: processar arquivo ──
  function handleFile(file: File) {
    if (!file.name.endsWith(".xml")) {
      toast.error("Por favor, selecione um arquivo XML de NF-e.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      parseMutation.mutate({ xmlContent: content });
    };
    reader.readAsText(file, "UTF-8");
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (mode === "batch") {
      addBatchFiles(files);
    } else {
      const file = files[0];
      if (file) handleFile(file);
    }
  }, [mode]);

  function updateItem(idx: number, changes: Partial<ParsedItem>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...changes } : item)));
  }

  function recalcStockQty(idx: number, factor: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, conversionFactor: factor, stockQty: Math.round(item.qCom * factor) }
          : item
      )
    );
  }

  function handleConfirm(force = false) {
    confirmMutation.mutate({
      nfeDate: nfeInfo!.dhEmi,
      supplier: nfeInfo!.emitNome,
      chNFe: nfeInfo!.chNFe || undefined,
      nNF: nfeInfo!.nNF || undefined,
      emitCnpj: nfeInfo!.emitCnpj || undefined,
      emitNome: nfeInfo!.emitNome || undefined,
      dhEmi: nfeInfo!.dhEmi || undefined,
      vNF: nfeInfo!.vNF || undefined,
      forceImport: force,
      items: items.map((i) => ({
        productId: i.matchedProductId,
        isNew: i.isNew,
        qCom: i.qCom,
        conversionFactor: i.conversionFactor,
        stockQty: i.stockQty,
        vUnCom: i.vUnCom,
        xProd: i.xProd,
        cProd: i.cProd,
        uCom: i.uCom,
      })),
    });
  }

  // ── Modo lote: adicionar arquivos ──
  function addBatchFiles(files: File[]) {
    const xmlFiles = files.filter((f) => f.name.endsWith(".xml"));
    if (xmlFiles.length === 0) {
      toast.error("Selecione arquivos XML de NF-e.");
      return;
    }
    const remaining = 30 - batchFiles.length;
    const toAdd = xmlFiles.slice(0, remaining);
    if (xmlFiles.length > remaining) {
      toast.warning(`Limite de 30 arquivos. Apenas ${toAdd.length} arquivo(s) adicionado(s).`);
    }

    const readers = toAdd.map((file) =>
      new Promise<BatchFile>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          // Extrair nNF e emitNome do XML para exibição
          const nNFMatch = content.match(/<nNF>(\d+)<\/nNF>/);
          const emitMatch = content.match(/<xNome>([^<]+)<\/xNome>/);
          resolve({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name,
            content,
            status: "pending",
            nNF: nNFMatch?.[1],
            emitNome: emitMatch?.[1],
          });
        };
        reader.readAsText(file, "UTF-8");
      })
    );

    Promise.all(readers).then((newFiles) => {
      setBatchFiles((prev) => [...prev, ...newFiles]);
      setBatchDone(false);
    });
  }

  function removeBatchFile(id: string) {
    setBatchFiles((prev) => prev.filter((f) => f.id !== id));
  }

  // ── Modo lote: processar todos os arquivos sequencialmente ──
  async function runBatch() {
    if (batchFiles.length === 0) return;
    setBatchRunning(true);
    setBatchDone(false);
    setBatchProgress(0);

    const files = [...batchFiles];
    let processed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.status === "success") {
        processed++;
        setBatchProgress(Math.round((processed / files.length) * 100));
        continue;
      }

      // Marcar como processando
      setBatchFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, status: "processing" } : f))
      );

      try {
        // 1. Parse do XML
        const parseResult = await new Promise<any>((resolve, reject) => {
          fetch("/api/trpc/nfe.parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ json: { xmlContent: file.content } }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.error) reject(new Error(data.error.message || "Erro ao processar XML"));
              else resolve(data.result?.data?.json ?? data.result?.data);
            })
            .catch(reject);
        });

        // 2. Verificar duplicata
        if (parseResult.isDuplicate) {
          setBatchFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? { ...f, status: "duplicate", errorMsg: `NF-e ${parseResult.info.nNF} já importada anteriormente` }
                : f
            )
          );
          processed++;
          setBatchProgress(Math.round((processed / files.length) * 100));
          continue;
        }

        // 3. Confirmar importação automática (sem revisão manual)
        const info = parseResult.info;
        const items = parseResult.items;

        const confirmResult = await new Promise<any>((resolve, reject) => {
          fetch("/api/trpc/nfe.confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              json: {
                nfeDate: info.dhEmi,
                supplier: info.emitNome,
                chNFe: info.chNFe || undefined,
                nNF: info.nNF || undefined,
                emitCnpj: info.emitCnpj || undefined,
                emitNome: info.emitNome || undefined,
                dhEmi: info.dhEmi || undefined,
                vNF: info.vNF || undefined,
                forceImport: false,
                items: items.map((it: any) => ({
                  productId: it.matchedProductId,
                  isNew: it.isNew,
                  qCom: it.qCom,
                  conversionFactor: it.conversionFactor,
                  stockQty: it.stockQty,
                  vUnCom: it.vUnCom,
                  xProd: it.xProd,
                  cProd: it.cProd,
                  uCom: it.uCom,
                })),
              },
            }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.error) reject(new Error(data.error.message || "Erro ao confirmar importação"));
              else resolve(data.result?.data?.json ?? data.result?.data);
            })
            .catch(reject);
        });

        setBatchFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, status: "success", result: confirmResult }
              : f
          )
        );
      } catch (err: any) {
        setBatchFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, status: "error", errorMsg: err.message || "Erro desconhecido" }
              : f
          )
        );
      }

      processed++;
      setBatchProgress(Math.round((processed / files.length) * 100));

      // Pequena pausa entre arquivos para não sobrecarregar o servidor
      await new Promise((r) => setTimeout(r, 300));
    }

    setBatchRunning(false);
    setBatchDone(true);
    utils.products.list.invalidate();
    toast.success("Processamento em lote concluído!");
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const newCount = items.filter((i) => i.isNew).length;
  const linkedCount = items.filter((i) => !i.isNew && i.matchedProductId !== null).length;
  const totalUnits = items.reduce((s, i) => s + i.stockQty, 0);

  // Contadores do lote
  const batchSuccess = batchFiles.filter((f) => f.status === "success").length;
  const batchDuplicates = batchFiles.filter((f) => f.status === "duplicate").length;
  const batchErrors = batchFiles.filter((f) => f.status === "error").length;
  const batchPending = batchFiles.filter((f) => f.status === "pending").length;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <BackButton to="/products" />

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Importar NF-e XML
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Faça upload do XML da nota fiscal para dar entrada automática no estoque
            </p>
          </div>

          {/* Seletor de modo */}
          <div className="flex gap-2">
            <Button
              variant={mode === "single" ? "default" : "outline"}
              size="sm"
              onClick={() => { setMode("single"); setStep("upload"); setItems([]); setNfeInfo(null); }}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              1 arquivo
            </Button>
            <Button
              variant={mode === "batch" ? "default" : "outline"}
              size="sm"
              onClick={() => { setMode("batch"); }}
              className="gap-2"
            >
              <Files className="h-4 w-4" />
              Lote (até 30)
            </Button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            MODO ÚNICO
        ══════════════════════════════════════════════════════════════════════ */}
        {mode === "single" && (
          <>
            {/* Step 1: Upload */}
            {step === "upload" && (
              <Card>
                <CardContent className="p-8">
                  <div
                    className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/20"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xml"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                    {parseMutation.isPending ? (
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="h-10 w-10 text-primary animate-spin" />
                        <p className="text-muted-foreground">Processando XML...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Upload className="h-10 w-10 text-muted-foreground/50" />
                        <div>
                          <p className="font-medium">Arraste o XML da NF-e aqui</p>
                          <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar o arquivo</p>
                        </div>
                        <Badge variant="outline" className="text-xs">Formato: .xml (NF-e padrão SEFAZ)</Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Revisão */}
            {step === "review" && nfeInfo && (
              <>
                <Card>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Emitente</p>
                        <p className="font-medium">{nfeInfo.emitNome}</p>
                        <p className="text-xs text-muted-foreground">{nfeInfo.emitCnpj}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">NF-e nº</p>
                        <p className="font-medium">{nfeInfo.nNF}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Data de Emissão</p>
                        <p className="font-medium">
                          {nfeInfo.dhEmi ? new Date(nfeInfo.dhEmi).toLocaleDateString("pt-BR") : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Valor Total</p>
                        <p className="font-bold text-primary">{fmt(nfeInfo.vNF)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-4 gap-4">
                  <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-muted-foreground">itens na NF-e</p></CardContent></Card>
                  <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{linkedCount}</p><p className="text-xs text-muted-foreground">já cadastrados</p></CardContent></Card>
                  <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600">{newCount}</p><p className="text-xs text-muted-foreground">serão criados</p></CardContent></Card>
                  <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{totalUnits}</p><p className="text-xs text-muted-foreground">unidades a entrar</p></CardContent></Card>
                </div>

                {/* Aviso duplicata */}
                {isDuplicate && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-red-700 text-sm">⚠️ Esta NF-e já foi importada anteriormente!</p>
                      <p className="text-xs text-red-600 mt-1">
                        A NF-e nº <strong>{nfeInfo?.nNF}</strong> do emitente <strong>{nfeInfo?.emitNome}</strong> já foi processada
                        {duplicateDate ? ` em ${duplicateDate}` : ""}. Importar novamente irá <strong>duplicar o estoque</strong>.
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-100 gap-2" onClick={() => { setStep("upload"); setItems([]); setNfeInfo(null); setIsDuplicate(false); }}>Cancelar</Button>
                        <Button size="sm" variant="destructive" className="gap-2" disabled={confirmMutation.isPending} onClick={() => handleConfirm(true)}>
                          {confirmMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                          Importar mesmo assim
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {newCount > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                    <Plus className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-700 text-sm">{newCount} produto(s) serão criados automaticamente</p>
                      <p className="text-xs text-blue-600 mt-0.5">Os itens marcados com <span className="font-semibold">Novo</span> não estão cadastrados e serão criados com o nome, código do fornecedor, fator de conversão e custo unitário da NF-e.</p>
                    </div>
                  </div>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" />Itens da NF-e</CardTitle>
                    <p className="text-xs text-muted-foreground">Revise os vínculos e o fator de conversão antes de confirmar.</p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left p-3 font-medium">Item NF-e</th>
                            <th className="text-center p-3 font-medium">Qtd Compra</th>
                            <th className="text-center p-3 font-medium">Fator</th>
                            <th className="text-center p-3 font-medium">Qtd Estoque</th>
                            <th className="text-left p-3 font-medium">Produto Cadastrado</th>
                            <th className="text-right p-3 font-medium">Valor Unit.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, idx) => (
                            <tr key={idx} className={`border-b ${item.isNew ? "bg-blue-50/40 hover:bg-blue-50/60" : "hover:bg-muted/10"}`}>
                              <td className="p-3">
                                <p className="font-medium text-xs leading-tight">{item.xProd}</p>
                                <p className="text-xs text-muted-foreground">Cód: {item.cProd}</p>
                              </td>
                              <td className="p-3 text-center"><span className="font-medium">{item.qCom}</span><span className="text-xs text-muted-foreground ml-1">{item.uCom}</span></td>
                              <td className="p-3 text-center">
                                <Input type="number" min={1} value={item.conversionFactor} onChange={(e) => recalcStockQty(idx, parseInt(e.target.value) || 1)} className="w-16 text-center h-7 text-xs mx-auto" />
                                <p className="text-xs text-muted-foreground mt-0.5">un/cx</p>
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant={item.isNew ? "secondary" : "default"} className={`text-xs ${item.isNew ? "bg-blue-100 text-blue-700 border-blue-200" : ""}`}>{item.stockQty} un</Badge>
                              </td>
                              <td className="p-3 min-w-[200px]">
                                {item.isNew ? (
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-blue-600 text-white text-xs shrink-0">Novo</Badge>
                                    <span className="text-xs text-blue-700 font-medium truncate">Será criado automaticamente</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                    <Select value={String(item.matchedProductId)} onValueChange={(v) => { const prod = productsList?.find((p) => p.id === parseInt(v)); updateItem(idx, { matchedProductId: parseInt(v), matchedProductName: prod?.name ?? null, isNew: false, stockUnit: prod?.unit ?? "un", conversionFactor: prod?.conversionFactor ?? item.conversionFactor, stockQty: Math.round(item.qCom * (prod?.conversionFactor ?? item.conversionFactor)) }); }}>
                                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>{productsList?.map((p) => (<SelectItem key={p.id} value={String(p.id)} className="text-xs">{p.name}</SelectItem>))}</SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-right text-xs text-muted-foreground">{fmt(item.vUnCom)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-between">
                  <Button variant="outline" onClick={() => { setStep("upload"); setItems([]); setNfeInfo(null); }}>Carregar outro XML</Button>
                  <Button onClick={() => handleConfirm(false)} disabled={confirmMutation.isPending || items.length === 0 || isDuplicate} className="gap-2">
                    {confirmMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                    Confirmar Importação ({items.length} itens, {totalUnits} un)
                  </Button>
                </div>
              </>
            )}

            {/* Step 3: Concluído */}
            {step === "done" && doneResult && (
              <Card>
                <CardContent className="flex flex-col items-center py-16 text-center gap-4">
                  <CheckCircle2 className="h-16 w-16 text-green-500" />
                  <div>
                    <h2 className="text-xl font-bold">Importação concluída!</h2>
                    <p className="text-muted-foreground mt-1">
                      {doneResult.imported} produto(s) com entrada no estoque.
                      {doneResult.created > 0 && <span className="text-blue-600 font-medium"> {doneResult.created} produto(s) criado(s) automaticamente.</span>}
                    </p>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <Button variant="outline" onClick={() => { setStep("upload"); setItems([]); setNfeInfo(null); setDoneResult(null); utils.products.list.invalidate(); }}>Importar outra NF-e</Button>
                    <Button onClick={() => { utils.products.list.invalidate(); navigate("/products"); }}>Ver Estoque</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            MODO LOTE
        ══════════════════════════════════════════════════════════════════════ */}
        {mode === "batch" && (
          <>
            {/* Área de upload em lote */}
            {!batchRunning && !batchDone && (
              <Card>
                <CardContent className="p-8">
                  <div
                    className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                      isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/20"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => batchFileInputRef.current?.click()}
                  >
                    <input
                      ref={batchFileInputRef}
                      type="file"
                      accept=".xml"
                      multiple
                      className="hidden"
                      onChange={(e) => { if (e.target.files) addBatchFiles(Array.from(e.target.files)); }}
                    />
                    <div className="flex flex-col items-center gap-3">
                      <Files className="h-12 w-12 text-muted-foreground/50" />
                      <div>
                        <p className="font-medium text-lg">Arraste vários XMLs de NF-e aqui</p>
                        <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar múltiplos arquivos (até 30)</p>
                      </div>
                      <Badge variant="outline" className="text-xs">Formato: .xml (NF-e padrão SEFAZ) — máximo 30 arquivos</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Lista de arquivos na fila */}
            {batchFiles.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Files className="h-4 w-4" />
                      Fila de Importação — {batchFiles.length} arquivo(s)
                    </CardTitle>
                    {!batchRunning && !batchDone && (
                      <Button variant="outline" size="sm" onClick={() => setBatchFiles([])}>Limpar tudo</Button>
                    )}
                  </div>

                  {/* Barra de progresso */}
                  {(batchRunning || batchDone) && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{batchRunning ? `Processando... ${batchProgress}%` : "Concluído"}</span>
                        <span>{batchSuccess} ok · {batchDuplicates} duplicadas · {batchErrors} erros · {batchPending} pendentes</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-300 ${batchDone ? "bg-green-500" : "bg-primary"}`}
                          style={{ width: `${batchProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {batchFiles.map((file) => (
                      <div key={file.id} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* Ícone de status */}
                          <div className="shrink-0">
                            {file.status === "pending" && <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />}
                            {file.status === "processing" && <RefreshCw className="h-5 w-5 text-primary animate-spin" />}
                            {file.status === "success" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                            {file.status === "duplicate" && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                            {file.status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
                          </div>

                          {/* Info do arquivo */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.nNF ? `NF-e nº ${file.nNF}` : ""}
                              {file.emitNome ? ` · ${file.emitNome}` : ""}
                            </p>
                          </div>

                          {/* Badge de status */}
                          <div className="shrink-0 flex items-center gap-2">
                            {file.status === "pending" && <Badge variant="outline" className="text-xs">Aguardando</Badge>}
                            {file.status === "processing" && <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">Processando...</Badge>}
                            {file.status === "success" && (
                              <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                                ✓ {file.result?.imported} itens{file.result?.created ? ` · ${file.result.created} criados` : ""}
                              </Badge>
                            )}
                            {file.status === "duplicate" && <Badge className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200">Duplicada</Badge>}
                            {file.status === "error" && <Badge className="text-xs bg-red-100 text-red-700 border-red-200">Erro</Badge>}

                            {/* Botão remover (só quando não está rodando) */}
                            {!batchRunning && file.status !== "processing" && (
                              <button
                                onClick={() => removeBatchFile(file.id)}
                                className="text-muted-foreground hover:text-red-500 transition-colors ml-1"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Mensagem de erro expandida */}
                        {(file.status === "error" || file.status === "duplicate") && file.errorMsg && (
                          <p className="text-xs text-red-600 mt-1 ml-8">{file.errorMsg}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resumo final */}
            {batchDone && (
              <div className="grid grid-cols-4 gap-4">
                <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{batchSuccess}</p><p className="text-xs text-muted-foreground">importadas com sucesso</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-600">{batchDuplicates}</p><p className="text-xs text-muted-foreground">duplicadas (ignoradas)</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-600">{batchErrors}</p><p className="text-xs text-muted-foreground">com erro</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{batchFiles.reduce((s, f) => s + (f.result?.imported ?? 0), 0)}</p><p className="text-xs text-muted-foreground">itens no estoque</p></CardContent></Card>
              </div>
            )}

            {/* Ações do lote */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {!batchRunning && (
                  <Button variant="outline" onClick={() => batchFileInputRef.current?.click()} disabled={batchFiles.length >= 30} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Adicionar mais XMLs
                  </Button>
                )}
                {batchDone && (
                  <Button variant="outline" onClick={() => { setBatchFiles([]); setBatchDone(false); setBatchProgress(0); navigate("/products"); }} className="gap-2">
                    Ver Estoque
                  </Button>
                )}
              </div>
              {!batchDone && (
                <Button
                  onClick={runBatch}
                  disabled={batchRunning || batchFiles.length === 0 || batchFiles.every((f) => f.status === "success")}
                  className="gap-2"
                  size="lg"
                >
                  {batchRunning ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" />Importando {batchProgress}%...</>
                  ) : (
                    <><Package className="h-4 w-4" />Importar {batchFiles.filter((f) => f.status === "pending").length} NF-e(s)</>
                  )}
                </Button>
              )}
              {batchDone && batchErrors > 0 && (
                <Button
                  onClick={runBatch}
                  variant="outline"
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Tentar novamente ({batchErrors} com erro)
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
