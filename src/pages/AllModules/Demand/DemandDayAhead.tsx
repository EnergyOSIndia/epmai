// Day-ahead · Demand "Forecast" page: KPI row, 96-block forecast chart, weather, error analysis
// and period breakdown, filling the viewport. System Forecast, Actual, MAPE and Roastering come
// from the day-ahead API and the weather from the weather API (see src/lib/dayahead.ts). The
// chart, weather card, KPI card and tables it uses live in src/components/dayahead/.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { NOW } from "@/data/engine";
import { cn } from "@/lib/utils";
import {
  blockTime, errorBuckets, isoDate, systemBucketsFromApi, kpisOf, buildActuals, periodsOf, todayIso, useDayForecast, useWeather,
} from "@/lib/dayahead";
import { ErrorAnalysisTable } from "@/components/dayahead/ErrorAnalysisTable";
import { ForecastChart } from "@/components/dayahead/ForecastChart";
import { ForecastDateControl } from "@/components/dayahead/ForecastDateControl";
import { KpiCard } from "@/components/dayahead/KpiCard";
import { PeriodBreakdown } from "@/components/dayahead/PeriodBreakdown";
import { WeatherCard } from "@/components/dayahead/WeatherCard";
import { cv } from "@/components/chart/colors";

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const card = "min-h-0 rounded-xl border bg-card p-3";

/** The Forecast page for one date. Day ahead uses the defaults; Week / Month ahead pass their
 *  day_ahead `dataId` (102120 / 102130), their last date and the chart title. */
export function DemandDayAhead({ dataId = 102110, maxDate: lastDate, title }: { dataId?: number; maxDate?: string; title?: string } = {}) {
  const [date, setDate] = useState(todayIso);
  const [location, setLocation] = useState("BH_AL");
  // Up to a week ahead of today (unless the horizon gives its own last date), any day back.
  const maxDate = useMemo(() => { if (lastDate) return lastDate; const d = new Date(NOW); d.setDate(d.getDate() + 7); return isoDate(d); }, [lastDate]);

  // Fill the viewport below the page's own top edge, so nothing scrolls.
  const rootRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(240);
  useLayoutEffect(() => {
    const measure = () => { if (rootRef.current) setTop(rootRef.current.getBoundingClientRect().top + window.scrollY); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div ref={rootRef} className="flex min-h-[640px] flex-col gap-2.5" style={{ height: `calc(100vh - ${top}px - 16px)`, marginTop: -16, marginBottom: -64 }}>
      <ForecastTab date={date} setDate={setDate} maxDate={maxDate} location={location} setLocation={setLocation} dataId={dataId} title={title} />
    </div>
  );
}

function ForecastTab({ date, setDate, maxDate, location, setLocation, dataId, title }: {
  date: string; setDate: (d: string) => void; maxDate: string; location: string; setLocation: (l: string) => void;
  dataId: number; title?: string;
}) {
  const { forecast, actual, mape, roastering, udm, manual, errorRanges, loading, error } = useDayForecast(date, dataId);
  const actuals = useMemo(() => (forecast ? buildActuals(forecast, { actual, mape, roastering, udm, manual }) : null), [forecast, actual, mape, roastering, udm, manual]);
  const weather = useWeather(date);
  const wxDay = weather.days[location];
  const k = useMemo(() => (forecast ? kpisOf(forecast) : null), [forecast]);
  const periods = useMemo(() => (forecast ? periodsOf(forecast) : null), [forecast]);
  const dateCtl = <ForecastDateControl date={date} onChange={setDate} max={maxDate} />;

  if (loading) return <Skeleton dateCtl={dateCtl} />;
  if (error) return <Frame dateCtl={dateCtl}><StatePanel tone="error" title="Forecast Failed" msg={error} /></Frame>;
  if (!forecast || !k || !periods) {
    return <Frame dateCtl={dateCtl}><StatePanel title="" msg="Select a date, then click the arrow to run the forecast" /></Frame>;
  }

  return (
    <>
      <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Total energy" strip={cv("--c-isgs")} value={n2(k.total) + " MWh"} caption="96 blocks summed" />
        <KpiCard title="Peak demand" strip={cv("--neg")} value={n2(k.peak) + " MW"} caption={`Block ${k.peakB + 1} • ${blockTime(k.peakB)}`} />
        <KpiCard title="Min demand" strip={cv("--demand")} value={k.min.toFixed(2) + " MW"} caption="Lowest 15-min block" />
        <KpiCard title="Average demand" strip={cv("--c-ipp")} value={k.avg.toFixed(2) + " MW"} caption="Mean 15-min block" />
        <KpiCard title="Temp range" strip={cv("--c-hydro")} value={wxDay ? `${Math.min(...wxDay.temps).toFixed(1)}°—${Math.max(...wxDay.temps).toFixed(1)}°C` : null} caption="weather forecast" />
        {dateCtl}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-12">
        <div className="flex min-h-0 flex-col gap-2.5 lg:col-span-8">
          <div className={cn(card, "flex-1")}><ForecastChart forecast={forecast} actuals={actuals} date={date} title={title} /></div>
          <div className={cn(card, "flex-1")}>
            <WeatherCard weather={weather} date={date} location={location} onLocation={setLocation} />
          </div>
        </div>
        <div className={cn(card, "flex flex-col gap-3 lg:col-span-4")}>
          <div className="min-h-0 flex-1">
            <ErrorAnalysisTable system={systemBucketsFromApi(errorRanges)} manual={actuals ? errorBuckets(actuals.manualMape, 0.5) : null} />
          </div>
          <div className="border-t" />
          <div className="min-h-0 flex-1"><PeriodBreakdown rows={periods} /></div>
        </div>
      </div>
    </>
  );
}

/** KPI row (with the live date control) over a single panel, for the error and empty states. */
function Frame({ dateCtl, children }: { dateCtl: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Total energy" strip="#3b82f6" value={null} />
        <KpiCard title="Peak demand" strip="#ef4444" value={null} />
        <KpiCard title="Min demand" strip="#f97316" value={null} />
        <KpiCard title="Average demand" strip="#8b5cf6" value={null} />
        <KpiCard title="Temp range" strip="#3b82f6" value={null} />
        {dateCtl}
      </div>
      <div className="grid min-h-0 flex-1 place-items-center rounded-xl border bg-card p-6">{children}</div>
    </>
  );
}

function StatePanel({ tone, title, msg }: { tone?: "error"; title: string; msg: string }) {
  if (tone === "error") {
    return (
      <div className="flex max-w-md items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div><div className="font-semibold">{title}</div><div className="text-[13px]">{msg}</div></div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
      <CalendarDays className="h-10 w-10" />
      <p className="text-[13px]">{msg}</p>
    </div>
  );
}

function Skeleton({ dateCtl }: { dateCtl: ReactNode }) {
  const blk = "animate-pulse rounded-xl bg-muted";
  return (
    <>
      <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className={cn(blk, "h-[74px]")} />)}
        {dateCtl}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-12">
        <div className="flex min-h-0 flex-col gap-2.5 lg:col-span-8">
          <div className={cn(blk, "flex-1")} />
          <div className={cn(blk, "flex-1")} />
        </div>
        <div className={cn(blk, "lg:col-span-4")} />
      </div>
    </>
  );
}

/** All modules → Demand shows the same view as the Planning horizon. */
export const DemandDayAheadModule = () => <DemandDayAhead />;
