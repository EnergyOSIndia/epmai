// Demand · Day / Week / Month / Year ahead on the Planning horizon: the Day-ahead Forecast layout
// (KPI row with the period control, 96-block forecast chart, weather card, error analysis, period
// breakdown) for one period, from the mean-demand-forecast API only — the period's saved System
// (and Manual) 96-block line; actual, MAPE, roastering and UDM appear once the period is over.
// Periods are the API's: a date, a Mon–Sun week, a calendar month, a calendar year.
// Real-time and Intra-day show the same day forecast (the API has no separate forecast for them):
// Intra-day for yesterday / today / tomorrow (today by default), Real-time for today up to the
// current block (it follows the clock).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { istNow } from "@/data/engine";
import { cn } from "@/lib/utils";
import { cv } from "@/components/chart/colors";
import { blockTime, buildActuals, errorBuckets, kpisOf, periodsOf, todayIso, useWeather, useWeatherAverage } from "@/lib/dayahead";
import {
  currentBlock, getWeekRange, isIsoDate, isMonthParam, isoOf, monthDays, monthLabel, monthParam, monthStart, parseIso, weekLabel,
} from "@/components/weeksupply/weekSupplyData";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMeanDemandForecast } from "@/store/slice/demandApiSlice";
import { ErrorAnalysisTable } from "./ErrorAnalysisTable";
import { ForecastChart } from "./ForecastChart";
import { ForecastDateControl } from "./ForecastDateControl";
import { KpiCard } from "./KpiCard";
import { PeriodBreakdown } from "./PeriodBreakdown";
import { WeatherCard } from "./WeatherCard";

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const card = "min-h-0 rounded-xl border bg-card p-3";

export type PeriodKind = "day" | "week" | "month" | "year" | "intraday" | "realtime";
const DATA_ID: Record<PeriodKind, number> = { day: 102110, week: 102120, month: 102130, year: 102140, intraday: 102100, realtime: 102110 };
const NAME: Record<PeriodKind, string> = { day: "Day", week: "Week", month: "Month", year: "Year", intraday: "Intra-day", realtime: "Real-time" };

/** Week / Month / Year card in the KPI row (where Day ahead has its date): ← label →. */
export function PeriodControl({ title, label, onShift, canNext }: { title: string; label: string; onShift: (dir: -1 | 1) => void; canNext: boolean }) {
  const btn = "grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";
  return (
    <KpiCard title={title} className="bg-muted/60">
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" aria-label="Previous" className={btn} onClick={() => onShift(-1)}><ArrowLeft className="h-3.5 w-3.5" /></button>
        <span className="num whitespace-nowrap text-[13px] font-semibold">{label}</span>
        <button type="button" aria-label="Next" className={btn} disabled={!canNext} onClick={() => onShift(1)}><ArrowRight className="h-3.5 w-3.5" /></button>
      </div>
    </KpiCard>
  );
}

