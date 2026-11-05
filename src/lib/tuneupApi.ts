// Thin typed client for the Demand Tuneup API (http://.../api/v1/tuneup/*). Mirrors the
// EPMS_ALL "Demand Tuneup" feature, but wired to the newer location_id-based backend that
// keeps the rule list server-side (undo/redo/apply) instead of in the browser.
// Consumed only by src/components/DemandTuneupPanel.tsx.
import BASE_URL from "../../BASE_URL";
import { idbGet, idbSet } from "@/lib/idbCache";

/** Blocks are 1..96, keyed as strings by the API; values may be null when unknown. */
export type BlockMap = Record<string, number | null>;

export interface ModelStats {
  peak: number;
  min: number;
  avg: number;
  offpeak: number;
  energy_mwh: number;
}

export interface TuneupConfig {
  locations: number[];
  weather_locations: string[];
  selected_location: number;
  models: string[];
  date_range: { min: string; max: string };
  weather_weights: Record<string, number>;
}

export interface TuneupForecast {
  date: string;
  location_id: number;
  models: Record<string, BlockMap>;
  available_models: string[];
  model_stats: Record<string, ModelStats>;
  mape: Record<string, number>;
  actual: BlockMap | null;
  roastering: BlockMap | null;
  ensemble: BlockMap | null;
  ensemble_stats: ModelStats | null;
}

/** The six actions the backend actually applies (Add/Multiply/Average/Shift_Left/Shift_Right/Smooth). */
export const TUNEUP_ACTIONS = ["Add", "Multiply", "Average", "Shift_Left", "Shift_Right", "Smooth"] as const;
export type TuneupAction = (typeof TUNEUP_ACTIONS)[number];

export interface RuleIn {
  from_block: number;
  to_block: number;
  action: string;
  from_value: number;
  to_value: number;
  ref_date?: string | null;
  enabled?: boolean;
}

/** A rule as the server returns it — RuleIn plus an id the edit/delete/reorder endpoints key on. */
export interface Rule extends RuleIn {
  id: string;
  enabled: boolean;
}

export interface RuleHistory {
  undo_count: number;
  redo_count: number;
  can_undo: boolean;
  can_redo: boolean;
  last_label: string | null;
}

export interface RulesResponse {
  rules: Rule[];
  history: RuleHistory;
}

/** /setline and /apply both return the recomputed 96-block line plus stats + a single MAPE number. */
export interface ModifiedResult {
  modified: BlockMap;
  stats: ModelStats | null;
  mape: number | null;
  rules_applied?: number;
  rules_total?: number;
  history?: RuleHistory;
}

const T = `${BASE_URL}tuneup`;
const JSON_HEADERS = { "Content-Type": "application/json", accept: "application/json" };

