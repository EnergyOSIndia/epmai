import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type {
    ApplyRequest,
    EnsembleRequest,
    ManualForecastRequest,
    ModifiedResult,
    RuleIn,
    RuleScope,
    RulesResponse,
    SetLineRequest,
    SimilarDay,
    SimilarDaysApiResponse,
    TuneupConfig,
    TuneupForecast,
    TuneupState,
    WeatherMulti,
} from "../features/tuneupTypes";
import BASE_URL from '../../../BASE_URL'
import { idbGet, idbSet } from "@/lib/idbCache";

// Demand Tuneup API (tuneup/*) — the location_id-based backend that keeps the rule list
// server-side (undo/redo/apply). Used by src/components/DemandTuneupPanel.tsx.

const initialState: TuneupState = {
    config: null,
    forecasts: {},
    rules: {},
    similarDays: {},
    weather: {},
};

const T = `${BASE_URL}tuneup`;
const JSON_HEADERS = { "Content-Type": "application/json", accept: "application/json" };
const CONFIG_IDB = "tuneup-config";

/** The six actions the backend actually applies (Add/Multiply/Average/Shift_Left/Shift_Right/Smooth). */
export const TUNEUP_ACTIONS = ["Add", "Multiply", "Average", "Shift_Left", "Shift_Right", "Smooth"] as const;
export type TuneupAction = (typeof TUNEUP_ACTIONS)[number];

/** Today as the tuneup tab uses it (yyyy-mm-dd). */
export const tuneupToday = () => new Date().toISOString().split("T")[0];
/** Location used before the config has ever loaded (the API's selected location). */
export const DEFAULT_TUNEUP_LOCATION = 10030;

// Keys of the remembered answers in the state.
export const forecastKey = (date: string, location_id: number) => `${date}:${location_id}`;
export const rulesKey = ({ location_id, date }: RuleScope) => `${location_id}:${date}`;
export const similarKey = (date: string, location_id: number, weather_location_id: string) => `${date}:${location_id}:${weather_location_id}`;
export const weatherKey = (date: string, location_id: number, weather_location_id?: string, ref_date?: string) =>
    `${date}:${location_id}:${weather_location_id ?? ""}:${ref_date ?? ""}`;

async function json<R>(res: Response, what: string): Promise<R> {
    if (!res.ok) {
        let detail = res.statusText;
        try {
            const body = await res.json();
            detail = body?.detail ? JSON.stringify(body.detail) : detail;
        } catch { /* non-JSON error body — keep statusText */ }
        throw new Error(`${what} failed (${res.status}): ${detail}`);
    }
    return res.json() as Promise<R>;
}

// One request per read at a time: a second dispatch while the first is running shares its answer.
const inflight = new Map<string, Promise<unknown>>();
function once<R>(key: string, load: () => Promise<R>): Promise<R> {
    const running = inflight.get(key) as Promise<R> | undefined;
    if (running) return running;
    const p = load().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
}

const get = <R>(path: string, what: string) =>
    fetch(`${T}/${path}`, { headers: { accept: "application/json" } }).then((r) => json<R>(r, what));
const send = <R>(method: "POST" | "PUT" | "DELETE", path: string, what: string, body?: unknown) =>
    fetch(`${T}/${path}`, { method, headers: body === undefined ? { accept: "application/json" } : JSON_HEADERS, body: body === undefined ? undefined : JSON.stringify(body) })
        .then((r) => json<R>(r, what));
const ruleQS = ({ location_id, date }: RuleScope) => `location_id=${location_id}&date=${encodeURIComponent(date)}`;

// ── Reads ─────────────────────────────────────────────────────────────

// 1. Config. Also saved in IndexedDB, so the first open after a reload needn't wait ≈3 s for it.
export const fetchTuneupConfig = createAsyncThunk<TuneupConfig, void>(
    "tuneup/fetchTuneupConfig",
    () => once("config", async () => {
        const c = await get<TuneupConfig>("config", "Load config");
        idbSet(CONFIG_IDB, c).catch(() => {});
        return c;
    }),
);

