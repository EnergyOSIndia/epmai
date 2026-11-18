import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Area, ComposedChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { istNow, type TfId } from "@/data/engine";
import type { ChartSpec } from "@/data/model";
import type { MeanDemandData } from "@/store/features/demandTypes";
import { useAppDispatch } from "@/store/hooks";
import { fetchMeanDemandForecast } from "@/store/slice/demandApiSlice";
import { getWeekRange, isoOf, monthDays, todayIso } from "@/components/weeksupply/weekSupplyData";
import { Spark } from "@/components/chart/Spark";
import { ForecastChart } from "@/components/dayahead/ForecastChart";
import { buildActuals } from "@/lib/dayahead";
import { cv } from "@/components/chart/colors";
import { YearSeasonSpark } from "@/components/YearSeasonSpark";

type Period = { data_id: number; from_date: string; to_date: string; label: string };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
/** 18 Nov */
const dayLabel = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;
/** 23–29 Nov, or 30 Nov–06 Dec across a month end. */
const weekLabel = (a: Date, b: Date) => a.getMonth() === b.getMonth()
  ? `${a.getDate()}–${b.getDate()} ${MON[b.getMonth()]}`
  : `${a.getDate()} ${MON[a.getMonth()]}–${pad(b.getDate())} ${MON[b.getMonth()]}`;
/** December 26 */
const monthLabel = (d: Date) => `${d.toLocaleDateString("en-GB", { month: "long" })} ${String(d.getFullYear()).slice(2)}`;

// The day / Mon–Sun week / calendar month `n` steps after the current one (1 = next).
const dayAhead = (n: number): Period => {
  const d = istNow(); d.setDate(d.getDate() + n);
  return { data_id: 102110, from_date: isoOf(d), to_date: isoOf(d), label: dayLabel(d) };
};
const weekAhead = (n: number): Period => {
  const d = istNow(); d.setDate(d.getDate() + 7 * n);
  const days = getWeekRange(d).days;
  return { data_id: 102120, from_date: isoOf(days[0]), to_date: isoOf(days[6]), label: weekLabel(days[0], days[6]) };
};
const monthAhead = (n: number): Period => {
  const t = istNow(), days = monthDays(new Date(t.getFullYear(), t.getMonth() + n, 1));
  return { data_id: 102130, from_date: isoOf(days[0]), to_date: isoOf(days[days.length - 1]), label: monthLabel(days[0]) };
};

/** The periods each Home Demand cell shows: Intra-day today; Day / Week / Month ahead the period the
 *  Planning page opens on (tomorrow, next Mon–Sun week, next month) and the one after it, side by side. */
const PERIODS: Partial<Record<TfId, () => Period[]>> = {
  // Intra-day: today (what the Intra-day page opens on), the intra-day forecast (day_ahead 102100).
  id: () => [{ data_id: 102100, from_date: todayIso(), to_date: todayIso(), label: "" }],
  da: () => [dayAhead(1), dayAhead(2)],
  wk: () => [weekAhead(1), weekAhead(2)],
  mo: () => [monthAhead(1), monthAhead(2)],
};
// Year ahead: the season box plot (YearSeasonSpark).
export const hasDemandPlanSpark = (tf: TfId) => tf in PERIODS || tf === "yr";

// One request per period for the whole session (the grid re-renders often).
const loads = new Map<string, Promise<MeanDemandData | null>>();

const LABEL_H = 12;

/** Command centre · Demand Intra-day / Day / Week / Month ahead cell: the Planning horizon's forecast
 *  chart itself (ForecastChart in its tiny "bare" mode — Actual, UDM, System, Manual, Roastering and
 *  the MAPE bars, the same lines and colours). Day / Week / Month ahead show two periods' forecasts
 *  on one chart to compare them, each with its date / week / month and colour above it. Falls back to `fallback` (the sample line) when
 *  a period has no forecast. */
export function DemandPlanSpark({ tf, fallback, height = 20 }: { tf: TfId; fallback?: ChartSpec; height?: number }) {
  const periods = useMemo(() => PERIODS[tf]?.() ?? [], [tf]);
  if (tf === "yr") return <YearSeasonSpark fallback={fallback} height={height} />;
  if (periods.length === 1) return <PeriodChart tf={tf} period={periods[0]} fallback={fallback} height={height} />;
  return <CompareChart periods={periods} fallback={fallback} height={height} />;
}

// Overlay colours: the first period in the forecast blue, the next in gold; the gap between them purple.
const COMPARE = [cv("--c-isgs"), cv("--c-solar")];
// Gap above 0 (later period higher) light green, below 0 light red.
const GAP_UP = cv("--pos"), GAP_DOWN = cv("--neg");

// One gap scale for the Day, Week and Month cells: each reports its largest |gap| and all three use
// the largest of them, ±, so the same gap is the same height in every cell (0 in the middle).
const gapMaxes = new Map<string, number>();
const gapListeners = new Set<() => void>();
const sharedGapMax = () => Math.max(1, ...gapMaxes.values());
function useSharedGapMax(key: string, max: number | null) {
  useEffect(() => {
    if (max == null) return;
    gapMaxes.set(key, max);
    gapListeners.forEach((l) => l());
    return () => { gapMaxes.delete(key); gapListeners.forEach((l) => l()); };
  }, [key, max]);
  return useSyncExternalStore((l) => { gapListeners.add(l); return () => gapListeners.delete(l); }, sharedGapMax);
}

