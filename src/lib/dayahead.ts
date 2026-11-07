// Data for the Day-ahead Demand "Forecast" page. System Forecast, Actual, MAPE and Roastering
// come from the day-ahead API (Redux `fetchDayAhead`, GET /day_ahead) and the weather from
// `weather/multi` (`fetchWeather`). Manual Forecast has no API yet (marked TODO).
import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchDayAhead, fetchWeather } from "@/store/slice/demandApiSlice";
import type { WeatherBlocks } from "@/store/features/demandTypes";
import { NOW } from "@/data/engine";

export const BLOCKS = 96;

/** "00:00" … "23:45" for block b (0-based). */
export const blockTime = (b: number) =>
  String(Math.floor(b / 4)).padStart(2, "0") + ":" + String((b % 4) * 15).padStart(2, "0");

export const isoDate = (d: Date) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const todayIso = () => isoDate(NOW);

/* ---------- forecast (API) ---------- */

export type DayForecast = {
  forecast: number[] | null;
  /** Actual, per-block MAPE % and Roastering — only for today or earlier, null for a future date. */
  actual: number[] | null;
  mape: number[] | null;
  roastering: number[] | null;
  /** UDM per block — also only for today or earlier. */
  udm: number[] | null;
  /** Manual forecast from demand_forecast (forecasted_by=Manual), null when no Manual row exists. */
  manual: number[] | null;
  /** System Forecast error bands from the API, null when there are no actuals yet. */
  errorRanges: { range: string; blocks: number; percent: number }[] | null;
  loading: boolean;
  error: string | null;
};

/** System Forecast, Actual and Manual for one date, from the day-ahead API via Redux. `dataId`
 *  picks the horizon: 102110 Day ahead (default), 102120 Week ahead, 102130 Month ahead. */
export function useDayForecast(date: string, dataId = 102110): DayForecast {
  const dispatch = useAppDispatch();
  const { dayData, dayDataId, dayLoading, dayError } = useAppSelector((s) => s.demand);
  useEffect(() => {
    dispatch(fetchDayAhead({ date, data_id: dataId }));
  }, [dispatch, date, dataId]);
  const day = dayData?.date === date && dayDataId === dataId ? dayData : null;
  return {
    forecast: day?.forecast ?? null, actual: day?.actual ?? null, mape: day?.mape ?? null, roastering: day?.roastering ?? null, udm: day?.udm ?? null,
    manual: day?.manual ?? null,
    errorRanges: day?.errorRanges ?? null,
    loading: dayLoading, error: dayError,
  };
}

/* ---------- actuals, MAPE, roastering (API) ---------- */

export type Actuals = {
  actual: number[];
  roastering: number[];
  mape: number[];
  /** UDM per block from the API; null when it isn't there. */
  udm: number[] | null;
  manual: number[] | null;
  manualMape: number[] | null;
};

/** Actual, MAPE and Roastering all come from the API, only for today or earlier — null
 *  otherwise, which hides those series. If the API leaves out MAPE it's worked out as
 *  |actual − forecast| / actual, and a missing Roastering draws as zero. Manual Forecast
 *  comes from demand_forecast (forecasted_by=Manual) — null when no Manual row exists. */
export function buildActuals(forecast: number[], d: Pick<DayForecast, "actual" | "mape" | "roastering" | "udm" | "manual">): Actuals | null {
  if (!d.actual) return null;
  const actual = d.actual;
  const mape = d.mape ?? actual.map((a, b) => +(Math.abs(a - forecast[b]) / (a || 1) * 100).toFixed(2));
  const roastering = d.roastering ?? actual.map(() => 0);

  // Manual MAPE: |(actual + roastering) - manual| / max(|actual + roastering|, 1) * 100
  let manualMape: number[] | null = null;
  if (d.manual) {
    manualMape = actual.map((a, b) => {
      const base = a + (roastering[b] ?? 0);
      const denom = Math.max(Math.abs(base), 1);
      return +((Math.abs(base - (d.manual![b] ?? 0)) / denom) * 100).toFixed(2);
    });
  }

  return { actual, roastering, mape, udm: d.udm ?? null, manual: d.manual ?? null, manualMape };
}

/* ---------- weather (API: weather/multi) ---------- */

export const WEATHER_CLIENT_ID = "mp";

// City names for the location codes the API returns; unknown codes show as the code itself.
const CITY: Record<string, string> = {
  BH_AL: "Bhopal", CH_WRA: "Chhindwara", DH_R: "Dhar", GW_R: "Gwalior", ID_RE: "Indore",
  RW_A: "Rewa", SG_R: "Sagar", ST_N: "Satna", UJ_AIN: "Ujjain",
};
export const cityOf = (id: string) => CITY[id] ?? id;

