// Demand · Week / Month / Year ahead on the Planning horizon: exactly the Day-ahead Forecast page,
// but every series is the block-by-block average of the period's days — KPI row
// (with a week / month navigator in place of the date), the 96-block forecast chart, the weather
// card, the error analysis and the period breakdown.
// Data: the existing calls (Week 102120 / Month 102130 day_ahead, Year 102140 demand-forcast —
// all cached in IndexedDB), averaged here — a ready-made "average day" API isn't built yet.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { istNow } from "@/data/engine";
import { cn } from "@/lib/utils";
import { cv } from "@/components/chart/colors";
import { blockTime, buildActuals, errorBuckets, kpisOf, periodsOf, systemBucketsFromApi, todayIso, useWeather } from "@/lib/dayahead";
import {
  getWeekRange, isIsoDate, isMonthParam, isoOf, monthDays, monthLabel, monthParam, monthStart, parseIso, weekLabel,
} from "@/components/weeksupply/weekSupplyData";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMonthDayAhead, fetchWeekDayAhead } from "@/store/slice/demandApiSlice";
import type { DayAheadData } from "@/store/features/demandTypes";
import { averageDayAhead } from "./DemandWeekCard";
import { ErrorAnalysisTable } from "./ErrorAnalysisTable";
import { ForecastChart } from "./ForecastChart";
import { KpiCard } from "./KpiCard";
import { PeriodBreakdown } from "./PeriodBreakdown";
import { WeatherCard } from "./WeatherCard";

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const card = "min-h-0 rounded-xl border bg-card p-3";

/** Week / Month / Year card in the KPI row (where Day ahead has its date): ← label →, with an
 *  optional control above it (the Year ahead's year-type select). */
export function PeriodControl({ title, label, onShift, canNext, extra }: { title: string; label: string; onShift: (dir: -1 | 1) => void; canNext: boolean; extra?: ReactNode }) {
  const btn = "grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";
  return (
    <KpiCard title={title} className="bg-muted/60">
      {extra}
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" aria-label="Previous" className={btn} onClick={() => onShift(-1)}><ArrowLeft className="h-3.5 w-3.5" /></button>
        <span className="num whitespace-nowrap text-[13px] font-semibold">{label}</span>
        <button type="button" aria-label="Next" className={btn} disabled={!canNext} onClick={() => onShift(1)}><ArrowRight className="h-3.5 w-3.5" /></button>
      </div>
    </KpiCard>
  );
}

export function DemandPeriodForecast({ kind }: { kind: "week" | "month" }) {
  const dispatch = useAppDispatch();
  const { weekAhead, weekAheadLoading, weekAheadError, monthAhead, monthAheadLoading, monthAheadError } = useAppSelector((s) => s.demand);
  const search = useSearch({ strict: false }) as { week?: string; month?: string };
  const navigate = useNavigate();

  // The shown week / month (in the URL, like the grid / calendar), forward up to the next one.
  const { fromIso, toIso, label, canNext, shift } = useMemo(() => {
    if (kind === "week") {
      const cur = getWeekRange(istNow()).monday;
      const max = new Date(cur); max.setDate(max.getDate() + 7);
      let mon = getWeekRange(isIsoDate(search.week) ? parseIso(search.week) : istNow()).monday;
      if (mon > max) mon = max;
      const days = getWeekRange(mon).days;
      return {
        fromIso: isoOf(days[0]), toIso: isoOf(days[6]), label: weekLabel(mon), canNext: mon < max,
        shift: (dir: -1 | 1) => { const d = new Date(mon); d.setDate(d.getDate() + dir * 7); navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, week: isoOf(d) }), replace: true }); },
      };
    }
    const cur = monthStart(istNow());
    const max = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    let first = isMonthParam(search.month) ? parseIso(search.month + "-01") : cur;
    if (first > max) first = max;
    const days = monthDays(first);
    return {
      fromIso: isoOf(days[0]), toIso: isoOf(days[days.length - 1]), label: monthLabel(first), canNext: first < max,
      shift: (dir: -1 | 1) => navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, month: monthParam(new Date(first.getFullYear(), first.getMonth() + dir, 1)) }), replace: true }),
    };
  }, [kind, search.week, search.month, navigate]);

  useEffect(() => {
    if (kind === "week") dispatch(fetchWeekDayAhead({ from_date: fromIso, to_date: toIso }));
    else dispatch(fetchMonthDayAhead({ from_date: fromIso, to_date: toIso }));
  }, [dispatch, kind, fromIso, toIso]);

  const range = kind === "week" ? weekAhead : monthAhead;
  const loading = kind === "week" ? weekAheadLoading : monthAheadLoading;
  const error = kind === "week" ? weekAheadError : monthAheadError;
  const ready = range?.from === fromIso && !loading;
  const days: DayAheadData[] = useMemo(() => (ready ? range.days.filter((d) => d.forecast) : []), [ready, range]);

  return (
    <PeriodForecastView
      name={kind === "week" ? "Week" : "Month"} days={days} ready={ready} error={error} fromIso={fromIso} toIso={toIso}
      control={<PeriodControl title={`Forecast ${kind}`} label={label} onShift={shift} canNext={canNext} />}
    />
  );
}