async function j<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ? JSON.stringify(body.detail) : detail;
    } catch { /* non-JSON error body — keep statusText */ }
    throw new Error(`${what} failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

// ── Speed: the tuneup API is slow (config ≈3 s, forecast ≈2.5 s), so reads are remembered ──
// In memory: the last answer per request, shown at once when the tab opens again while a fresh
// copy loads quietly (`peek…` + the normal call). Config is also kept in IndexedDB, so even the
// first open after a reload starts without waiting for it. `prefetchTuneup` (run at app start)
// warms config and today's forecast, rules, similar days and weather before the tab is opened.
const mem = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
/** One request per key at a time; the answer is remembered in `mem`. */
function remembered<R>(key: string, load: () => Promise<R>): Promise<R> {
  const running = inflight.get(key) as Promise<R> | undefined;
  if (running) return running;
  const p = load().then((v) => { mem.set(key, v); return v; }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
const peekKey = <R>(key: string) => mem.get(key) as R | undefined;

/** Today as the tuneup tab uses it (yyyy-mm-dd). */
export const tuneupToday = () => new Date().toISOString().split("T")[0];
/** Location used before the config has ever loaded (the API's selected location). */
export const DEFAULT_TUNEUP_LOCATION = 10030;

// ── Reads ─────────────────────────────────────────────────────────────
const CONFIG_IDB = "tuneup-config";
export const getTuneupConfig = (locationId?: number) =>
  remembered(`config:${locationId ?? ""}`, () =>
    fetch(`${T}/config${locationId != null ? `?location_id=${locationId}` : ""}`, { headers: { accept: "application/json" } })
      .then((r) => j<TuneupConfig>(r, "Load config"))
      .then((c) => { if (locationId == null) idbSet(CONFIG_IDB, c).catch(() => {}); return c; }));
/** The config seen last (memory, else IndexedDB), without calling the API. */
export async function peekTuneupConfig(): Promise<TuneupConfig | undefined> {
  const m = peekKey<TuneupConfig>("config:");
  if (m) return m;
  try { return await idbGet<TuneupConfig>(CONFIG_IDB); } catch { return undefined; }
}

const forecastKey = (date: string, locationId: number) => `forecast:${date}:${locationId}`;
export const getTuneupForecast = (date: string, locationId: number) =>
  remembered(forecastKey(date, locationId), () =>
    fetch(`${T}/forecast?date=${encodeURIComponent(date)}&location_id=${locationId}`, { headers: { accept: "application/json" } })
      .then((r) => j<TuneupForecast>(r, "Load forecast")));
export const peekTuneupForecast = (date: string, locationId: number) => peekKey<TuneupForecast>(forecastKey(date, locationId));

export interface SimilarDay { date: string; score: number; per_block?: number[] }
export const peekSimilarDays = (date: string, locationId: number, weatherLocationId: string) =>
  peekKey<{ similar_days: SimilarDay[] }>(`similar:${date}:${locationId}:${weatherLocationId}`);
export const getSimilarDays = (date: string, locationId: number, weatherLocationId: string, daysBack = 60, topN = 8) =>
  remembered(`similar:${date}:${locationId}:${weatherLocationId}`, () => fetch(`${T}/similar-days?date=${encodeURIComponent(date)}&location_id=${locationId}&weather_location_id=${encodeURIComponent(weatherLocationId)}&days_back=${daysBack}&top_n=${topN}`, { headers: { accept: "application/json" } })
    .then((r) => j<{ similar_days: SimilarDay[] }>(r, "Load similar days")));

export interface WeatherMulti {
  date: string;
  ref_date: string | null;
  location_id: number;
  locations: Record<string, { current: Record<string, BlockMap>; reference: Record<string, BlockMap> | null }>;
}
export const peekWeatherMulti = (date: string, locationId: number, weatherLocationId?: string, refDate?: string) =>
  peekKey<WeatherMulti>(`wx:${date}:${locationId}:${weatherLocationId ?? ""}:${refDate ?? ""}`);
export const getWeatherMulti = (date: string, locationId: number, weatherLocationId?: string, refDate?: string) =>
  remembered(`wx:${date}:${locationId}:${weatherLocationId ?? ""}:${refDate ?? ""}`, () => fetch(`${T}/weather-multi?date=${encodeURIComponent(date)}&location_id=${locationId}${weatherLocationId ? `&weather_location_id=${encodeURIComponent(weatherLocationId)}` : ""}${refDate ? `&ref_date=${encodeURIComponent(refDate)}` : ""}`, { headers: { accept: "application/json" } })
    .then((r) => j<WeatherMulti>(r, "Load weather")));

// ── Control tab writes ────────────────────────────────────────────────
export interface SetLineRequest {
  date: string;
  location_id: number;
  base_model: string;
  rules: RuleIn[];
  edit_blocks?: Record<string, number> | null;
  enabled_blocks?: Record<string, boolean> | null;
}
export const postSetline = (payload: SetLineRequest) =>
  fetch(`${T}/setline`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) })
    .then((r) => j<ModifiedResult>(r, "Apply adjustment"));

/** Persist a manual forecast line to BigQuery (the Control-tab "Update" button). */
export const postManualForecast = (payload: { date: string; location_id: number; blocks: Record<string, number> }) =>
  fetch(`${T}/manual-forecast`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) })
    .then((r) => j<unknown>(r, "Save forecast"));

/** Reset the manual forecast back to system values (persisted). */
export const postReset = (payload: { date: string; location_id: number }) =>
  fetch(`${T}/reset`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) })
    .then((r) => j<unknown>(r, "Reset forecast"));

export interface EnsembleRequest {
  date: string;
  location_id: number;
  ref_dates: Record<string, number>;
  mpe_factor?: number;
  top_n?: number;
}
export const postEnsemble = (payload: EnsembleRequest) =>
  fetch(`${T}/ensemble-forecast`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) })
    .then((r) => j<ModifiedResult>(r, "Build ensemble"));

// ── Rules tab (server-side rule engine) ───────────────────────────────
const ruleQS = (locationId: number, date: string) => `location_id=${locationId}&date=${encodeURIComponent(date)}`;

export const getRules = (locationId: number, date: string) =>
  remembered(`rules:${locationId}:${date}`, () =>
    fetch(`${T}/rules?${ruleQS(locationId, date)}`, { headers: { accept: "application/json" } })
      .then((r) => j<RulesResponse>(r, "Load rules")));
export const peekRules = (locationId: number, date: string) => peekKey<RulesResponse>(`rules:${locationId}:${date}`);

export const addRule = (locationId: number, date: string, rule: RuleIn) =>
  fetch(`${T}/rules?${ruleQS(locationId, date)}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(rule) })
    .then((r) => j<RulesResponse>(r, "Add rule"));

