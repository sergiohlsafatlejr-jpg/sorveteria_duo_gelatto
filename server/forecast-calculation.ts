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
};

type WeatherDay = { code: number; tempMax: number; precip: number; precipProb: number };

export const DEFAULT_FORECAST_SETTINGS: ForecastSettingsValues = {
  avgWeekday: 2000,
  avgSaturday: 5300,
  avgSundayHoliday: 8300,
  rainFactor: 0.7,
};

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
  let weatherResult: ForecastWeather | null = null;
  if (weather) {
    let label: ForecastWeather["label"] = "unknown";
    if (weather.code === 0) label = "sun";
    else if (weather.code <= 3) label = "cloud";
    else if (weather.code <= 67 || (weather.code >= 80 && weather.code <= 84)) {
      label = weather.precip > 5 || weather.precipProb > 60 ? "rain" : "cloud";
    } else if (weather.code >= 85) label = "storm";
    else label = "cloud";

    if (label === "rain") projectedAmount = baseAvg * settings.rainFactor;
    else if (label === "storm") projectedAmount = baseAvg * (settings.rainFactor * 0.8);
    else if (label === "cloud") projectedAmount = baseAvg * 0.9;
    weatherResult = { label, ...weather };
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
      const url = `https://api.open-meteo.com/v1/forecast?latitude=-16.6864&longitude=-49.2643&daily=weathercode,temperature_2m_max,precipitation_sum,precipitation_probability_max&timezone=America%2FSao_Paulo&start_date=${weatherDates[0]}&end_date=${weatherDates[weatherDates.length - 1]}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        const data = await response.json();
        const daily = data.daily ?? {};
        (daily.time ?? []).forEach((date: string, index: number) => {
          weatherMap.set(date, {
            code: daily.weathercode?.[index] ?? -1,
            tempMax: daily.temperature_2m_max?.[index] ?? 0,
            precip: daily.precipitation_sum?.[index] ?? 0,
            precipProb: daily.precipitation_probability_max?.[index] ?? 0,
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
    days,
  };
}
