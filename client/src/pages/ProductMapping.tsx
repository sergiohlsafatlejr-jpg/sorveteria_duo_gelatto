import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Link2, Search, Sparkles, RefreshCw, CheckCircle2, AlertCircle,
  Unlink, ArrowLeft, Package, Tag, Download, Upload
} from "lucide-react";
import { Link } from "wouter";

function fmt(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ProductMapping() {
  const utils = trpc.useUtils();
  const { data: mappings, isLoading } = trpc.salesImport.getMappings.useQuery();
  const { data: pdvProducts } = trpc.salesImport.getProductsForLinking.useQuery();

  const updateMut = trpc.salesImport.updateMapping.useMutation({
    onSuccess: () => {
      utils.salesImport.getMappings.invalidate();
      toast.success("Mapeamento atualizado!");
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkSuggestMut = trpc.salesImport.bulkSuggestMappings.useMutation({
    onSuccess: (result) => {
      utils.salesImport.getMappings.invalidate();
      toast.success(result.message);
    },
    onError: (err) => toast.error(`Erro na IA: ${err.message}`),
  });

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "mapped" | "unmapped">("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const filtered = useMemo(() => {
    if (!mappings) return [];
    return mappings.filter((m) => {
      const matchSearch =
        !search ||
        m.productName.toLowerCase().includes(search.toLowerCase()) ||
        (m.externalCode ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (m.externalName ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "mapped" && !!m.externalCode) ||
        (filterStatus === "unmapped" && !m.externalCode);
      return matchSearch && matchStatus;
    });
  }, [mappings, search, filterStatus]);

  const mappedCount = mappings?.filter((m) => !!m.externalCode).length ?? 0;
  const totalCount = mappings?.length ?? 0;
  const unmappedCount = totalCount - mappedCount;

  // Buscar todos os códigos PDV únicos das importações
  const pdvCodes = useMemo(() => {
    if (!pdvProducts) return [];
    return pdvProducts.filter((p) => p.externalCode).map((p) => ({
      code: p.externalCode!,
      name: p.name,
    }));
  }, [pdvProducts]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/sales/import">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Importação
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <Link2 className="h-6 w-6 text-blue-600" />
            Mapeamento PDV → Estoque
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vincule permanentemente os códigos do PDV aos produtos do estoque. Uma vez mapeado, o sistema reconhece automaticamente nas próximas importações.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              const a = document.createElement("a");
              a.href = "/api/mapping/export";
              a.download = "Mapeamento_PDV_Estoque.xlsx";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              toast.success("✅ Excel exportado! Preencha as colunas verdes e reimporte.");
            }}
            variant="outline"
            className="border-green-600 text-green-600 hover:bg-green-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".xlsx,.xls";
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append("file", file);
                try {
                  toast.info("⏳ Importando mapeamentos...");
                  const res = await fetch("/api/mapping/import", {
                    method: "POST",
                    body: formData,
                  });
                  const data = await res.json();
                  if (data.success) {
                    utils.salesImport.getMappings.invalidate();
                    toast.success(data.message);
                  } else {
                    toast.error(data.error || "Erro ao importar");
                  }
                } catch (err) {
                  toast.error("Erro ao importar: " + String(err));
                }
              };
              input.click();
            }}
            variant="outline"
            className="border-blue-600 text-blue-600 hover:bg-blue-50"
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar Excel
          </Button>
          <Button
            onClick={() => bulkSuggestMut.mutate()}
            disabled={bulkSuggestMut.isPending}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {bulkSuggestMut.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                IA mapeando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Sugerir com IA
              </>
            )}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total de Produtos</p>
          <p className="text-2xl font-bold">{totalCount}</p>
          <p className="text-xs text-muted-foreground">no catálogo de estoque</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Mapeados</p>
          <p className="text-2xl font-bold text-green-600">{mappedCount}</p>
          <p className="text-xs text-muted-foreground">
            {totalCount > 0 ? Math.round((mappedCount / totalCount) * 100) : 0}% do catálogo
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Sem Mapeamento</p>
          <p className="text-2xl font-bold text-amber-600">{unmappedCount}</p>
          <p className="text-xs text-muted-foreground">aguardando vínculo PDV</p>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome do produto ou código PDV..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              {(["all", "mapped", "unmapped"] as const).map((s) => (
                <Button
                  key={s}
                  variant={filterStatus === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus(s)}
                >
                  {s === "all"
                    ? `Todos (${totalCount})`
                    : s === "mapped"
                    ? `Mapeados (${mappedCount})`
                    : `Sem mapeamento (${unmappedCount})`}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de mapeamentos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-500" />
            Produtos do Estoque ({filtered.length} exibidos)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">
              <RefreshCw className="h-8 w-8 mx-auto animate-spin mb-2" />
              Carregando mapeamentos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum produto encontrado com esses filtros.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Produto no Estoque</th>
                    <th className="text-left p-3 font-medium">Estoque Atual</th>
                    <th className="text-left p-3 font-medium">Código PDV</th>
                    <th className="text-left p-3 font-medium">Nome no PDV</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-center p-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.productId} className="border-t hover:bg-muted/20">
                      <td className="p-3 font-medium">{m.productName}</td>
                      <td className="p-3 text-muted-foreground">
                        {m.currentStock} {m.unit}
                      </td>
                      <td className="p-3">
                        {editingId === m.productId ? (
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-7 text-xs w-32"
                            placeholder="Código PDV..."
                            autoFocus
                          />
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {m.externalCode ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="p-3 max-w-[200px]">
                        {editingId === m.productId ? (
                          <Select
                            value={editValue || "__none__"}
                            onValueChange={(v) => {
                              if (v !== "__none__") setEditValue(v);
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Selecionar código PDV..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Digitar manualmente —</SelectItem>
                              {pdvProducts
                                ?.filter((p) => p.externalCode)
                                .map((p) => (
                                  <SelectItem key={p.externalCode!} value={p.externalCode!}>
                                    {p.externalCode} — {p.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs truncate block max-w-[200px]" title={m.externalName ?? ""}>
                            {m.externalName ?? (m.externalCode ? "Nome não registrado" : "—")}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {m.externalCode ? (
                          <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Mapeado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Sem vínculo
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {editingId === m.productId ? (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => {
                                  updateMut.mutate({ productId: m.productId, externalCode: editValue || null });
                                  setEditingId(null);
                                }}
                                disabled={updateMut.isPending}
                              >
                                Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setEditingId(null)}
                              >
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setEditingId(m.productId);
                                  setEditValue(m.externalCode ?? "");
                                }}
                              >
                                <Tag className="h-3 w-3 mr-1" />
                                {m.externalCode ? "Editar" : "Mapear"}
                              </Button>
                              {m.externalCode && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-rose-500 hover:text-rose-600"
                                  onClick={() => {
                                    if (confirm(`Remover mapeamento de "${m.productName}"?`)) {
                                      updateMut.mutate({ productId: m.productId, externalCode: null });
                                    }
                                  }}
                                  disabled={updateMut.isPending}
                                >
                                  <Unlink className="h-3 w-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legenda */}
      <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50">
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Como funciona o mapeamento permanente
          </h3>
          <div className="text-xs text-blue-600/80 dark:text-blue-300/80 space-y-1">
            <p>• Cada produto do estoque pode ser vinculado a um código do PDV (caixa registradora).</p>
            <p>• Uma vez mapeado, o sistema reconhece automaticamente o produto nas próximas importações de vendas.</p>
            <p>• Use o botão <strong>"Sugerir com IA"</strong> para que a inteligência artificial sugira vínculos automaticamente.</p>
            <p>• Você pode editar ou remover qualquer mapeamento manualmente a qualquer momento.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
