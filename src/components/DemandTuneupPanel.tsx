// Demand Tuneup — a functional port of EPMS_ALL's "Demand Tuneup" tab, wired to the
// /api/v1/tuneup/* backend (see src/lib/tuneupApi.ts). Layout mirrors the reference:
//   • Left:  the 96-Block Forecast chart (System Forecast + the Modified line) with stats.
//   • Right: a date control, then Weather / Rules / Control tabs.
// Control builds a single-rule adjustment (Change = preview, Update = persist); Rules is the
// server-side rule engine (add/edit/reorder/undo/redo/apply); Weather shows similar-day
// matching and per-location weather. Shown on Demand's "Demand Tune up" cell page.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, Copy, Download, Info, Loader2, Plus, RotateCcw, RotateCw, Trash2,
} from "lucide-react";
import {
  Area, CartesianGrid, ComposedChart, Label, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { TfId } from "@/data/engine";
import {
  TUNEUP_ACTIONS, addRule, clearRules, deleteRule, getRules, getSimilarDays, getTuneupConfig,
  getTuneupForecast, getWeatherMulti, postApply, postEnsemble, postManualForecast, postReset,
  postSetline, redoRules, reorderRules, undoRules, updateRule,
  type BlockMap, type ModelStats, type Rule, type RuleHistory, type SimilarDay, type TuneupConfig,
  type TuneupForecast, type WeatherMulti,
} from "@/lib/tuneupApi";

const SYS_COLOR = "#0f766e"; // teal — System Forecast
const MOD_COLOR = "#7c3aed"; // purple — Modified (dashed = preview, solid = committed)
const ACT_COLOR = "#e11d48"; // rose — Actual (only when the day has actuals)

const today = () => new Date().toISOString().split("T")[0];
const blockTime = (b: number) => {
  const m = (b - 1) * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/** Drop null entries so a BlockMap can be sent as the manual-forecast body. */
const numericBlocks = (m: BlockMap): Record<string, number> =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => v != null)) as Record<string, number>;
const fmt = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: d });

// X ticks every 2 hours (8 blocks), always ending on block 96, labelled by time of day.
const X_TICKS = (() => {
  const t: number[] = [];
  for (let v = 0; v < 95; v += 8) t.push(v);
  t.push(95);
  return t;
})();
function XTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  return (
    <text x={x} y={(y ?? 0) + 14} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">
      {blockTime((payload?.value ?? 0) + 1)}
    </text>
  );
}

function TipRow({ c, n, v, dash }: { c: string; n: string; v: string; dash?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="flex items-center gap-1.5">
        <svg width="16" height="8" className="shrink-0"><line x1="0" y1="4" x2="16" y2="4" stroke={c} strokeWidth="2.4" strokeDasharray={dash ? "4 2" : ""} /></svg>
        {n}
      </span>
      <span className="num font-medium tabular-nums">{v}</span>
    </div>
  );
}

/** Rich tooltip for the 96-block chart: time header, each active series, and the Modified Δ. */
function MainTip({ active, payload, label, committed }: { active?: boolean; payload?: { payload: ChartRow }[]; label?: number; committed?: boolean }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const b = (label ?? 0) + 1;
  const delta = r.modified != null && r.system != null ? r.modified - r.system : null;
  return (
    <div className="min-w-[200px] rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg">
      <div className="mb-1.5 flex items-center justify-between font-semibold">
        <span>Block {b}</span>
        <span className="text-muted-foreground">{blockTime(b)}</span>
      </div>
      <div className="space-y-1">
        {r.actual != null && <TipRow c={ACT_COLOR} n="Actual" v={`${fmt(r.actual)} MW`} />}
        <TipRow c={SYS_COLOR} n="System" v={`${fmt(r.system)} MW`} />
        {r.modified != null && <TipRow c={MOD_COLOR} n={committed ? "Modified" : "Preview"} v={`${fmt(r.modified)} MW`} dash={!committed} />}
      </div>
      {delta != null && (
        <div className="mt-1.5 flex items-center justify-between border-t pt-1.5">
          <span className="text-muted-foreground">Δ vs System</span>
          <span className={"num font-semibold tabular-nums " + (delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            {(delta >= 0 ? "+" : "") + fmt(delta, 1)} MW
          </span>
        </div>
      )}
    </div>
  );
}

/** A compact, fully controlled legend rendered under the chart. */
function ChartLegend({ items }: { items: { k: string; c: string; dash?: boolean }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.k} className="inline-flex items-center gap-1.5">
          <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke={it.c} strokeWidth="2.6" strokeDasharray={it.dash ? "5 3" : ""} strokeLinecap="round" /></svg>
          {it.k}
        </span>
      ))}
    </div>
  );
}

