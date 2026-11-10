import { useCallback, useEffect, useMemo, useState } from "react";
import { NOW } from "@/data/engine";
import { PageHead } from "@/components/layout";
import { DemandCalendar, type YearApi } from "@/components/DemandCalendar";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchSeasons, fetchYearDayDemand, fetchYearDemandForecast } from "@/store/slice/demandApiSlice";
import { SyncDbButton } from "@/components/SyncDbButton";
import { idbDeletePrefix } from "@/lib/idbCache";
import { formatIso } from "../shared/HorizonControls";
import { PeriodControl, PeriodForecastView } from "@/components/dayahead/DemandPeriodForecast";
import type { DayAheadData } from "@/store/features/demandTypes";

type YearType = "current" | "calendar" | "financial";
const YEAR_TYPES: { value: YearType; label: string }[] = [
  { value: "current", label: "Current Year" },
  { value: "calendar", label: "Calendar Year" },
  { value: "financial", label: "Financial Year" },
];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-01" … "2027-10-31" → "Nov 2026 – Oct 2027". */
const rangeText = (r: { from: string; to: string }) =>
  `${MON[+r.from.slice(5, 7) - 1]} ${r.from.slice(0, 4)} – ${MON[+r.to.slice(5, 7) - 1]} ${r.to.slice(0, 4)}`;

/** The shown year (type + offset) — shared by the Forecast page and the calendar. */
function useYearRange() {
  // Year type (default Current Year), stepped a year at a time by the picker, never past the default:
  //  · Current Year — 12 months from the current month, but never before Nov 2026 where the
  //    forecast begins (Nov 2026 – Oct 2027 until 30 Nov, then it rolls a month at a time).
  //  · Calendar Year — Jan – Dec of the current year.
  //  · Financial Year — Apr – Mar of the current financial year.
  const [yearType, setYearType] = useState<YearType>("current");
  const [yearOffset, setYearOffset] = useState(0);
  const yearRange = useMemo(() => {
    const y = NOW.getFullYear();
    let base: Date;
    if (yearType === "calendar") base = new Date(y, 0, 1);
    else if (yearType === "financial") base = new Date(NOW.getMonth() >= 3 ? y : y - 1, 3, 1);
    else {
      const cur = new Date(y, NOW.getMonth(), 1), first = new Date(2026, 10, 1);
      base = cur < first ? first : cur;
    }
    const start = new Date(base.getFullYear() + yearOffset, base.getMonth(), 1);
    const end = new Date(start.getFullYear() + 1, start.getMonth(), 0);
    return { from: formatIso(start), to: formatIso(end) };
  }, [yearType, yearOffset]);
  return { yearType, setYearType, yearOffset, setYearOffset, yearRange };
}

