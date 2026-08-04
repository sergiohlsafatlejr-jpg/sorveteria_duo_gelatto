import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { makeRequest } from "../_core/map";
import * as db from "../db";

// Cache para avaliações Google (evitar chamadas excessivas)
let googleReviewsCache: { rating: number; totalReviews: number; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

async function fetchGoogleReviews() {
  if (googleReviewsCache && Date.now() - googleReviewsCache.fetchedAt < CACHE_TTL) {
    return googleReviewsCache;
  }
  try {
    // Buscar a sorveteria pelo nome
    const searchResult = await makeRequest<{ results: Array<{ place_id: string; name: string; rating?: number; user_ratings_total?: number }> }>(
      "/maps/api/place/textsearch/json",
      { query: "Duo Gelatto Sorveteria" }
    );
    if (searchResult.results && searchResult.results.length > 0) {
      const place = searchResult.results[0];
      // Buscar detalhes para rating e total de avaliações
      const details = await makeRequest<{ result: { rating?: number; user_ratings_total?: number } }>(
        "/maps/api/place/details/json",
        { place_id: place.place_id, fields: "rating,user_ratings_total" }
      );
      const data = {
        rating: details.result?.rating ?? place.rating ?? 0,
        totalReviews: details.result?.user_ratings_total ?? place.user_ratings_total ?? 0,
        fetchedAt: Date.now(),
      };
      googleReviewsCache = data;
      return data;
    }
    return { rating: 0, totalReviews: 0, fetchedAt: Date.now() };
  } catch (e) {
    console.error("[googleReviews] Erro ao buscar avaliações:", e);
    return googleReviewsCache ?? { rating: 0, totalReviews: 0, fetchedAt: Date.now() };
  }
}

export const dashboardRouter = router({
  googleReviews: protectedProcedure.query(async () => {
    return fetchGoogleReviews();
  }),
  metrics: protectedProcedure.query(() => db.getDashboardMetrics()),
  chartData: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(({ input }) => db.getSalesChartData(input.days)),
  topProducts: protectedProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(({ input }) => db.getTopProducts(input.limit)),
  birthdays: protectedProcedure.query(() => db.getBirthdayCustomers()),
  lowStock: protectedProcedure.query(() => db.getLowStockProducts()),
  topCustomersByPoints: protectedProcedure
    .input(z.object({ limit: z.number().default(10) }).optional())
    .query(({ input }) => db.getTopCustomersByPoints(input?.limit ?? 10)),
  customersWithPointsCount: protectedProcedure.query(() => db.getCustomersWithPointsCount()),
});
