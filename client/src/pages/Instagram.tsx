import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Instagram, Image, BarChart2, RefreshCw, Trash2, Send, Plus,
  Heart, Eye, MessageCircle, Users, ExternalLink, CheckCircle,
  AlertCircle, Clock, Sparkles, Calendar, Wand2, TrendingUp,
  DollarSign, MousePointer, Megaphone, Share2, Bookmark,
  Activity, Target, ChevronRight, Play, Grid3X3,
  BarChart3, Loader2, Repeat2, BookmarkIcon, ThumbsUp
} from "lucide-react";

type PostType = "post" | "story" | "reels";
type AiStyle = "realistic" | "cartoon" | "watercolor" | "minimalist";

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Rascunho", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: <Clock className="w-3 h-3" /> },
  published: { label: "Publicado", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle className="w-3 h-3" /> },
  failed: { label: "Falhou", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <AlertCircle className="w-3 h-3" /> },
};

const TYPE_LABELS: Record<string, string> = { post: "Post", story: "Story", reels: "Reels" };
const AI_STYLE_LABELS: Record<AiStyle, string> = {
  realistic: "Fotorrealista",
  cartoon: "Cartoon / Divertido",
  watercolor: "Aquarela / Artístico",
  minimalist: "Minimalista / Moderno",
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color, loading }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
  color: string; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={color}>{icon}</span>
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-1" />
        ) : (
          <>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Campaign Row ─────────────────────────────────────────────────────────────
function CampaignRow({ campaign }: { campaign: any }) {
  const ctrColor = campaign.ctr >= 2 ? "text-green-600" : campaign.ctr >= 1 ? "text-yellow-600" : "text-red-500";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="w-2 h-2 rounded-full bg-pink-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{campaign.campaignName}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Eye className="w-3 h-3" /> {(campaign.impressions ?? 0).toLocaleString("pt-BR")}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" /> {(campaign.reach ?? 0).toLocaleString("pt-BR")}
          </span>
          <span className={`text-xs font-semibold flex items-center gap-1 ${ctrColor}`}>
            <MousePointer className="w-3 h-3" /> CTR {(campaign.ctr ?? 0).toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-pink-600">R${(campaign.spend ?? 0).toFixed(2)}</p>
        <p className="text-xs text-muted-foreground">CPM R${(campaign.cpm ?? 0).toFixed(2)}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InstagramPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStyle, setAiStyle] = useState<AiStyle>("realistic");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [adsDatePreset, setAdsDatePreset] = useState<"last_7d" | "last_14d" | "last_30d" | "last_90d" | "this_month" | "last_month">("last_30d");
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [newPost, setNewPost] = useState({
    type: "post" as PostType,
    caption: "",
    imageUrl: "",
    promotionTitle: "",
  });

  // ── Queries ──────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const insightsQuery = trpc.instagram.getPostInsightsLive.useQuery(
    { postId: selectedPost?.id ?? "" },
    { enabled: !!selectedPost?.id, staleTime: 2 * 60 * 1000 }
  );
  const accountQuery = trpc.instagram.getAccountInfo.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const postsQuery = trpc.instagram.getPosts.useQuery();
  const recentQuery = trpc.instagram.getRecentPosts.useQuery({ limit: 10 }, { staleTime: 5 * 60 * 1000 });
  const perfQuery = trpc.instagram.getPerformanceSummary.useQuery({ limit: 10 }, { staleTime: 5 * 60 * 1000 });

  const [stableAdsPreset] = useState<typeof adsDatePreset>(adsDatePreset);
  const adsQuery = trpc.instagram.getMetaAdsCampaigns.useQuery(
    { datePreset: adsDatePreset },
    { staleTime: 5 * 60 * 1000 }
  );
  const adsByAdQuery = trpc.instagram.getMetaAdsInsightsByAd.useQuery(
    { datePreset: adsDatePreset },
    { staleTime: 5 * 60 * 1000 }
  );
  const cacheStatusQuery = trpc.instagram.getCacheStatus.useQuery(undefined, { staleTime: 60 * 1000 });
  const weeklyTrendQuery = trpc.instagram.getWeeklyTrend.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const ctrAlertsQuery = trpc.instagram.getCtrAlerts.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const requestSyncMut = trpc.instagram.requestSync.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        // Invalidar todas as queries para forçar recarregamento dos dados atualizados
        utils.instagram.getAccountInfo.invalidate();
        utils.instagram.getRecentPosts.invalidate();
        utils.instagram.getPerformanceSummary.invalidate();
        utils.instagram.getMetaAdsCampaigns.invalidate();
        utils.instagram.getMetaAdsInsightsByAd.invalidate();
        utils.instagram.getCacheStatus.invalidate();
        utils.instagram.getWeeklyTrend.invalidate();
        utils.instagram.getCtrAlerts.invalidate();
      } else {
        toast.error(data.message);
      }
    },
    onError: (e) => toast.error(`Erro ao sincronizar: ${e.message}`),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const generateImageMut = trpc.instagram.generateImage.useMutation({
    onSuccess: (data) => {
      const url = data.imageUrl ?? "";
      setGeneratedImageUrl(url);
      setNewPost(p => ({ ...p, imageUrl: url }));
      toast.success("Imagem gerada com sucesso!");
      setIsGenerating(false);
    },
    onError: (e) => { toast.error(`Erro ao gerar imagem: ${e.message}`); setIsGenerating(false); },
  });

  const createDraftMut = trpc.instagram.createDraft.useMutation({
    onSuccess: () => {
      toast.success(scheduledAt ? "Post agendado!" : "Rascunho criado!");
      postsQuery.refetch();
      setShowCreateModal(false);
      resetModal();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const markPublishedMut = trpc.instagram.markPublished.useMutation({
    onSuccess: () => { toast.success("Post marcado como publicado!"); postsQuery.refetch(); setPublishingId(null); },
    onError: (e) => { toast.error(`Erro: ${e.message}`); setPublishingId(null); },
  });

  const deleteMut = trpc.instagram.deleteDraft.useMutation({
    onSuccess: () => { toast.success("Rascunho excluído."); postsQuery.refetch(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const resetModal = () => {
    setNewPost({ type: "post", caption: "", imageUrl: "", promotionTitle: "" });
    setAiMode(false); setAiPrompt(""); setAiStyle("realistic");
    setGeneratedImageUrl(""); setScheduledAt("");
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const account = accountQuery.data as any;
  const localPosts = postsQuery.data ?? [];
  const recentPosts = (recentQuery.data as any)?.data ?? [];
  const drafts = localPosts.filter(p => p.status === "draft");
  const published = localPosts.filter(p => p.status === "published");
  const scheduled = drafts.filter(p => p.scheduledAt && new Date(p.scheduledAt) > new Date());
  const adsSummary = adsQuery.data?.summary;
  const adsCampaigns = adsQuery.data?.campaigns ?? [];
  const adsByAd = adsByAdQuery.data ?? [];
  const perf = perfQuery.data;
  const weeklyTrend = (weeklyTrendQuery.data as any)?.weeks ?? [];
  const ctrAlerts = (ctrAlertsQuery.data as any) ?? [];

  // ── Engagement rate estimado ──────────────────────────────────────────────
  const engagementRate = account?.followers && perf
    ? (((perf.avgLikes + perf.avgComments) / account.followers) * 100).toFixed(2)
    : null;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Instagram + Meta Ads</h1>
              <p className="text-sm text-muted-foreground">Desempenho orgânico e campanhas pagas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Status do cache */}
            {cacheStatusQuery.data && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${cacheStatusQuery.data.isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="hidden sm:inline">
                  {cacheStatusQuery.data.lastSync
                    ? (() => {
                        const d = new Date(cacheStatusQuery.data.lastSync!);
                        const now = new Date();
                        const isToday = d.toDateString() === now.toDateString();
                        const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
                        const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        if (isToday) return `Sincronizado hoje às ${time}`;
                        if (isYesterday) return `Sincronizado ontem às ${time}`;
                        return `Sincronizado ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`;
                      })()
                    : 'Aguardando sincronização'}
                </span>
              </div>
            )}
            {/* Botão Sincronizar */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => requestSyncMut.mutate()}
              disabled={requestSyncMut.isPending}
              className="gap-1.5"
              title="Solicitar atualização dos dados do Instagram e Meta Ads"
            >
              <RefreshCw className={`w-4 h-4 ${requestSyncMut.isPending ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{requestSyncMut.isPending ? 'Enviando...' : 'Sincronizar'}</span>
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:from-pink-600 hover:to-purple-700"
            >
              <Plus className="w-4 h-4 mr-1" /> Criar Post
            </Button>
          </div>
        </div>

        {/* ── Conta conectada ──────────────────────────────────────────────── */}
        {accountQuery.isLoading ? (
          <Card><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ) : account ? (
          <Card className="border-pink-200/50 bg-gradient-to-r from-pink-50/50 to-purple-50/50 dark:from-pink-950/20 dark:to-purple-950/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-4">
                {account.profile_picture && (
                  <img src={account.profile_picture} alt="Perfil" className="w-14 h-14 rounded-full border-2 border-pink-300 object-cover" style={{ width: 56, height: 56 }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">@{account.username}</span>
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" /> Conectado
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{account.name}</p>
                </div>
                <div className="flex gap-6 text-center shrink-0">
                  <div>
                    <p className="text-xl font-bold text-pink-600">{account.followers?.toLocaleString("pt-BR") ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">Seguidores</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-purple-600">{account.posts ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">Posts</p>
                  </div>
                  {engagementRate && (
                    <div>
                      <p className="text-xl font-bold text-green-600">{engagementRate}%</p>
                      <p className="text-xs text-muted-foreground">Engajamento</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 text-yellow-800 dark:text-yellow-400">
                <AlertCircle className="w-5 h-5" />
                <div>
                  <p className="font-semibold">Instagram não conectado</p>
                  <p className="text-sm">Acesse as Configurações do Manus → Integrações → Instagram para conectar.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Agendados pendentes ───────────────────────────────────────────── */}
        {scheduled.length > 0 && (
          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-3 text-blue-700 dark:text-blue-400">
                <Calendar className="w-4 h-4" />
                <p className="text-sm font-semibold">{scheduled.length} post(s) agendado(s)</p>
                <span className="text-sm text-muted-foreground">· Próximo: {scheduled[0].promotionTitle ?? "Post"} em {new Date(scheduled[0].scheduledAt!).toLocaleString("pt-BR")}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs">
              <Activity className="w-3.5 h-3.5" /> Visão Geral
            </TabsTrigger>
            <TabsTrigger value="ads" className="flex items-center gap-1.5 text-xs">
              <Megaphone className="w-3.5 h-3.5" /> Campanhas
              {adsSummary && <Badge className="ml-1 bg-pink-100 text-pink-700 text-xs px-1 py-0">{adsCampaigns.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="feed" className="flex items-center gap-1.5 text-xs">
              <Grid3X3 className="w-3.5 h-3.5" /> Feed
            </TabsTrigger>
            <TabsTrigger value="drafts" className="flex items-center gap-1.5 text-xs">
              <Clock className="w-3.5 h-3.5" /> Rascunhos
              {drafts.length > 0 && <Badge className="ml-1 bg-orange-100 text-orange-700 text-xs px-1 py-0">{drafts.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════════
              TAB: VISÃO GERAL
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="overview" className="mt-4 space-y-5">
            {/* KPIs Instagram orgânico */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Instagram className="w-4 h-4 text-pink-500" /> Performance Orgânica — últimos 10 posts
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard icon={<Heart className="w-5 h-5" />} label="Média de Curtidas" value={perf?.avgLikes?.toLocaleString("pt-BR") ?? "—"} color="text-red-500" loading={perfQuery.isLoading} />
                <KpiCard icon={<MessageCircle className="w-5 h-5" />} label="Média de Comentários" value={perf?.avgComments?.toLocaleString("pt-BR") ?? "—"} color="text-blue-500" loading={perfQuery.isLoading} />
                <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Total de Curtidas" value={perf?.totalLikes?.toLocaleString("pt-BR") ?? "—"} sub="últimos 10 posts" color="text-pink-500" loading={perfQuery.isLoading} />
                <KpiCard icon={<Play className="w-5 h-5" />} label="Formato Top" value={perf?.topContentType ?? "—"} sub="mais frequente" color="text-purple-500" loading={perfQuery.isLoading} />
              </div>
            </div>

            {/* KPIs Meta Ads */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-orange-500" /> Meta Ads — {adsDatePreset.replace("last_", "últimos ").replace("d", " dias").replace("this_month", "este mês").replace("last_month", "mês passado")}
                </h3>
                <Select value={adsDatePreset} onValueChange={(v) => setAdsDatePreset(v as any)}>
                  <SelectTrigger className="w-36 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last_7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="last_14d">Últimos 14 dias</SelectItem>
                    <SelectItem value="last_30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="last_90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="this_month">Este mês</SelectItem>
                    <SelectItem value="last_month">Mês passado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {adsQuery.isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
                </div>
              ) : adsSummary ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard icon={<DollarSign className="w-5 h-5" />} label="Gasto Total" value={`R$${(adsSummary?.totalSpend ?? 0).toFixed(2)}`} sub={`${adsSummary?.activeCampaigns ?? 0} campanhas`} color="text-green-600" />
                  <KpiCard icon={<Eye className="w-5 h-5" />} label="Impressões" value={(adsSummary?.totalImpressions ?? 0).toLocaleString("pt-BR")} sub={`Alcance: ${(adsSummary?.totalReach ?? 0).toLocaleString("pt-BR")}`} color="text-blue-500" />
                  <KpiCard icon={<MousePointer className="w-5 h-5" />} label="Cliques no Link" value={(adsSummary?.totalLinkClicks ?? 0).toLocaleString("pt-BR")} sub={`CTR médio: ${(adsSummary?.avgCtr ?? 0).toFixed(2)}%`} color="text-orange-500" />
                  <KpiCard icon={<Target className="w-5 h-5" />} label="CPM Médio" value={`R$${(adsSummary?.avgCpm ?? 0).toFixed(2)}`} sub="custo por mil impressões" color="text-purple-500" />
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
                    <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma campanha ativa no período selecionado.</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Post destaque */}
            {perf?.topPost && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-yellow-500" /> Post com Melhor Desempenho
                </h3>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-4">
                      {perf.topPost.thumbnail && (
                        <img src={perf.topPost.thumbnail} alt="Top post" className="w-16 h-16 rounded-lg object-cover shrink-0" style={{ width: 64, height: 64 }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2">{perf.topPost.caption?.slice(0, 120) ?? "Post sem legenda"}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="flex items-center gap-1 text-sm text-red-500 font-semibold"><Heart className="w-4 h-4" /> {perf.topPost.likes}</span>
                          <span className="flex items-center gap-1 text-sm text-blue-500 font-semibold"><MessageCircle className="w-4 h-4" /> {perf.topPost.comments}</span>
                        </div>
                      </div>
                      {perf.topPost.permalink && (
                        <a href={perf.topPost.permalink} target="_blank" rel="noreferrer" className="shrink-0 text-pink-500 hover:text-pink-600">
                          <ExternalLink className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Campanhas resumidas */}
            {adsCampaigns.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-pink-500" /> Campanhas Ativas
                </h3>
                <Card>
                  <CardContent className="pt-3 pb-3 space-y-2">
                    {adsCampaigns.slice(0, 5).map((c: any) => (
                      <CampaignRow key={c.campaignId ?? c.campaignName} campaign={c} />
                    ))}
                    {adsCampaigns.length > 5 && (
                      <button onClick={() => setActiveTab("ads")} className="w-full text-xs text-pink-500 hover:underline flex items-center justify-center gap-1 pt-1">
                        Ver todas as {adsCampaigns.length} campanhas <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB: CAMPANHAS META ADS
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="ads" className="mt-4 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-orange-500" /> Campanhas Meta Ads
              </h2>
              <div className="flex items-center gap-2">
                <Select value={adsDatePreset} onValueChange={(v) => setAdsDatePreset(v as any)}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last_7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="last_14d">Últimos 14 dias</SelectItem>
                    <SelectItem value="last_30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="last_90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="this_month">Este mês</SelectItem>
                    <SelectItem value="last_month">Mês passado</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => { adsQuery.refetch(); adsByAdQuery.refetch(); }}>
                  <RefreshCw className={`w-4 h-4 ${adsQuery.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Resumo */}
            {adsSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard icon={<DollarSign className="w-5 h-5" />} label="Gasto Total" value={`R$${(adsSummary?.totalSpend ?? 0).toFixed(2)}`} color="text-green-600" />
                <KpiCard icon={<Eye className="w-5 h-5" />} label="Impressões" value={(adsSummary?.totalImpressions ?? 0).toLocaleString("pt-BR")} color="text-blue-500" />
                <KpiCard icon={<Users className="w-5 h-5" />} label="Alcance" value={(adsSummary?.totalReach ?? 0).toLocaleString("pt-BR")} color="text-purple-500" />
                <KpiCard icon={<MousePointer className="w-5 h-5" />} label="Cliques" value={(adsSummary?.totalLinkClicks ?? 0).toLocaleString("pt-BR")} sub={`CTR ${(adsSummary?.avgCtr ?? 0).toFixed(2)}%`} color="text-orange-500" />
              </div>
            )}

            {/* Tabela de campanhas */}
            {adsQuery.isLoading ? (
              <Card><CardContent className="pt-4 space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </CardContent></Card>
            ) : adsCampaigns.length > 0 ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Desempenho por Campanha</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {adsCampaigns.map((c: any) => (
                    <div key={c.campaignId ?? c.campaignName} className="p-3 rounded-lg bg-muted/30 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold truncate flex-1">{c.campaignName}</p>
                        <span className="text-sm font-bold text-green-600 shrink-0">R${(c.spend ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs text-muted-foreground">
                        <div><p className="font-semibold text-foreground">{(c.impressions ?? 0).toLocaleString("pt-BR")}</p><p>Impressões</p></div>
                        <div><p className="font-semibold text-foreground">{(c.reach ?? 0).toLocaleString("pt-BR")}</p><p>Alcance</p></div>
                        <div><p className={`font-semibold ${(c.ctr ?? 0) >= 2 ? "text-green-600" : (c.ctr ?? 0) >= 1 ? "text-yellow-600" : "text-red-500"}`}>{(c.ctr ?? 0).toFixed(2)}%</p><p>CTR</p></div>
                        <div><p className="font-semibold text-foreground">R${(c.cpc ?? 0).toFixed(2)}</p><p>CPC</p></div>
                        <div><p className="font-semibold text-foreground">R${(c.cpm ?? 0).toFixed(2)}</p><p>CPM</p></div>
                        <div><p className="font-semibold text-foreground">{(c.linkClicks ?? 0).toLocaleString("pt-BR")}</p><p>Cliques</p></div>
                      </div>
                      {c.dateStart && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(c.dateStart).toLocaleDateString("pt-BR")} → {c.dateStop ? new Date(c.dateStop).toLocaleDateString("pt-BR") : "hoje"}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
                  <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma campanha encontrada no período.</p>
                </CardContent>
              </Card>
            )}

            {/* ── Alertas de CTR Baixo ───────────────────────────────────────────────── */}
            {ctrAlerts.length > 0 && (
              <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-4 h-4" /> Alerta: CTR Abaixo de 1%
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-3">
                    As campanhas abaixo estão com CTR crítico (&lt;1%). Considere pausar, ajustar o criativo ou o público-alvo.
                  </p>
                  {(ctrAlerts as any[]).map((alert: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-red-100/60 dark:bg-red-900/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-red-700 dark:text-red-400 truncate">{alert.campaignName}</p>
                        <p className="text-xs text-muted-foreground">Semana: {alert.week} · {alert.impressions?.toLocaleString('pt-BR')} impressões</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-bold text-red-600">{Number(alert.ctr).toFixed(2)}%</p>
                        <p className="text-xs text-muted-foreground">R${Number(alert.spend).toFixed(2)} gasto</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ── Gráfico de Evolução Semanal ─────────────────────────────────────────── */}
            {weeklyTrend.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-pink-500" /> Evolução Semanal — CTR e Gasto
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Semana</th>
                          <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Impressões</th>
                          <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Cliques</th>
                          <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">CTR Médio</th>
                          <th className="text-right py-2 pl-2 text-xs text-muted-foreground font-medium">Gasto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(weeklyTrend as any[]).map((week: any, i: number) => {
                          const prevWeek = i > 0 ? weeklyTrend[i - 1] : null;
                          const ctrDelta = prevWeek ? (week.totals.avgCtr - prevWeek.totals.avgCtr) : 0;
                          const spendDelta = prevWeek ? (week.totals.spend - prevWeek.totals.spend) : 0;
                          return (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="py-2.5 pr-4 font-medium text-xs">{week.weekLabel}</td>
                              <td className="py-2.5 px-2 text-right text-xs">{week.totals.impressions?.toLocaleString('pt-BR')}</td>
                              <td className="py-2.5 px-2 text-right text-xs">{week.totals.totalClicks?.toLocaleString('pt-BR')}</td>
                              <td className="py-2.5 px-2 text-right">
                                <span className={`text-xs font-semibold ${
                                  week.totals.avgCtr >= 1.5 ? 'text-green-600' :
                                  week.totals.avgCtr >= 1.0 ? 'text-yellow-600' : 'text-red-500'
                                }`}>{Number(week.totals.avgCtr).toFixed(2)}%</span>
                                {prevWeek && (
                                  <span className={`ml-1 text-xs ${ctrDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {ctrDelta >= 0 ? '↑' : '↓'}{Math.abs(ctrDelta).toFixed(2)}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 pl-2 text-right">
                                <span className="text-xs font-semibold">R${Number(week.totals.spend).toFixed(2)}</span>
                                {prevWeek && (
                                  <span className={`ml-1 text-xs ${spendDelta >= 0 ? 'text-orange-500' : 'text-green-500'}`}>
                                    {spendDelta >= 0 ? '+' : ''}{spendDelta.toFixed(2)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/20">
                          <td className="py-2 pr-4 text-xs font-bold">Total</td>
                          <td className="py-2 px-2 text-right text-xs font-bold">
                            {(weeklyTrend as any[]).reduce((s: number, w: any) => s + (w.totals.impressions ?? 0), 0).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 px-2 text-right text-xs font-bold">
                            {(weeklyTrend as any[]).reduce((s: number, w: any) => s + (w.totals.totalClicks ?? 0), 0).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 px-2 text-right text-xs font-bold">
                            {((weeklyTrend as any[]).reduce((s: number, w: any) => s + Number(w.totals.avgCtr), 0) / weeklyTrend.length).toFixed(2)}%
                          </td>
                          <td className="py-2 pl-2 text-right text-xs font-bold">
                            R${(weeklyTrend as any[]).reduce((s: number, w: any) => s + Number(w.totals.spend), 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    ↑ / ↓ indica variação em relação à semana anterior. CTR verde ≥ 1,5% · amarelo ≥ 1% · vermelho &lt; 1%.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Top anúncios */}
            {adsByAd.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="w-4 h-4 text-purple-500" /> Top Anúncios por Desempenho
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(adsByAd as any[]).slice(0, 8).map((ad: any) => (
                    <div key={ad.adId ?? ad.adName} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{ad.adName}</p>
                        <p className="text-xs text-muted-foreground truncate">{ad.campaignName}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-muted-foreground">{(ad.impressions ?? 0).toLocaleString("pt-BR")} imp.</span>
                        <span className={`font-semibold ${(ad.ctr ?? 0) >= 2 ? "text-green-600" : (ad.ctr ?? 0) >= 1 ? "text-yellow-600" : "text-red-500"}`}>{(ad.ctr ?? 0).toFixed(2)}%</span>
                        <span className="font-semibold text-green-600">R${(ad.spend ?? 0).toFixed(2)}</span>
                        {ad.qualityRanking && (
                          <Badge variant="outline" className="text-xs py-0">{ad.qualityRanking.replace("_", " ").toLowerCase()}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB: FEED
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="feed" className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Posts Recentes no Instagram</h2>
              <Button variant="outline" size="sm" onClick={() => recentQuery.refetch()}>
                <RefreshCw className={`w-4 h-4 mr-1 ${recentQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar
              </Button>
            </div>
            {recentQuery.isLoading && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => <div key={i} className="aspect-square bg-muted rounded-xl animate-pulse" />)}
              </div>
            )}
            {!recentQuery.isLoading && recentPosts.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Instagram className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum post encontrado.</p>
                <p className="text-sm">Conecte o Instagram da Duo Gelatto para ver o feed.</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {(recentPosts as any[]).map((post: any) => (
                <div
                  key={post.id}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-muted cursor-pointer"
                  onClick={() => setSelectedPost(post)}
                >
                  {(post.thumbnail_url || post.media_url) ? (
                    <img src={post.thumbnail_url ?? post.media_url} alt="Post" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-900/30 dark:to-purple-900/30">
                      <Instagram className="w-10 h-10 text-pink-400 opacity-40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 text-white">
                    <div className="flex items-center gap-4 text-sm font-semibold">
                      <span className="flex items-center gap-1"><Heart className="w-4 h-4" /> {post.like_count ?? post.likes ?? 0}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" /> {post.comments_count ?? post.comments ?? 0}</span>
                    </div>
                    <span className="flex items-center gap-1 text-xs bg-white/20 px-2 py-1 rounded-full">
                      <BarChart3 className="w-3 h-3" /> Ver Insights
                    </span>
                  </div>
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-black/60 text-white text-xs border-0">{post.media_type ?? post.type ?? "POST"}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB: RASCUNHOS
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="drafts" className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Rascunhos e Publicados</h2>
            </div>
            {localPosts.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum rascunho criado ainda.</p>
                <p className="text-sm">Clique em "Criar Post" para começar.</p>
              </div>
            )}
            <div className="space-y-3">
              {localPosts.map((post) => {
                const statusInfo = STATUS_LABELS[post.status] ?? STATUS_LABELS.draft;
                const isScheduled = post.scheduledAt && new Date(post.scheduledAt) > new Date();
                return (
                  <Card key={post.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {post.imageUrl && (
                          <img src={post.imageUrl} alt="Preview" className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border" style={{ width: 80, height: 80 }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">{TYPE_LABELS[post.type] ?? post.type}</Badge>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                              {statusInfo.icon} {statusInfo.label}
                            </span>
                            {isScheduled && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                <Calendar className="w-3 h-3" />
                                {new Date(post.scheduledAt!).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                            {post.aiPrompt && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                <Sparkles className="w-3 h-3" /> IA
                              </span>
                            )}
                          </div>
                          {post.caption && <p className="text-sm text-muted-foreground line-clamp-2">{post.caption}</p>}
                          {post.status === "published" && (
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-red-400" /> {post.likes ?? 0}</span>
                              <span className="flex items-center gap-1"><Eye className="w-3 h-3 text-blue-400" /> {post.reach ?? 0}</span>
                              <span className="flex items-center gap-1"><Users className="w-3 h-3 text-purple-400" /> {post.impressions ?? 0}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {post.status === "draft" && (
                            <Button size="sm" className="bg-gradient-to-r from-pink-500 to-purple-600 text-white"
                              onClick={() => { setPublishingId(post.id); markPublishedMut.mutate({ postId: post.id }); }}
                              disabled={publishingId === post.id}>
                              {publishingId === post.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" /> Publicado</>}
                            </Button>
                          )}
                          {post.status === "draft" && (
                            <Button size="sm" variant="outline" className="text-red-500 hover:bg-red-50"
                              onClick={() => deleteMut.mutate({ postId: post.id })}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Modal: Insights do Post ──────────────────────────────────────────── */}
        <Dialog open={!!selectedPost} onOpenChange={(open) => { if (!open) setSelectedPost(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-pink-500" /> Insights do Post
              </DialogTitle>
            </DialogHeader>
            {selectedPost && (
              <div className="space-y-5">
                <div className="flex gap-4">
                  {(selectedPost.thumbnail_url || selectedPost.media_url) && (
                    <img src={selectedPost.thumbnail_url ?? selectedPost.media_url} alt="Post" className="w-28 h-28 rounded-xl object-cover flex-shrink-0 border" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-gradient-to-r from-pink-500 to-purple-600 text-white border-0 text-xs">
                        {selectedPost.media_type ?? selectedPost.type ?? 'POST'}
                      </Badge>
                      {selectedPost.timestamp && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(selectedPost.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                    {selectedPost.caption && (
                      <p className="text-sm text-muted-foreground line-clamp-3">{selectedPost.caption}</p>
                    )}
                    {selectedPost.permalink && (
                      <a href={selectedPost.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-pink-500 hover:underline mt-2">
                        <ExternalLink className="w-3 h-3" /> Ver no Instagram
                      </a>
                    )}
                  </div>
                </div>

                {insightsQuery.isLoading && (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
                    <p className="text-sm">Buscando insights em tempo real...</p>
                    <p className="text-xs">Isso pode levar alguns segundos</p>
                  </div>
                )}

                {insightsQuery.data && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Curtidas', value: insightsQuery.data.likes, icon: <Heart className="w-4 h-4 text-red-500" />, color: 'text-red-600' },
                        { label: 'Comentários', value: insightsQuery.data.comments, icon: <MessageCircle className="w-4 h-4 text-blue-500" />, color: 'text-blue-600' },
                        { label: 'Compartilhamentos', value: insightsQuery.data.shares, icon: <Repeat2 className="w-4 h-4 text-green-500" />, color: 'text-green-600' },
                        { label: 'Salvamentos', value: insightsQuery.data.saved, icon: <BookmarkIcon className="w-4 h-4 text-yellow-500" />, color: 'text-yellow-600' },
                      ].map(({ label, value, icon, color }) => (
                        <div key={label} className="rounded-xl bg-muted/40 p-3 flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</div>
                          <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString('pt-BR')}</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Alcance', value: insightsQuery.data.reach, icon: <Users className="w-4 h-4 text-purple-500" />, color: 'text-purple-600', desc: 'Contas únicas que viram' },
                        { label: 'Visualizações', value: insightsQuery.data.views, icon: <Eye className="w-4 h-4 text-cyan-500" />, color: 'text-cyan-600', desc: 'Total de exibições' },
                        { label: 'Interações Totais', value: insightsQuery.data.totalInteractions, icon: <Activity className="w-4 h-4 text-orange-500" />, color: 'text-orange-600', desc: 'Curtidas + comentários + etc.' },
                      ].map(({ label, value, icon, color, desc }) => (
                        <div key={label} className="rounded-xl bg-muted/40 p-3 flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</div>
                          <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString('pt-BR')}</p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                      ))}
                    </div>

                    {insightsQuery.data.reach > 0 && (
                      <div className="rounded-xl bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-950/30 dark:to-purple-950/30 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">Taxa de Engajamento</p>
                            <p className="text-xs text-muted-foreground">Interações ÷ Alcance</p>
                          </div>
                          <p className="text-3xl font-bold text-pink-600">
                            {((insightsQuery.data.totalInteractions / insightsQuery.data.reach) * 100).toFixed(2)}%
                          </p>
                        </div>
                        <Progress value={Math.min(((insightsQuery.data.totalInteractions / insightsQuery.data.reach) * 100), 20) * 5} className="mt-3 h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {((insightsQuery.data.totalInteractions / insightsQuery.data.reach) * 100) >= 3
                            ? '✅ Excelente engajamento (acima de 3%)'
                            : ((insightsQuery.data.totalInteractions / insightsQuery.data.reach) * 100) >= 1
                            ? '🟡 Engajamento médio (1–3%)'
                            : '🔴 Engajamento baixo (abaixo de 1%)'}
                        </p>
                      </div>
                    )}

                    {(insightsQuery.data.profileVisits !== null || insightsQuery.data.follows !== null) && (
                      <div className="grid grid-cols-2 gap-3">
                        {insightsQuery.data.profileVisits !== null && (
                          <div className="rounded-xl bg-muted/40 p-3">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Users className="w-4 h-4 text-indigo-500" /> Visitas ao Perfil</div>
                            <p className="text-2xl font-bold text-indigo-600">{insightsQuery.data.profileVisits?.toLocaleString('pt-BR')}</p>
                          </div>
                        )}
                        {insightsQuery.data.follows !== null && (
                          <div className="rounded-xl bg-muted/40 p-3">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><ThumbsUp className="w-4 h-4 text-teal-500" /> Novos Seguidores</div>
                            <p className="text-2xl font-bold text-teal-600">{insightsQuery.data.follows?.toLocaleString('pt-BR')}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {!insightsQuery.isLoading && !insightsQuery.data && (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Não foi possível carregar os insights deste post.</p>
                    <p className="text-xs mt-1">O post pode ser muito antigo ou os dados não estão disponíveis.</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPost(null)}>Fechar</Button>
              {selectedPost?.permalink && (
                <Button className="bg-gradient-to-r from-pink-500 to-purple-600 text-white" onClick={() => window.open(selectedPost.permalink, '_blank')}>
                  <ExternalLink className="w-4 h-4 mr-1" /> Ver no Instagram
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Modal: Criar Post ─────────────────────────────────────────────── */}
        <Dialog open={showCreateModal} onOpenChange={(open) => { if (!open) { setShowCreateModal(false); resetModal(); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Instagram className="w-5 h-5 text-pink-500" /> Criar Post / Rascunho
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de conteúdo</Label>
                  <Select value={newPost.type} onValueChange={(v) => setNewPost(p => ({ ...p, type: v as PostType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="post">Post</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                      <SelectItem value="reels">Reels</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Título da promoção</Label>
                  <Input placeholder="Ex: Combo Verão" value={newPost.promotionTitle} onChange={(e) => setNewPost(p => ({ ...p, promotionTitle: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Legenda (caption)</Label>
                <Textarea placeholder="Escreva a legenda do post..." rows={3} value={newPost.caption} onChange={(e) => setNewPost(p => ({ ...p, caption: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <Button variant={aiMode ? "default" : "outline"} size="sm" onClick={() => setAiMode(true)} className={aiMode ? "bg-purple-600 text-white" : ""}>
                  <Wand2 className="w-4 h-4 mr-1" /> Gerar com IA
                </Button>
                <Button variant={!aiMode ? "default" : "outline"} size="sm" onClick={() => setAiMode(false)}>
                  <Image className="w-4 h-4 mr-1" /> URL da Imagem
                </Button>
              </div>
              {aiMode ? (
                <div className="space-y-3">
                  <div>
                    <Label>Descreva a promoção</Label>
                    <Textarea placeholder="Ex: sorvete de açaí com granola e leite condensado, fundo branco..." rows={2} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
                  </div>
                  <div>
                    <Label>Estilo visual</Label>
                    <Select value={aiStyle} onValueChange={(v) => setAiStyle(v as AiStyle)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(AI_STYLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => { setIsGenerating(true); generateImageMut.mutate({ prompt: aiPrompt, style: aiStyle }); }} disabled={isGenerating || !aiPrompt.trim()} className="w-full">
                    {isGenerating ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Gerando...</> : <><Sparkles className="w-4 h-4 mr-2" /> Gerar Imagem</>}
                  </Button>
                  {generatedImageUrl && (
                    <div className="rounded-lg overflow-hidden border">
                      <img src={generatedImageUrl} alt="Gerada" className="w-full aspect-square object-cover" />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <Label>URL da imagem</Label>
                  <Input placeholder="https://..." value={newPost.imageUrl} onChange={(e) => setNewPost(p => ({ ...p, imageUrl: e.target.value }))} />
                </div>
              )}
              <div>
                <Label>Agendar para (opcional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowCreateModal(false); resetModal(); }}>Cancelar</Button>
              <Button onClick={() => {
                const imageUrl = generatedImageUrl || newPost.imageUrl;
                if (!imageUrl) { toast.error("Adicione uma imagem ou gere uma com IA"); return; }
                createDraftMut.mutate({ type: newPost.type, caption: newPost.caption || undefined, imageUrl: imageUrl as string, promotionTitle: newPost.promotionTitle || undefined, aiPrompt: aiMode ? aiPrompt : undefined, scheduledAt: scheduledAt || undefined });
              }} disabled={createDraftMut.isPending} className="bg-gradient-to-r from-pink-500 to-purple-600 text-white">
                {createDraftMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : scheduledAt ? <><Calendar className="w-4 h-4 mr-1" /> Agendar</> : <><CheckCircle className="w-4 h-4 mr-1" /> Salvar Rascunho</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
