// Demand · Zone-wise demand (Details → Intra-day / Day / Week / Month ahead → Demand → Zone-wise
// demand): the Demand Forecast layout — KPI row with the period control, 96-block chart, weather
// card, error analysis, period breakdown — for the three zones (EZ, WZ, CZ) on one chart.
//  · Demand: zone-demand/data (Intra-day 102100, Day ahead 102110) or zone-demand/average
//    (Week 102120, Month 102130), one call per zone; solid where there is an actual, dotted after.
//  · KPIs, period breakdown and error bands: the three zones added together.
//  · Weather: weather/zone for the zone picked (Central / East / West).
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { istNow } from "@/data/engine";
import { cn } from "@/lib/utils";
import { cv } from "@/components/chart/colors";
import { errorBuckets, kpisOf, periodsOf, todayIso } from "@/lib/dayahead";
import { ZONES, useZoneDemand, useZoneWeather, type ZoneId } from "@/lib/zoneDemand";
import { getWeekRange, isIsoDate, isMonthParam, isoOf, monthDays, monthLabel, monthParam, monthStart, parseIso, weekLabel } from "@/components/weeksupply/weekSupplyData";
import { PeriodControl } from "./DemandPeriodForecast";
import { ErrorAnalysisTable } from "./ErrorAnalysisTable";
import { ForecastDateControl } from "./ForecastDateControl";
import { KpiCard } from "./KpiCard";
import { PeriodBreakdown } from "./PeriodBreakdown";
import { WeatherCard } from "./WeatherCard";
import { ZoneDemandChart } from "./ZoneDemandChart";

export type ZoneKind = "intraday" | "day" | "week" | "month";
const DATA_ID: Record<ZoneKind, number> = { intraday: 102100, day: 102110, week: 102120, month: 102130 };
const NAME: Record<ZoneKind, string> = { intraday: "Intra-day", day: "Day-Ahead", week: "Week-Ahead", month: "Month-Ahead" };
const ZONE_NAME = Object.fromEntries(ZONES.map((z) => [z.id, `${z.name} (${z.code})`])) as Record<string, string>;

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const card = "min-h-0 rounded-xl border bg-card p-3";