/** Load one period's forecast (once per session); null while loading, "none" without a forecast. */
function usePeriodData(period: Period) {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<MeanDemandData | null | "none">(null);
  const { data_id, from_date, to_date } = period;
  useEffect(() => {
    const key = `${data_id}:${from_date}:${to_date}`;
    if (!loads.has(key)) loads.set(key, dispatch(fetchMeanDemandForecast({ data_id, from_date, to_date })).unwrap().catch(() => null));
    let live = true;
    loads.get(key)!.then((m) => { if (live) setData(m && (m.system || m.manual) ? m : "none"); });
    return () => { live = false; };
  }, [dispatch, data_id, from_date, to_date]);
  return data;
}

/** Day / Week / Month ahead: both periods' forecast (System, else Manual) on one chart, to compare
 *  them block by block, with each period's date / week / month and colour above it; the gap between
 *  them (second minus first, MW) is the shaded area on a hidden right axis (green above 0, red below), scaled the same in all
 *  three cells. */
function CompareChart({ periods, fallback, height }: { periods: Period[]; fallback?: ChartSpec; height: number }) {
  const a = usePeriodData(periods[0]), b = usePeriodData(periods[1]);
  const line = (d: typeof a) => (d && d !== "none" ? d.system?.forecast ?? d.manual?.forecast ?? null : null);
  const la = line(a), lb = line(b);
  // Gap per block: the second period minus the first (MW), when both have a forecast.
  const rows = useMemo(() => Array.from({ length: 96 }, (_, i) => ({
    b: i, p0: la?.[i], p1: lb?.[i],
    gap: la && lb ? Math.round((lb[i] - la[i]) * 100) / 100 : undefined,
  })).map((r) => ({ ...r, up: r.gap == null ? undefined : Math.max(0, r.gap), down: r.gap == null ? undefined : Math.min(0, r.gap) })), [la, lb]);
  // Right axis (no labels): ± the largest gap of all three cells, the same scale in each.
  const localMax = useMemo(() => {
    const g = rows.map((r) => r.gap).filter((v): v is number => v != null);
    return g.length ? Math.max(...g.map(Math.abs)) : null;
  }, [rows]);
  const gapMax = useSharedGapMax(periods[0].from_date + ":" + periods[0].data_id, localMax);
  const hasGap = localMax != null;
  if (a === null || b === null) return null;
  if (!la && !lb) return fallback ? <Spark spec={fallback} height={height} /> : null;
  return (
    <span className="pointer-events-none flex flex-col" style={{ height }}>
      <span className="flex shrink-0 gap-2.5 text-[10px] font-medium leading-3 text-muted-foreground" style={{ height: LABEL_H }}>
        {periods.map((p, i) => (
          <span key={p.from_date} className="inline-flex min-w-0 items-center gap-1">
            <span className="h-0.5 w-2.5 shrink-0 rounded" style={{ background: COMPARE[i] }} />
            <span className="truncate">{p.label}</span>
          </span>
        ))}
      </span>
      <span className="block min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis yAxisId="mw" hide domain={["dataMin", "dataMax"]} />
            {/* Right axis: the gap between the two periods (MW), drawn as an area behind the lines. */}
            {hasGap && <YAxis yAxisId="gap" orientation="right" hide domain={[-gapMax, gapMax]} allowDataOverflow />}
            {hasGap && <Area yAxisId="gap" dataKey="up" stroke={GAP_UP} strokeOpacity={0.6} strokeWidth={1} fill={GAP_UP} fillOpacity={0.2} dot={false} isAnimationActive={false} />}
            {hasGap && <Area yAxisId="gap" dataKey="down" stroke={GAP_DOWN} strokeOpacity={0.6} strokeWidth={1} fill={GAP_DOWN} fillOpacity={0.2} dot={false} isAnimationActive={false} />}
            {/* Future periods: dotted, like the forecast line on the single charts. */}
            <Line yAxisId="mw" dataKey="p0" stroke={COMPARE[0]} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
            <Line yAxisId="mw" dataKey="p1" stroke={COMPARE[1]} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </span>
    </span>
  );
}

/** One period's chart. */
function PeriodChart({ tf, period, fallback, height }: { tf: TfId; period: Period; fallback?: ChartSpec; height: number }) {
  const data = usePeriodData(period);
  const { from_date } = period;

  // The same lines the Planning page builds (DemandPeriodForecast).
  const chart = useMemo(() => {
    if (!data || data === "none") return null;
    const sys = data.system, man = data.manual, base = sys ?? man;
    const forecast = sys?.forecast ?? man?.forecast;
    if (!forecast || !base) return null;
    const actuals = buildActuals(forecast, { actual: base.actual, mape: base.mape, roastering: base.roastering, udm: base.udm, manual: sys && man ? man.forecast : null });
    return { forecast, actuals };
  }, [data]);

  if (data === "none") return fallback ? <Spark spec={fallback} height={height} /> : null;
  if (!chart) return null;
  return (
    // No hover / tooltip in the grid cell: the chart is just a picture (clicks go to the cell's link).
    <span className="pointer-events-none block" style={{ height }}>
      <ForecastChart forecast={chart.forecast} actuals={chart.actuals} date={tf === "da" || tf === "id" ? from_date : tf === "wk" ? "week" : "month"} bare />
    </span>
  );
}
