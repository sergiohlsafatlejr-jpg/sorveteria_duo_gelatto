import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import BackButton from "@/components/BackButton";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, DollarSign, Eye, MousePointerClick, Target,
  RefreshCw, AlertCircle, CheckCircle2, Megaphone, BarChart2,
  LayoutGrid, GitCompare, Layers,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtNum = (v: number) =>
  new Intl.NumberFormat("pt-BR").format(v);
const fmtPct = (v: number) => `${v.toFixed(2)}%`;

const DATE_PRESETS = [
  { label: "Hoje", value: "today" },
  { label: "7 dias", value: "last_7d" },
  { label: "14 dias", value: "last_14d" },
  { label: "30 dias", value: "last_30d" },
  { label: "90 dias", value: "last_90d" },
  { label: "Este mês", value: "this_month" },
  { label: "Mês passado", value: "last_month" },
] as const;

type DatePreset = (typeof DATE_PRESETS)[number]["value"];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Ativa", className: "bg-green-100 text-green-700 border-green-200" },
  PAUSED: { label: "Pausada", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  ARCHIVED: { label: "Arquivada", className: "bg-gray-100 text-gray-600 border-gray-200" },
  DELETED: { label: "Excluída", className: "bg-red-100 text-red-700 border-red-200" },
  DISABLED: { label: "Desativada", className: "bg-red-100 text-red-700 border-red-200" },
};

const RANKING_LABEL: Record<string, { label: string; color: string }> = {
  ABOVE_AVERAGE: { label: "Acima da média", color: "text-green-600" },
  AVERAGE: { label: "Na média", color: "text-blue-600" },
  BELOW_AVERAGE_10: { label: "Abaixo (10%)", color: "text-yellow-600" },
  BELOW_AVERAGE_20: { label: "Abaixo (20%)", color: "text-orange-600" },
  BELOW_AVERAGE_35: { label: "Abaixo (35%)", color: "text-red-600" },
  UNKNOWN: { label: "—", color: "text-muted-foreground" },
};