// 1b. The config saved in IndexedDB (null when there is none), without calling the API.
export const fetchSavedTuneupConfig = createAsyncThunk<TuneupConfig | null, void>(
    "tuneup/fetchSavedTuneupConfig",
    async () => { try { return (await idbGet<TuneupConfig>(CONFIG_IDB)) ?? null; } catch { return null; } },
);

// 2. Forecast: every model's 96 blocks for a date (System, Manual …).
export const fetchTuneupForecast = createAsyncThunk<TuneupForecast, { date: string; location_id: number }>(
    "tuneup/fetchTuneupForecast",
    ({ date, location_id }) => once(`forecast:${forecastKey(date, location_id)}`, () =>
        get<TuneupForecast>(`forecast?date=${encodeURIComponent(date)}&location_id=${location_id}`, "Load forecast")),
);

// 3. Similar days to a date, matched on a weather location's weather.
export const fetchSimilarDays = createAsyncThunk<
    SimilarDay[],
    { date: string; location_id: number; weather_location_id: string; days_back?: number; top_n?: number }
>("tuneup/fetchSimilarDays", ({ date, location_id, weather_location_id, days_back = 60, top_n = 8 }) =>
    once(`similar:${similarKey(date, location_id, weather_location_id)}`, async () => {
        const r = await get<SimilarDaysApiResponse>(
            `similar-days?date=${encodeURIComponent(date)}&location_id=${location_id}&weather_location_id=${encodeURIComponent(weather_location_id)}&days_back=${days_back}&top_n=${top_n}`,
            "Load similar days",
        );
        return r.similar_days ?? [];
    }),
);

// 4. Weather for the date, plus a reference day when `ref_date` is given.
export const fetchTuneupWeather = createAsyncThunk<
    WeatherMulti,
    { date: string; location_id: number; weather_location_id?: string; ref_date?: string }
>("tuneup/fetchTuneupWeather", ({ date, location_id, weather_location_id, ref_date }) =>
    once(`weather:${weatherKey(date, location_id, weather_location_id, ref_date)}`, () => get<WeatherMulti>(
        `weather-multi?date=${encodeURIComponent(date)}&location_id=${location_id}${weather_location_id ? `&weather_location_id=${encodeURIComponent(weather_location_id)}` : ""}${ref_date ? `&ref_date=${encodeURIComponent(ref_date)}` : ""}`,
        "Load weather",
    )),
);

// 5. The rule list (and undo / redo history) for a location and date.
export const fetchTuneupRules = createAsyncThunk<RulesResponse, RuleScope>(
    "tuneup/fetchTuneupRules",
    (scope) => once(`rules:${rulesKey(scope)}`, () => get<RulesResponse>(`rules?${ruleQS(scope)}`, "Load rules")),
);

// ── Control tab writes ────────────────────────────────────────────────

// 6. Preview an adjustment (Change) — nothing is saved.
export const postSetline = createAsyncThunk<ModifiedResult, SetLineRequest>(
    "tuneup/postSetline",
    (payload) => send<ModifiedResult>("POST", "setline", "Apply adjustment", payload),
);

// 7. Save a Manual Forecast line (Update).
export const postManualForecast = createAsyncThunk<unknown, ManualForecastRequest>(
    "tuneup/postManualForecast",
    (payload) => send<unknown>("POST", "manual-forecast", "Save forecast", payload),
);

// 8. Reset the Manual Forecast back to System (saved).
export const postReset = createAsyncThunk<unknown, { date: string; location_id: number }>(
    "tuneup/postReset",
    (payload) => send<unknown>("POST", "reset", "Reset forecast", payload),
);

// 9. Build an ensemble forecast from reference days (Forecast) — a preview.
export const postEnsemble = createAsyncThunk<ModifiedResult, EnsembleRequest>(
    "tuneup/postEnsemble",
    (payload) => send<ModifiedResult>("POST", "ensemble-forecast", "Build ensemble", payload),
);

// ── Rules tab writes (server-side rule engine); each returns the new rule list ──

