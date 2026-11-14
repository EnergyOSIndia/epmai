import { useEffect, useMemo, useState } from "react";
import { Chart } from "@highcharts/react";
import { istNow, type TfId } from "@/data/engine";
import type { ChartSpec } from "@/data/model";
import type { SupplyDayDetail } from "@/store/features/supplyTypes";
import { useAppDispatch } from "@/store/hooks";
import { fetchDayPlantSupply, fetchPeriodAvgSupply } from "@/store/slice/supplyApiSlice";
import { dayChartOptions } from "@/components/weeksupply/DayChartCard";
import { currentBlock, fromApiDay, getWeekRange, isoOf, monthDays, todayIso } from "@/components/weeksupply/weekSupplyData";
import { Spark } from "@/components/chart/Spark";

type Loaded = { detail: SupplyDayDetail; date: string } | null;

// The periods the Planning pages open on: tomorrow, next Mon–Sun week, next month.
const tomorrowIso = () => { const d = istNow(); d.setDate(d.getDate() + 1); return isoOf(d); };
const nextWeekDays = () => { const d = istNow(); d.setDate(d.getDate() + 7); return getWeekRange(d).days; };
const nextMonthDays = () => { const n = istNow(); return monthDays(new Date(n.getFullYear(), n.getMonth() + 1, 1)); };
/** What each Planning-horizon Supply page opens on: tomorrow's supply, next Mon–Sun week's and next
 *  month's average day (plant-supply/avg-supply). */
const LOADERS: Partial<Record<TfId, { key: () => string; load: (d: ReturnType<typeof useAppDispatch>) => Promise<Loaded> }>> = {
  // Intra-day: today's supply (what the Intra-day page opens on).
  id: {
    key: () => `id:${todayIso()}`,
    load: (d) => d(fetchDayPlantSupply({ date: todayIso() })).unwrap().then((r) => (r.detail ? { detail: r.detail, date: r.date } : null)),
  },
  da: {
    key: () => `da:${tomorrowIso()}`,
    load: (d) => d(fetchDayPlantSupply({ date: tomorrowIso() })).unwrap().then((r) => (r.detail ? { detail: r.detail, date: r.date } : null)),
  },
  wk: {
    key: () => `wk:${isoOf(nextWeekDays()[0])}`,
    load: (d) => {
      const days = nextWeekDays();
      return d(fetchPeriodAvgSupply({ from_date: isoOf(days[0]), to_date: isoOf(days[6]) })).unwrap().then((r) => (r.detail ? { detail: r.detail, date: r.detail.date } : null));
    },
  },
  mo: {
    key: () => `mo:${isoOf(nextMonthDays()[0])}`,
    load: (d) => {
      const days = nextMonthDays();
      return d(fetchPeriodAvgSupply({ from_date: isoOf(days[0]), to_date: isoOf(days[days.length - 1]) })).unwrap().then((r) => (r.detail ? { detail: r.detail, date: r.detail.date } : null));
    },
  },
};
export const hasSupplyPlanSpark = (tf: TfId) => tf in LOADERS;

// One request per period for the whole session (the grid re-renders often).
const loads = new Map<string, Promise<Loaded>>();

/** Command centre · Supply Availability Day / Week / Month ahead cell: the Planning horizon's
 *  "Supply by Category" chart in miniature (same stacks, colours and Demand / Rostering lines;
 *  Week / Month have no Demand). Just a picture: no hover or tooltip. Falls back to `fallback`
 *  (the sample chart) when there is no data. */
export function SupplyPlanSpark({ tf, fallback, height = 20 }: { tf: TfId; fallback?: ChartSpec; height?: number }) {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<Loaded | "none" | undefined>(undefined);
  useEffect(() => {
    const L = LOADERS[tf];
    if (!L) return;
    const key = L.key();
    if (!loads.has(key)) loads.set(key, L.load(dispatch).catch(() => null));
    let live = true;
    loads.get(key)!.then((r) => { if (live) setData(r ?? "none"); });
    return () => { live = false; };
  }, [dispatch, tf]);

  const options = useMemo(() => {
    if (!data || data === "none") return null;
    const { detail, date } = data;
    // Series with a value anywhere in the day, in API order — as the Planning page picks them.
    const names = detail.category.filter((s) => s.data.some((v) => v)).map((s) => s.name);
    if (!names.length) return null;
    const day = fromApiDay({ date, series: detail.category, demand: detail.demand }, names);
    const today = todayIso();
    const oneDay = tf === "da" || tf === "id";
    const common = oneDay ? { isToday: date === today, isPast: date < today, currentBlock: currentBlock() } : { isToday: false, isPast: date.slice(0, 10) <= today, currentBlock: currentBlock() }; // a period not started yet: dotted
    return dayChartOptions({ day, type: "category", hidden: new Set(oneDay ? [] : ["Demand"]), height, names, compact: true, ...common });
  }, [data, tf, height]);

  if (data === "none" || (data && !options)) return fallback ? <Spark spec={fallback} height={height} /> : null;
  if (!options) return null;
  return (
    <span className="pointer-events-none block" style={{ height }}>
      <Chart options={options} containerProps={{ style: { height: "100%", width: "100%" } }} />
    </span>
  );
}