// Cores para o gráfico de pizza de anúncios
const AD_COLORS = ["#3b82f6", "#8b5cf6", "#f97316", "#10b981", "#ef4444", "#f59e0b"];

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, sub, color = "text-primary",
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`mt-0.5 rounded-lg p-2 bg-muted/50 ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Abas ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview", label: "Visão Geral", icon: LayoutGrid },
  { id: "byad", label: "Por Anúncio", icon: Layers },
  { id: "compare", label: "Comparativo", icon: GitCompare },
  { id: "recommendations", label: "Recomendações", icon: CheckCircle2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function MetaAds() {
  const [datePreset, setDatePreset] = useState<DatePreset>("last_30d");
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: campaigns, isLoading: campaignsLoading, refetch: refetchCampaigns } =
    trpc.metaAds.getCampaigns.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  const { data: insights, isLoading: insightsLoading, refetch: refetchInsights } =
    trpc.metaAds.getInsights.useQuery(
      { datePreset, level: "campaign" },
      { staleTime: 5 * 60 * 1000 }
    );

  const { data: insightsByAd, isLoading: insightsByAdLoading, refetch: refetchInsightsByAd } =
    trpc.metaAds.getInsightsByAd.useQuery(
      { datePreset },
      { staleTime: 5 * 60 * 1000, enabled: activeTab === "byad" || activeTab === "compare" }
    );

  const { data: recommendations } =
    trpc.metaAds.getRecommendations.useQuery(undefined, { staleTime: 10 * 60 * 1000 });

  const isLoading = campaignsLoading || insightsLoading;

  // ── KPIs agregados ──────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!insights?.length) return null;
    type Totals = { spend: number; impressions: number; reach: number; linkClicks: number };
    return insights.reduce(
      (acc: Totals, r: Totals) => ({
        spend: acc.spend + r.spend,
        impressions: acc.impressions + r.impressions,
        reach: acc.reach + r.reach,
        linkClicks: acc.linkClicks + r.linkClicks,
      }),
      { spend: 0, impressions: 0, reach: 0, linkClicks: 0 }
    );
  }, [insights]);

  const avgCtr = useMemo(() => {
    if (!insights?.length) return 0;
    const total = insights.reduce((s: number, r: { impressions: number }) => s + r.impressions, 0);
    if (total === 0) return 0;
    const totalClicks = insights.reduce((s: number, r: { linkClicks: number }) => s + r.linkClicks, 0);
    return (totalClicks / total) * 100;
  }, [insights]);

  const avgCpm = useMemo(() => {
    if (!totals || totals.impressions === 0) return 0;
    return (totals.spend / totals.impressions) * 1000;
  }, [totals]);

  // ── Dados do gráfico de campanhas ───────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!insights?.length) return [];
    return insights.map((r: { campaignName: string; impressions: number; reach: number; linkClicks: number }) => ({
      name: r.campaignName.length > 22 ? r.campaignName.slice(0, 22) + "…" : r.campaignName,
      fullName: r.campaignName,
      Impressões: r.impressions,
      Alcance: r.reach,
      "Cliques no link": r.linkClicks,
    }));
  }, [insights]);

  // ── Merge campaigns + insights ──────────────────────────────────────────────
  const mergedCampaigns = useMemo(() => {
    if (!campaigns) return [];
    return campaigns.map((c: {
      id: string; name: string; status: string; objective: string | null;
      dailyBudget: number | null; lifetimeBudget: number | null;
      startTime: string | null; stopTime: string | null;
    }) => {
      const ins = insights?.find((i: { campaignId: string | null }) => i.campaignId === c.id);
      return { ...c, insight: ins ?? null };
    });
  }, [campaigns, insights]);

  // ── Dados por anúncio (para aba "Por Anúncio") ──────────────────────────────
  const adData = useMemo(() => {
    if (!insightsByAd?.length) return [];
    return insightsByAd
      .filter((r: { impressions: number }) => r.impressions > 0)
      .sort((a: { spend: number }, b: { spend: number }) => b.spend - a.spend);
  }, [insightsByAd]);

  // Dados para o gráfico de pizza de distribuição de gasto por anúncio
  const adSpendPieData = useMemo(() => {
    if (!adData.length) return [];
    return adData.slice(0, 6).map((r: { adName: string | null; campaignName: string; spend: number }) => ({
      name: r.adName ?? r.campaignName,
      value: r.spend,
    }));
  }, [adData]);

  // ── Comparativo de campanhas ────────────────────────────────────────────────
  const compareData = useMemo(() => {
    if (!insights?.length) return [];
    return insights.map((r: {
      campaignId: string | null; campaignName: string; spend: number;
      reach: number; linkClicks: number; impressions: number; cpm: number;
    }) => {
      const costPerReach = r.reach > 0 ? r.spend / r.reach : 0;
      const costPerLinkClick = r.linkClicks > 0 ? r.spend / r.linkClicks : 0;
      return {
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        spend: r.spend,
        impressions: r.impressions,
        reach: r.reach,
        linkClicks: r.linkClicks,
        cpm: r.cpm,
        costPerReach,
        costPerLinkClick,
      };
    });
  }, [insights]);

  function handleRefresh() {
    refetchCampaigns();
    refetchInsights();
    if (activeTab === "byad" || activeTab === "compare") refetchInsightsByAd();
  }

  const isPartialDate = datePreset === "today";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackButton to="/dashboard" />

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-blue-600" />
              Meta Ads Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Conta: <strong>Duo Gelatto Urias Magalhães</strong> · BRL
              {isPartialDate && (
                <span className="ml-2 text-amber-600 font-medium">⚠ Dados parciais (dia em andamento)</span>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading} className="gap-2 self-start">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* ── Seletor de período ── */}
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDatePreset(p.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                datePreset === p.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-background text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* ── KPIs (sempre visíveis) ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_: unknown, i: number) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4 h-20 bg-muted/30 rounded-lg" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard icon={DollarSign} label="Valor usado" value={totals ? fmtBRL(totals.spend) : "R$ 0,00"} color="text-green-600" />
            <KpiCard icon={Eye} label="Impressões" value={totals ? fmtNum(totals.impressions) : "0"} color="text-blue-600" />
            <KpiCard icon={Target} label="Alcance" value={totals ? fmtNum(totals.reach) : "0"} sub="Accounts Center accounts" color="text-purple-600" />
            <KpiCard icon={MousePointerClick} label="Cliques no link" value={totals ? fmtNum(totals.linkClicks) : "0"} sub={`CTR: ${fmtPct(avgCtr)}`} color="text-orange-600" />
            <KpiCard icon={TrendingUp} label="CPM" value={fmtBRL(avgCpm)} sub="custo por 1.000 impressões" color="text-pink-600" />
          </div>
        )}

        {/* ── Abas ── */}
        <div className="border-b flex gap-0 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.id === "recommendations" && recommendations && recommendations.length > 0 && (
                  <span className="ml-1 rounded-full bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 font-bold">
                    {recommendations.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            ABA: VISÃO GERAL
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <>
            {/* Gráfico de barras */}
            {!isLoading && chartData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-blue-600" />
                    Desempenho por Campanha
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => [fmtNum(value), name]}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName ?? label}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="Impressões" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Alcance" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Cliques no link" fill="#f97316" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Tabela de Campanhas */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-blue-600" />
                  Campanhas
                  <span className="ml-auto text-xs text-muted-foreground font-normal">
                    {mergedCampaigns.length} campanha(s)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6 space-y-3">
                    {Array.from({ length: 4 }).map((_: unknown, i: number) => (
                      <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
                    ))}
                  </div>
                ) : mergedCampaigns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Megaphone className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhuma campanha encontrada.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Campanha</th>
                          <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Valor usado</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Impressões</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Alcance</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Cliques no link</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">CTR</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">CPM</th>
                          <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Qualidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mergedCampaigns.map((c: typeof mergedCampaigns[0]) => {
                          const statusInfo = STATUS_BADGE[c.status] ?? { label: c.status, className: "bg-gray-100 text-gray-600" };
                          const ins = c.insight;
                          const qr = ins?.qualityRanking ? RANKING_LABEL[ins.qualityRanking] : null;
                          return (
                            <tr
                              key={c.id}
                              className={`border-b hover:bg-muted/20 transition-colors cursor-pointer ${selectedCampaign === c.id ? "bg-blue-50/50" : ""}`}
                              onClick={() => setSelectedCampaign(selectedCampaign === c.id ? null : c.id)}
                            >
                              <td className="px-4 py-3">
                                <p className="font-medium text-foreground leading-tight">{c.name}</p>
                                {c.objective && <p className="text-[10px] text-muted-foreground mt-0.5">{c.objective}</p>}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusInfo.className}`}>
                                  {statusInfo.label}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-right font-medium">{ins ? fmtBRL(ins.spend) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-3 py-3 text-right">{ins ? fmtNum(ins.impressions) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-3 py-3 text-right">{ins ? fmtNum(ins.reach) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-3 py-3 text-right">{ins ? fmtNum(ins.linkClicks) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-3 py-3 text-right">{ins ? fmtPct(ins.linkCtr) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-3 py-3 text-right">{ins ? fmtBRL(ins.cpm) : <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-3 py-3 text-center">
                                {qr ? <span className={`text-xs font-medium ${qr.color}`}>{qr.label}</span> : <span className="text-muted-foreground text-xs">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detalhe da campanha selecionada */}
            {selectedCampaign && (() => {
              const c = mergedCampaigns.find((x: typeof mergedCampaigns[0]) => x.id === selectedCampaign);
              const ins = c?.insight;
              if (!ins) return null;
              return (
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-blue-700">Detalhes: {c?.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Frequência</p>
                        <p className="font-bold">{ins.frequency.toFixed(2)}x</p>
                        <p className="text-[10px] text-muted-foreground">média de exibições por conta</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">CPC (todos)</p>
                        <p className="font-bold">{fmtBRL(ins.cpc)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">CTR (todos)</p>
                        <p className="font-bold">{fmtPct(ins.ctr)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Período</p>
                        <p className="font-bold">
                          {ins.dateStart ? `${new Date(ins.dateStart).toLocaleDateString("pt-BR")} – ${new Date(ins.dateStop!).toLocaleDateString("pt-BR")}` : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {[
                        { label: "Qualidade do anúncio", key: ins.qualityRanking },
                        { label: "Taxa de engajamento", key: ins.engagementRateRanking },
                        { label: "Taxa de conversão", key: ins.conversionRateRanking },
                      ].map((r) => {
                        const info = r.key ? RANKING_LABEL[r.key] : null;
                        return (
                          <div key={r.label} className="rounded-md border bg-background px-3 py-2">
                            <p className="text-muted-foreground text-[10px]">{r.label}</p>
                            <p className={`font-medium ${info?.color ?? "text-muted-foreground"}`}>{info?.label ?? "—"}</p>
                          </div>
                        );
                      })}
                    </div>
                    {Object.keys(ins.actions).length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Ações</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(ins.actions)
                            .filter(([, v]) => (v as number) > 0)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .slice(0, 8)
                            .map(([k, v]) => (
                              <div key={k} className="rounded border bg-background px-2 py-1 text-xs">
                                <span className="text-muted-foreground">{k.replace(/_/g, " ")}: </span>
                                <strong>{fmtNum(v as number)}</strong>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            ABA: POR ANÚNCIO
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "byad" && (
          <>
            {insightsByAdLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_: unknown, i: number) => (
                  <Card key={i} className="animate-pulse"><CardContent className="p-4 h-16 bg-muted/30" /></Card>
                ))}
              </div>
            ) : adData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Layers className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhum dado de anúncio disponível para o período.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Tabela de anúncios */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="h-4 w-4 text-blue-600" />
                        Desempenho por Anúncio
                        <span className="ml-auto text-xs text-muted-foreground font-normal">{adData.length} anúncio(s)</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Anúncio / Campanha</th>
                              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Valor usado</th>
                              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Impressões</th>
                              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Alcance</th>
                              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Cliques no link</th>
                              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">CTR</th>
                              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">CPM</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adData.map((r: {
                              adId: string | null; adName: string | null; campaignName: string;
                              adsetName: string | null; spend: number; impressions: number;
                              reach: number; linkClicks: number; linkCtr: number; cpm: number;
                            }, idx: number) => (
                              <tr key={r.adId ?? idx} className="border-b hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: AD_COLORS[idx % AD_COLORS.length] }}
                                    />
                                    <div>
                                      <p className="font-medium text-foreground leading-tight">{r.adName ?? "Anúncio " + (idx + 1)}</p>
                                      <p className="text-[10px] text-muted-foreground">{r.campaignName}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right font-medium">{fmtBRL(r.spend)}</td>
                                <td className="px-3 py-3 text-right">{fmtNum(r.impressions)}</td>
                                <td className="px-3 py-3 text-right">{fmtNum(r.reach)}</td>
                                <td className="px-3 py-3 text-right">{fmtNum(r.linkClicks)}</td>
                                <td className="px-3 py-3 text-right">{fmtPct(r.linkCtr)}</td>
                                <td className="px-3 py-3 text-right">{fmtBRL(r.cpm)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Gráfico de pizza — distribuição de gasto */}
                <div>
                  <Card className="h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Distribuição de Gasto</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center">
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={adSpendPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {adSpendPieData.map((_: unknown, index: number) => (
                              <Cell key={`cell-${index}`} fill={AD_COLORS[index % AD_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-2 w-full space-y-1.5">
                        {adSpendPieData.map((d: { name: string; value: number }, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: AD_COLORS[i % AD_COLORS.length] }} />
                              <span className="text-muted-foreground truncate max-w-[120px]">{d.name}</span>
                            </div>
                            <span className="font-medium">{fmtBRL(d.value)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            ABA: COMPARATIVO DE CAMPANHAS
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "compare" && (
          <>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_: unknown, i: number) => (
                  <Card key={i} className="animate-pulse"><CardContent className="p-4 h-20 bg-muted/30" /></Card>
                ))}
              </div>
            ) : compareData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <GitCompare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhum dado disponível para comparação.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Tabela comparativa */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <GitCompare className="h-4 w-4 text-blue-600" />
                      Comparativo de Campanhas
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Custo por conta alcançada = Valor usado ÷ Alcance (Accounts Center accounts). Custo por clique no link = Valor usado ÷ Cliques no link.
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Campanha</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Valor usado</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Alcance</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Custo / Conta alcançada</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Cliques no link</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Custo / Clique no link</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">CPM</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Impressões</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compareData.map((r: typeof compareData[0], idx: number) => {
                            // Destacar o melhor (menor custo) em cada métrica
                            const bestCostPerReach = Math.min(...compareData.map((x: typeof compareData[0]) => x.costPerReach > 0 ? x.costPerReach : Infinity));
                            const bestCostPerClick = Math.min(...compareData.map((x: typeof compareData[0]) => x.costPerLinkClick > 0 ? x.costPerLinkClick : Infinity));
                            const bestCpm = Math.min(...compareData.map((x: typeof compareData[0]) => x.cpm > 0 ? x.cpm : Infinity));
                            return (
                              <tr key={r.campaignId ?? idx} className="border-b hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: AD_COLORS[idx % AD_COLORS.length] }} />
                                    <p className="font-medium text-foreground">{r.campaignName}</p>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right font-medium">{fmtBRL(r.spend)}</td>
                                <td className="px-3 py-3 text-right">{fmtNum(r.reach)}</td>
                                <td className={`px-3 py-3 text-right font-medium ${r.costPerReach === bestCostPerReach && r.costPerReach > 0 ? "text-green-600" : ""}`}>
                                  {r.costPerReach > 0 ? (
                                    <span className="flex items-center justify-end gap-1">
                                      {fmtBRL(r.costPerReach)}
                                      {r.costPerReach === bestCostPerReach && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">melhor</span>}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-3 py-3 text-right">{fmtNum(r.linkClicks)}</td>
                                <td className={`px-3 py-3 text-right font-medium ${r.costPerLinkClick === bestCostPerClick && r.costPerLinkClick > 0 ? "text-green-600" : ""}`}>
                                  {r.costPerLinkClick > 0 ? (
                                    <span className="flex items-center justify-end gap-1">
                                      {fmtBRL(r.costPerLinkClick)}
                                      {r.costPerLinkClick === bestCostPerClick && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">melhor</span>}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className={`px-3 py-3 text-right ${r.cpm === bestCpm && r.cpm > 0 ? "text-green-600 font-medium" : ""}`}>
                                  {fmtBRL(r.cpm)}
                                  {r.cpm === bestCpm && r.cpm > 0 && <span className="ml-1 text-[10px] bg-green-100 text-green-700 px-1 rounded">melhor</span>}
                                </td>
                                <td className="px-3 py-3 text-right">{fmtNum(r.impressions)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Gráfico comparativo de custo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Custo por Conta Alcançada (R$)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={compareData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            dataKey="campaignName"
                            tick={{ fontSize: 9 }}
                            angle={-25}
                            textAnchor="end"
                            interval={0}
                            tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v}
                          />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${v.toFixed(2)}`} />
                          <Tooltip formatter={(v: number) => [fmtBRL(v), "Custo/conta"]} contentStyle={{ fontSize: 11 }} />
                          <Bar dataKey="costPerReach" name="Custo/conta" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Custo por Clique no Link (R$)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={compareData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            dataKey="campaignName"
                            tick={{ fontSize: 9 }}
                            angle={-25}
                            textAnchor="end"
                            interval={0}
                            tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v}
                          />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${v.toFixed(2)}`} />
                          <Tooltip formatter={(v: number) => [fmtBRL(v), "Custo/clique"]} contentStyle={{ fontSize: 11 }} />
                          <Bar dataKey="costPerLinkClick" name="Custo/clique" fill="#f97316" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            ABA: RECOMENDAÇÕES
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "recommendations" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Recomendações do Meta
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!recommendations || recommendations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-400 mb-3" />
                  <p className="font-medium text-foreground">Nenhuma recomendação pendente</p>
                  <p className="text-sm text-muted-foreground mt-1">Suas campanhas estão bem configuradas no momento.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((r: { id: string; title: string; message: string; importance: string; confidence: string | null }) => (
                    <div key={r.id} className="flex gap-3 rounded-lg border p-3">
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">{r.title}</p>
                        {r.message && <p className="text-xs text-muted-foreground mt-0.5">{r.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Nota legal ── */}
        <p className="text-[10px] text-muted-foreground text-center pb-4">
          Alcance refere-se a Accounts Center accounts. Dados fornecidos pela API oficial do Meta Ads.
          {isPartialDate && " Os dados de hoje são parciais e sujeitos a alteração."}
        </p>
      </div>
    </DashboardLayout>
  );
}