export function ZoneDemandForecast({ kind }: { kind: ZoneKind }) {
  const search = useSearch({ strict: false }) as { week?: string; month?: string };
  const navigate = useNavigate();
  // Day ahead opens on tomorrow (up to today + 7); Intra-day on today (yesterday – tomorrow).
  const [day, setDay] = useState(() => {
    if (kind !== "day") return todayIso();
    const t = parseIso(todayIso()); t.setDate(t.getDate() + 1); return isoOf(t);
  });
  const [zone, setZone] = useState<ZoneId>("central");

  // The shown period — the same choices as the Demand Forecast page.
  const { fromIso, toIso, control } = useMemo((): { fromIso: string; toIso: string; control: ReactNode } => {
    if (kind === "intraday") {
      const t = parseIso(todayIso()), lo = new Date(t), hi = new Date(t);
      lo.setDate(t.getDate() - 1); hi.setDate(t.getDate() + 1);
      const min = isoOf(lo), max = isoOf(hi);
      const d = day < min ? min : day > max ? max : day;
      return { fromIso: d, toIso: d, control: <ForecastDateControl date={d} onChange={setDay} min={min} max={max} /> };
    }
    if (kind === "day") {
      const max = new Date(istNow()); max.setDate(max.getDate() + 7);
      return { fromIso: day, toIso: day, control: <ForecastDateControl date={day} onChange={setDay} max={isoOf(max)} /> };
    }
    if (kind === "week") {
      const cur = getWeekRange(istNow()).monday;
      const next = new Date(cur); next.setDate(next.getDate() + 7);
      const max = new Date(cur); max.setDate(max.getDate() + 21);
      let mon = isIsoDate(search.week) ? getWeekRange(parseIso(search.week)).monday : next;
      if (mon > max) mon = max;
      const days = getWeekRange(mon).days;
      const shift = (dir: -1 | 1) => { const d = new Date(mon); d.setDate(d.getDate() + dir * 7); navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, week: isoOf(d) }), replace: true }); };
      return { fromIso: isoOf(days[0]), toIso: isoOf(days[6]), control: <PeriodControl title="Forecast week" label={weekLabel(mon)} onShift={shift} canNext={mon < max} /> };
    }
    const cur = monthStart(istNow());
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const max = new Date(cur.getFullYear(), cur.getMonth() + 4, 1);
    let first = isMonthParam(search.month) ? parseIso(search.month + "-01") : next;
    if (first > max) first = max;
    const days = monthDays(first);
    const shift = (dir: -1 | 1) => navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, month: monthParam(new Date(first.getFullYear(), first.getMonth() + dir, 1)) }), replace: true });
    return { fromIso: isoOf(days[0]), toIso: isoOf(days[days.length - 1]), control: <PeriodControl title="Forecast month" label={monthLabel(first)} onShift={shift} canNext={first < max} /> };
  }, [kind, day, search.week, search.month, navigate]);

  const dataId = DATA_ID[kind];
  const { lines, error, loading } = useZoneDemand(dataId, fromIso, toIso);

  // The three zones' forecasts added together, block by block (the page shows the forecast only).
  const total = useMemo(() => {
    if (!lines) return null;
    const vals = Array.from({ length: 96 }, (_, b) => {
      const v = ZONES.map((z) => lines[z.id].forecast[b]);
      return v.every((x) => x == null) ? null : v.reduce<number>((s, x) => s + (x ?? 0), 0);
    });
    return vals.some((v) => v == null) ? null : (vals as number[]);
  }, [lines]);
  const k = useMemo(() => (total ? kpisOf(total) : null), [total]);
  const periods = useMemo(() => (total ? periodsOf(total) : null), [total]);
  // Error bands of the total: blocks where all three zones have both an actual and a forecast.
  const bands = useMemo(() => {
    if (!lines) return null;
    const mape: number[] = [];
    for (let b = 0; b < 96; b++) {
      const a = ZONES.map((z) => lines[z.id].actual[b]), f = ZONES.map((z) => lines[z.id].forecast[b]);
      if (a.some((x) => x == null) || f.some((x) => x == null)) continue;
      const A = (a as number[]).reduce((s, x) => s + x, 0), F = (f as number[]).reduce((s, x) => s + x, 0);
      if (A) mape.push((Math.abs(A - F) / A) * 100);
    }
    return mape.length ? errorBuckets(mape, 1) : null;
  }, [lines]);

  // Weather of the picked zone for the period (a week / month averaged).
  const wx = useZoneWeather(zone, dataId, fromIso, toIso);
  const weather = useMemo(() => ({
    locations: ZONES.map((z) => z.id) as string[],
    days: wx.day ? { [zone]: wx.day } : {},
    // No weather (e.g. a week / month that hasn't started) shows "No data available", not the API message.
    loading: wx.loading, error: null,
  }), [wx.day, wx.loading, zone]);
  const today = todayIso();
  const dayLike = kind === "intraday" || kind === "day";
  const wxDate = dayLike ? fromIso : `avg:${fromIso}`;

  // Fill the viewport below the page's own top edge, so nothing scrolls.
  const rootRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(240);
  useLayoutEffect(() => {
    const measure = () => { if (rootRef.current) setTop(rootRef.current.getBoundingClientRect().top + window.scrollY); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const title = `96-Block Zone-wise ${NAME[kind]} Forecast` + (dayLike ? (fromIso === today ? " · today" : "") : ` · ${fromIso} – ${toIso}`);
  const kpiRow = (cells: ReactNode) => <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">{cells}{control}</div>;

  let body: ReactNode;
  if (loading) {
    const blk = "animate-pulse rounded-xl bg-muted";
    body = (
      <>
        {kpiRow(Array.from({ length: 5 }, (_, i) => <div key={i} className={cn(blk, "h-[74px]")} />))}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-12">
          <div className="flex min-h-0 flex-col gap-2.5 lg:col-span-8"><div className={cn(blk, "flex-1")} /><div className={cn(blk, "flex-1")} /></div>
          <div className={cn(blk, "lg:col-span-4")} />
        </div>
      </>
    );
  } else if (!lines || !total || !k || !periods) {
    body = (
      <>
        {kpiRow(["Total energy", "Peak demand", "Min demand", "Average demand", "Temp range"].map((t) => <KpiCard key={t} title={t} value={null} />))}
        <div className="grid min-h-0 flex-1 place-items-center rounded-xl border bg-card p-6">
          <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10" />
            <p className="text-[13px]">{error ?? `No zone-wise forecast is saved for this ${dayLike ? "date" : kind}.`}</p>
          </div>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {kpiRow(<>
          <KpiCard title="Total energy" strip={cv("--c-isgs")} value={n2(k.total) + " MWh"} caption="EZ + WZ + CZ · 96 blocks summed" />
          <KpiCard title="Peak demand" strip={cv("--neg")} value={n2(k.peak) + " MW"} caption={`Block ${k.peakB + 1} · all zones`} />
          <KpiCard title="Min demand" strip={cv("--demand")} value={k.min.toFixed(2) + " MW"} caption="Lowest 15-min block" />
          <KpiCard title="Average demand" strip={cv("--c-ipp")} value={k.avg.toFixed(2) + " MW"} caption="Mean 15-min block" />
          <KpiCard title="Temp range" strip={cv("--c-hydro")} value={wx.day ? `${Math.min(...wx.day.temps).toFixed(1)}°—${Math.max(...wx.day.temps).toFixed(1)}°C` : null} caption={`${ZONES.find((z) => z.id === zone)?.code} weather`} />
        </>)}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-12">
          <div className="flex min-h-0 flex-col gap-2.5 lg:col-span-8">
            <div className={cn(card, "flex-1")}><ZoneDemandChart lines={lines} title={title} /></div>
            <div className={cn(card, "flex-1")}>
              <WeatherCard weather={weather} date={wxDate} location={zone} onLocation={(id) => setZone(id as ZoneId)} label={(id) => ZONE_NAME[id] ?? id} emptyText="No data available" />
            </div>
          </div>
          <div className={cn(card, "flex flex-col gap-3 lg:col-span-4")}>
            <div className="min-h-0 flex-1"><ErrorAnalysisTable system={bands} manual={null} /></div>
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
