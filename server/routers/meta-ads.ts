import { z } from "zod";
import { execSync } from "child_process";
import { protectedProcedure, router } from "../_core/trpc";

// ─── Helper: chama o MCP meta-marketing via CLI ───────────────────────────────
function callMcp(toolName: string, input: Record<string, unknown>): unknown {
  const inputJson = JSON.stringify(input).replace(/'/g, "'\\''");
  const cmd = `manus-mcp-cli tool call ${toolName} --server meta-marketing --input '${inputJson}' 2>/dev/null`;
  try {
    execSync(cmd, { timeout: 30000 });
    const listCmd = `ls -t /tmp/manus-mcp/mcp_result_*.json 2>/dev/null | head -1`;
    const latestFile = execSync(listCmd).toString().trim();
    if (!latestFile) return null;
    const content = execSync(`cat "${latestFile}"`).toString();
    const parsed = JSON.parse(content);
    return parsed?.result ?? parsed;
  } catch {
    return null;
  }
}

// ─── Conta padrão Duo Gelatto ─────────────────────────────────────────────────
const DUO_ACCOUNT_ID = "act_1821396852023766";

// ─── Mapa de plataformas ──────────────────────────────────────────────────────
const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  unknown: "Desconhecido",
};

// ─── Helper: parse row de insight ─────────────────────────────────────────────
function parseInsightRow(r: any) {
  const actions: Record<string, number> = {};
  if (Array.isArray(r.actions)) {
    for (const a of r.actions) actions[a.action_type] = parseFloat(a.value ?? "0");
  }
  const costPerAction: Record<string, number> = {};
  if (Array.isArray(r.cost_per_action_type)) {
    for (const a of r.cost_per_action_type) costPerAction[a.action_type] = parseFloat(a.value ?? "0");
  }
  return {
    campaignId: r.campaign_id ?? null,
    campaignName: r.campaign_name ?? r.adset_name ?? r.ad_name ?? "—",
    adsetId: r.adset_id ?? null,
    adsetName: r.adset_name ?? null,
    adId: r.ad_id ?? null,
    adName: r.ad_name ?? null,
    impressions: parseInt(r.impressions ?? "0"),
    reach: parseInt(r.reach ?? "0"),
    frequency: parseFloat(r.frequency ?? "0"),
    spend: parseFloat(r.spend ?? "0"),
    ctr: parseFloat(r.ctr ?? "0"),
    cpc: parseFloat(r.cpc ?? "0"),
    cpm: parseFloat(r.cpm ?? "0"),
    linkClicks: parseInt(r.inline_link_clicks ?? "0"),
    linkCtr: parseFloat(r.inline_link_click_ctr ?? "0"),
    qualityRanking: r.quality_ranking ?? null,
    engagementRateRanking: r.engagement_rate_ranking ?? null,
    conversionRateRanking: r.conversion_rate_ranking ?? null,
    actions,
    costPerAction,
    dateStart: r.date_start ?? null,
    dateStop: r.date_stop ?? null,
  };
}