const yearTypeSelect = (yearType: YearType, onChange: (t: YearType) => void, className: string) => (
  <select aria-label="Year type" value={yearType} onChange={(e) => onChange(e.target.value as YearType)} className={className}>
    {YEAR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
  </select>
);

/** Demand · Year ahead — Planning horizon: the Day-ahead Forecast page for the whole year on one
 *  screen — every series the block-by-block average of the year's days (Year-ahead forecast,
 *  data_id 102140, cached) — with the year-type select and ← year → in the KPI row. */
export function DemandYearAhead() {
  const dispatch = useAppDispatch();
  const { yearData, yearLoading, yearError } = useAppSelector((state) => state.demand);
  const { yearType, setYearType, yearOffset, setYearOffset, yearRange } = useYearRange();
  useEffect(() => {
    dispatch(fetchYearDemandForecast({ data_id: 102140, from_date: yearRange.from, to_date: yearRange.to, location_id: 10030, forcasted_by: "System", table: "daily" }));
  }, [dispatch, yearRange]);
  // The stored year belongs to the shown range once its dates fall inside it.
  const ready = !yearLoading && !!yearData && (yearData.dates.length === 0 || (yearData.dates[0] >= yearRange.from && yearData.dates[yearData.dates.length - 1] <= yearRange.to));
  const days = useMemo<DayAheadData[]>(() => (ready && yearData ? yearData.dates.map((date, i) => ({
    date, forecast: yearData.dem[i], actual: null, mape: null, roastering: null, udm: null, errorRanges: null, dayMape: null, manual: null, manualDayMape: null,
  })) : []), [ready, yearData]);
  return (
    <PeriodForecastView
      name="Year" days={days} ready={ready} error={yearError} fromIso={yearRange.from} toIso={yearRange.to}
      control={
        <PeriodControl
          title="Forecast year" label={rangeText(yearRange)} canNext={yearOffset < 0}
          onShift={(dir) => setYearOffset((o) => Math.min(0, o + dir))}
          extra={yearTypeSelect(yearType, (t) => { setYearType(t); setYearOffset(0); }, "mt-1 h-6 rounded-md border bg-card px-1.5 text-[11px] font-medium")}
        />
      }
    />
  );
}

/** Demand · Year ahead — All modules / Command centre: the year calendar. */
function DemandYearAheadCalendar() {
  const dispatch = useAppDispatch();
  const { yearData, yearLoading, yearError, seasons, yearDay } = useAppSelector((state) => state.demand);
  const { yearType, setYearType, yearOffset, setYearOffset, yearRange } = useYearRange();
  useEffect(() => {
    dispatch(fetchYearDemandForecast({ data_id: 102140, from_date: yearRange.from, to_date: yearRange.to, location_id: 10030, forcasted_by: "System", table: "daily" }));
    dispatch(fetchSeasons({ start_date: yearRange.from, end_date: yearRange.to }));
  }, [dispatch, yearRange]);
  const loadYearDay = useCallback((date: string) => {
    dispatch(fetchYearDayDemand({ date, data_id: 102140, location_id: 10030, forcasted_by: "System", table: "daily" }));
  }, [dispatch]);
  // Sync DB: re-call the APIs for the shown window, save any differences to IndexedDB, and drop
  // the saved single days so an opened day re-loads fresh.
  const syncDb = useCallback(async () => {
    const [forecast, season] = await Promise.all([
      dispatch(fetchYearDemandForecast({ data_id: 102140, from_date: yearRange.from, to_date: yearRange.to, location_id: 10030, forcasted_by: "System", table: "daily", sync: true })).unwrap(),
      dispatch(fetchSeasons({ start_date: yearRange.from, end_date: yearRange.to, sync: true })).unwrap(),
    ]);
    await idbDeletePrefix("year-day:");
    return forecast.changed || season.changed;
  }, [dispatch, yearRange]);
  const yearApi = useMemo((): YearApi => ({
    seasons, day: yearDay, loadDay: loadYearDay, range: yearRange,
    shift: (dir) => setYearOffset((o) => Math.min(0, o + dir)), canNext: yearOffset < 0,
    extra: <SyncDbButton onSync={syncDb} />,
    before: yearTypeSelect(yearType, (t) => { setYearType(t); setYearOffset(0); }, "h-7 rounded-md border bg-card px-2 text-[12px] font-medium"),
  }), [seasons, yearDay, loadYearDay, yearRange, yearOffset, yearType, syncDb, setYearOffset, setYearType]);

  return (
    <>
      <PageHead title={null} />
      {yearError && <p className="mt-5 text-sm text-destructive">{yearError}</p>}
      <div className="mt-5">
        <DemandCalendar
          section="year" hideKpis modes={["dem"]} defaultMode="dem"
          externalData={yearData} loading={yearLoading} yearApi={yearApi}
        />
      </div>
    </>
  );
}

/** All modules → Demand (and Command centre → Demand Forecast) keep the year calendar. */
export const DemandYearAheadModule = DemandYearAheadCalendar;
