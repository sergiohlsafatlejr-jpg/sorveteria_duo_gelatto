import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Boxes, CalendarRange, ChevronLeft, ChevronRight, Download, FileSearch, PackageSearch, Search, ShoppingBasket } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

const CATEGORY_LABELS: Record<string, string> = {
  limpeza: "Material de limpeza", guloseimas: "Guloseimas", caldas: "Caldas",
  descartaveis: "Descartáveis", embalagens: "Embalagens", manutencao: "Manutenção",
  insumos: "Insumos", outros: "Outros itens",
};

async function exportToExcel(items: any[], supplier: string) {
  const XLSX = await import("xlsx");
  const data = items.map((item: any) => ({
    "Produto": item.description,
    "Fornecedor": item.supplierName || "N/I",
    "Nota": item.invoiceNumber || "",
    "Data": item.issueDate ? item.issueDate.split("-").reverse().join("/") : "",
    "Categoria": item.category || "",
    "Quantidade": Number(item.quantity),
    "Unidade": item.unit || "UN",
    "Preço Unit.": Number(Number(item.unitPrice).toFixed(2)),
    "Total": Number(Number(item.totalPrice).toFixed(2)),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Compras por Item");
  XLSX.writeFile(wb, `compras_por_item_${supplier}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function money(value: string | number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
}

function dateOnly(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export default function PurchaseItems() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [supplier, setSupplier] = useState<"all" | "sorvefort" | "duo_gelatto" | "outros">("outros");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("all");
  const input = useMemo(() => ({
    supplier, search, dateFrom: dateFrom || null, dateTo: dateTo || null,
    category: category as "all" | "limpeza" | "guloseimas" | "caldas" | "descartaveis" | "embalagens" | "manutencao" | "insumos" | "outros",
    limit: 500,
  }), [supplier, search, dateFrom, dateTo, category]);
  const { data: items = [], isLoading } = trpc.purchaseInvoices.itemsBySupplier.useQuery(input);

  const metrics = useMemo(() => ({
    total: items.reduce((sum, item) => sum + Number(item.totalPrice), 0),
    quantity: items.reduce((sum, item) => sum + Number(item.quantity), 0),
    products: new Set(items.map((item) => item.description.toLowerCase())).size,
    invoices: new Set(items.map((item) => item.invoiceId)).size,
  }), [items]);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage],
  );
  const firstItem = items.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, items.length);

  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><ShoppingBasket className="h-4 w-4" /> Compras Internas</div><h1 className="text-3xl font-bold tracking-tight">Compras abertas por item</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Analise cada produto da Sorvefort ou de todos os fornecedores, com origem, quantidade e preço.</p></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportToExcel(items, supplier)} disabled={items.length === 0}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button>
            <Button variant="outline" onClick={() => setLocation("/purchases/invoices")}><FileSearch className="mr-2 h-4 w-4" />Histórico de notas</Button>
          </div>
        </div>

        <Card className="border-primary/15">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
            <Select value={supplier} onValueChange={(value) => { setSupplier(value as typeof supplier); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="outros">Almoxarifado (outros)</SelectItem><SelectItem value="duo_gelatto">Sorvetes (Duo Gelatto)</SelectItem><SelectItem value="sorvefort">Somente Sorvefort</SelectItem><SelectItem value="all">Todos os fornecedores</SelectItem></SelectContent></Select>
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Produto ou código" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
            <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} aria-label="Data inicial" />
            <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} aria-label="Data final" />
            <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ShoppingBasket className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Valor dos itens</p><p className="text-xl font-bold">{money(metrics.total)}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-700"><Boxes className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Quantidade</p><p className="text-xl font-bold">{metrics.quantity.toLocaleString("pt-BR")}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-700"><PackageSearch className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Produtos distintos</p><p className="text-xl font-bold">{metrics.products}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-700"><CalendarRange className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">Notas de origem</p><p className="text-xl font-bold">{metrics.invoices}</p></div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>{supplier === "sorvefort" ? "Itens comprados da Sorvefort" : supplier === "duo_gelatto" ? "Sorvetes (Duo Gelatto)" : supplier === "outros" ? "Almoxarifado — Itens operacionais" : "Itens de todos os fornecedores"}</CardTitle><p className="text-sm text-muted-foreground">{items.length} linha(s) encontrada(s) nos filtros atuais.</p></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-y bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3">Produto</th><th className="px-4 py-3">Nota / data</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3 text-right">Qtd.</th><th className="px-4 py-3 text-right">Preço unit.</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">Carregando itens...</td></tr> : paginatedItems.map((item) => <tr key={item.id} className="border-b transition-colors hover:bg-muted/20"><td className="px-5 py-4"><p className="font-semibold">{item.description}</p><p className="text-xs text-muted-foreground">{item.supplierName || "Fornecedor não identificado"} • cód. {item.supplierCode || "—"}</p></td><td className="px-4 py-4"><p className="font-medium">NF {item.invoiceNumber || "—"}</p><p className="text-xs text-muted-foreground">{dateOnly(item.issueDate)}</p></td><td className="px-4 py-4"><Badge variant="outline">{CATEGORY_LABELS[item.category] || item.category}</Badge></td><td className="px-4 py-4 text-right">{Number(item.quantity).toLocaleString("pt-BR")} {item.unit}</td><td className="px-4 py-4 text-right">{money(item.unitPrice)}</td><td className="px-5 py-4 text-right font-semibold">{money(item.totalPrice)}</td></tr>)}{!isLoading && items.length === 0 && <tr><td colSpan={6} className="py-14 text-center"><PackageSearch className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" /><p className="font-medium">Nenhum item encontrado</p><p className="mt-1 text-sm text-muted-foreground">Envie uma nota em PDF ou ajuste os filtros.</p></td></tr>}</tbody></table></div>
            {!isLoading && items.length > 0 && <div className="flex flex-col gap-3 border-t px-5 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>Exibindo {firstItem}–{lastItem} de {items.length} itens.</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><span className="min-w-20 text-center">Página {currentPage} de {totalPages}</span><Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
