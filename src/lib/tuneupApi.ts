// Thin typed client for the Demand Tuneup API (http://.../api/v1/tuneup/*). Mirrors the
// EPMS_ALL "Demand Tuneup" feature, but wired to the newer location_id-based backend that
// keeps the rule list server-side (undo/redo/apply) instead of in the browser.
// Consumed only by src/components/DemandTuneupPanel.tsx.
import BASE_URL from "../../BASE_URL";

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

// ── Reads ─────────────────────────────────────────────────────────────
export const getTuneupConfig = (locationId?: number) =>
  fetch(`${T}/config${locationId != null ? `?location_id=${locationId}` : ""}`, { headers: { accept: "application/json" } })
    .then((r) => j<TuneupConfig>(r, "Load config"));

export const getTuneupForecast = (date: string, locationId: number) =>
  fetch(`${T}/forecast?date=${encodeURIComponent(date)}&location_id=${locationId}`, { headers: { accept: "application/json" } })
    .then((r) => j<TuneupForecast>(r, "Load forecast"));

export interface SimilarDay { date: string; score: number; per_block?: number[] }
export const getSimilarDays = (date: string, locationId: number, weatherLocationId: string, daysBack = 60, topN = 8) =>
  fetch(`${T}/similar-days?date=${encodeURIComponent(date)}&location_id=${locationId}&weather_location_id=${encodeURIComponent(weatherLocationId)}&days_back=${daysBack}&top_n=${topN}`, { headers: { accept: "application/json" } })
    .then((r) => j<{ similar_days: SimilarDay[] }>(r, "Load similar days"));

export interface WeatherMulti {
  date: string;
  ref_date: string | null;
  location_id: number;
  locations: Record<string, { current: Record<string, BlockMap>; reference: Record<string, BlockMap> | null }>;
}
export const getWeatherMulti = (date: string, locationId: number, weatherLocationId?: string, refDate?: string) =>
  fetch(`${T}/weather-multi?date=${encodeURIComponent(date)}&location_id=${locationId}${weatherLocationId ? `&weather_location_id=${encodeURIComponent(weatherLocationId)}` : ""}${refDate ? `&ref_date=${encodeURIComponent(refDate)}` : ""}`, { headers: { accept: "application/json" } })
    .then((r) => j<WeatherMulti>(r, "Load weather"));

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
  fetch(`${T}/rules?${ruleQS(locationId, date)}`, { headers: { accept: "application/json" } })
    .then((r) => j<RulesResponse>(r, "Load rules"));

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
