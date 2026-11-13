import { useEffect, useMemo, useState } from "react";
import { Chart } from "@highcharts/react";
import { istNow, type TfId } from "@/data/engine";
import type { ChartSpec } from "@/data/model";
import type { SupplyDayDetail } from "@/store/features/supplyTypes";
import { useAppDispatch } from "@/store/hooks";
import { fetchDayPlantSupply, fetchPeriodAvgSupply } from "@/store/slice/supplyApiSlice";
import { dayChartOptions } from "@/components/weeksupply/DayChartCard";
import { currentBlock, fromApiDay, getWeekRange, isoOf, monthDays, monthStart, todayIso } from "@/components/weeksupply/weekSupplyData";
import { Spark } from "@/components/chart/Spark";

type Loaded = { detail: SupplyDayDetail; date: string } | null;

/** What each Planning-horizon Supply page opens on: today's supply, this Mon–Sun week's and this
 *  month's average day (plant-supply/avg-supply). */
const LOADERS: Partial<Record<TfId, { key: () => string; load: (d: ReturnType<typeof useAppDispatch>) => Promise<Loaded> }>> = {
  da: {
    key: () => `da:${todayIso()}`,
    load: (d) => d(fetchDayPlantSupply({ date: todayIso() })).unwrap().then((r) => (r.detail ? { detail: r.detail, date: r.date } : null)),
  },
  wk: {
    key: () => `wk:${isoOf(getWeekRange(istNow()).monday)}`,
    load: (d) => {
      const days = getWeekRange(istNow()).days;
      return d(fetchPeriodAvgSupply({ from_date: isoOf(days[0]), to_date: isoOf(days[6]) })).unwrap().then((r) => (r.detail ? { detail: r.detail, date: r.detail.date } : null));
    },
  },
  mo: {
    key: () => `mo:${isoOf(monthStart(istNow()))}`,
    load: (d) => {
      const days = monthDays(monthStart(istNow()));
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
    const common = tf === "da" ? { isToday: date === today, isPast: date < today, currentBlock: currentBlock() } : { isToday: false, isPast: true, currentBlock: currentBlock() };
    return dayChartOptions({ day, type: "category", hidden: new Set(tf === "da" ? [] : ["Demand"]), height, names, compact: true, ...common });
  }, [data, tf, height]);

  if (data === "none" || (data && !options)) return fallback ? <Spark spec={fallback} height={height} /> : null;
  if (!options) return null;
  return (
    <span className="pointer-events-none block" style={{ height }}>
      <Chart options={options} containerProps={{ style: { height: "100%", width: "100%" } }} />
    </span>
  );
}