type ChartRow = { i: number; system: number | null; modified: number | null; actual: number | null };

const inputCls = "h-8 w-full rounded-md border bg-card px-2 text-right text-sm tabular-nums";
const selectCls = "h-8 w-full rounded-md border bg-card px-2 text-sm";
const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className={labelCls}>{label}</span>
      <span className="w-28 shrink-0">{children}</span>
    </label>
  );
}

const TABS = ["Weather", "Rules", "Control"] as const;
type Tab = (typeof TABS)[number];

export function DemandTuneupPanel({ tf }: { tf: TfId }) {
  void tf; // tuneup keeps its own date control; horizon is informational only here.

  // ── config / selection ──────────────────────────────────────────────
  const [config, setConfig] = useState<TuneupConfig | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [model, setModel] = useState<string>("System");
  const [date, setDate] = useState<string>(today());
  const [appliedDate, setAppliedDate] = useState<string>(today());

  // ── forecast data ───────────────────────────────────────────────────
  const [forecast, setForecast] = useState<TuneupForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── the Modified overlay (from setline / apply / ensemble) ──────────
  const [modified, setModified] = useState<BlockMap | null>(null);
  const [modStats, setModStats] = useState<ModelStats | null>(null);
  const [modMape, setModMape] = useState<number | null>(null);
  const [modCommitted, setModCommitted] = useState(false);
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

  // ── Weather tab ─────────────────────────────────────────────────────
  const [weatherCity, setWeatherCity] = useState<string>("");
  const [weather, setWeather] = useState<WeatherMulti | null>(null);
  const [similarDays, setSimilarDays] = useState<SimilarDay[]>([]);
  const [refDates, setRefDates] = useState<string[]>([]);

  const flash = useCallback((kind: "ok" | "err", text: string) => setNotice({ kind, text }), []);
  const resetMod = useCallback(() => { setModified(null); setModStats(null); setModMape(null); setModCommitted(false); }, []);

  // Load config once.
  useEffect(() => {
    let alive = true;
    getTuneupConfig()
      .then((c) => {
        if (!alive) return;
        setConfig(c);
        setLocationId((prev) => prev ?? c.selected_location ?? c.locations[0] ?? null);
        setModel((prev) => (c.models.includes(prev) ? prev : c.models[0] ?? "System"));
        setWeatherCity((prev) => prev || c.weather_locations[0] || "");
      })
      .catch((e) => alive && setError(String(e.message ?? e)));
    return () => { alive = false; };
  }, []);

  // Load forecast + rules + similar-days whenever the applied date / location changes.
  const loadForecast = useCallback((loc: number, d: string) => {
    setLoading(true); setError(null); resetMod();
    Promise.all([
      getTuneupForecast(d, loc),
      getRules(loc, d).catch(() => ({ rules: [], history: null })),
    ])
      .then(([fc, rr]) => {
        setForecast(fc);
        setModel((prev) => (fc.available_models.includes(prev) ? prev : fc.available_models[0] ?? prev));
        setRules(rr.rules ?? []);
        setHistory(rr.history ?? null);
        setAppliedDate(d);
      })
      .catch((e) => { setForecast(null); setError(String(e.message ?? e)); })
      .finally(() => setLoading(false));
  }, [resetMod]);

  useEffect(() => { if (locationId != null) loadForecast(locationId, appliedDate); }, [locationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Weather + similar-days follow the applied date / location / city.
  useEffect(() => {
    if (locationId == null || !weatherCity) return;
    let alive = true;
    getWeatherMulti(appliedDate, locationId, weatherCity).then((w) => alive && setWeather(w)).catch(() => alive && setWeather(null));
    getSimilarDays(appliedDate, locationId, weatherCity).then((s) => alive && setSimilarDays(s.similar_days ?? [])).catch(() => alive && setSimilarDays([]));
    return () => { alive = false; };
  }, [locationId, appliedDate, weatherCity]);

  // ── chart rows ──────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const baseLine: BlockMap = forecast?.models?.[model] ?? {};
    const out: ChartRow[] = [];
    for (let b = 1; b <= 96; b++) {
      const bs = String(b);
      out.push({
        i: b - 1,
        system: baseLine[bs] ?? null,
        modified: modified ? modified[bs] ?? null : null,
        actual: forecast?.actual ? forecast.actual[bs] ?? null : null,
      });
    }
    return out;
  }, [forecast, model, modified]);

  const activeStats = modified ? modStats : forecast?.model_stats?.[model] ?? null;
  const activeMape = modified ? modMape : forecast?.mape?.[model] ?? null;
  const hasActual = !!forecast?.actual && Object.values(forecast.actual).some((v) => v != null);

  const yDomain = useMemo<[number, number]>(() => {
    const vals = rows.flatMap((r) => [r.system, r.modified, r.actual].filter((v): v is number => v != null));
    if (!vals.length) return [0, 100];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return [Math.max(0, Math.floor((lo * 0.96) / 250) * 250), Math.ceil((hi * 1.03) / 250) * 250];
  }, [rows]);
  const legendItems = useMemo(() => [
    ...(hasActual ? [{ k: "Actual", c: ACT_COLOR }] : []),
    { k: "System Forecast", c: SYS_COLOR },
    ...(modified ? [{ k: modCommitted ? "Modified" : "Preview (unsaved)", c: MOD_COLOR, dash: !modCommitted }] : []),
  ], [hasActual, modified, modCommitted]);

  // ── Control actions ─────────────────────────────────────────────────
  const applySetline = useCallback(async (commit: boolean) => {
    if (locationId == null) return;
    setBusy(true); setNotice(null);
    try {
      const res = await postSetline({
        date: appliedDate, location_id: locationId, base_model: model,
        rules: [{ from_block: +fromBlock, to_block: +toBlock, action, from_value: +fromValue, to_value: +toValue, ref_date: refDate || null, enabled: true }],
      });
      const mod = res.modified ?? {};
      if (!Object.keys(mod).length) { flash("err", "No blocks were modified."); return; }
      setModified(mod); setModStats(res.stats ?? null); setModMape(res.mape ?? null); setModCommitted(commit);
      if (commit) {
        await postManualForecast({ date: appliedDate, location_id: locationId, blocks: numericBlocks(mod) });
        flash("ok", "Forecast saved to BigQuery ✓");
      } else {
        flash("ok", "Preview only — click Update to apply.");
      }
    } catch (e) { flash("err", String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }, [locationId, appliedDate, model, fromBlock, toBlock, action, fromValue, toValue, refDate, flash]);

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
      resetMod();
      loadForecast(locationId, appliedDate);
      flash("ok", "Reset to System Forecast — saved ✓");
    } catch (e) { flash("err", String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }, [locationId, appliedDate, resetMod, loadForecast, flash]);

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
    guard(() => addRule(locationId!, appliedDate, { from_block: +nrFrom, to_block: +nrTo, action: nrAction, from_value: +nrFromV, to_value: +nrToV, enabled: true }), apply);

  const moveRule = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rules.length) return;
    const ids = rules.map((r) => r.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    guard(() => reorderRules(locationId!, appliedDate, ids));
  };

  const exportCsv = () => {
    const header = "block,time,system_forecast" + (modified ? ",modified" : "") + (hasActual ? ",actual" : "");
    const lines = rows.map((r) =>
      [r.i + 1, blockTime(r.i + 1), r.system ?? "", ...(modified ? [r.modified ?? ""] : []), ...(hasActual ? [r.actual ?? ""] : [])].join(","));
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `demand-tuneup-${appliedDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cycleRef = (d: string) =>
    setRefDates((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : prev.length < 2 ? [...prev, d] : [prev[1], d]);

  const dateDirty = date !== appliedDate;

  // Fit the panel to fill from its top to the viewport bottom (minus the cell page's footer
  // chrome) at every width, so the page itself never scrolls and no bottom gap is left.
  // The top offset is measured live (it grows as the header wraps on narrow screens); the
  // footer chrome below the panel is near-constant.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const BELOW = 150; // section bottom padding + "open full module" links + main pb-20
    const fit = () => {
      window.scrollTo(0, 0);
      const top = el.getBoundingClientRect().top;
      const h = window.innerHeight - top - BELOW;
      el.style.height = h >= 300 ? `${h}px` : "";
    };
    fit();
    const t = setTimeout(fit, 350);
    window.addEventListener("resize", fit);
    return () => { clearTimeout(t); window.removeEventListener("resize", fit); };
  }, []);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-col gap-3 overflow-hidden">
      {notice && (
        <div className={"rounded-md border px-3 py-2 text-sm " + (notice.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300")}>
          {notice.text}
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* ── Chart ───────────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 shrink grow-[1.1] basis-0 flex-col overflow-hidden rounded-lg border bg-card p-4 lg:grow-[1.9]">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">96-Block Forecast</span>
              {modified && (
                <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (modCommitted ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-600 dark:text-amber-300")}>
                  {modCommitted ? "Modified" : "Preview (unsaved)"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <button type="button" aria-label="Reload" onClick={() => locationId != null && loadForecast(locationId, appliedDate)} className="grid h-7 w-7 place-items-center rounded hover:bg-accent hover:text-foreground"><RotateCw className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Reset to system" onClick={resetManual} disabled={busy} className="grid h-7 w-7 place-items-center rounded hover:bg-accent hover:text-foreground disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /></button>
              <span className="grid h-7 w-7 place-items-center"><Info className="h-3.5 w-3.5" /></span>
            </div>
          </div>

          <div className="relative flex-1 rounded-md" style={{ background: "rgba(15, 118, 110, 0.04)" }}>
            {loading && <div className="absolute inset-0 z-10 grid place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>}
            {error && !loading && <div className="absolute inset-0 z-10 grid place-items-center px-6 text-center text-sm text-rose-600">{error}</div>}
            {!error && !loading && !forecast && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">No forecast for this date.</div>}
            <ResponsiveContainer width="100%" height="100%" minHeight={140}>
              <ComposedChart data={rows} margin={{ top: 10, right: 16, bottom: 34, left: 14 }}>
                <defs>
                  <linearGradient id="tuneupSysFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SYS_COLOR} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={SYS_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.7} />
                {toBlock > fromBlock && (
                  <ReferenceArea x1={fromBlock - 1} x2={toBlock - 1} fill={SYS_COLOR} fillOpacity={0.07} ifOverflow="hidden">
                    <Label value="adjust range" position="insideTop" fontSize={10} fill="hsl(var(--muted-foreground))" offset={6} />
                  </ReferenceArea>
                )}
                <XAxis dataKey="i" type="number" domain={[0, 95]} ticks={X_TICKS} height={26} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} tick={<XTick />} interval={0}>
                  <Label value="Time of day" position="insideBottom" offset={-6} fontSize={11} fill="hsl(var(--muted-foreground))" />
                </XAxis>
                <YAxis domain={yDomain} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmt(v)} tickCount={6}>
                  <Label value="Demand (MW)" angle={-90} position="insideLeft" style={{ textAnchor: "middle" }} offset={4} fontSize={11} fill="hsl(var(--muted-foreground))" />
                </YAxis>
                <Tooltip cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.3, strokeDasharray: "3 3" }} content={<MainTip committed={modCommitted} />} />
                <Area dataKey="system" type="monotone" stroke="none" fill="url(#tuneupSysFill)" isAnimationActive={false} connectNulls activeDot={false} />
                <Line dataKey="system" name="System Forecast" type="monotone" stroke={SYS_COLOR} strokeWidth={2.6} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} connectNulls />
                {hasActual && <Line dataKey="actual" name="Actual" type="monotone" stroke={ACT_COLOR} strokeWidth={1.6} dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }} isAnimationActive={false} connectNulls />}
                {modified && <Line dataKey="modified" name="Modified" type="monotone" stroke={MOD_COLOR} strokeWidth={2.4} strokeDasharray={modCommitted ? "" : "6 3"} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <ChartLegend items={legendItems} />

          {/* stats footer */}
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {([
              { k: "Peak", v: activeStats?.peak, u: "MW" },
              { k: "Min", v: activeStats?.min, u: "MW" },
              { k: "Avg", v: activeStats?.avg, u: "MW" },
              { k: "Off-peak", v: activeStats?.offpeak, u: "MW" },
              { k: "Energy", v: activeStats?.energy_mwh, u: "MWh" },
              { k: "MAPE", v: activeMape, u: "%", mape: true },
            ]).map(({ k, v, u, mape }) => (
              <div key={k} className="rounded-md border bg-muted/30 px-2.5 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className="num text-sm font-semibold leading-tight">
                  {v == null ? "—" : mape ? `${(v as number).toFixed(2)}` : fmt(v as number)}
                  <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{v == null ? "" : u}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right column ────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 shrink grow-[1.35] basis-0 flex-col gap-3 lg:grow-[1]">
          {/* date control */}
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
            <input type="date" value={date} min={config?.date_range.min} max={config?.date_range.max}
              onChange={(e) => setDate(e.target.value)} className="h-8 flex-1 rounded-md border bg-card px-2 text-sm" />
            <select value={model} onChange={(e) => setModel(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-sm">
              {(forecast?.available_models ?? config?.models ?? ["System"]).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button type="button" disabled={!dateDirty || loading || locationId == null}
              onClick={() => locationId != null && loadForecast(locationId, date)}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load"}
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between border-b">
              <div className="flex gap-4">
                {TABS.map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    className={"border-b-2 pb-2 text-sm font-medium " + (tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                    {t}{t === "Rules" && rules.length ? ` (${rules.length})` : ""}
                  </button>
                ))}
              </div>
              <Info className="mb-2 h-3.5 w-3.5 text-muted-foreground" />
            </div>

            {/* single scroll region: tab content fills when there's room, scrolls only when cramped */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {tab === "Control" && (
              <ControlTab
                {...{ busy, adjust, setAdjust, preBlocks, setPreBlocks, postBlocks, setPostBlocks, fromBlock, setFromBlock, toBlock, setToBlock, action, setAction, fromValue, setFromValue, toValue, setToValue, refDate, setRefDate, mpex, setMpex, similarDays }}
                onForecast={runEnsemble} onChange={() => applySetline(false)} onUpdate={() => applySetline(true)}
                onReset={() => { setAdjust("Yes"); setPreBlocks(5); setPostBlocks(5); setFromBlock(1); setToBlock(96); setAction("Add"); setFromValue(100); setToValue(100); setRefDate(""); setMpex(1); resetMod(); }}
                onCsv={exportCsv}
              />
            )}

            {tab === "Rules" && (
              <RulesTab
                {...{ rules, history, busy, nrFrom, setNrFrom, nrTo, setNrTo, nrAction, setNrAction, nrFromV, setNrFromV, nrToV, setNrToV }}
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
                {...{ config, weatherCity, setWeatherCity, weather, similarDays, refDates }}
                onCycleRef={cycleRef}
              />
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Control tab ───────────────────────────────────────────────────────
function ControlTab(p: {
  busy: boolean;
  adjust: string; setAdjust: (v: string) => void;
  preBlocks: number; setPreBlocks: (v: number) => void;
  postBlocks: number; setPostBlocks: (v: number) => void;
  fromBlock: number; setFromBlock: (v: number) => void;
  toBlock: number; setToBlock: (v: number) => void;
  action: string; setAction: (v: string) => void;
  fromValue: number; setFromValue: (v: number) => void;
  toValue: number; setToValue: (v: number) => void;
  refDate: string; setRefDate: (v: string) => void;
  mpex: number; setMpex: (v: number) => void;
  similarDays: SimilarDay[];
  onForecast: () => void; onChange: () => void; onUpdate: () => void; onReset: () => void; onCsv: () => void;
}) {
  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={p.onForecast} disabled={p.busy} className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">Forecast</button>
        <button type="button" onClick={p.onChange} disabled={p.busy} className="rounded-md px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ background: "#f59e0b" }}>Change</button>
        <button type="button" onClick={p.onUpdate} disabled={p.busy} className="inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ background: "#0f766e" }}>
          {p.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Update
        </button>
      </div>

      <div className="mt-2 divide-y">
        <div className="flex items-center justify-between gap-2 py-2">
          <span className={labelCls}>Adjust</span>
          <div className="flex items-center gap-2">
            <select value={p.adjust} onChange={(e) => p.setAdjust(e.target.value)} className="h-8 w-16 rounded-md border bg-card px-2 text-sm"><option>Yes</option><option>No</option></select>
            <span className={labelCls}>Pre</span>
            <input type="number" value={p.preBlocks} onChange={(e) => p.setPreBlocks(+e.target.value)} className="h-8 w-14 rounded-md border bg-card px-2 text-right text-sm" />
            <span className={labelCls}>Post</span>
            <input type="number" value={p.postBlocks} onChange={(e) => p.setPostBlocks(+e.target.value)} className="h-8 w-14 rounded-md border bg-card px-2 text-right text-sm" />
          </div>
        </div>
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

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-2">
          <span className={labelCls}>Mpex</span>
          <input type="number" value={p.mpex} onChange={(e) => p.setMpex(+e.target.value)} className="h-8 w-14 rounded-md border bg-card px-2 text-center text-sm" />
        </div>
        <button type="button" onClick={p.onCsv} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"><Download className="h-3.5 w-3.5" /> CSV</button>
        <button type="button" onClick={p.onReset} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
      </div>
    </>
  );
}

// ── Rules tab ─────────────────────────────────────────────────────────
function RulesTab(p: {
  rules: Rule[]; history: RuleHistory | null; busy: boolean;
  nrFrom: number; setNrFrom: (v: number) => void; nrTo: number; setNrTo: (v: number) => void;
  nrAction: string; setNrAction: (v: string) => void; nrFromV: number; setNrFromV: (v: number) => void; nrToV: number; setNrToV: (v: number) => void;
  onAdd: () => void; onAddApply: () => void;
  onEdit: (id: string, patch: Partial<Rule>) => void; onDelete: (id: string) => void; onToggle: (r: Rule) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onUndo: () => void; onRedo: () => void; onClear: () => void; onApply: () => void;
}) {
  const enabledCount = p.rules.filter((r) => r.enabled).length;
  const miniNum = "h-7 w-full rounded border bg-card px-1 text-right text-xs tabular-nums";
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      {/* add form */}
      <div className="rounded-md border bg-muted/20 p-2">
        <div className="grid grid-cols-5 gap-1.5">
          <label className="text-[10px] text-muted-foreground">From<input type="number" min={1} max={96} value={p.nrFrom} onChange={(e) => p.setNrFrom(+e.target.value)} className={miniNum} /></label>
          <label className="text-[10px] text-muted-foreground">To<input type="number" min={1} max={96} value={p.nrTo} onChange={(e) => p.setNrTo(+e.target.value)} className={miniNum} /></label>
          <label className="col-span-3 text-[10px] text-muted-foreground">Action<select value={p.nrAction} onChange={(e) => p.setNrAction(e.target.value)} className="h-7 w-full rounded border bg-card px-1 text-xs">{TUNEUP_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
          <label className="text-[10px] text-muted-foreground">From Val<input type="number" value={p.nrFromV} onChange={(e) => p.setNrFromV(+e.target.value)} className={miniNum} /></label>
          <label className="text-[10px] text-muted-foreground">To Val<input type="number" value={p.nrToV} onChange={(e) => p.setNrToV(+e.target.value)} className={miniNum} /></label>
          <div className="col-span-3 flex items-end gap-1.5">
            <button type="button" onClick={p.onAdd} disabled={p.busy} className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded border text-xs font-medium hover:bg-accent disabled:opacity-50"><Plus className="h-3 w-3" />Add</button>
            <button type="button" onClick={p.onAddApply} disabled={p.busy} className="h-7 flex-1 rounded text-xs font-medium text-white hover:opacity-90 disabled:opacity-50" style={{ background: "#f59e0b" }}>Add & Apply</button>
          </div>
        </div>
      </div>

      {/* list */}
      <div className="mt-2 min-h-0 flex-1 space-y-1.5">
        {p.rules.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No rules yet.</p>}
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
        <div className="flex items-center gap-1">
          <button type="button" onClick={p.onUndo} disabled={p.busy || !p.history?.can_undo} className="inline-flex items-center gap-1 rounded border px-2 py-1 font-medium hover:bg-accent disabled:opacity-40"><RotateCcw className="h-3 w-3" />Undo</button>
          <button type="button" onClick={p.onRedo} disabled={p.busy || !p.history?.can_redo} className="inline-flex items-center gap-1 rounded border px-2 py-1 font-medium hover:bg-accent disabled:opacity-40"><RotateCw className="h-3 w-3" />Redo</button>
          <button type="button" onClick={p.onClear} disabled={p.busy || !p.rules.length} className="inline-flex items-center gap-1 rounded border px-2 py-1 font-medium hover:bg-accent disabled:opacity-40"><Copy className="h-3 w-3" />Clear</button>
        </div>
        <button type="button" onClick={p.onApply} disabled={p.busy || !enabledCount} className="rounded px-3 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-40" style={{ background: "#f59e0b" }}>Apply All Rules</button>
      </div>
      {p.history?.last_label && <p className="mt-1 text-[10px] text-muted-foreground">Last: {p.history.last_label}</p>}
    </div>
  );
}

// ── Weather tab ───────────────────────────────────────────────────────
const WEATHER_METRICS: { key: string; label: string; unit: string; color: string }[] = [
  { key: "temperature", label: "Temperature", unit: "°C", color: "#ef4444" },
  { key: "relativeHumidity", label: "Humidity", unit: "%", color: "#3b82f6" },
  { key: "cloudCover", label: "Cloud Cover", unit: "", color: "#64748b" },
];

function WeatherTip({ active, payload, label, unit, color, name }: { active?: boolean; payload?: { value: number }[]; label?: number; unit: string; color: string; name: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-lg">
      <span className="text-muted-foreground">{blockTime((label ?? 0) + 1)} · </span>
      <span className="font-semibold" style={{ color }}>{name} {payload[0].value}{unit}</span>
    </div>
  );
}

function WeatherTab(p: {
  config: TuneupConfig | null;
  weatherCity: string; setWeatherCity: (v: string) => void;
  weather: WeatherMulti | null; similarDays: SimilarDay[]; refDates: string[];
  onCycleRef: (d: string) => void;
}) {
  const cur = p.weather?.locations?.[p.weatherCity]?.current ?? null;
  const metricRows = (key: string) => {
    const m = cur?.[key];
    if (!m) return [];
    return Array.from({ length: 96 }, (_, k) => ({ i: k, v: m[String(k + 1)] ?? null }));
  };
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
      <select value={p.weatherCity} onChange={(e) => p.setWeatherCity(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-sm">
        {(p.config?.weather_locations ?? []).map((w) => <option key={w} value={w}>{w}</option>)}
      </select>

      {/* similar days → reference picker */}
      <div>
        <div className={labelCls + " mb-1"}>Similar days (pick up to 2 references)</div>
        <div className="flex flex-wrap gap-1">
          {p.similarDays.length === 0 && <span className="text-xs text-muted-foreground">No similar days.</span>}
          {p.similarDays.slice(0, 10).map((s) => {
            const on = p.refDates.includes(s.date);
            return (
              <button key={s.date} type="button" onClick={() => p.onCycleRef(s.date)}
                className={"rounded-full border px-2 py-0.5 text-[11px] " + (on ? "border-primary bg-primary/15 text-primary" : "hover:bg-accent")}>
                {s.date} · {(s.score * 100).toFixed(0)}%
              </button>
            );
          })}
        </div>
      </div>

      {/* metric mini-charts — flex to fill the remaining height, no inner scrollbar */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        {!cur && <p className="py-6 text-center text-sm text-muted-foreground">No weather data.</p>}
        {cur && WEATHER_METRICS.map((metric) => {
          const data = metricRows(metric.key);
          const nums = data.map((d) => d.v).filter((v): v is number => v != null);
          if (!nums.length) return null;
          const lo = Math.min(...nums), hi = Math.max(...nums);
          const fid = `wx-${metric.key}`;
          return (
            <div key={metric.key} className="flex min-h-[84px] flex-1 flex-col rounded-lg border bg-muted/20 p-2.5">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold">{metric.label}</span>
                <span className="num text-[11px] tabular-nums text-muted-foreground">
                  {lo.toFixed(1)}–{hi.toFixed(1)}<span className="ml-0.5">{metric.unit}</span>
                </span>
              </div>
              <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={fid} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={metric.color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={["auto", "auto"]} />
                  <XAxis dataKey="i" type="number" domain={[0, 95]} hide />
                  <Tooltip cursor={{ stroke: metric.color, strokeOpacity: 0.3 }} content={<WeatherTip unit={metric.unit} color={metric.color} name={metric.label} />} />
                  <Area dataKey="v" type="monotone" stroke="none" fill={`url(#${fid})`} isAnimationActive={false} connectNulls />
                  <Line dataKey="v" type="monotone" stroke={metric.color} strokeWidth={1.8} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