export type WeatherHour = {
  t: string; temp: number; feels: number; hum: number; wind: number; gust: number; dew: number; cloud: number; day: boolean;
};
/** A location's day: 24 hourly points for the chart plus the raw 96-block temperatures. */
export type WeatherDay = { hours: WeatherHour[]; temps: number[] };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 96 API blocks → 24 hourly averages (labelled 00:30 … 23:30). Null if temperature is missing. */
function toDay(w: WeatherBlocks): WeatherDay | null {
  const arr = (f: keyof WeatherBlocks) => Array.from({ length: BLOCKS }, (_, b) => Number(w[f]?.[String(b + 1)]));
  const temps = arr("temperature");
  if (temps.some((v) => Number.isNaN(v))) return null;
  const feels = arr("temperatureFeelsLike"), hum = arr("relativeHumidity"), wind = arr("windSpeed"), gust = arr("windGust");
  const dew = arr("temperatureDewPoint"), cloud = arr("cloudCover");
  const hr = (a: number[], h: number) => { const s = a.slice(h * 4, h * 4 + 4).filter((v) => !Number.isNaN(v)); return s.length ? r2(s.reduce((x, y) => x + y, 0) / s.length) : 0; };
  return {
    temps,
    hours: Array.from({ length: 24 }, (_, h) => ({
      t: String(h).padStart(2, "0") + ":30",
      temp: hr(temps, h), feels: hr(feels, h), hum: hr(hum, h), wind: hr(wind, h), gust: hr(gust, h), dew: hr(dew, h), cloud: hr(cloud, h),
      day: h >= 6 && h < 18,
    })),
  };
}

export type Weather = {
  locations: string[]; days: Record<string, WeatherDay>; loading: boolean; error: string | null;
};

/** Every location's weather for a date, from the weather API via Redux (one call per date). */
export function useWeather(date: string): Weather {
  const dispatch = useAppDispatch();
  const { weather, weatherLoading, weatherError } = useAppSelector((s) => s.demand);
  useEffect(() => {
    dispatch(fetchWeather({ date, client_id: WEATHER_CLIENT_ID }));
  }, [dispatch, date]);
  const days = useMemo(() => {
    const out: Record<string, WeatherDay> = {};
    if (weather?.date === date) Object.entries(weather.locations).forEach(([id, w]) => { const d = toDay(w); if (d) out[id] = d; });
    return out;
  }, [weather, date]);
  return { locations: Object.keys(days), days, loading: weatherLoading, error: weatherError };
}

export const conditionOf = (cloud: number) => (cloud >= 70 ? "Cloudy" : cloud >= 35 ? "Partly cloudy" : "Clear sky");

export type WeatherSummary = {
  temp: number; label: "NOW" | "PEAK"; condition: string; cloud: number;
  high: number; low: number; humidity: number; maxWind: number; peakAt: string;
};

/** "Now" values when the date is today, else the day's peak. */
export function weatherSummary(w: WeatherDay, date: string): WeatherSummary {
  const h = w.hours;
  const peakB = w.temps.reduce((m, v, b) => (v > w.temps[m] ? b : m), 0);
  const isToday = date === todayIso();
  const i = isToday ? NOW.getHours() : Math.floor(peakB / 4);
  return {
    temp: isToday ? h[i].temp : w.temps[peakB], label: isToday ? "NOW" : "PEAK", condition: conditionOf(h[i].cloud), cloud: h[i].cloud,
    high: Math.max(...w.temps), low: Math.min(...w.temps),
    humidity: Math.round(h[i].hum), maxWind: Math.round(Math.max(...h.map((x) => x.wind))),
    peakAt: String(Math.floor(peakB / 4)).padStart(2, "0") + ":00",
  };
}

/* ---------- calculations from the 96-block arrays ---------- */

export type Kpis = { total: number; peak: number; peakB: number; min: number; avg: number };

export function kpisOf(a: number[]): Kpis {
  let peakB = 0, minB = 0, total = 0;
  a.forEach((v, b) => { total += v; if (v > a[peakB]) peakB = b; if (v < a[minB]) minB = b; });
  return { total, peak: a[peakB], peakB, min: a[minB], avg: total / a.length };
}

export const PERIODS = [
  { label: "Night (00–06)", color: "#111827", from: 0 },
  { label: "Morning Ramp (06–12)", color: "#3b82f6", from: 24 },
  { label: "Afternoon (12–18)", color: "#f97316", from: 48 },
  { label: "Evening Peak (18–24)", color: "#ef4444", from: 72 },
];

export function periodsOf(a: number[]) {
  return PERIODS.map((p) => {
    const s = a.slice(p.from, p.from + 24);
    return { ...p, peak: Math.max(...s), min: Math.min(...s), avg: s.reduce((x, y) => x + y, 0) / s.length };
  });
}

export const SYSTEM_RANGES = ["0–1%", "1–2%", "2–3%", "3–4%", "4–5%", "5–6%", ">6%"];
export const MANUAL_RANGES = ["0–0.5%", "0.5–1%", "1–1.5%", "1.5–2%", "2–2.5%", "2.5–3%", ">3%"];

/** Share of blocks (%) whose MAPE falls in each band of width `step`, last band open-ended. */
/** API error bands → percents in SYSTEM_RANGES order (matched by label, else by position). */
export function systemBucketsFromApi(ranges: { range: string; percent: number }[] | null): number[] | null {
  if (!ranges?.length) return null;
  const norm = (s: string) => s.replace(/\s|-/g, "–").replace(/–+/g, "–");
  return SYSTEM_RANGES.map((lbl, k) => (ranges.find((r) => norm(r.range) === norm(lbl)) ?? ranges[k])?.percent ?? 0);
}

export function errorBuckets(mape: number[] | null, step: number): number[] {
  const out = new Array(7).fill(0);
  if (!mape?.length) return out;
  mape.forEach((m) => { out[Math.min(6, Math.floor(m / step))]++; });
  return out.map((c) => Math.round((c / mape.length) * 100));
}
