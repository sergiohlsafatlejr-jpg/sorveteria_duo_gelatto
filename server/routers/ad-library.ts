import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

// ─── Meta Ad Library API ──────────────────────────────────────────────────────
// A Meta Ad Library é pública e não requer autenticação para buscas básicas.
// Usamos a Graph API v19.0 com um token de acesso de app (não precisa de conta de anúncio).
// Documentação: https://www.facebook.com/ads/library/api/

const AD_LIBRARY_BASE = "https://graph.facebook.com/v19.0/ads_archive";

// Lista de concorrentes conhecidos da Duo Gelatto para busca rápida
const KNOWN_COMPETITORS = [
  { name: "Açaí Concept Goiânia", query: "açaí concept goiânia", category: "açaí" },
  { name: "Açaí Lovers", query: "açaí lovers goiânia", category: "açaí" },
  { name: "Gelateria Italiana Goiânia", query: "gelateria italiana goiânia", category: "sorvete" },
  { name: "Sorvetes Goiânia", query: "sorvetes artesanais goiânia", category: "sorvete" },
  { name: "Açaí Tropical", query: "açaí tropical goiânia", category: "açaí" },
  { name: "Gelato Premium", query: "gelato premium goiânia", category: "sorvete" },
];

// ─── Helper: busca na Ad Library via fetch ────────────────────────────────────
async function searchAdLibrary(params: {
  searchTerms: string;
  accessToken: string;
  adType?: string;
  adActiveStatus?: string;
  country?: string;
  limit?: number;
  adReachedCountries?: string[];
}) {
  const {
    searchTerms,
    accessToken,
    adType = "ALL",
    adActiveStatus = "ALL",
    country = "BR",
    limit = 20,
  } = params;

  const url = new URL(AD_LIBRARY_BASE);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("search_terms", searchTerms);
  url.searchParams.set("ad_type", adType);
  url.searchParams.set("ad_active_status", adActiveStatus);
  url.searchParams.set("ad_reached_countries", JSON.stringify([country]));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", [
    "id",
    "ad_creation_time",
    "ad_creative_bodies",
    "ad_creative_link_captions",
    "ad_creative_link_descriptions",
    "ad_creative_link_titles",
    "ad_delivery_start_time",
    "ad_delivery_stop_time",
    "ad_snapshot_url",
    "currency",
    "delivery_by_region",
    "demographic_distribution",
    "estimated_audience_size",
    "impressions",
    "page_id",
    "page_name",
    "publisher_platforms",
    "spend",
    "target_ages",
    "target_gender",
    "target_locations",
  ].join(","));

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Meta Ad Library API error: ${response.status} — ${errorText}`);
  }
  return response.json();
}

// ─── Helper: normaliza um anúncio da Ad Library ───────────────────────────────
function normalizeAd(ad: any) {
  return {
    id: ad.id ?? "",
    pageName: ad.page_name ?? "—",
    pageId: ad.page_id ?? null,
    createdAt: ad.ad_creation_time ?? null,
    deliveryStart: ad.ad_delivery_start_time ?? null,
    deliveryStop: ad.ad_delivery_stop_time ?? null,
    bodies: ad.ad_creative_bodies ?? [],
    linkTitles: ad.ad_creative_link_titles ?? [],
    linkDescriptions: ad.ad_creative_link_descriptions ?? [],
    linkCaptions: ad.ad_creative_link_captions ?? [],
    snapshotUrl: ad.ad_snapshot_url ?? null,
    platforms: ad.publisher_platforms ?? [],
    impressions: ad.impressions
      ? { lowerBound: ad.impressions.lower_bound, upperBound: ad.impressions.upper_bound }
      : null,
    spend: ad.spend
      ? { lowerBound: ad.spend.lower_bound, upperBound: ad.spend.upper_bound, currency: ad.currency }
      : null,
    estimatedAudience: ad.estimated_audience_size
      ? { lowerBound: ad.estimated_audience_size.lower_bound, upperBound: ad.estimated_audience_size.upper_bound }
      : null,
    targetAges: ad.target_ages ?? null,
    targetGender: ad.target_gender ?? null,
    targetLocations: ad.target_locations ?? [],
    demographicDistribution: ad.demographic_distribution ?? [],
    deliveryByRegion: ad.delivery_by_region ?? [],
  };
}

// ─── Ad Library Router ────────────────────────────────────────────────────────
export const adLibraryRouter = router({
  // Busca anúncios na Meta Ad Library por termo de pesquisa
  search: protectedProcedure
    .input(z.object({
      searchTerms: z.string().min(2),
      adType: z.enum(["ALL", "POLITICAL_AND_ISSUE_ADS"]).optional(),
      adActiveStatus: z.enum(["ALL", "ACTIVE", "INACTIVE"]).optional(),
      country: z.string().optional(),
      limit: z.number().min(1).max(50).optional(),
    }))
    .query(async ({ input }) => {
      const accessToken = process.env.META_AD_LIBRARY_TOKEN;
      if (!accessToken) {
        // Retorna dados de demonstração quando o token não está configurado
        return {
          configured: false,
          ads: [],
          total: 0,
          message: "Token da Meta Ad Library não configurado. Configure META_AD_LIBRARY_TOKEN nas configurações.",
        };
      }

      try {
        const data = await searchAdLibrary({
          searchTerms: input.searchTerms,
          accessToken,
          adType: input.adType,
          adActiveStatus: input.adActiveStatus,
          country: input.country ?? "BR",
          limit: input.limit ?? 20,
        });

        const ads = (data.data ?? []).map(normalizeAd);
        return {
          configured: true,
          ads,
          total: ads.length,
          paging: data.paging ?? null,
          message: null,
        };
      } catch (error: any) {
        return {
          configured: true,
          ads: [],
          total: 0,
          message: `Erro ao buscar na Ad Library: ${error.message}`,
        };
      }
    }),

  // Retorna a lista de concorrentes conhecidos para busca rápida
  getKnownCompetitors: protectedProcedure.query(() => {
    return KNOWN_COMPETITORS;
  }),

  // Verifica se o token da Ad Library está configurado
  checkConfig: protectedProcedure.query(() => {
    const token = process.env.META_AD_LIBRARY_TOKEN;
    return {
      configured: !!token,
      tokenPreview: token ? `${token.substring(0, 8)}...` : null,
    };
  }),
});
