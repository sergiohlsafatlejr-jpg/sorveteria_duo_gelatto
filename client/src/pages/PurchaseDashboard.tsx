import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  CalendarRange,
  FileSearch,
  PackageSearch,
  ReceiptText,
  Repeat2,
  ShoppingBasket,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { IceCream, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLocation } from "wouter";

const CATEGORY_LABELS: Record<string, string> = {
  limpeza: "Material de limpeza",
  guloseimas: "Guloseimas",
  caldas: "Caldas",
  descartaveis: "Descartáveis",
  embalagens: "Embalagens",
  manutencao: "Manutenção",
  insumos: "Insumos",
  outros: "Outros itens",
};

function money(value: string | number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function dayLabel(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function axisMoney(value: number) {
  if (value >= 1000) return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

export default function PurchaseDashboard() {
  const [, setLocation] = useLocation();
  const [month, setMonth] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"almoxarifado" | "sorvetes">("almoxarifado");
  const supplierFilter = activeTab === "sorvetes" ? "duo_gelatto" : "almoxarifado";
  const input = useMemo(() => ({ month, supplier: supplierFilter as "all" | "duo_gelatto" | "almoxarifado" }), [month, supplierFilter]);
  const { data: filteredData, isLoading } = trpc.purchaseInvoices.dashboard.useQuery(input);

  useEffect(() => {
    if (!month && filteredData?.month) setMonth(filteredData.month);
  }, [filteredData?.month, month]);

  const summary = filteredData?.summary;
  const daily = useMemo(
    () => (filteredData?.daily ?? []).map((row) => ({ ...row, label: dayLabel(row.date) })),
    [filteredData?.daily],
  );
  const maxCategory = Math.max(1, ...(filteredData?.categories ?? []).map((row) => row.totalSpent));

  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <BarChart3 className="h-4 w-4" /> Compras Internas
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard mensal de compras</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Acompanhe gastos, fornecedores e produtos recorrentes a partir das notas extraídas, revisadas ou confirmadas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setLocation("/purchases/items")}>
              <PackageSearch className="mr-2 h-4 w-4" />Compras por item
            </Button>
            <Button onClick={() => setLocation("/purchases/invoices")}>
              <FileSearch className="mr-2 h-4 w-4" />Notas fiscais
            </Button>
          </div>
        </div>

        {/* Abas Almoxarifado / Sorvetes */}
        <div className="flex gap-2 rounded-lg bg-muted/50 p-1">
          <button
            onClick={() => setActiveTab("almoxarifado")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "almoxarifado" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Warehouse className="h-4 w-4" />
            Almoxarifado
          </button>
          <button
            onClick={() => setActiveTab("sorvetes")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "sorvetes" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <IceCream className="h-4 w-4" />
            Sorvetes
          </button>
        </div>

        <Card className="overflow-hidden border-primary/15 bg-gradient-to-r from-primary/[0.06] via-card to-amber-500/[0.05]">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold"><CalendarRange className="h-4 w-4 text-primary" />Período analisado</div>
              <p className="mt-1 text-sm text-muted-foreground">Selecione um mês que possua notas processadas no sistema.</p>
            </div>
            <Select value={month ?? filteredData?.month ?? ""} onValueChange={setMonth}>
              <SelectTrigger className="w-full bg-background md:w-[220px]" aria-label="Mês de análise">
                <SelectValue placeholder="Selecione o mês" />
              </SelectTrigger>
              <SelectContent>
                {(filteredData?.availableMonths ?? []).map((value) => (
                  <SelectItem key={value} value={value}>{monthLabel(value)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={ShoppingBasket} label="Valor total" value={money(filteredData?.summary?.totalSpent)} tone="primary" />
          <MetricCard icon={ReceiptText} label="Ticket médio" value={money(filteredData?.summary?.averageTicket)} hint={`${filteredData?.summary?.invoiceCount ?? 0} nota(s)`} tone="blue" />
          <MetricCard icon={UsersRound} label="Maior fornecedor" value={`${(filteredData?.summary?.topSupplierShare ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} hint={filteredData?.summary?.topSupplierName ?? "Sem dados"} tone="amber" />
          <MetricCard icon={Repeat2} label="Itens recorrentes" value={String(filteredData?.summary?.recurringItemCount ?? 0)} hint="Presentes em 2+ notas" tone="emerald" />
        </div>

        {!isLoading && (filteredData?.summary?.invoiceCount ?? 0) === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <BarChart3 className="mb-4 h-11 w-11 text-muted-foreground/35" />
              <h2 className="text-lg font-semibold">Nenhuma compra processada neste mês</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Envie um PDF de nota fiscal ou selecione outro período para visualizar os indicadores.</p>
              <Button className="mt-5" onClick={() => setLocation("/purchases/invoices")}>Enviar nota fiscal</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />{activeTab === "sorvetes" ? "Compras de sorvetes no mês" : "Compras do almoxarifado no mês"}</CardTitle>
                  <p className="text-sm text-muted-foreground">Valor total das notas por dia de emissão.</p>
                </CardHeader>
                <CardContent>
                  <div className="h-[290px] w-full" aria-label="Gráfico de compras diárias">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e4f2" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis tickLine={false} axisLine={false} fontSize={11} width={76} tickFormatter={(value) => axisMoney(Number(value))} />
                        <Tooltip formatter={(value) => [money(Number(value)), "Compras"]} labelFormatter={(label) => `Data: ${label}`} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
                        <Bar dataKey="totalSpent" fill="#6d4ce8" radius={[7, 7, 2, 2]} maxBarSize={46} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Concentração por fornecedor</CardTitle>
                  <p className="text-sm text-muted-foreground">Participação de cada fornecedor no valor mensal.</p>
                </CardHeader>
                <CardContent className="space-y-5">
                  {(filteredData?.suppliers ?? []).slice(0, 6).map((supplier, index) => (
                    <div key={supplier.supplierName} className="space-y-2">
                      <div className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0"><p className="truncate font-semibold">{supplier.supplierName}</p><p className="text-xs text-muted-foreground">{supplier.invoiceCount} nota(s)</p></div>
                        <div className="text-right"><p className="font-semibold">{money(supplier.totalSpent)}</p><p className="text-xs text-muted-foreground">{supplier.share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</p></div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${index === 0 ? "bg-primary" : "bg-primary/55"}`} style={{ width: `${Math.max(2, supplier.share)}%` }} /></div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Repeat2 className="h-5 w-5 text-emerald-600" />Itens recorrentes</CardTitle>
                  <p className="text-sm text-muted-foreground">Produtos presentes em duas ou mais notas do período.</p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead><tr className="border-y bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3">Produto</th><th className="px-4 py-3 text-right">Notas</th><th className="px-4 py-3 text-right">Qtd.</th><th className="px-5 py-3 text-right">Valor</th></tr></thead>
                      <tbody>
                        {(filteredData?.recurringItems ?? []).map((item) => <tr key={item.description} className="border-b"><td className="px-5 py-3 font-medium">{item.description}</td><td className="px-4 py-3 text-right"><Badge variant="outline">{item.invoiceCount}</Badge></td><td className="px-4 py-3 text-right">{item.totalQuantity.toLocaleString("pt-BR")}</td><td className="px-5 py-3 text-right font-semibold">{money(item.totalSpent)}</td></tr>)}
                        {(filteredData?.recurringItems ?? []).length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">Ainda não há itens presentes em mais de uma nota.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Distribuição dos itens por categoria</CardTitle>
                  <p className="text-sm text-muted-foreground">Valores extraídos das linhas das notas, sem simular categorias ausentes.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(filteredData?.categories ?? []).map((category) => (
                    <div key={category.category} className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-4">
                      <div className="min-w-0"><div className="mb-1.5 flex items-center justify-between gap-2 text-sm"><span className="truncate font-medium">{CATEGORY_LABELS[category.category] ?? category.category}</span><span className="text-xs text-muted-foreground">{category.itemCount} item(ns)</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(3, (category.totalSpent / maxCategory) * 100)}%` }} /></div></div>
                      <p className="text-right text-sm font-semibold">{money(category.totalSpent)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone }: { icon: typeof ShoppingBasket; label: string; value: string; hint?: string; tone: "primary" | "blue" | "amber" | "emerald" }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-700",
    amber: "bg-amber-500/10 text-amber-700",
    emerald: "bg-emerald-500/10 text-emerald-700",
  };
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-xl font-bold">{value}</p>{hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}</div></CardContent></Card>;
}