/** The Forecast page for a period's days (Week / Month / Year ahead): their block-by-block
 *  average in the Day-ahead layout. `control` is the period card in the KPI row. */
export function PeriodForecastView({ name, days, ready, error, fromIso, toIso, control }: {
  name: "Week" | "Month" | "Year";
  /** The period's days that have a forecast. */
  days: DayAheadData[];
  ready: boolean;
  error: string | null;
  fromIso: string;
  toIso: string;
  control: ReactNode;
}) {
  const kind = name.toLowerCase();
  const [location, setLocation] = useState("BH_AL");

  // The average day: every series averaged block by block over the days that have it.
  const avgDay = useMemo(() => averageDayAhead(days, kind), [days, kind]);
  const forecast = avgDay?.forecast ?? null;
  const actuals = useMemo(() => (forecast ? buildActuals(forecast, { actual: avgDay!.actual, mape: avgDay!.mape, roastering: avgDay!.roastering, udm: avgDay!.udm, manual: null }) : null), [forecast, avgDay]);
  const k = useMemo(() => (forecast ? kpisOf(forecast) : null), [forecast]);
  const periods = useMemo(() => (forecast ? periodsOf(forecast) : null), [forecast]);
  // Error bands: the days' API bands, averaged.
  const systemBands = useMemo(() => {
    const per = days.map((d) => systemBucketsFromApi(d.errorRanges)).filter((b): b is number[] => !!b);
    return per.length ? per[0].map((_, i) => +(per.reduce((s, b) => s + b[i], 0) / per.length).toFixed(2)) : null;
  }, [days]);

  // Weather: today when it falls in the shown week / month, else its first day.
  const today = todayIso();
  const wxDate = today >= fromIso && today <= toIso ? today : fromIso;
  const weather = useWeather(wxDate);
  const wxDay = weather.days[location];

  // Fill the viewport below the page's own top edge, so nothing scrolls.
  const rootRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(240);
  useLayoutEffect(() => {
    const measure = () => { if (rootRef.current) setTop(rootRef.current.getBoundingClientRect().top + window.scrollY); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const nameOf = name;
  const avgNote = `${days.length}-day avg`;
  const ctl = control;

  let body: ReactNode;
  if (!ready && !error) {
    const blk = "animate-pulse rounded-xl bg-muted";
    body = (
      <>
        <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className={cn(blk, "h-[74px]")} />)}
          {ctl}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-12">
          <div className="flex min-h-0 flex-col gap-2.5 lg:col-span-8"><div className={cn(blk, "flex-1")} /><div className={cn(blk, "flex-1")} /></div>
          <div className={cn(blk, "lg:col-span-4")} />
        </div>
      </>
    );
  } else if (!forecast || !k || !periods) {
    body = (
      <>
        <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {["Total energy", "Peak demand", "Min demand", "Average demand", "Temp range"].map((t) => <KpiCard key={t} title={t} value={null} />)}
          {ctl}
        </div>
        <div className="grid min-h-0 flex-1 place-items-center rounded-xl border bg-card p-6">
          <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10" />
            <p className="text-[13px]">{error ?? `No forecast for this ${kind}.`}</p>
          </div>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Total energy" strip={cv("--c-isgs")} value={n2(k.total) + " MWh"} caption={`96 blocks summed · ${avgNote}`} />
          <KpiCard title="Peak demand" strip={cv("--neg")} value={n2(k.peak) + " MW"} caption={`Block ${k.peakB + 1} • ${blockTime(k.peakB)}`} />
          <KpiCard title="Min demand" strip={cv("--demand")} value={k.min.toFixed(2) + " MW"} caption="Lowest 15-min block" />
          <KpiCard title="Average demand" strip={cv("--c-ipp")} value={k.avg.toFixed(2) + " MW"} caption="Mean 15-min block" />
          <KpiCard title="Temp range" strip={cv("--c-hydro")} value={wxDay ? `${Math.min(...wxDay.temps).toFixed(1)}°—${Math.max(...wxDay.temps).toFixed(1)}°C` : null} caption="weather forecast" />
          {ctl}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-12">
          <div className="flex min-h-0 flex-col gap-2.5 lg:col-span-8">
            <div className={cn(card, "flex-1")}>
              <ForecastChart forecast={forecast} actuals={actuals} date={kind} title={`96-Block ${nameOf}-Ahead Forecast (${avgNote})`} />
            </div>
            <div className={cn(card, "flex-1")}>
              <WeatherCard weather={weather} date={wxDate} location={location} onLocation={setLocation} />
            </div>
          </div>
          <div className={cn(card, "flex flex-col gap-3 lg:col-span-4")}>
            <div className="min-h-0 flex-1">
              <ErrorAnalysisTable system={systemBands} manual={actuals ? errorBuckets(actuals.manualMape, 0.5) : null} />
            </div>
            <div className="border-t" />
            <div className="min-h-0 flex-1"><PeriodBreakdown rows={periods} /></div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div ref={rootRef} className="flex min-h-[640px] flex-col gap-2.5" style={{ height: `calc(100vh - ${top}px - 16px)`, marginTop: -16, marginBottom: -64 }}>
      {body}
    </div>
  );
}