export function DemandPeriodForecast({ kind }: { kind: PeriodKind }) {
  const dispatch = useAppDispatch();
  const { mean, meanLoading, meanError } = useAppSelector((s) => s.demand);
  const search = useSearch({ strict: false }) as { week?: string; month?: string };
  const navigate = useNavigate();
  // Day ahead opens on tomorrow (forward up to today + 7); Intra-day / Real-time on today.
  const [day, setDay] = useState(() => {
    if (kind !== "day") return todayIso();
    const t = parseIso(todayIso()); t.setDate(t.getDate() + 1); return isoOf(t);
  });
  const [year, setYear] = useState(() => istNow().getFullYear());
  const [location, setLocation] = useState("BH_AL");
  // Real-time: the current block, kept up to date (checked every 30 s).
  const [nowB, setNowB] = useState(currentBlock);
  useEffect(() => {
    if (kind !== "realtime") return;
    const id = window.setInterval(() => setNowB(currentBlock()), 30_000);
    return () => window.clearInterval(id);
  }, [kind]);
  const dayLike = kind === "day" || kind === "intraday" || kind === "realtime";

  // The shown period, as the API defines them: a date (up to a week ahead), a Mon–Sun week and a
  // calendar month (up to the next one, in the URL like the grid / calendar), a calendar year.
  const { fromIso, toIso, control } = useMemo((): { fromIso: string; toIso: string; control: ReactNode } => {
    if (kind === "intraday") {
      // Yesterday, today or tomorrow; today by default.
      const t = parseIso(todayIso()), lo = new Date(t), hi = new Date(t);
      lo.setDate(t.getDate() - 1); hi.setDate(t.getDate() + 1);
      const min = isoOf(lo), max = isoOf(hi);
      const d = day < min ? min : day > max ? max : day;
      return { fromIso: d, toIso: d, control: <ForecastDateControl date={d} onChange={setDay} min={min} max={max} /> };
    }
    if (kind === "realtime") {
      const t = todayIso();
      return {
        fromIso: t, toIso: t,
        control: <KpiCard title="Real time" className="bg-muted/60" value={`Block ${nowB + 1}`} caption={`Today · till ${blockTime(nowB)}`} />,
      };
    }
    if (kind === "day") {
      const max = new Date(istNow()); max.setDate(max.getDate() + 7);
      return { fromIso: day, toIso: day, control: <ForecastDateControl date={day} onChange={setDay} max={isoOf(max)} /> };
    }
    if (kind === "week") {
      // Opens on next week; forward up to 2 weeks after it; back as far as there is data.
      const cur = getWeekRange(istNow()).monday;
      const next = new Date(cur); next.setDate(next.getDate() + 7);
      const max = new Date(cur); max.setDate(max.getDate() + 21);
      let mon = isIsoDate(search.week) ? getWeekRange(parseIso(search.week)).monday : next;
      if (mon > max) mon = max;
      const days = getWeekRange(mon).days;
      const shift = (dir: -1 | 1) => { const d = new Date(mon); d.setDate(d.getDate() + dir * 7); navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, week: isoOf(d) }), replace: true }); };
      return { fromIso: isoOf(days[0]), toIso: isoOf(days[6]), control: <PeriodControl title="Forecast week" label={weekLabel(mon)} onShift={shift} canNext={mon < max} /> };
    }
    if (kind === "month") {
      // Opens on next month; forward up to 3 months after it; back as far as there is data.
      const cur = monthStart(istNow());
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const max = new Date(cur.getFullYear(), cur.getMonth() + 4, 1);
      let first = isMonthParam(search.month) ? parseIso(search.month + "-01") : next;
      if (first > max) first = max;
      const days = monthDays(first);
      const shift = (dir: -1 | 1) => navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, month: monthParam(new Date(first.getFullYear(), first.getMonth() + dir, 1)) }), replace: true });
      return { fromIso: isoOf(days[0]), toIso: isoOf(days[days.length - 1]), control: <PeriodControl title="Forecast month" label={monthLabel(first)} onShift={shift} canNext={first < max} /> };
    }
    const maxYear = istNow().getFullYear() + 1;
    return {
      fromIso: `${year}-01-01`, toIso: `${year}-12-31`,
      control: <PeriodControl title="Forecast year" label={`${year} (Jan – Dec)`} onShift={(dir) => setYear((y) => Math.min(maxYear, y + dir))} canNext={year < maxYear} />,
    };
  }, [kind, day, year, search.week, search.month, navigate, nowB]);

  const dataId = DATA_ID[kind];
  useEffect(() => { dispatch(fetchMeanDemandForecast({ data_id: dataId, from_date: fromIso, to_date: toIso })); }, [dispatch, dataId, fromIso, toIso]);
  const ready = !meanLoading && mean?.dataId === dataId && mean.from === fromIso && mean.to === toIso;
  const data = ready ? mean : null;

  // The API's lines: System is the forecast; Manual joins it on the chart once actuals exist.
  const sys = data?.system ?? null, man = data?.manual ?? null;
  const forecast = sys?.forecast ?? man?.forecast ?? null;
  const base = sys ?? man;
  const actuals = useMemo(() => (forecast && base ? buildActuals(forecast, { actual: base.actual, mape: base.mape, roastering: base.roastering, udm: base.udm, manual: sys && man ? man.forecast : null }) : null), [forecast, base, sys, man]);
  // Real-time: everything up to the current block only (the chart stops there too).
  const upTo = kind === "realtime" ? nowB : undefined;
  const k = useMemo(() => (forecast ? kpisOf(upTo == null ? forecast : forecast.slice(0, upTo + 1)) : null), [forecast, upTo]);
  const periods = useMemo(() => {
    if (!forecast) return null;
    if (upTo == null) return periodsOf(forecast);
    // Only the periods that have started, over their blocks so far.
    return periodsOf(forecast.slice(0, upTo + 1)).filter((p) => p.from <= upTo);
  }, [forecast, upTo]);
  // Error bands: share of blocks in each MAPE band, from the API's per-block MAPE.
  const cut = (a: number[]) => (upTo == null ? a : a.slice(0, upTo + 1));
  const systemBands = useMemo(() => (base?.mape ? errorBuckets(cut(base.mape), 1) : null), [base, upTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const manualBands = useMemo(() => (sys && man?.mape ? errorBuckets(cut(man.mape), 0.5) : null), [sys, man, upTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Weather: today when it falls in the shown period, else the period's first day.
  const today = todayIso();
  const wxDate = today >= fromIso && today <= toIso ? today : fromIso;
  // Week / Month ahead: the period's average weather (weather/multi/average); else the date's.
  // The API averages only periods that have started — for a future week / month (no locations
  // back) the card falls back to the date's weather forecast, as before.
  const dayWeather = useWeather(wxDate);
  const avgWeather = useWeatherAverage(fromIso, toIso, kind === "week" || kind === "month");
  const periodWx = (kind === "week" || kind === "month") && (avgWeather.loading || avgWeather.locations.length > 0);
  const weather = periodWx ? avgWeather : dayWeather;
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

  const name = NAME[kind];
  const title = kind === "intraday" || kind === "realtime"
    ? `96-Block ${name} Forecast` + (kind === "realtime" ? ` · till ${blockTime(nowB)}` : "")
    : `96-Block ${name}-Ahead Forecast` + (kind !== "day" && data?.period ? ` · ${data.period}` : "");
  const mapeNote = base?.periodMape != null ? ` · MAPE ${base.periodMape.toFixed(2)}%` : "";

  let body: ReactNode;
  if (!ready && !meanError) {
    const blk = "animate-pulse rounded-xl bg-muted";
    body = (
      <>
        <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className={cn(blk, "h-[74px]")} />)}
          {control}
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
          {control}
        </div>
        <div className="grid min-h-0 flex-1 place-items-center rounded-xl border bg-card p-6">
          <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10" />
            <p className="text-[13px]">{meanError ?? `No ${dayLike ? "day-ahead" : name.toLowerCase() + "-ahead"} forecast is saved for this ${dayLike ? "date" : kind}.`}</p>
          </div>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Total energy" strip={cv("--c-isgs")} value={n2(k.total) + " MWh"} caption={`${upTo == null ? 96 : upTo + 1} blocks summed` + mapeNote} />
          <KpiCard title="Peak demand" strip={cv("--neg")} value={n2(k.peak) + " MW"} caption={`Block ${k.peakB + 1} • ${blockTime(k.peakB)}`} />
          <KpiCard title="Min demand" strip={cv("--demand")} value={k.min.toFixed(2) + " MW"} caption="Lowest 15-min block" />
          <KpiCard title="Average demand" strip={cv("--c-ipp")} value={k.avg.toFixed(2) + " MW"} caption="Mean 15-min block" />
          <KpiCard title="Temp range" strip={cv("--c-hydro")} value={wxDay ? `${Math.min(...wxDay.temps).toFixed(1)}°—${Math.max(...wxDay.temps).toFixed(1)}°C` : null} caption="weather forecast" />
          {control}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-12">
          <div className="flex min-h-0 flex-col gap-2.5 lg:col-span-8">
            <div className={cn(card, "flex-1")}>
              <ForecastChart forecast={forecast} actuals={actuals} date={dayLike ? fromIso : kind} title={title} upTo={upTo} />
            </div>
            <div className={cn(card, "flex-1")}>
              {/* An average day isn't "today": it shows its peak, with no "now" marker. */}
              <WeatherCard weather={weather} date={periodWx ? `avg:${fromIso}` : wxDate} location={location} onLocation={setLocation} />
            </div>
          </div>
          <div className={cn(card, "flex flex-col gap-3 lg:col-span-4")}>
            <div className="min-h-0 flex-1">
              <ErrorAnalysisTable system={systemBands} manual={manualBands} />
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
