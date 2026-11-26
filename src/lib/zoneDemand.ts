// Zone-wise demand (Details → Demand → Zone-wise demand): the three MP zones' demand and weather.
//  · zone-demand/data     — Intra-day (102100) / Day ahead (102110): one date's 96 blocks per zone
//                           (Actual_demand, Forecasted_demand, udm, mape).
//  · zone-demand/average  — Week (102120) / Month (102130): the period's average day per zone
//                           (avg_actual_demand, avg_forecast_demand, avg_udm, avg_mape).
//  · weather/zone         — the zone's weather per day and block (mean of its locations); a week /
//                           month is averaged block by block here into one day.
// All behind the login (authFetch). One request per zone / period for the session.
import { useEffect, useState } from "react";
import BASE_URL from "../../BASE_URL";
import { authFetch, readApiError } from "@/lib/auth";
import { BLOCKS, toWeatherDay, todayIso, type WeatherDay } from "@/lib/dayahead";
import type { MeanForecastLine, WeatherBlocks } from "@/store/features/demandTypes";

export type ZoneId = "central" | "east" | "west";
export const ZONES: { id: ZoneId; code: "CZ" | "EZ" | "WZ"; name: string }[] = [
  { id: "east", code: "EZ", name: "East zone" },
  { id: "west", code: "WZ", name: "West zone" },
  { id: "central", code: "CZ", name: "Central zone" },
];

/** One zone's 96 blocks; a value is null where the API has none (e.g. actual for future blocks). */
export type ZoneLine = { actual: (number | null)[]; forecast: (number | null)[]; udm: (number | null)[]; mape: (number | null)[]; periodMape: number | null };

const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const emptyCol = () => new Array<number | null>(BLOCKS).fill(null);

