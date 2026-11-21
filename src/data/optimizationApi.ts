import BASE_URL from "../../BASE_URL";
import { authFetch } from "@/lib/auth";

export type OptMethod = "milp" | "iterative";
export type HorizonId = "dr" | "id" | "da" | "wk" | "mo" | "yr" | "lt";

export interface OptPlantResult {
  name: string; category: string; technology: string;
  rate_rs_kwh: number; rate_rs_mwh: number;
  dc_avg_mw: number; scheduled_mw: number;
  curtailed_mwh: number; saving_rs: number;
  decision: string; must_run: boolean;
  is_hydro?: boolean;
  dc_blocks?: number[]; sg_blocks?: number[]; sg_actual_blocks?: number[];
}

export interface OptApiResponse {
  status: string; method: string; runtime_s: number;
  horizon?: string; start_block?: number; num_blocks?: number;
  n_plants: number; plants_on: number;
  baseline_cost_rs: number; optimized_cost_rs: number;
  saving_rs: number; saving_lakh: number; saving_cr: number;
  demand: number[]; gap: number[]; buy: number[]; sell: number[];
  buy_mu: number; sell_mu: number;
  exchange: number[]; exchange_cost_rs: number;
  plants: OptPlantResult[];
  marginal_plant: OptPlantResult | null;
  date: string; location_id: number | null;
  milp_error?: string; error?: string;
}

let _method: OptMethod = "iterative";
let _cache: Record<string, OptApiResponse> = {};
let _listeners: (() => void)[] = [];

export const getOptMethod = () => _method;
export const setOptMethod = (m: OptMethod) => { _method = m; _cache = {}; _listeners.forEach(fn => fn()); };
export const onMethodChange = (fn: () => void) => { _listeners.push(fn); return () => { _listeners = _listeners.filter(f => f !== fn); }; };

// The optimization API lives on the same server as the rest (BASE_URL) and needs the login token
// (authFetch); VITE_OPTIMIZATION_API_BASE can still point it elsewhere.
const OPT_BASE = (import.meta.env.VITE_OPTIMIZATION_API_BASE || `${BASE_URL}optimization`).replace(/\/$/, "");

// The date to optimise: the last day the backend has data for (milp/config → date_range.to),
// fetched once; VITE_OPTIMIZATION_DATA_DATE overrides it.
const FALLBACK_DATE = "2026-08-31";
let _dataDate: string = import.meta.env.VITE_OPTIMIZATION_DATA_DATE || "";
let _datePromise: Promise<string> | null = null;

function ensureDataDate(): Promise<string> {
  if (_dataDate) return Promise.resolve(_dataDate);
  if (!_datePromise) {
    _datePromise = (async () => {
      try {
        const res = await authFetch(`${OPT_BASE}/milp/config`, { headers: { accept: "application/json" } });
        if (res.ok) {
          const to = (await res.json())?.date_range?.to;
          if (typeof to === "string" && to.length >= 10) _dataDate = to.slice(0, 10);
        }
      } catch { /* fall back below */ }
      if (!_dataDate) _dataDate = FALLBACK_DATE;
      return _dataDate;
    })();
  }
  return _datePromise;
}

/** Our horizon → the API's (da | id | rt | wk): Real-time → rt (next 12 h), Intra-day → id (rest of
 *  the day), everything else → da (a full day). wk is left out until the backend has the weekly
 *  hydro budgets it needs. */
export function horizonToParams(tf: HorizonId): { horizon: string; target_date: string } {
  const hMap: Partial<Record<HorizonId, string>> = { dr: "rt", id: "id" };
  return { horizon: hMap[tf] ?? "da", target_date: _dataDate || FALLBACK_DATE };
}

const _inflight = new Map<string, Promise<OptApiResponse>>();

export async function fetchOptimization(tf: HorizonId = "da", method?: OptMethod, locationId?: number): Promise<OptApiResponse> {
  const m = method ?? _method;
  await ensureDataDate();
  const { target_date, horizon } = horizonToParams(tf);
  const key = `${m}:${target_date}:${horizon}`;
  if (_cache[key]) return _cache[key];
  // The tab panel and the plant cards ask at the same time: one request between them.
  const reqKey = `${key}:${locationId ?? ""}`;
  const pending = _inflight.get(reqKey);
  if (pending) return pending;

  const params = new URLSearchParams({ target_date, horizon, force: "false" });
  if (locationId != null) params.set("location_id", String(locationId));

  const req = (async () => {
    const res = await authFetch(`${OPT_BASE}/${m}/run?${params}`, { headers: { accept: "application/json" } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(typeof err.detail === "string" ? err.detail : err.detail?.message ?? JSON.stringify(err.detail));
    }
    const data: OptApiResponse = await res.json();
    if (data.error) throw new Error(data.error);
    _cache[key] = data;
    return data;
  })().finally(() => { _inflight.delete(reqKey); });
  _inflight.set(reqKey, req);
  return req;
}

export function getCachedApiResponse(tf: HorizonId = "da", method?: OptMethod): OptApiResponse | null {
  const m = method ?? _method;
  const { target_date, horizon } = horizonToParams(tf);
  return _cache[`${m}:${target_date}:${horizon}`] ?? null;
}
