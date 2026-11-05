export type ForecastSettingsValues = {
  avgWeekday: number;
  avgSaturday: number;
  avgSundayHoliday: number;
  rainFactor: number;
};

export type ForecastWeather = {
  label: "sun" | "cloud" | "rain" | "storm" | "unknown";
  code: number;
  tempMax: number;
  precip: number;
  precipProb: number;
  /** Probabilidade máxima de chuva na janela de pico da sorveteria (13h–20h) */
  peakHoursRainProb?: number | null;
  /** Chuva prevista especificamente na janela de pico (13h–20h) em mm */
  peakHoursPrecip?: number | null;
  /** Multiplicador térmico calculado pela temperatura máxima (ex: 1.12 para 34°C) */
  thermalMultiplier?: number;
  /** Recomendação tática comercial para a equipe com base no clima do dia */
  tacticalRecommendation?: string;
};

type WeatherDay = {
  code: number;
  tempMax: number;
  precip: number;
  precipProb: number;
  peakHoursRainProb?: number | null;
  peakHoursPrecip?: number | null;
};

export const DEFAULT_FORECAST_SETTINGS: ForecastSettingsValues = {
  avgWeekday: 2000,
  avgSaturday: 5300,
  avgSundayHoliday: 8300,
  rainFactor: 0.7,
};

/**
 * Calcula a elasticidade térmica de vendas para sorveteria:
 * - Entre 27°C e 30°C: neutro (1.00)
 * - Acima de 30°C: +3% por grau acima de 30°C (até +18% em 36°C+)
 * - Entre 24°C e 26.9°C: -8% (0.92)
 * - Abaixo de 24°C: -18% (0.82)
 */
export function calculateThermalMultiplier(tempMax: number): number {
  if (!Number.isFinite(tempMax) || tempMax <= 0) return 1;
  if (tempMax > 30) {
    const boost = Math.min(0.18, (tempMax - 30) * 0.03);
    return Number((1 + boost).toFixed(2));
  }
  if (tempMax >= 27) return 1;
  if (tempMax >= 24) return 0.92;
  return 0.82;
}

export function buildWeatherTacticalRecommendation(
  label: ForecastWeather["label"],
  tempMax: number,
  peakHoursRainProb?: number | null,
): string {
  if (label === "rain" || label === "storm") {
    if (peakHoursRainProb != null && peakHoursRainProb < 35) {
      return "Chuva fora do horário de pico (13h–20h): manter operação normal de balcão e estimular taças.";
    }
    return "Alerta de Chuva no Pico: focar equipe na meta 'Leve para Casa' (Potes 1,5L/2L, Açaí e Combos de Picolé).";
  }
  if (tempMax >= 32) {
    return `Calor Forte (${Math.round(tempMax)}°C): reforçar cubas de 10L de maior giro, picolés de fruta e agilidade na fila (13h–19h).`;
  }
  if (tempMax < 25 || label === "cloud") {
    return "Clima Ameno/Nublado: trabalhar venda sugestiva no caixa (cascão recheado, cobertura quente, sobremesas e potes 2L).";
  }
  return "Dia de Sol Ideal: estimular aumento de Ticket Médio (+adicionais, cascão duplo e picolés especiais).";
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getBusinessToday(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day"), 12));
}

export function getNextSevenForecastDates(now = new Date()): string[] {
  const today = getBusinessToday(now);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + index + 1);
    return formatUtcDate(date);
  });
}

export function getWeatherEligibleDates(dateStrings: string[], now = new Date()): string[] {
  const today = getBusinessToday(now);
  const horizon = new Date(today);
  horizon.setUTCDate(today.getUTCDate() + 15);
  const todayStr = formatUtcDate(today);
  const horizonStr = formatUtcDate(horizon);
  return dateStrings.filter(date => date >= todayStr && date <= horizonStr);
}

export function calculateForecastDay(
  dateStr: string,
  settings: ForecastSettingsValues,
  holidayName: string | null,
  weather: WeatherDay | null,
  todayStr: string,
) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  const weekday = date.getUTCDay();
  const isHoliday = Boolean(holidayName);
  const isSunday = weekday === 0;
  const isSaturday = weekday === 6;
  const dayType: "weekday" | "saturday" | "sunday" | "holiday" = isHoliday
    ? "holiday"
    : isSunday
      ? "sunday"
      : isSaturday
        ? "saturday"
        : "weekday";
  const baseAvg = dayType === "weekday"
    ? settings.avgWeekday
    : dayType === "saturday"
      ? settings.avgSaturday
      : settings.avgSundayHoliday;

  let projectedAmount = baseAvg;
  let thermalAdjustedAmount = baseAvg;
  let weatherResult: ForecastWeather | null = null;
  if (weather) {
    let label: ForecastWeather["label"] = "unknown";
    const effectiveRainProb = weather.peakHoursRainProb ?? weather.precipProb;
    const effectivePrecip = weather.peakHoursPrecip ?? weather.precip;

    if (weather.code === 0) label = "sun";
    else if (weather.code <= 3) label = "cloud";
    else if (weather.code <= 67 || (weather.code >= 80 && weather.code <= 84)) {
      label = effectivePrecip > 5 || effectiveRainProb > 60 ? "rain" : "cloud";
    } else if (weather.code >= 85) label = "storm";
    else label = "cloud";

    if (label === "rain") projectedAmount = baseAvg * settings.rainFactor;
    else if (label === "storm") projectedAmount = baseAvg * (settings.rainFactor * 0.8);
    else if (label === "cloud") projectedAmount = baseAvg * 0.9;

    const thermalMultiplier = calculateThermalMultiplier(weather.tempMax);
    thermalAdjustedAmount = Math.round(projectedAmount * thermalMultiplier);

    weatherResult = {
      label,
      ...weather,
      thermalMultiplier,
      tacticalRecommendation: buildWeatherTacticalRecommendation(
        label,
        weather.tempMax,
        weather.peakHoursRainProb,
      ),
    };
  }

  return {
    date: dateStr,
    day: date.getUTCDate(),
    weekday,
    dayType,
    isHoliday,
    holidayName,
    isPast: dateStr < todayStr,
    isToday: dateStr === todayStr,
    weather: weatherResult,
    baseAvg,
    projectedAmount: Math.round(projectedAmount),
    thermalAdjustedAmount: Math.round(thermalAdjustedAmount),
  };
}

