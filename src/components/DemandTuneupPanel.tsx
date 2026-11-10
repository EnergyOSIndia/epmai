// Demand Tuneup — a functional port of EPMS_ALL's "Demand Tuneup" tab, wired to the
// /api/v1/tuneup/* backend (see src/lib/tuneupApi.ts). Layout mirrors the reference:
//   • Left:  the 96-Block Forecast chart (Highcharts): System + saved Manual Forecast, and the
//            dashed preview of a Change.
//   • Right: a date control, then Weather / Rules / Control tabs.
// Control builds a single-rule adjustment (Change = preview, Update = persist); Rules is the
// server-side rule engine (add/edit/reorder/undo/redo/apply); Weather shows similar-day
// matching and per-location weather. Shown on Demand's "Demand Tune up" cell page.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chart, type ChartOptions } from "@highcharts/react";
import "@highcharts/react/options/Exporting";
import {
  ArrowDown, ArrowUp, Info, Loader2, Plus, Redo2, RotateCw, Trash2, Undo2, Zap,
} from "lucide-react";
import { cityOf, useWeather } from "@/lib/dayahead";
import { WeatherCard } from "@/components/dayahead/WeatherCard";
import type { TfId } from "@/data/engine";
import { store } from "@/store/store";
import type {
  ApplyRequest, BlockMap, EnsembleRequest, ManualForecastRequest, ModelStats, Rule, RuleHistory, RuleIn, SetLineRequest,
  SimilarDay, TuneupConfig, TuneupForecast, WeatherMulti,
} from "@/store/features/tuneupTypes";
import {
  DEFAULT_TUNEUP_LOCATION, TUNEUP_ACTIONS, addTuneupRule, clearTuneupRules, deleteTuneupRule, fetchSavedTuneupConfig,
  fetchSimilarDays, fetchTuneupConfig, fetchTuneupForecast, fetchTuneupRules, fetchTuneupWeather, forecastKey,
  postApply as postApplyThunk, postEnsemble as postEnsembleThunk, postManualForecast as postManualForecastThunk,
  postReset as postResetThunk, postSetline as postSetlineThunk, redoTuneupRules, reorderTuneupRules, rulesKey,
  similarKey, tuneupToday, undoTuneupRules, updateTuneupRule, weatherKey,
} from "@/store/slice/tuneupApiSlice";

// ── tuneup API, through the tuneup slice (store/slice/tuneupApiSlice.ts) ──
// Each call dispatches the slice's thunk and returns its answer; `peek…` read the answer the
// slice remembered last, shown at once while a fresh copy loads (the API is slow).
const run = store.dispatch;
const tuneup = () => store.getState().tuneup;
const getTuneupConfig = () => run(fetchTuneupConfig()).unwrap();
const peekTuneupConfig = async (): Promise<TuneupConfig | undefined> =>
  tuneup().config ?? (await run(fetchSavedTuneupConfig()).unwrap()) ?? undefined;
const getTuneupForecast = (date: string, location_id: number) => run(fetchTuneupForecast({ date, location_id })).unwrap();
const peekTuneupForecast = (date: string, location_id: number): TuneupForecast | undefined => tuneup().forecasts[forecastKey(date, location_id)];
const getRules = (location_id: number, date: string) => run(fetchTuneupRules({ location_id, date })).unwrap();
const peekRules = (location_id: number, date: string) => tuneup().rules[rulesKey({ location_id, date })];
const getSimilarDays = async (date: string, location_id: number, weather_location_id: string) =>
  ({ similar_days: await run(fetchSimilarDays({ date, location_id, weather_location_id })).unwrap() });
const peekSimilarDays = (date: string, location_id: number, weather_location_id: string) => {
  const d = tuneup().similarDays[similarKey(date, location_id, weather_location_id)];
  return d ? { similar_days: d } : undefined;
};
const getWeatherMulti = (date: string, location_id: number, weather_location_id?: string, ref_date?: string) =>
  run(fetchTuneupWeather({ date, location_id, weather_location_id, ref_date })).unwrap();
const peekWeatherMulti = (date: string, location_id: number, weather_location_id?: string, ref_date?: string): WeatherMulti | undefined =>
  tuneup().weather[weatherKey(date, location_id, weather_location_id, ref_date)];
const postSetline = (payload: SetLineRequest) => run(postSetlineThunk(payload)).unwrap();
const postManualForecast = (payload: ManualForecastRequest) => run(postManualForecastThunk(payload)).unwrap();
const postReset = (payload: { date: string; location_id: number }) => run(postResetThunk(payload)).unwrap();
const postEnsemble = (payload: EnsembleRequest) => run(postEnsembleThunk(payload)).unwrap();
const postApply = (payload: ApplyRequest) => run(postApplyThunk(payload)).unwrap();
const addRule = (location_id: number, date: string, rule: RuleIn) => run(addTuneupRule({ location_id, date, rule })).unwrap();
const updateRule = (rule_id: string, location_id: number, date: string, patch: Partial<RuleIn>) =>
  run(updateTuneupRule({ rule_id, location_id, date, patch })).unwrap();
const deleteRule = (rule_id: string, location_id: number, date: string) => run(deleteTuneupRule({ rule_id, location_id, date })).unwrap();
const clearRules = (location_id: number, date: string) => run(clearTuneupRules({ location_id, date })).unwrap();
const reorderRules = (location_id: number, date: string, ordered_ids: string[]) =>
  run(reorderTuneupRules({ location_id, date, ordered_ids })).unwrap();
const undoRules = (location_id: number, date: string) => run(undoTuneupRules({ location_id, date })).unwrap();
const redoRules = (location_id: number, date: string) => run(redoTuneupRules({ location_id, date })).unwrap();

/** Warm the tab before it is opened: config, then today's forecast, rules, similar days and
 *  weather for the selected location. Errors are ignored — the tab loads normally then. */