// ─── Meta Ads Router ──────────────────────────────────────────────────────────
export const metaAdsRouter = router({
  // Retorna as contas de anúncio conectadas
  getAccounts: protectedProcedure.query(() => {
    const result = callMcp("meta_marketing_get_ad_accounts", { keywords: [] }) as any;
    const accounts = result?.data ?? [];
    return accounts.map((a: any) => ({
      id: a.id,
      name: a.name,
      businessName: a.business?.name ?? null,
      status: a.account_status === 1 ? "ACTIVE" : "DISABLED",
      currency: a.currency,
    }));
  }),

  // Retorna campanhas da conta Duo Gelatto
  getCampaigns: protectedProcedure
    .input(z.object({
      adAccountId: z.string().optional(),
      status: z.array(z.string()).optional(),
      limit: z.number().optional(),
    }).optional())
    .query(({ input }) => {
      const accountId = input?.adAccountId ?? DUO_ACCOUNT_ID;
      const payload: Record<string, unknown> = { ad_account_id: accountId, limit: input?.limit ?? 50 };
      if (input?.status?.length) payload.effective_status = input.status;
      const result = callMcp("meta_marketing_get_campaigns", payload) as any;
      const campaigns = result?.data ?? [];
      return campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.effective_status,
        objective: c.objective ?? null,
        dailyBudget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
        lifetimeBudget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
        startTime: c.start_time ?? null,
        stopTime: c.stop_time ?? null,
      }));
    }),

  // Retorna insights (métricas) por campanha
  getInsights: protectedProcedure
    .input(z.object({
      adAccountId: z.string().optional(),
      datePreset: z.enum([
        "today", "yesterday", "last_7d", "last_14d", "last_30d",
        "last_90d", "this_month", "last_month", "this_year", "last_year", "maximum"
      ]).optional(),
      level: z.enum(["account", "campaign", "adset", "ad"]).optional(),
      limit: z.number().optional(),
    }).optional())
    .query(({ input }) => {
      const accountId = input?.adAccountId ?? DUO_ACCOUNT_ID;
      const payload: Record<string, unknown> = {
        object_type: "ad_account",
        object_id: accountId,
        level: input?.level ?? "campaign",
        date_preset: input?.datePreset ?? "last_30d",
        limit: input?.limit ?? 50,
      };
      const result = callMcp("meta_marketing_get_insights", payload) as any;
      // O MCP retorna result.insights (lista) ou result.data
      const rows = result?.insights ?? result?.data ?? [];
      return rows.map(parseInsightRow);
    }),

  // Retorna insights no nível de anúncio (para breakdown por criativo/posicionamento)
  getInsightsByAd: protectedProcedure
    .input(z.object({
      adAccountId: z.string().optional(),
      datePreset: z.enum([
        "today", "yesterday", "last_7d", "last_14d", "last_30d",
        "last_90d", "this_month", "last_month", "this_year", "last_year", "maximum"
      ]).optional(),
      limit: z.number().optional(),
    }).optional())
    .query(({ input }) => {
      const accountId = input?.adAccountId ?? DUO_ACCOUNT_ID;
      const payload: Record<string, unknown> = {
        object_type: "ad_account",
        object_id: accountId,
        level: "ad",
        date_preset: input?.datePreset ?? "last_30d",
        limit: input?.limit ?? 100,
      };
      const result = callMcp("meta_marketing_get_insights", payload) as any;
      const rows = result?.insights ?? result?.data ?? [];
      return rows.map(parseInsightRow);
    }),

  // Retorna resumo rápido para o Dashboard (últimos 7 dias)
  getSummary: protectedProcedure
    .input(z.object({
      adAccountId: z.string().optional(),
      datePreset: z.enum([
        "today", "yesterday", "last_7d", "last_14d", "last_30d",
        "last_90d", "this_month", "last_month", "this_year", "last_year", "maximum"
      ]).optional(),
    }).optional())
    .query(({ input }) => {
      const accountId = input?.adAccountId ?? DUO_ACCOUNT_ID;
      const payload: Record<string, unknown> = {
        object_type: "ad_account",
        object_id: accountId,
        level: "campaign",
        date_preset: input?.datePreset ?? "last_7d",
        limit: 50,
      };
      const result = callMcp("meta_marketing_get_insights", payload) as any;
      const rows: any[] = result?.insights ?? result?.data ?? [];
      const totalSpend = rows.reduce((s: number, r: any) => s + parseFloat(r.spend ?? "0"), 0);
      const totalImpressions = rows.reduce((s: number, r: any) => s + parseInt(r.impressions ?? "0"), 0);
      const totalReach = rows.reduce((s: number, r: any) => s + parseInt(r.reach ?? "0"), 0);
      const totalLinkClicks = rows.reduce((s: number, r: any) => s + parseInt(r.inline_link_clicks ?? "0"), 0);
      const activeCampaigns = rows.length;
      const datePreset = input?.datePreset ?? "last_7d";
      return {
        totalSpend,
        totalImpressions,
        totalReach,
        totalLinkClicks,
        activeCampaigns,
        datePreset,
        dateStart: rows[0]?.date_start ?? null,
        dateStop: rows[0]?.date_stop ?? null,
      };
    }),

  // Retorna ad sets de uma campanha ou conta
  getAdSets: protectedProcedure
    .input(z.object({
      campaignId: z.string().optional(),
      adAccountId: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(({ input }) => {
      const payload: Record<string, unknown> = { limit: input?.limit ?? 50 };
      if (input?.campaignId) payload.campaign_id = input.campaignId;
      else payload.ad_account_id = input?.adAccountId ?? DUO_ACCOUNT_ID;
      const result = callMcp("meta_marketing_get_adsets", payload) as any;
      const adsets = result?.data ?? [];
      return adsets.map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.effective_status,
        campaignId: a.campaign_id ?? null,
        dailyBudget: a.daily_budget ? parseFloat(a.daily_budget) / 100 : null,
        lifetimeBudget: a.lifetime_budget ? parseFloat(a.lifetime_budget) / 100 : null,
        optimizationGoal: a.optimization_goal ?? null,
        billingEvent: a.billing_event ?? null,
      }));
    }),

  // Retorna recomendações da conta
  getRecommendations: protectedProcedure
    .input(z.object({ adAccountId: z.string().optional() }).optional())
    .query(({ input }) => {
      const accountId = input?.adAccountId ?? DUO_ACCOUNT_ID;
      const result = callMcp("meta_marketing_get_recommendations", { ad_account_id: accountId }) as any;
      const recs = result?.data ?? [];
      return recs.map((r: any) => ({
        id: r.id ?? Math.random().toString(),
        title: r.title ?? r.recommendation_type ?? "Recomendação",
        message: r.message ?? r.body ?? "",
        importance: r.importance ?? "MEDIUM",
        confidence: r.confidence ?? null,
      }));
    }),
});

export { PLATFORM_LABELS };