export async function buildForecastDays(
  dateStrings: string[],
  settings: ForecastSettingsValues,
  now = new Date(),
) {
  if (dateStrings.length === 0) return [];
  const holidayNames = new Map<string, string>();
  for (const year of Array.from(new Set(dateStrings.map(date => date.slice(0, 4))))) {
    try {
      const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const holidays: { date: string; name: string }[] = await response.json();
        holidays.forEach(holiday => holidayNames.set(holiday.date, holiday.name));
      }
    } catch { /* previsão continua sem feriados externos */ }
  }

  const weatherMap = new Map<string, WeatherDay>();
  const weatherDates = getWeatherEligibleDates(dateStrings, now);
  if (weatherDates.length > 0) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=-16.6864&longitude=-49.2643&daily=weathercode,temperature_2m_max,precipitation_sum,precipitation_probability_max&hourly=precipitation_probability,precipitation&timezone=America%2FSao_Paulo&start_date=${weatherDates[0]}&end_date=${weatherDates[weatherDates.length - 1]}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        const data = await response.json();
        const daily = data.daily ?? {};
        const hourly = data.hourly ?? {};
        const hourlyTimes: string[] = hourly.time ?? [];
        const hourlyProbs: number[] = hourly.precipitation_probability ?? [];
        const hourlyPrecip: number[] = hourly.precipitation ?? [];

        // Calcula chuva especificamente na janela de ouro da sorveteria (13h às 20h)
        const peakStatsByDate = new Map<string, { maxProb: number; sumPrecip: number }>();
        hourlyTimes.forEach((isoTime, idx) => {
          const [dStr, tStr] = isoTime.split("T");
          const hour = Number((tStr ?? "00").slice(0, 2));
          if (hour >= 13 && hour <= 20) {
            const cur = peakStatsByDate.get(dStr) ?? { maxProb: 0, sumPrecip: 0 };
            const prob = Number(hourlyProbs[idx] ?? 0);
            const prec = Number(hourlyPrecip[idx] ?? 0);
            if (prob > cur.maxProb) cur.maxProb = prob;
            cur.sumPrecip += prec;
            peakStatsByDate.set(dStr, cur);
          }
        });

        (daily.time ?? []).forEach((date: string, index: number) => {
          const peak = peakStatsByDate.get(date);
          weatherMap.set(date, {
            code: daily.weathercode?.[index] ?? -1,
            tempMax: daily.temperature_2m_max?.[index] ?? 0,
            precip: daily.precipitation_sum?.[index] ?? 0,
            precipProb: daily.precipitation_probability_max?.[index] ?? 0,
            peakHoursRainProb: peak ? peak.maxProb : null,
            peakHoursPrecip: peak ? Number(peak.sumPrecip.toFixed(1)) : null,
          });
        });
      }
    } catch { /* previsão continua com médias base */ }
  }

  const todayStr = formatUtcDate(getBusinessToday(now));
  return dateStrings.map(date => calculateForecastDay(
    date,
    settings,
    holidayNames.get(date) ?? null,
    weatherMap.get(date) ?? null,
    todayStr,
  ));
}

export async function buildForecastMonth(year: number, month: number, settings: ForecastSettingsValues) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dateStrings = Array.from({ length: daysInMonth }, (_, index) =>
    `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
  );
  const days = await buildForecastDays(dateStrings, settings);
  return {
    year,
    month,
    daysInMonth,
    days,
    summary: {
      totalProjected: days.reduce((sum, day) => sum + day.projectedAmount, 0),
      totalThermalProjected: days.reduce((sum, day) => sum + day.thermalAdjustedAmount, 0),
      totalBase: days.reduce((sum, day) => sum + day.baseAvg, 0),
      weekdayCount: days.filter(day => day.dayType === "weekday").length,
      saturdayCount: days.filter(day => day.dayType === "saturday").length,
      sundayHolidayCount: days.filter(day => day.dayType === "sunday" || day.dayType === "holiday").length,
    },
  };
}

export async function buildNextSevenDayForecast(settings: ForecastSettingsValues, now = new Date()) {
  const dateStrings = getNextSevenForecastDates(now);
  const days = await buildForecastDays(dateStrings, settings, now);
  return {
    dateFrom: dateStrings[0],
    dateTo: dateStrings[dateStrings.length - 1],
    totalProjected: days.reduce((sum, day) => sum + day.projectedAmount, 0),
    totalThermalProjected: days.reduce((sum, day) => sum + day.thermalAdjustedAmount, 0),
    days,
  };
}