function prefetchTuneup(): void {
  const date = tuneupToday();
  getTuneupForecast(date, DEFAULT_TUNEUP_LOCATION).catch(() => {});
  getRules(DEFAULT_TUNEUP_LOCATION, date).catch(() => {});
  getTuneupConfig().then((cfg) => {
    const loc = cfg.selected_location ?? cfg.locations[0] ?? DEFAULT_TUNEUP_LOCATION;
    const city = cfg.weather_locations[0];
    if (loc !== DEFAULT_TUNEUP_LOCATION) { getTuneupForecast(date, loc).catch(() => {}); getRules(loc, date).catch(() => {}); }
    if (city) { getSimilarDays(date, loc, city).catch(() => {}); getWeatherMulti(date, loc, city).catch(() => {}); }
  }).catch(() => {});
}
// Start as soon as the app has loaded (idle), so opening Demand Tune up doesn't wait on the API.
if (typeof window !== "undefined") {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(prefetchTuneup, { timeout: 2000 }); else setTimeout(prefetchTuneup, 800);
}

const SYS_COLOR = "#0f766e"; // teal — System Forecast
const MOD_COLOR = "#7c3aed"; // purple — Preview of a Change (dashed, not saved yet)
const MAN_COLOR = "#f59e0b"; // orange — Manual Forecast (saved; starts equal to System)

const blockTime = (b: number) => {
  const m = (b - 1) * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/** Drop null entries so a BlockMap can be sent as the manual-forecast body. */
const numericBlocks = (m: BlockMap): Record<string, number> =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => v != null)) as Record<string, number>;

type ChartRow = { i: number; system: number | null; manual: number | null; modified: number | null };

const inputCls = "h-8 w-full rounded-md border bg-card px-2 text-center text-sm font-semibold tabular-nums";
const selectCls = "h-8 w-full rounded-md border bg-card px-2 text-center text-sm font-semibold";
const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-[13px] font-medium text-foreground/80">{label}</span>
      <span className="w-36 shrink-0">{children}</span>
    </label>
  );
}

const TABS = ["Weather", "Rules", "Control"] as const;
type Tab = (typeof TABS)[number];