export const addTuneupRule = createAsyncThunk<RulesResponse, RuleScope & { rule: RuleIn }>(
    "tuneup/addTuneupRule",
    ({ rule, ...scope }) => send<RulesResponse>("POST", `rules?${ruleQS(scope)}`, "Add rule", rule),
);

export const updateTuneupRule = createAsyncThunk<RulesResponse, RuleScope & { rule_id: string; patch: Partial<RuleIn> }>(
    "tuneup/updateTuneupRule",
    ({ rule_id, patch, ...scope }) => send<RulesResponse>("PUT", `rules/${encodeURIComponent(rule_id)}?${ruleQS(scope)}`, "Edit rule", patch),
);

export const deleteTuneupRule = createAsyncThunk<RulesResponse, RuleScope & { rule_id: string }>(
    "tuneup/deleteTuneupRule",
    ({ rule_id, ...scope }) => send<RulesResponse>("DELETE", `rules/${encodeURIComponent(rule_id)}?${ruleQS(scope)}`, "Delete rule"),
);

export const clearTuneupRules = createAsyncThunk<RulesResponse, RuleScope>(
    "tuneup/clearTuneupRules",
    (scope) => send<RulesResponse>("DELETE", `rules?${ruleQS(scope)}`, "Clear rules"),
);

export const reorderTuneupRules = createAsyncThunk<RulesResponse, RuleScope & { ordered_ids: string[] }>(
    "tuneup/reorderTuneupRules",
    ({ ordered_ids, ...scope }) => send<RulesResponse>("POST", `rules/reorder?${ruleQS(scope)}`, "Reorder rules", { ordered_ids }),
);

export const undoTuneupRules = createAsyncThunk<RulesResponse, RuleScope>(
    "tuneup/undoTuneupRules",
    (scope) => send<RulesResponse>("POST", `undo?${ruleQS(scope)}`, "Undo"),
);

export const redoTuneupRules = createAsyncThunk<RulesResponse, RuleScope>(
    "tuneup/redoTuneupRules",
    (scope) => send<RulesResponse>("POST", `redo?${ruleQS(scope)}`, "Redo"),
);

// Apply all enabled rules — a preview.
export const postApply = createAsyncThunk<ModifiedResult, ApplyRequest>(
    "tuneup/postApply",
    (payload) => send<ModifiedResult>("POST", "apply", "Apply rules", payload),
);

const ruleWrites = [addTuneupRule, updateTuneupRule, deleteTuneupRule, clearTuneupRules, reorderTuneupRules, undoTuneupRules, redoTuneupRules];

export const tuneupSlice = createSlice({
    name: "tuneup",
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        // Config: the saved copy only until the API's arrives.
        builder
            .addCase(fetchSavedTuneupConfig.fulfilled, (state, action) => {
                if (!state.config && action.payload) state.config = action.payload;
            })
            .addCase(fetchTuneupConfig.fulfilled, (state, action) => {
                state.config = action.payload;
            });

        // Reads: remember the latest answer per request.
        builder
            .addCase(fetchTuneupForecast.fulfilled, (state, action) => {
                state.forecasts[forecastKey(action.meta.arg.date, action.meta.arg.location_id)] = action.payload;
            })
            .addCase(fetchSimilarDays.fulfilled, (state, action) => {
                const a = action.meta.arg;
                state.similarDays[similarKey(a.date, a.location_id, a.weather_location_id)] = action.payload;
            })
            .addCase(fetchTuneupWeather.fulfilled, (state, action) => {
                const a = action.meta.arg;
                state.weather[weatherKey(a.date, a.location_id, a.weather_location_id, a.ref_date)] = action.payload;
            })
            .addCase(fetchTuneupRules.fulfilled, (state, action) => {
                state.rules[rulesKey(action.meta.arg)] = action.payload;
            });

        // Rule writes return the new list — keep it as the remembered one for that date.
        for (const thunk of ruleWrites) {
            builder.addCase(thunk.fulfilled, (state, action) => {
                const { location_id, date } = action.meta.arg as RuleScope;
                state.rules[rulesKey({ location_id, date })] = action.payload;
            });
        }
    },
});

export default tuneupSlice.reducer;
