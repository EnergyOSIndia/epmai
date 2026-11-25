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
import { BLOCKS, toWeatherDay, type WeatherDay } from "@/lib/dayahead";
import type { WeatherBlocks } from "@/store/features/demandTypes";

export type ZoneId = "central" | "east" | "west";
export const ZONES: { id: ZoneId; code: "CZ" | "EZ" | "WZ"; name: string }[] = [
  { id: "east", code: "EZ", name: "East zone" },
  { id: "west", code: "WZ", name: "West zone" },
  { id: "central", code: "CZ", name: "Central zone" },
];

/** One zone's 96 blocks; a value is null where the API has none (e.g. actual for future blocks). */
export type ZoneLine = { actual: (number | null)[]; forecast: (number | null)[]; udm: (number | null)[]; mape: (number | null)[] };

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
  const line: ZoneLine = { actual: emptyCol(), forecast: emptyCol(), udm: emptyCol(), mape: emptyCol() };
  const put = (b: number, a: unknown, f: unknown, u: unknown, m: unknown) => {
    if (b < 1 || b > BLOCKS) return;
    line.actual[b - 1] = num(a); line.forecast[b - 1] = num(f); line.udm[b - 1] = num(u); line.mape[b - 1] = num(m);
  };
  if (dataId === 102100 || dataId === 102110) {
    const json = await getJson("zone-demand/data", q);
    const days = (json.data as { date: string; blocks?: DataBlock[] }[] | undefined) ?? [];
    const day = days.find((d) => d.date === from) ?? days[0];
    for (const b of day?.blocks ?? []) put(b.block, b.Actual_demand, b.Forecasted_demand, b.udm, b.mape);
  } else {
    const json = await getJson("zone-demand/average", q);
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

const lineLoads = new Map<string, Promise<ZoneLine>>();
const wxLoads = new Map<string, Promise<WeatherDay | null>>();
/** Session cache: a failed load is dropped so the next visit retries. */
function cached<T>(m: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  if (!m.has(key)) { const p = load(); p.catch(() => m.delete(key)); m.set(key, p); }
  return m.get(key)!;
}

/** All three zones' lines for a period. */
export function useZoneDemand(dataId: number, from: string, to: string) {
  const key = `${dataId}:${from}:${to}`;
  const [state, setState] = useState<{ key: string; lines: Record<ZoneId, ZoneLine> | null; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(ZONES.map((z) => cached(lineLoads, `${z.id}:${key}`, () => loadZoneLine(z.id, dataId, from, to))))
      .then((ls) => { if (live) setState({ key, lines: Object.fromEntries(ZONES.map((z, i) => [z.id, ls[i]])) as Record<ZoneId, ZoneLine>, error: null }); })
      .catch((e) => { if (live) setState({ key, lines: null, error: e?.message ?? String(e) }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = state?.key === key;
  return { lines: ready ? state.lines : null, error: ready ? state.error : null, loading: !ready };
}

/** One zone's weather for a period. */
export function useZoneWeather(zone: ZoneId, dataId: number, from: string, to: string) {
  const key = `${zone}:${dataId}:${from}:${to}`;
  const [state, setState] = useState<{ key: string; day: WeatherDay | null; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    cached(wxLoads, key, () => loadZoneWeather(zone, dataId, from, to))
      .then((day) => { if (live) setState({ key, day, error: null }); })
      .catch((e) => { if (live) setState({ key, day: null, error: e?.message ?? String(e) }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = state?.key === key;
  return { day: ready ? state.day : null, error: ready ? state.error : null, loading: !ready };
}