export function DemandTuneupPanel({ tf }: { tf: TfId }) {
  void tf; // tuneup keeps its own date control; horizon is informational only here.

  // ── config / selection ──────────────────────────────────────────────
  const [config, setConfig] = useState<TuneupConfig | null>(null);
  const [locationId, setLocationId] = useState<number | null>(DEFAULT_TUNEUP_LOCATION);
  const [model, setModel] = useState<string>("System");
  const [date, setDate] = useState<string>(tuneupToday);
  const [appliedDate, setAppliedDate] = useState<string>(tuneupToday);

  // ── forecast data ───────────────────────────────────────────────────
  const [forecast, setForecast] = useState<TuneupForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── the Modified overlay (from setline / apply / ensemble) ──────────
  const [modified, setModified] = useState<BlockMap | null>(null);
  const [, setModStats] = useState<ModelStats | null>(null);
  const [, setModMape] = useState<number | null>(null);
  const [, setModCommitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [tab, setTab] = useState<Tab>("Control");

  // ── Control-tab form ────────────────────────────────────────────────
  const [adjust, setAdjust] = useState("Yes");
  const [preBlocks, setPreBlocks] = useState(5);
  const [postBlocks, setPostBlocks] = useState(5);
  const [fromBlock, setFromBlock] = useState(1);
  const [toBlock, setToBlock] = useState(96);
  const [action, setAction] = useState<string>("Add");
  const [fromValue, setFromValue] = useState(100);
  const [toValue, setToValue] = useState(100);
  const [refDate, setRefDate] = useState("");
  const [mpex, setMpex] = useState(1);

  // ── Rules tab (server-backed) ───────────────────────────────────────
  const [rules, setRules] = useState<Rule[]>([]);
  const [history, setHistory] = useState<RuleHistory | null>(null);
  const [nrFrom, setNrFrom] = useState(1);
  const [nrTo, setNrTo] = useState(96);
  const [nrAction, setNrAction] = useState<string>("Add");
  const [nrFromV, setNrFromV] = useState(100);
  const [nrToV, setNrToV] = useState(100);
  const [nrRef, setNrRef] = useState("");

  // ── Weather tab ─────────────────────────────────────────────────────
  const [weatherCity, setWeatherCity] = useState<string>("");
  const [similarDays, setSimilarDays] = useState<SimilarDay[]>([]);
  const [refDates, setRefDates] = useState<string[]>([]);

  const flash = useCallback((kind: "ok" | "err", text: string) => setNotice({ kind, text }), []);
  const resetMod = useCallback(() => { setModified(null); setModStats(null); setModMape(null); setModCommitted(false); }, []);

  // Config: the remembered copy at once (memory / IndexedDB), then the API's. The forecast doesn't
  // wait for it — it starts on the default location, which the config confirms or changes.
  useEffect(() => {
    let alive = true;
    const apply = (c: TuneupConfig) => {
      if (!alive) return;
      setConfig(c);
      const loc = c.selected_location ?? c.locations[0];
      if (loc != null) setLocationId((prev) => (prev === DEFAULT_TUNEUP_LOCATION ? loc : prev ?? loc));
      setModel((prev) => (c.models.includes(prev) ? prev : c.models[0] ?? "System"));
      setWeatherCity((prev) => prev || c.weather_locations[0] || "");
    };
    peekTuneupConfig().then((c) => c && apply(c));
    getTuneupConfig().then(apply).catch((e) => alive && setError(String(e.message ?? e)));
    return () => { alive = false; };
  }, []);

  // Load forecast + rules + similar-days whenever the applied date / location changes.
  // A remembered answer for this date / location shows at once; the API's fresh one replaces it.
  const loadSeq = useRef(0);
  const loadForecast = useCallback((loc: number, d: string) => {
    const seq = ++loadSeq.current;
    setError(null); resetMod();
    const seen = peekTuneupForecast(d, loc), seenRules = peekRules(loc, d);
    if (seen) {
      setForecast(seen); setAppliedDate(d);
      if (seenRules) { setRules(seenRules.rules ?? []); setHistory(seenRules.history ?? null); }
    }
    setLoading(!seen);
    Promise.all([
      getTuneupForecast(d, loc),
      getRules(loc, d).catch(() => ({ rules: [], history: null })),
    ])
      .then(([fc, rr]) => {
        if (seq !== loadSeq.current) return;
        setForecast(fc);
        setModel((prev) => (fc.available_models.includes(prev) ? prev : fc.available_models[0] ?? prev));
        setRules(rr.rules ?? []);
        setHistory(rr.history ?? null);
        setAppliedDate(d);
      })
      .catch((e) => { if (seq !== loadSeq.current) return; if (!seen) setForecast(null); setError(String(e.message ?? e)); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  }, [resetMod]);

  useEffect(() => { if (locationId != null) loadForecast(locationId, appliedDate); }, [locationId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Picking a date loads it straight away.
  useEffect(() => { if (locationId != null && date !== appliedDate) loadForecast(locationId, date); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-read the forecast after Update / Reset without the loading skeleton, so the Manual line
  // shows exactly what the API saved (and what reopening the page will show).
  const refreshForecast = useCallback(async (loc: number, d: string) => {
    const fc = await getTuneupForecast(d, loc);
    setForecast(fc);
    resetMod();
  }, [resetMod]);

  // Weather + similar-days follow the applied date / location / city.
  useEffect(() => {
    if (locationId == null || !weatherCity) return;
    let alive = true;
    const seen = peekSimilarDays(appliedDate, locationId, weatherCity);
    if (seen) setSimilarDays(seen.similar_days ?? []);
    getSimilarDays(appliedDate, locationId, weatherCity).then((s) => alive && setSimilarDays(s.similar_days ?? [])).catch(() => alive && setSimilarDays([]));
    return () => { alive = false; };
  }, [locationId, appliedDate, weatherCity]);

  // Weather tab charts: the day's weather plus the latest picked reference day (tuneup weather-multi).
  const wxRef = refDates[refDates.length - 1] ?? "";
  const [wxMulti, setWxMulti] = useState<WeatherMulti | null>(null);
  useEffect(() => {
    if (locationId == null || !weatherCity) return;
    let alive = true;
    const seen = peekWeatherMulti(appliedDate, locationId, weatherCity, wxRef || undefined);
    if (seen) setWxMulti(seen);
    getWeatherMulti(appliedDate, locationId, weatherCity, wxRef || undefined)
      .then((w) => alive && setWxMulti(w)).catch(() => alive && setWxMulti(null));
    return () => { alive = false; };
  }, [locationId, appliedDate, weatherCity, wxRef]);

  // Weather card under the chart: the same weather/multi data and card as the Demand Forecast page.
  const weather = useWeather(appliedDate);

  // ── chart rows ──────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const sysLine: BlockMap = forecast?.models?.System ?? forecast?.models?.[model] ?? {};
    // Manual Forecast: what the API has saved; until something is saved it equals System.
    const manLine: BlockMap = forecast?.models?.Manual ?? sysLine;
    const out: ChartRow[] = [];
    for (let b = 1; b <= 96; b++) {
      const bs = String(b);
      out.push({
        i: b - 1,
        system: sysLine[bs] ?? null,
        manual: manLine[bs] ?? sysLine[bs] ?? null,
        modified: modified ? modified[bs] ?? null : null,
      });
    }
    return out;
  }, [forecast, model, modified]);
  // Changes build on the Manual Forecast (the saved line), so edits add up across sessions.
  const baseModel = forecast?.available_models?.includes("Manual") ? "Manual" : model;

  const yDomain = useMemo<[number, number]>(() => {
    const vals = rows.flatMap((r) => [r.system, r.manual, r.modified].filter((v): v is number => v != null));
    if (!vals.length) return [0, 100];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return [Math.max(0, Math.floor((lo * 0.96) / 250) * 250), Math.ceil((hi * 1.03) / 250) * 250];
  }, [rows]);
  // ── Control actions ─────────────────────────────────────────────────
  const applySetline = useCallback(async (commit: boolean) => {
    if (locationId == null) return;
    setBusy(true); setNotice(null);
    try {
      const res = await postSetline({
        date: appliedDate, location_id: locationId, base_model: baseModel,
        rules: [{ from_block: +fromBlock, to_block: +toBlock, action, from_value: +fromValue, to_value: +toValue, ref_date: refDate || null, enabled: true }],
      });
      const mod = res.modified ?? {};
      if (!Object.keys(mod).length) { flash("err", "No blocks were modified."); return; }
      setModified(mod); setModStats(res.stats ?? null); setModMape(res.mape ?? null); setModCommitted(commit);
      if (commit) {
        // Save the whole day as the Manual Forecast (unchanged blocks keep their Manual value).
        const manual = forecast?.models?.Manual ?? forecast?.models?.System ?? {};
        await postManualForecast({ date: appliedDate, location_id: locationId, blocks: numericBlocks({ ...manual, ...mod }) });
        await refreshForecast(locationId, appliedDate);
        flash("ok", "Manual Forecast saved ✓");
      } else {
        flash("ok", "Preview only — click Update to apply.");
      }
    } catch (e) { flash("err", String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }, [locationId, appliedDate, baseModel, forecast, refreshForecast, fromBlock, toBlock, action, fromValue, toValue, refDate, flash]);

  const runEnsemble = useCallback(async () => {
    if (locationId == null) return;
    if (!refDates.length) { flash("err", "Pick reference days in the Weather tab first."); setTab("Weather"); return; }
    setBusy(true); setNotice(null);
    try {
      const weights = Object.fromEntries(refDates.map((d) => [d, 1 / refDates.length]));
      const res = await postEnsemble({ date: appliedDate, location_id: locationId, ref_dates: weights, mpe_factor: Number(mpex) || 1, top_n: 5 });
      const mod = (res as { modified?: BlockMap; forecast?: BlockMap }).modified ?? (res as { forecast?: BlockMap }).forecast ?? {};
      if (!Object.keys(mod).length) { flash("err", "Ensemble returned no data."); return; }
      setModified(mod); setModStats(res.stats ?? null); setModMape(res.mape ?? null); setModCommitted(false);
      flash("ok", `Ensemble of ${refDates.length} day(s) — preview.`);
    } catch (e) { flash("err", String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }, [locationId, appliedDate, refDates, mpex, flash]);

  const resetManual = useCallback(async () => {
    if (locationId == null) return;
    setBusy(true); setNotice(null);
    try {
      await postReset({ date: appliedDate, location_id: locationId });
      await refreshForecast(locationId, appliedDate);
      flash("ok", "Reset to System Forecast — saved ✓");
    } catch (e) { flash("err", String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }, [locationId, appliedDate, refreshForecast, flash]);

  // ── Rules actions ───────────────────────────────────────────────────
  const applyRules = useCallback(async (res?: { rules: Rule[]; history: RuleHistory }) => {
    if (res) { setRules(res.rules); setHistory(res.history); }
    if (locationId == null) return;
    try {
      const r = await postApply({ date: appliedDate, location_id: locationId, base_model: model });
      const mod = r.modified ?? {};
      if (Object.keys(mod).length) { setModified(mod); setModStats(r.stats ?? null); setModMape(r.mape ?? null); setModCommitted(false); }
      if (r.history) setHistory(r.history);
      flash("ok", `Applied ${r.rules_applied ?? "all"} of ${r.rules_total ?? rules.length} rule(s) — preview.`);
    } catch (e) { flash("err", String((e as Error).message ?? e)); }
  }, [locationId, appliedDate, model, rules.length, flash]);

  const guard = useCallback(async (fn: () => Promise<{ rules: Rule[]; history: RuleHistory }>, apply = false) => {
    if (locationId == null) return;
    setBusy(true); setNotice(null);
    try {
      const res = await fn();
      setRules(res.rules); setHistory(res.history);
      if (apply) await applyRules(res);
    } catch (e) { flash("err", String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }, [locationId, applyRules, flash]);

  const addNewRule = (apply: boolean) =>
    guard(() => addRule(locationId!, appliedDate, { from_block: +nrFrom, to_block: +nrTo, action: nrAction, from_value: +nrFromV, to_value: +nrToV, ref_date: nrRef || null, enabled: true }), apply);

  const moveRule = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rules.length) return;
    const ids = rules.map((r) => r.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    guard(() => reorderRules(locationId!, appliedDate, ids));
  };

  const exportCsv = () => {
    const header = "block,time,system_forecast,manual_forecast" + (modified ? ",preview" : "");
    const lines = rows.map((r) =>
      [r.i + 1, blockTime(r.i + 1), r.system ?? "", r.manual ?? "", ...(modified ? [r.modified ?? ""] : [])].join(","));
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `demand-tuneup-${appliedDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cycleRef = (d: string) =>
    setRefDates((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : prev.length < 2 ? [...prev, d] : [prev[1], d]);

  // Fill the window below the panel's top edge, so the page itself never scrolls.
  const rootRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(160);
  useLayoutEffect(() => {
    const measure = () => { if (rootRef.current) setTop(rootRef.current.getBoundingClientRect().top + window.scrollY); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // 96-block chart (Highcharts): System and Manual Forecast, plus the dashed Preview of a Change.
  const chartOptions = useMemo<ChartOptions>(() => {
    const AX = { color: "#64748b", fontSize: "10px" };
    return {
      chart: {
        type: "spline", animation: false, backgroundColor: "transparent", plotBackgroundColor: "rgba(15, 118, 110, 0.05)",
        spacing: [10, 4, 4, 0], style: { fontFamily: "inherit" },
      },
      title: { text: undefined },
      credits: { enabled: false },
      accessibility: { enabled: false },
      exporting: {
        buttons: { contextButton: { menuItems: ["viewFullscreen", "separator", "downloadPNG", "downloadCSV"], symbolSize: 10, theme: { fill: "transparent", stroke: "none" } as never } },
        filename: `demand-tuneup-${appliedDate}`,
      },
      xAxis: {
        categories: rows.map((r) => blockTime(r.i + 1)),
        labels: { step: 2, rotation: -45, style: AX },
        tickLength: 0, lineColor: "#e5e7eb",
        crosshair: { color: "#94a3b8", dashStyle: "Dash", width: 1 },
      },
      yAxis: {
        title: { text: undefined }, min: yDomain[0], max: yDomain[1], startOnTick: false, endOnTick: false,
        gridLineColor: "#e5e7eb", labels: { style: AX },
      },
      legend: { symbolWidth: 18, itemStyle: { fontSize: "12px", fontWeight: "500", color: "#475569" }, itemHoverStyle: { color: "#0f172a" } },
      tooltip: {
        shared: true, useHTML: true, animation: false, hideDelay: 0,
        backgroundColor: "#ffffff", borderColor: "#e5e7eb", borderRadius: 8, padding: 10,
        shadow: { color: "rgba(15,23,42,0.12)", offsetX: 0, offsetY: 2, width: 6 },
        formatter(this: unknown) {
          const ctx = this as { points?: { series: { name: string; color: string }; y: number | null; point: { index: number } }[] };
          const pts = ctx.points ?? [];
          if (!pts.length) return false;
          const b = pts[0].point.index + 1;
          const end = b === 96 ? "24:00" : blockTime(b + 1);
          const rowsHtml = pts.map((p) => `<tr>
            <td style="padding:3px 8px 3px 0"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${p.series.color}"></span></td>
            <td style="color:#475569;padding:3px 18px 3px 0">${p.series.name} (MW):</td>
            <td style="text-align:right;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums">${p.y == null ? "—" : Number(p.y).toFixed(2)}</td>
          </tr>`).join("");
          return `<div style="font-size:12px;min-width:210px"><div style="font-weight:700;margin-bottom:4px;color:#0f172a">Block ${b} · ${blockTime(b)}–${end}</div><table style="width:100%">${rowsHtml}</table></div>`;
        },
      },
      plotOptions: {
        series: {
          animation: false, connectNulls: true,
          marker: { enabled: false, states: { hover: { enabled: true, radius: 5, lineWidth: 3, lineColor: "rgba(15,118,110,0.25)" } } },
          states: { inactive: { opacity: 0.25 } },
        },
      },
      series: [
        { type: "spline", name: "System Forecast", color: SYS_COLOR, lineWidth: 2.5, data: rows.map((r) => r.system) },
        { type: "spline", name: "Manual Forecast", color: MAN_COLOR, lineWidth: 2.5, data: rows.map((r) => r.manual) },
        ...(modified ? [{ type: "spline" as const, name: "Preview (unsaved)", color: MOD_COLOR, lineWidth: 2, dashStyle: "Dash" as const, data: rows.map((r) => r.modified) }] : []),
      ],
    };
  }, [rows, yDomain, modified, appliedDate]);

  const noticeEl = notice && (
    <div className={"mt-3 rounded-md border px-3 py-2 text-[13px] font-medium " + (notice.kind === "ok" ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300" : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300")}>
      {notice.text}
    </div>
  );
  const adjustRow = <AdjustRow {...{ adjust, setAdjust, preBlocks, setPreBlocks, postBlocks, setPostBlocks }} />;

  return (
    <div
      ref={rootRef}
      className="flex min-h-[560px] flex-col gap-3 lg:flex-row"
      // Negative bottom margin cancels the page's bottom padding so the page itself doesn't scroll.
      style={{ height: `calc(100vh - ${top}px - 16px)`, marginBottom: -64 }}
    >
      {/* ── Left column: forecast chart over the weather card (like the Demand Forecast page) ── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:basis-0 lg:grow-[2.2]">
      <div className="flex min-h-[300px] min-w-0 flex-1 flex-col rounded-xl border bg-card p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[14px] font-semibold">96-Block Forecast</span>
          <div className="mr-8 flex items-center gap-1 text-muted-foreground">
            <button type="button" aria-label="Reload" title="Reload" onClick={() => locationId != null && loadForecast(locationId, appliedDate)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-accent hover:text-foreground"><RotateCw className="h-3.5 w-3.5" /></button>
            <span title="System Forecast, saved Manual Forecast and the dashed preview of a Change" className="grid h-6 w-6 place-items-center rounded-full border"><Info className="h-3 w-3" /></span>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {(loading || (!forecast && !config && !error)) && <div className="absolute inset-0 z-10 grid place-items-center bg-card/60 text-sm text-muted-foreground"><span className="inline-flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</span></div>}
          {error && !loading && <div className="absolute inset-0 z-10 grid place-items-center px-6 text-center text-sm text-rose-600">{error}</div>}
          {!error && !loading && (config || forecast) && !forecast && <div className="absolute inset-0 z-10 grid place-items-center text-sm text-muted-foreground">No forecast for this date.</div>}
          <Chart key={modified ? "preview" : "plain"} options={chartOptions} containerProps={{ style: { height: "100%", width: "100%" } }} />
        </div>
      </div>
      <div className="flex min-h-[300px] min-w-0 flex-1 flex-col rounded-xl border bg-card p-3">
        <WeatherCard
          weather={weather} date={appliedDate}
          location={weather.locations.includes(weatherCity) ? weatherCity : weather.locations[0] ?? weatherCity}
          onLocation={setWeatherCity}
        />
      </div>
      </div>

      {/* ── Right column ────────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:w-[30%] lg:min-w-[380px] lg:shrink-0">
        <div className="flex items-center justify-end gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <input type="date" value={date} min={config?.date_range.min} max={config?.date_range.max} aria-label="Date"
            onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 rounded-md border bg-card px-3 text-[13px] font-medium" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="flex items-stretch border-b">
            {TABS.map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={"flex-1 border-b-2 py-2.5 text-[13px] font-medium transition-colors " + (tab === t ? "border-[#0f766e] bg-[#0f766e]/[0.06] text-[#0f766e]" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t}{t === "Rules" && rules.length ? ` (${rules.length})` : ""}
              </button>
            ))}
            <span className="grid w-10 place-items-center text-muted-foreground"><span className="grid h-5 w-5 place-items-center rounded-full border"><Info className="h-3 w-3" /></span></span>
          </div>

          {/* one scroll region: tab content fills when there's room, scrolls only when cramped */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            {tab === "Control" && (
              <ControlTab
                {...{ busy, fromBlock, setFromBlock, toBlock, setToBlock, action, setAction, fromValue, setFromValue, toValue, setToValue, refDate, setRefDate, mpex, setMpex, similarDays }}
                adjustRow={adjustRow} notice={noticeEl}
                onForecast={runEnsemble} onChange={() => applySetline(false)} onUpdate={() => applySetline(true)}
                // Reset: the form back to its defaults and the saved Manual Forecast back to System (API).
                onReset={() => { setAdjust("Yes"); setPreBlocks(5); setPostBlocks(5); setFromBlock(1); setToBlock(96); setAction("Add"); setFromValue(100); setToValue(100); setRefDate(""); setMpex(1); resetManual(); }}
                onCsv={exportCsv}
              />
            )}

            {tab === "Rules" && (
              <RulesTab
                {...{ rules, history, busy, nrFrom, setNrFrom, nrTo, setNrTo, nrAction, setNrAction, nrFromV, setNrFromV, nrToV, setNrToV, nrRef, setNrRef, similarDays }}
                adjustRow={adjustRow} notice={noticeEl}
                onAdd={() => addNewRule(false)} onAddApply={() => addNewRule(true)}
                onEdit={(id, patch) => guard(() => updateRule(id, locationId!, appliedDate, patch))}
                onDelete={(id) => guard(() => deleteRule(id, locationId!, appliedDate))}
                onToggle={(r) => guard(() => updateRule(r.id, locationId!, appliedDate, { enabled: !r.enabled }))}
                onMove={moveRule}
                onUndo={() => guard(() => undoRules(locationId!, appliedDate), true)}
                onRedo={() => guard(() => redoRules(locationId!, appliedDate), true)}
                onClear={() => { guard(() => clearRules(locationId!, appliedDate)); resetMod(); }}
                onApply={() => applyRules()}
              />
            )}

            {tab === "Weather" && (
              <WeatherTab
                {...{ weatherCity, setWeatherCity, similarDays, refDates }} date={appliedDate}
                locations={config?.weather_locations ?? []} wx={wxMulti} notice={noticeEl}
                onCycleRef={cycleRef} onClearRefs={() => setRefDates([])}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── shared: Adjust · Pre · Post band ─────────────────────────────────
function AdjustRow(p: {
  adjust: string; setAdjust: (v: string) => void;
  preBlocks: number; setPreBlocks: (v: number) => void;
  postBlocks: number; setPostBlocks: (v: number) => void;
}) {
  const num = "h-8 w-14 rounded-md border bg-card px-2 text-center text-sm";
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
      <label className="flex items-center gap-2"><span className={labelCls}>Adjust</span>
        <select value={p.adjust} onChange={(e) => p.setAdjust(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-sm"><option>Yes</option><option>No</option></select>
      </label>
      <label className="flex items-center gap-2"><span className={labelCls}>Pre</span>
        <input type="number" value={p.preBlocks} onChange={(e) => p.setPreBlocks(+e.target.value)} className={num} />
      </label>
      <label className="flex items-center gap-2"><span className={labelCls}>Post</span>
        <input type="number" value={p.postBlocks} onChange={(e) => p.setPostBlocks(+e.target.value)} className={num} />
      </label>
    </div>
  );
}

// ── Control tab ───────────────────────────────────────────────────────
function ControlTab(p: {
  busy: boolean;
  fromBlock: number; setFromBlock: (v: number) => void;
  toBlock: number; setToBlock: (v: number) => void;
  action: string; setAction: (v: string) => void;
  fromValue: number; setFromValue: (v: number) => void;
  toValue: number; setToValue: (v: number) => void;
  refDate: string; setRefDate: (v: string) => void;
  mpex: number; setMpex: (v: number) => void;
  similarDays: SimilarDay[];
  adjustRow: ReactNode; notice: ReactNode;
  onForecast: () => void; onChange: () => void; onUpdate: () => void; onReset: () => void; onCsv: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={p.onForecast} disabled={p.busy} className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">Forecast</button>
        <button type="button" onClick={p.onChange} disabled={p.busy} className="rounded-md px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ background: "#d97706" }}>Change</button>
        <button type="button" onClick={p.onUpdate} disabled={p.busy} className="inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ background: "#0d9488" }}>
          {p.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Update
        </button>
      </div>

      <div className="mt-3">{p.adjustRow}</div>

      <div className="mt-1 divide-y">
        <Field label="From Block"><input type="number" min={1} max={96} value={p.fromBlock} onChange={(e) => p.setFromBlock(+e.target.value)} className={inputCls} /></Field>
        <Field label="To Block"><input type="number" min={1} max={96} value={p.toBlock} onChange={(e) => p.setToBlock(+e.target.value)} className={inputCls} /></Field>
        <Field label="Action"><select value={p.action} onChange={(e) => p.setAction(e.target.value)} className={selectCls}>{TUNEUP_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
        <Field label="From Value"><input type="number" value={p.fromValue} onChange={(e) => p.setFromValue(+e.target.value)} className={inputCls} /></Field>
        <Field label="To Value"><input type="number" value={p.toValue} onChange={(e) => p.setToValue(+e.target.value)} className={inputCls} /></Field>
        <Field label="Reference">
          <select value={p.refDate} onChange={(e) => p.setRefDate(e.target.value)} className={selectCls}>
            <option value="">—</option>
            {p.similarDays.map((s) => <option key={s.date} value={s.date}>{s.date}</option>)}
          </select>
        </Field>
      </div>

      {p.notice}

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <label className="flex items-center gap-2">
          <span className={labelCls}>Mpex</span>
          <input type="number" value={p.mpex} onChange={(e) => p.setMpex(+e.target.value)} className="h-8 w-14 rounded-md border bg-card px-2 text-center text-sm" />
        </label>
        <button type="button" onClick={p.onCsv} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"><ArrowDown className="h-3.5 w-3.5" /> CSV</button>
        <button type="button" onClick={p.onReset} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"><RotateCw className="h-3.5 w-3.5" /> Reset</button>
      </div>
    </>
  );
}

// ── Rules tab ─────────────────────────────────────────────────────────
function RulesTab(p: {
  rules: Rule[]; history: RuleHistory | null; busy: boolean;
  nrFrom: number; setNrFrom: (v: number) => void; nrTo: number; setNrTo: (v: number) => void;
  nrAction: string; setNrAction: (v: string) => void; nrFromV: number; setNrFromV: (v: number) => void; nrToV: number; setNrToV: (v: number) => void;
  nrRef: string; setNrRef: (v: string) => void; similarDays: SimilarDay[];
  adjustRow: ReactNode; notice: ReactNode;
  onAdd: () => void; onAddApply: () => void;
  onEdit: (id: string, patch: Partial<Rule>) => void; onDelete: (id: string) => void; onToggle: (r: Rule) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onUndo: () => void; onRedo: () => void; onClear: () => void; onApply: () => void;
}) {
  const enabledCount = p.rules.filter((r) => r.enabled).length;
  const box = "h-9 w-full rounded-md border bg-card px-2 text-center text-sm tabular-nums";
  const cap = "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* add form */}
      <div className="rounded-lg border border-dashed p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#0f766e]"><Plus className="h-3.5 w-3.5" />Add New Rule</div>
        <div className="grid grid-cols-3 gap-2">
          <label><span className={cap}>From</span><input type="number" min={1} max={96} value={p.nrFrom} onChange={(e) => p.setNrFrom(+e.target.value)} className={box} /></label>
          <label><span className={cap}>To</span><input type="number" min={1} max={96} value={p.nrTo} onChange={(e) => p.setNrTo(+e.target.value)} className={box} /></label>
          <label><span className={cap}>Action</span><select value={p.nrAction} onChange={(e) => p.setNrAction(e.target.value)} className="h-9 w-full rounded-md border bg-card px-2 text-sm">{TUNEUP_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
          <label><span className={cap}>Fval</span><input type="number" value={p.nrFromV} onChange={(e) => p.setNrFromV(+e.target.value)} className={box} /></label>
          <label><span className={cap}>Tval</span><input type="number" value={p.nrToV} onChange={(e) => p.setNrToV(+e.target.value)} className={box} /></label>
          <label><span className={cap}>Ref</span>
            <select value={p.nrRef} onChange={(e) => p.setNrRef(e.target.value)} className="h-9 w-full rounded-md border bg-card px-2 text-sm">
              <option value="">—</option>
              {p.similarDays.map((s) => <option key={s.date} value={s.date}>{s.date}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={p.onAdd} disabled={p.busy} className="inline-flex h-9 items-center justify-center gap-1 rounded-md text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ background: "#0d9488" }}><Plus className="h-3.5 w-3.5" />Add Rule</button>
          <button type="button" onClick={p.onAddApply} disabled={p.busy} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border bg-muted/40 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Zap className="h-3.5 w-3.5 text-amber-500" />Add &amp; Apply</button>
        </div>
      </div>

      {/* list */}
      <div className="mt-3 flex items-center justify-between border-b pb-1.5">
        <span className="text-[13px] font-semibold">Active Rules</span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px]">{p.rules.length}</span>
      </div>
      <div className="mt-2 min-h-[80px] space-y-1.5">
        {p.rules.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No rules yet. Add one above ↑</p>}
        {p.rules.map((r, idx) => (
          <div key={r.id} className={"rounded-md border p-2 text-xs " + (r.enabled ? "" : "opacity-50")}>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold">#{idx + 1} · {r.action}</span>
              <div className="flex items-center gap-0.5 text-muted-foreground">
                <button type="button" aria-label="Move up" onClick={() => p.onMove(idx, -1)} disabled={idx === 0} className="grid h-6 w-6 place-items-center rounded hover:bg-accent disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                <button type="button" aria-label="Move down" onClick={() => p.onMove(idx, 1)} disabled={idx === p.rules.length - 1} className="grid h-6 w-6 place-items-center rounded hover:bg-accent disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                <button type="button" aria-label="Toggle" onClick={() => p.onToggle(r)} className="grid h-6 w-6 place-items-center rounded hover:bg-accent">{r.enabled ? "✓" : "✗"}</button>
                <button type="button" aria-label="Delete" onClick={() => p.onDelete(r.id)} className="grid h-6 w-6 place-items-center rounded text-rose-500 hover:bg-accent"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[11px] text-muted-foreground">
              <span>Blk {r.from_block}–{r.to_block}</span>
              <span>From {r.from_value}</span>
              <span>To {r.to_value}</span>
              <span>{r.ref_date ?? ""}</span>
            </div>
          </div>
        ))}
      </div>

      {/* undo / redo / clear */}
      <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={p.onUndo} disabled={p.busy || !p.history?.can_undo} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium hover:bg-accent disabled:opacity-40"><Undo2 className="h-3 w-3" />Undo</button>
          <button type="button" onClick={p.onRedo} disabled={p.busy || !p.history?.can_redo} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium hover:bg-accent disabled:opacity-40"><Redo2 className="h-3 w-3" />Redo</button>
          <button type="button" onClick={p.onClear} disabled={p.busy || !p.rules.length} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 font-medium text-rose-500 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900 dark:hover:bg-rose-950/30"><Trash2 className="h-3 w-3" />Clear</button>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{p.history?.undo_count ?? 0} undo · {p.history?.redo_count ?? 0} redo</span>
      </div>

      <div className="mt-auto space-y-2 pt-3">
        <button type="button" onClick={p.onApply} disabled={p.busy || !enabledCount}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ background: "#d97706" }}>
          <Zap className="h-4 w-4" />Apply All Rules
        </button>
        {p.adjustRow}
        {p.notice}
      </div>
    </div>
  );
}

// ── Weather tab ───────────────────────────────────────────────────────
// Location, the day + reference chips, the similar days ("D.DATA", click to pick up to two
// references for Forecast) and three small weather charts for the day — with the latest picked
// reference day dashed — from the tuneup weather-multi API.
const WX_CHARTS: { title: string; unit: string; series: { key: string; name: string; color: string }[] }[] = [
  { title: "Temperature & Feels Like", unit: "°C", series: [{ key: "temperature", name: "Temp", color: "#ef4444" }, { key: "temperatureFeelsLike", name: "Feels Like", color: "#f97316" }] },
  { title: "Wind Speed & Gust", unit: "km/h", series: [{ key: "windSpeed", name: "Wind", color: "#3b82f6" }, { key: "windGust", name: "Gust", color: "#0ea5e9" }] },
  { title: "Cloud Cover & Humidity", unit: "%", series: [{ key: "cloudCover", name: "Cloud", color: "#10b981" }, { key: "relativeHumidity", name: "Humidity", color: "#8b5cf6" }] },
];
const md = (iso: string) => iso.slice(5); // "2026-11-05" → "11-05"

function WxChart({ title, unit, series, cur, ref, date, refDate }: {
  title: string; unit: string; series: { key: string; name: string; color: string }[];
  cur: Record<string, BlockMap> | null; ref: Record<string, BlockMap> | null; date: string; refDate: string;
}) {
  const options = useMemo<ChartOptions>(() => {
    const line = (m: BlockMap | undefined) => Array.from({ length: 96 }, (_, k) => { const v = m?.[String(k + 1)]; return v == null ? null : Number(v); });
    const all = [
      ...series.map((x) => ({ type: "spline" as const, name: `${md(date)}_${x.name}`, color: x.color, data: line(cur?.[x.key]), lineWidth: 1.8 })),
      ...(ref && refDate ? series.map((x) => ({ type: "spline" as const, name: `${md(refDate)}_${x.name}`, color: x.color, data: line(ref[x.key]), lineWidth: 1.4, dashStyle: "Dash" as const, opacity: 0.8 })) : []),
    ];
    return {
      chart: { height: 170, animation: false, backgroundColor: "transparent", spacing: [6, 2, 2, 0], style: { fontFamily: "inherit" } },
      title: { text: undefined }, credits: { enabled: false }, accessibility: { enabled: false },
      exporting: { buttons: { contextButton: { menuItems: ["viewFullscreen", "separator", "downloadPNG", "downloadCSV"], symbolSize: 9, theme: { fill: "transparent", stroke: "none" } as never } } },
      xAxis: {
        categories: Array.from({ length: 96 }, (_, k) => blockTime(k + 1)),
        tickInterval: 4, labels: { step: 1, rotation: -45, style: { color: "#94a3b8", fontSize: "8px" } }, tickLength: 0, lineColor: "#e5e7eb",
      },
      yAxis: { title: { text: undefined }, gridLineColor: "#eef0f4", labels: { style: { color: "#94a3b8", fontSize: "8px" } } },
      legend: { itemStyle: { fontSize: "10px", fontWeight: "500", color: "#475569" }, symbolWidth: 14, margin: 4, padding: 2 },
      tooltip: {
        shared: true, useHTML: true, animation: false, hideDelay: 0, backgroundColor: "#ffffff", borderColor: "#e5e7eb", borderRadius: 6, padding: 8,
        formatter(this: unknown) {
          const pts = (this as { points?: { series: { name: string; color: string }; y: number | null; point: { index: number } }[] }).points ?? [];
          if (!pts.length) return false;
          const b = pts[0].point.index + 1;
          return `<div style="font-size:11px"><b>Block ${b} · ${blockTime(b)}</b><table>${pts.map((p) => `<tr><td style="color:${p.series.color};padding-right:10px">● ${p.series.name}</td><td style="text-align:right;font-weight:700">${p.y == null ? "—" : Number(p.y).toFixed(1)} ${unit}</td></tr>`).join("")}</table></div>`;
        },
      },
      plotOptions: { series: { animation: false, connectNulls: true, marker: { enabled: false } } },
      series: all,
    };
  }, [series, cur, ref, date, refDate, unit]);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={labelCls}>{title}</span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
      <Chart key={refDate || "none"} options={options} />
    </div>
  );
}

function WeatherTab(p: {
  weatherCity: string; setWeatherCity: (v: string) => void;
  locations: string[]; wx: WeatherMulti | null; date: string; similarDays: SimilarDay[]; refDates: string[];
  notice: ReactNode;
  onCycleRef: (d: string) => void; onClearRefs: () => void;
}) {
  const loc = p.wx?.locations?.[p.weatherCity] ?? (p.wx ? Object.values(p.wx.locations)[0] : undefined);
  const refDate = p.refDates[p.refDates.length - 1] ?? "";
  const ids = p.locations.includes(p.weatherCity) || !p.weatherCity ? p.locations : [p.weatherCity, ...p.locations];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <label className="flex items-center gap-3">
        <span className={labelCls}>Location</span>
        <select value={p.weatherCity} onChange={(e) => p.setWeatherCity(e.target.value)} className="h-9 flex-1 rounded-md border bg-card px-3 text-[13px] font-medium">
          {ids.map((w) => <option key={w} value={w}>{cityOf(w) === w ? w : `${cityOf(w)} (${w})`}</option>)}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-[#0f766e] px-2 py-0.5 text-[11px] font-semibold text-white">{p.date}</span>
        {p.refDates.length === 0
          ? <span className="rounded border px-2 py-0.5 text-[11px] text-muted-foreground">no ref</span>
          : p.refDates.map((d) => (
            <button key={d} type="button" onClick={() => p.onCycleRef(d)} title="Remove reference"
              className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300">ref {d} ×</button>
          ))}
        {p.refDates.length > 0 && <button type="button" onClick={p.onClearRefs} className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">clear</button>}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
        <span className={labelCls}>D.Data:</span>
        {p.similarDays.length === 0 && <span className="text-muted-foreground">No similar days.</span>}
        {p.similarDays.slice(0, 12).map((s) => (
          <button key={s.date} type="button" onClick={() => p.onCycleRef(s.date)} title={`Similarity ${(s.score * 100).toFixed(0)}% — click to use as a reference`}
            className={"underline underline-offset-2 " + (p.refDates.includes(s.date) ? "font-semibold text-amber-600" : "text-[#0f766e] hover:text-[#0d9488]")}>
            {s.date}
          </button>
        ))}
      </div>

      {!loc && <p className="py-6 text-center text-sm text-muted-foreground">No weather data.</p>}
      {loc && WX_CHARTS.map((c) => (
        <WxChart key={c.title} {...c} cur={loc.current ?? null} ref={loc.reference ?? null} date={p.date} refDate={refDate} />
      ))}

      {p.notice}
    </div>
  );
}