export const updateRule = (ruleId: string, locationId: number, date: string, patch: Partial<RuleIn>) =>
  fetch(`${T}/rules/${encodeURIComponent(ruleId)}?${ruleQS(locationId, date)}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(patch) })
    .then((r) => j<RulesResponse>(r, "Edit rule"));

export const deleteRule = (ruleId: string, locationId: number, date: string) =>
  fetch(`${T}/rules/${encodeURIComponent(ruleId)}?${ruleQS(locationId, date)}`, { method: "DELETE", headers: { accept: "application/json" } })
    .then((r) => j<RulesResponse>(r, "Delete rule"));

export const clearRules = (locationId: number, date: string) =>
  fetch(`${T}/rules?${ruleQS(locationId, date)}`, { method: "DELETE", headers: { accept: "application/json" } })
    .then((r) => j<RulesResponse>(r, "Clear rules"));

export const reorderRules = (locationId: number, date: string, orderedIds: string[]) =>
  fetch(`${T}/rules/reorder?${ruleQS(locationId, date)}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ ordered_ids: orderedIds }) })
    .then((r) => j<RulesResponse>(r, "Reorder rules"));

export const undoRules = (locationId: number, date: string) =>
  fetch(`${T}/undo?${ruleQS(locationId, date)}`, { method: "POST", headers: { accept: "application/json" } })
    .then((r) => j<RulesResponse>(r, "Undo"));

export const redoRules = (locationId: number, date: string) =>
  fetch(`${T}/redo?${ruleQS(locationId, date)}`, { method: "POST", headers: { accept: "application/json" } })
    .then((r) => j<RulesResponse>(r, "Redo"));

export interface ApplyRequest {
  date: string;
  location_id: number;
  base_model: string;
  edit_blocks?: Record<string, number> | null;
  enabled_blocks?: Record<string, boolean> | null;
}
export const postApply = (payload: ApplyRequest) =>
  fetch(`${T}/apply`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) })
    .then((r) => j<ModifiedResult>(r, "Apply rules"));

/** Warm the tab before it is opened: config, then today's forecast, rules, similar days and
 *  weather for the selected location. Errors are ignored — the tab loads normally then. */
export function prefetchTuneup(): void {
  const date = tuneupToday();
  getTuneupForecast(date, DEFAULT_TUNEUP_LOCATION).catch(() => {});
  getRules(DEFAULT_TUNEUP_LOCATION, date).catch(() => {});
  getTuneupConfig().then((c) => {
    const loc = c.selected_location ?? c.locations[0] ?? DEFAULT_TUNEUP_LOCATION;
    const city = c.weather_locations[0];
    if (loc !== DEFAULT_TUNEUP_LOCATION) { getTuneupForecast(date, loc).catch(() => {}); getRules(loc, date).catch(() => {}); }
    if (city) { getSimilarDays(date, loc, city).catch(() => {}); getWeatherMulti(date, loc, city).catch(() => {}); }
  }).catch(() => {});
}
// Start as soon as the app has loaded (idle), so opening Demand Tune up doesn't wait on the API.
if (typeof window !== "undefined") {
  const start = () => prefetchTuneup();
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(start, { timeout: 2000 }); else setTimeout(start, 800);
}
