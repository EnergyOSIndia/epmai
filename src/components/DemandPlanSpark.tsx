import { useEffect, useMemo, useState } from "react";
import { istNow, type TfId } from "@/data/engine";
import type { ChartSpec } from "@/data/model";
import type { MeanDemandData } from "@/store/features/demandTypes";
import { useAppDispatch } from "@/store/hooks";
import { fetchMeanDemandForecast } from "@/store/slice/demandApiSlice";
import { getWeekRange, isoOf, monthDays, todayIso } from "@/components/weeksupply/weekSupplyData";
import { Spark } from "@/components/chart/Spark";
import { ForecastChart } from "@/components/dayahead/ForecastChart";
import { buildActuals } from "@/lib/dayahead";

// The periods the Planning pages open on: tomorrow, next Mon–Sun week, next month.
const tomorrowIso = () => { const d = istNow(); d.setDate(d.getDate() + 1); return isoOf(d); };
const nextWeekDays = () => { const d = istNow(); d.setDate(d.getDate() + 7); return getWeekRange(d).days; };
const nextMonthDays = () => { const n = istNow(); return monthDays(new Date(n.getFullYear(), n.getMonth() + 1, 1)); };
/** The period each Planning-horizon Demand page opens on: tomorrow, next Mon–Sun week, next month. */
const PERIODS: Partial<Record<TfId, () => { data_id: number; from_date: string; to_date: string }>> = {
  // Intra-day: today (what the Intra-day page opens on), the same day forecast.
  id: () => ({ data_id: 102110, from_date: todayIso(), to_date: todayIso() }),
  da: () => ({ data_id: 102110, from_date: tomorrowIso(), to_date: tomorrowIso() }),
  wk: () => { const d = nextWeekDays(); return { data_id: 102120, from_date: isoOf(d[0]), to_date: isoOf(d[6]) }; },
  mo: () => { const d = nextMonthDays(); return { data_id: 102130, from_date: isoOf(d[0]), to_date: isoOf(d[d.length - 1]) }; },
};
export const hasDemandPlanSpark = (tf: TfId) => tf in PERIODS;

// One request per period for the whole session (the grid re-renders often).
const loads = new Map<string, Promise<MeanDemandData | null>>();

/** Command centre · Demand Day / Week / Month ahead cell: the Planning horizon's forecast chart
 *  itself (ForecastChart in its tiny "bare" mode — Actual, UDM, System, Manual, Roastering and the
 *  MAPE bars, the same lines and colours) for the period the Planning page opens on. Falls back to
 *  `fallback` (the sample line) when the period has no forecast. */
export function DemandPlanSpark({ tf, fallback, height = 20 }: { tf: TfId; fallback?: ChartSpec; height?: number }) {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<MeanDemandData | null | "none">(null);
  const period = useMemo(() => PERIODS[tf]?.(), [tf]);
  useEffect(() => {
    if (!period) return;
    const key = `${period.data_id}:${period.from_date}:${period.to_date}`;
    if (!loads.has(key)) loads.set(key, dispatch(fetchMeanDemandForecast(period)).unwrap().catch(() => null));
    let live = true;
    loads.get(key)!.then((m) => { if (live) setData(m && (m.system || m.manual) ? m : "none"); });
    return () => { live = false; };
  }, [dispatch, period]);

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
  if (!chart || !period) return null;
  return (
    // No hover / tooltip in the grid cell: the chart is just a picture (clicks go to the cell's link).
    <span className="pointer-events-none block" style={{ height }}>
      <ForecastChart forecast={chart.forecast} actuals={chart.actuals} date={tf === "da" || tf === "id" ? period.from_date : tf === "wk" ? "week" : "month"} bare />
    </span>
  );
}
