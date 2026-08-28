export type CachedDailyRevenue = {
  revenueDate: string;
  realAmount: string | number;
  note?: string | null;
  updatedAt?: Date | string | null;
};

export type CachedProductSales = {
  produtoId?: number;
  codPdv?: string | null;
  nome: string;
  qtd: number;
  total: number;
};

export function getSaoPauloDate(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function subtractIsoDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00-03:00`);
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function parseSaleCount(note?: string | null): number {
  const match = String(note ?? "").match(/\((\d+)\s+vendas?\)/i);
  return match ? Number(match[1]) : 0;
}

export function buildCachedKpis(rows: CachedDailyRevenue[], today = getSaoPauloDate()) {
  const month = today.slice(0, 7);
  const yesterday = subtractIsoDays(today, 1);
  const monthRows = rows.filter((row) => row.revenueDate.startsWith(month));
  const totalMonth = monthRows.reduce((sum, row) => sum + Number(row.realAmount || 0), 0);
  const countMonth = monthRows.reduce((sum, row) => sum + parseSaleCount(row.note), 0);
  const todayRow = rows.find((row) => row.revenueDate === today);
  const yesterdayRow = rows.find((row) => row.revenueDate === yesterday);
  const updatedTimes = rows
    .map((row) => row.updatedAt ? new Date(row.updatedAt).getTime() : 0)
    .filter(Number.isFinite);

  return {
    vendas_hoje: {
      qtd: parseSaleCount(todayRow?.note),
      total: Number(todayRow?.realAmount || 0),
    },
    vendas_mes: { qtd: countMonth, total: totalMonth },
    ticket_medio: countMonth > 0 ? totalMonth / countMonth : 0,
    vendas_ontem: {
      qtd: parseSaleCount(yesterdayRow?.note),
      total: Number(yesterdayRow?.realAmount || 0),
    },
    source: "cache" as const,
    cachedAt: updatedTimes.length > 0 ? new Date(Math.max(...updatedTimes)).toISOString() : null,
  };
}

export function buildCachedSalesByDay(rows: CachedDailyRevenue[], dateFrom: string) {
  return rows
    .filter((row) => row.revenueDate >= dateFrom)
    .map((row) => ({
      dia: row.revenueDate,
      qtd: parseSaleCount(row.note),
      total: Number(row.realAmount || 0),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

export function parseCachedProducts(data: string, limit: number): CachedProductSales[] {
  try {
    const parsed = JSON.parse(data) as {
      products?: Array<{ produtoId?: number; codPdv?: string | null; nome?: string; qtd?: number; faturamento?: number }>;
      top10?: Array<{ produtoId?: number; codPdv?: string | null; nome?: string; qtd?: number; faturamento?: number }>;
    };
    const products = parsed.products ?? parsed.top10 ?? [];
    return products
      .map((product) => ({
        ...(Number.isFinite(Number(product.produtoId)) ? { produtoId: Number(product.produtoId) } : {}),
        ...(product.codPdv === null || product.codPdv === undefined ? {} : { codPdv: String(product.codPdv) }),
        nome: String(product.nome ?? "Produto sem nome"),
        qtd: Number(product.qtd ?? 0),
        total: Number(product.faturamento ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  } catch {
    return [];
  }
}