async function getJson(path: string, q: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await authFetch(`${BASE_URL}${path}?${new URLSearchParams(q).toString()}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(await readApiError(res, `Failed to load ${path} (${res.status})`));
  return res.json();
}

type DataBlock = { block: number; Actual_demand?: number | null; Forecasted_demand?: number | null; udm?: number | null; mape?: number | null };
type AvgBlock = { block: number; avg_actual_demand?: number | null; avg_forecast_demand?: number | null; avg_udm?: number | null; avg_mape?: number | null };

/** zone-demand/data (one date) or zone-demand/average (week / month) → the zone's line. */
async function loadZoneLine(zone: ZoneId, dataId: number, from: string, to: string): Promise<ZoneLine> {
  const q = { zone, data_id: String(dataId), from_date: from, to_date: to };
  const line: ZoneLine = { actual: emptyCol(), forecast: emptyCol(), udm: emptyCol(), mape: emptyCol(), periodMape: null };
  const put = (b: number, a: unknown, f: unknown, u: unknown, m: unknown) => {
    if (b < 1 || b > BLOCKS) return;
    line.actual[b - 1] = num(a); line.forecast[b - 1] = num(f); line.udm[b - 1] = num(u); line.mape[b - 1] = num(m);
  };
  if (dataId === 102100 || dataId === 102110) {
    const json = await getJson("zone-demand/data", q);
    line.periodMape = num((json.summary as { mape?: number } | undefined)?.mape);
    const days = (json.data as { date: string; blocks?: DataBlock[] }[] | undefined) ?? [];
    const day = days.find((d) => d.date === from) ?? days[0];
    for (const b of day?.blocks ?? []) put(b.block, b.Actual_demand, b.Forecasted_demand, b.udm, b.mape);
  } else {
    const json = await getJson("zone-demand/average", q);
    line.periodMape = num((json.summary as { mape?: number } | undefined)?.mape);
    for (const b of (json.blocks as AvgBlock[] | undefined) ?? []) put(b.block, b.avg_actual_demand, b.avg_forecast_demand, b.avg_udm, b.avg_mape);
  }
  return line;
}

type WxBlock = { block: number } & Partial<Record<keyof WeatherBlocks, number | null>>;
const WX_FIELDS = ["cloudCover", "relativeHumidity", "temperature", "temperatureDewPoint", "temperatureFeelsLike", "windGust", "windSpeed"] as const;

/** weather/zone → one day (a week / month is the block-by-block average of its days with data). */
async function loadZoneWeather(zone: ZoneId, dataId: number, from: string, to: string): Promise<WeatherDay | null> {
  const json = await getJson("weather/zone", { zone, data_id: String(dataId), from_date: from, to_date: to });
  const days = ((json.data as { date: string; has_data?: boolean; blocks?: WxBlock[] }[] | undefined) ?? []).filter((d) => d.has_data !== false && d.blocks?.length);
  if (!days.length) return null;
  const blocks = {} as WeatherBlocks;
  for (const f of WX_FIELDS) {
    const out: Record<string, number> = {};
    for (let b = 1; b <= BLOCKS; b++) {
      const vals = days.map((d) => num(d.blocks!.find((x) => x.block === b)?.[f])).filter((v): v is number => v != null);
      if (vals.length) out[String(b)] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    blocks[f] = out;
  }
  return toWeatherDay(blocks);
}

const lineLoads = new Map<string, { p: Promise<ZoneLine>; at: number }>();
const wxLoads = new Map<string, { p: Promise<WeatherDay | null>; at: number }>();
/** A period that reaches today still gains actuals block by block: its saved answer is re-asked
 *  after this long (past and future periods are kept for the session). */
const LIVE_MS = 5 * 60_000;
/** Keys end in …:from:to — true when `to` is today or later. */
const isLive = (key: string) => key.slice(-10) >= todayIso();
/** Session cache: a failed load is dropped so the next visit retries; a live period is re-asked
 *  after LIVE_MS. */
function cached<T>(m: Map<string, { p: Promise<T>; at: number }>, key: string, load: () => Promise<T>): Promise<T> {
  const hit = m.get(key);
  if (!hit || (isLive(key) && Date.now() - hit.at > LIVE_MS)) {
    const p = load(); p.catch(() => m.delete(key)); m.set(key, { p, at: Date.now() });
  }
  return m.get(key)!.p;
}
/** Re-renders every LIVE_MS while the shown period reaches today, so an open page picks up new actuals. */
function useLiveTick(to: string) {
  const [tick, setTick] = useState(0);
  const live = to >= todayIso();
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setTick((t) => t + 1), LIVE_MS + 1000);
    return () => window.clearInterval(id);
  }, [live]);
  return tick;
}

/** All three zones' lines for a period. */
export function useZoneDemand(dataId: number, from: string, to: string) {
  const key = `${dataId}:${from}:${to}`;
  const tick = useLiveTick(to);
  const [state, setState] = useState<{ key: string; lines: Record<ZoneId, ZoneLine> | null; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(ZONES.map((z) => cached(lineLoads, `${z.id}:${key}`, () => loadZoneLine(z.id, dataId, from, to))))
      .then((ls) => { if (live) setState({ key, lines: Object.fromEntries(ZONES.map((z, i) => [z.id, ls[i]])) as Record<ZoneId, ZoneLine>, error: null }); })
      .catch((e) => { if (live) setState({ key, lines: null, error: e?.message ?? String(e) }); });
    return () => { live = false; };
  }, [key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = state?.key === key;
  return { lines: ready ? state.lines : null, error: ready ? state.error : null, loading: !ready };
}

/** One zone's weather for a period. */
export function useZoneWeather(zone: ZoneId | null, dataId: number, from: string, to: string) {
  const key = zone ? `${zone}:${dataId}:${from}:${to}` : "";
  const [state, setState] = useState<{ key: string; day: WeatherDay | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!zone) return;
    let live = true;
    cached(wxLoads, key, () => loadZoneWeather(zone, dataId, from, to))
      .then((day) => { if (live) setState({ key, day, error: null }); })
      .catch((e) => { if (live) setState({ key, day: null, error: e?.message ?? String(e) }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !!zone && state?.key === key;
  return { day: ready ? state.day : null, error: ready ? state.error : null, loading: !!zone && !ready };
}

/** A zone's line in the Demand Forecast page's shape (MeanForecastLine): the 96-block forecast,
 *  and actual / MAPE / UDM over the blocks that have an actual (Intra-day / Day ahead: up to the
 *  last one; Week / Month: every block the period's days with actuals cover). No Roastering. */
export function toForecastLine(l: ZoneLine): MeanForecastLine | null {
  if (l.forecast.every((v) => v == null)) return null;
  // A missing forecast block takes its neighbour's value so the line stays whole.
  let last = l.forecast.find((v) => v != null) as number;
  const forecast = l.forecast.map((v) => (v == null ? last : (last = v)));
  let n = 0; l.actual.forEach((v, i) => { if (v != null) n = i + 1; });
  const part = (a: (number | null)[], fill: (i: number) => number) => (n ? a.slice(0, n).map((v, i) => v ?? fill(i)) : null);
  const actual = part(l.actual, (i) => forecast[i]);
  return {
    forecast, actual,
    mape: actual ? part(l.mape, (i) => (actual[i] ? (Math.abs(actual[i] - forecast[i]) / actual[i]) * 100 : 0)) : null,
    udm: actual ? part(l.udm, (i) => actual[i]) : null,
    roastering: null,
    periodMape: l.periodMape,
  };
}

/** One zone's line for a period (nothing loaded while `zone` is null). */
export function useZoneLine(zone: ZoneId | null, dataId: number, from: string, to: string) {
  const key = zone ? `${zone}:${dataId}:${from}:${to}` : "";
  const tick = useLiveTick(to);
  const [state, setState] = useState<{ key: string; line: MeanForecastLine | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!zone) return;
    let live = true;
    cached(lineLoads, key, () => loadZoneLine(zone, dataId, from, to))
      .then((l) => { if (live) setState({ key, line: toForecastLine(l), error: null }); })
      .catch((e) => { if (live) setState({ key, line: null, error: e?.message ?? String(e) }); });
    return () => { live = false; };
  }, [key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !!zone && state?.key === key;
  return { line: ready ? state.line : null, error: ready ? state.error : null, loading: !!zone && !ready };
}
