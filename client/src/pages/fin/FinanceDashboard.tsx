import { trpc } from "@/lib/trpc";
import BackButton from "@/components/BackButton";
import { FinKPICard } from "@/components/fin/FinKPICard";
import { FinMonthlyEvolutionChart, FinCategoryChart } from "@/components/fin/FinCharts";
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Banknote, Calendar,
  CheckCircle2, Clock, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function FinanceDashboard() {
  const { data: kpis, isLoading } = trpc.fin.dashboard.useQuery();
  const { data: categories = [] } = trpc.fin.categories.list.useQuery();
  const { data: transactions = [] } = trpc.fin.transactions.list.useQuery();

  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  // Build category breakdown for chart
  const categoryBreakdown = (() => {
    const map = new Map<string, number>();
    transactions.forEach(t => {
      const name = t.categoryId ? (categoryMap.get(t.categoryId) ?? "Outros") : "Sem categoria";
      map.set(name, (map.get(name) ?? 0) + Number(t.amount));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  })();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="p-6 space-y-6">
        <BackButton to="/dashboard" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            {format(now, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        {kpis && kpis.overdueCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {kpis.overdueCount} conta{kpis.overdueCount > 1 ? "s" : ""} vencida{kpis.overdueCount > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FinKPICard
          title="A Pagar"
          value={fmtBRL(kpis?.totalPayable ?? 0)}
          subtitle={`${kpis?.overdueCount ?? 0} vencidas`}
          icon={ArrowUpCircle}
          iconColor="text-destructive"
          bgColor="bg-destructive/10"
          alert={(kpis?.overdueCount ?? 0) > 0}
        />
        <FinKPICard
          title="Pago"
          value={fmtBRL(kpis?.totalPaid ?? 0)}
          subtitle="Total liquidado"
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />
        <FinKPICard
          title="A Receber"
          value={fmtBRL(kpis?.totalReceivable ?? 0)}
          subtitle="Em aberto"
          icon={ArrowDownCircle}
          iconColor="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <FinKPICard
          title="Recebido"
          value={fmtBRL(kpis?.totalReceived ?? 0)}
          subtitle="Total recebido"
          icon={TrendingUp}
          iconColor="text-violet-500"
          bgColor="bg-violet-500/10"
        />
      </div>

      {/* KPI Cards Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FinKPICard
          title="Vencidas"
          value={fmtBRL(kpis?.totalOverdue ?? 0)}
          subtitle={`${kpis?.overdueCount ?? 0} lançamento${(kpis?.overdueCount ?? 0) !== 1 ? "s" : ""}`}
          icon={AlertTriangle}
          iconColor="text-destructive"
          bgColor="bg-destructive/10"
          alert={(kpis?.totalOverdue ?? 0) > 0}
        />
        <FinKPICard
          title="Vence Hoje"
          value={fmtBRL(kpis?.todayPaymentsPendingTotal ?? 0)}
          subtitle={`${kpis?.todayPaymentsPendingCount ?? 0} pendente${(kpis?.todayPaymentsPendingCount ?? 0) !== 1 ? "s" : ""}`}
          icon={Calendar}
          iconColor="text-amber-500"
          bgColor="bg-amber-500/10"
        />
        <FinKPICard
          title="Próx. 7 dias"
          value={fmtBRL(kpis?.next7Total ?? 0)}
          subtitle={`${kpis?.next7Count ?? 0} lançamento${(kpis?.next7Count ?? 0) !== 1 ? "s" : ""}`}
          icon={Clock}
          iconColor="text-orange-500"
          bgColor="bg-orange-500/10"
        />
        <FinKPICard
          title="Saldo Previsto"
          value={fmtBRL(kpis?.balance ?? 0)}
          subtitle="Receber - Pagar"
          icon={(kpis?.balance ?? 0) >= 0 ? TrendingUp : TrendingDown}
          iconColor={(kpis?.balance ?? 0) >= 0 ? "text-emerald-500" : "text-destructive"}
          bgColor={(kpis?.balance ?? 0) >= 0 ? "bg-emerald-500/10" : "bg-destructive/10"}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FinMonthlyEvolutionChart data={kpis?.monthlyData ?? []} />
        </div>
        <div>
          <FinCategoryChart data={categoryBreakdown} title="Despesas por Categoria" />
        </div>
      </div>

      {/* Upcoming Payments */}
      {(kpis?.upcomingPayments?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
          <div className="p-4 border-b border-border/50 bg-muted/20">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Próximos Vencimentos (7 dias)
            </h3>
          </div>
          <div className="divide-y divide-border/30">
            {kpis?.upcomingPayments?.map(p => {
              const isToday = new Date(p.dueDate).toDateString() === new Date().toDateString();
              const isOverdue = new Date(p.dueDate) < new Date();
              return (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      isOverdue ? "bg-destructive" : isToday ? "bg-amber-500" : "bg-blue-500"
                    )} />
                    <div>
                      <p className="text-sm font-medium">{p.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.categoryId ? categoryMap.get(p.categoryId) : "Sem categoria"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmtBRL(p.amount)}</p>
                    <p className={cn(
                      "text-xs",
                      isOverdue ? "text-destructive font-medium" : isToday ? "text-amber-500 font-medium" : "text-muted-foreground"
                    )}>
                      {isOverdue ? "Vencida" : isToday ? "Hoje" : format(new Date(p.dueDate), "dd/MM")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Balance Card */}
      <div className="rounded-xl border border-border/50 bg-gradient-to-br from-primary/5 to-violet-500/5 p-5">
        <div className="flex items-center gap-3 mb-4">
          <Wallet className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Resumo Financeiro</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total a Pagar", value: kpis?.totalPayable ?? 0, color: "text-destructive" },
            { label: "Total a Receber", value: kpis?.totalReceivable ?? 0, color: "text-blue-500" },
            { label: "Total Pago", value: kpis?.totalPaid ?? 0, color: "text-emerald-500" },
            { label: "Total Recebido", value: kpis?.totalReceived ?? 0, color: "text-violet-500" },
          ].map(item => (
            <div key={item.label} className="text-center">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={cn("text-lg font-bold", item.color)}>{fmtBRL(item.value)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
