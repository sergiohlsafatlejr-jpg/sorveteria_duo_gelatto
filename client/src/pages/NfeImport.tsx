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

// ─── Componente principal ─────────────────────────────────────────────────────
export default function NfeImport() {
  const [, navigate] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const [nfeInfo, setNfeInfo] = useState<NfeInfo | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [doneResult, setDoneResult] = useState<{ imported: number; created: number } | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState<string | null>(null);
  const [forceImport, setForceImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: productsList } = trpc.nfe.productsList.useQuery();
  const parseMutation = trpc.nfe.parse.useMutation({
    onSuccess: (data) => {
      setNfeInfo(data.info as NfeInfo);
      setItems(data.items as ParsedItem[]);
      setIsDuplicate(!!data.isDuplicate);
      setForceImport(false);
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
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

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

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const newCount = items.filter((i) => i.isNew).length;
  const linkedCount = items.filter((i) => !i.isNew && i.matchedProductId !== null).length;
  const totalUnits = items.reduce((s, i) => s + i.stockQty, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <BackButton to="/products" />

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Importar NF-e XML
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Faça upload do XML da nota fiscal para dar entrada automática no estoque
          </p>
        </div>

        {/* ── Step 1: Upload ── */}
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

        {/* ── Step 2: Revisão ── */}
        {step === "review" && nfeInfo && (
          <>
            {/* Cabeçalho da NF */}
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

            {/* Resumo */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{items.length}</p>
                  <p className="text-xs text-muted-foreground">itens na NF-e</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{linkedCount}</p>
                  <p className="text-xs text-muted-foreground">já cadastrados</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{newCount}</p>
                  <p className="text-xs text-muted-foreground">serão criados</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{totalUnits}</p>
                  <p className="text-xs text-muted-foreground">unidades a entrar</p>
                </CardContent>
              </Card>
            </div>

            {/* ⚠️ Aviso de NF-e Duplicada */}
            {isDuplicate && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-red-700 text-sm">
                    ⚠️ Esta NF-e já foi importada anteriormente!
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    A NF-e nº <strong>{nfeInfo?.nNF}</strong> do emitente <strong>{nfeInfo?.emitNome}</strong> já foi processada
                    {duplicateDate ? ` em ${duplicateDate}` : ""}. Importar novamente irá <strong>duplicar o estoque</strong> de todos os itens.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-700 hover:bg-red-100 gap-2"
                      onClick={() => { setStep("upload"); setItems([]); setNfeInfo(null); setIsDuplicate(false); }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-2"
                      disabled={confirmMutation.isPending}
                      onClick={() => handleConfirm(true)}
                    >
                      {confirmMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                      Importar mesmo assim (duplicar estoque)
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Aviso sobre criação automática */}
            {newCount > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <Plus className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-700 text-sm">
                    {newCount} produto(s) serão criados automaticamente
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Os itens marcados com <span className="font-semibold">Novo</span> não estão cadastrados e serão criados com o nome, código do fornecedor, fator de conversão e custo unitário da NF-e. Você pode editar os detalhes depois no Estoque.
                  </p>
                </div>
              </div>
            )}

            {/* Tabela de itens */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Itens da NF-e
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Revise os vínculos e o fator de conversão antes de confirmar. Itens marcados como <strong>Novo</strong> serão criados automaticamente.
                </p>
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
                        <tr
                          key={idx}
                          className={`border-b ${
                            item.isNew
                              ? "bg-blue-50/40 hover:bg-blue-50/60"
                              : "hover:bg-muted/10"
                          }`}
                        >
                          <td className="p-3">
                            <p className="font-medium text-xs leading-tight">{item.xProd}</p>
                            <p className="text-xs text-muted-foreground">Cód: {item.cProd}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-medium">{item.qCom}</span>
                            <span className="text-xs text-muted-foreground ml-1">{item.uCom}</span>
                          </td>
                          <td className="p-3 text-center">
                            <Input
                              type="number"
                              min={1}
                              value={item.conversionFactor}
                              onChange={(e) => recalcStockQty(idx, parseInt(e.target.value) || 1)}
                              className="w-16 text-center h-7 text-xs mx-auto"
                            />
                            <p className="text-xs text-muted-foreground mt-0.5">un/cx</p>
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              variant={item.isNew ? "secondary" : "default"}
                              className={`text-xs ${item.isNew ? "bg-blue-100 text-blue-700 border-blue-200" : ""}`}
                            >
                              {item.stockQty} un
                            </Badge>
                          </td>
                          <td className="p-3 min-w-[200px]">
                            {item.isNew ? (
                              <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 text-white text-xs shrink-0">Novo</Badge>
                                <span className="text-xs text-blue-700 font-medium truncate">
                                  Será criado automaticamente
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                <Select
                                  value={String(item.matchedProductId)}
                                  onValueChange={(v) => {
                                    const prod = productsList?.find((p) => p.id === parseInt(v));
                                    updateItem(idx, {
                                      matchedProductId: parseInt(v),
                                      matchedProductName: prod?.name ?? null,
                                      isNew: false,
                                      stockUnit: prod?.unit ?? "un",
                                      conversionFactor: prod?.conversionFactor ?? item.conversionFactor,
                                      stockQty: Math.round(item.qCom * (prod?.conversionFactor ?? item.conversionFactor)),
                                    });
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {productsList?.map((p) => (
                                      <SelectItem key={p.id} value={String(p.id)} className="text-xs">
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right text-xs text-muted-foreground">
                            {fmt(item.vUnCom)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Ações */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => { setStep("upload"); setItems([]); setNfeInfo(null); }}
              >
                Carregar outro XML
              </Button>
              <Button
                onClick={() => handleConfirm(false)}
                disabled={confirmMutation.isPending || items.length === 0 || isDuplicate}
                className="gap-2"
              >
                {confirmMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
                Confirmar Importação ({items.length} itens, {totalUnits} un)
              </Button>
            </div>
          </>
        )}

        {/* ── Step 3: Concluído ── */}
        {step === "done" && doneResult && (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center gap-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <div>
                <h2 className="text-xl font-bold">Importação concluída!</h2>
                <p className="text-muted-foreground mt-1">
                  {doneResult.imported} produto(s) com entrada no estoque.
                  {doneResult.created > 0 && (
                    <span className="text-blue-600 font-medium">
                      {" "}{doneResult.created} produto(s) criado(s) automaticamente.
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-3 mt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("upload");
                    setItems([]);
                    setNfeInfo(null);
                    setDoneResult(null);
                    utils.products.list.invalidate();
                  }}
                >
                  Importar outra NF-e
                </Button>
                <Button
                  onClick={() => {
                    utils.products.list.invalidate();
                    navigate("/products");
                  }}
                >
                  Ver Estoque
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
