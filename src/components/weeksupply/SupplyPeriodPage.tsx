import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { istNow } from "@/data/engine";
import { SyncDbButton } from "@/components/SyncDbButton";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchDayPlantSupply, fetchPeriodAvgSupply, fetchPeriodPlantSupply } from "@/store/slice/supplyApiSlice";
import { BlockSelect, DayNavigator } from "./DayControls";
import { DaySupplyChartCard } from "./DaySupplyChartCard";
import { GraphTypeDropdown } from "./GraphTypeDropdown";
import { MonthNavigator } from "./MonthNavigator";
import { CategoryTable, TableCard, TechnologyTable } from "./SupplyTables";
import { WeekNavigator } from "./WeekNavigator";
import { GRAPH_TYPES, currentBlock, fromApiDay, getWeekRange, isGraphType, todayIso, isIsoDate, isMonthParam, isoOf, monthDays, monthParam, monthStart, parseIso } from "./weekSupplyData";

export type SupplyPeriodKind = "day" | "week" | "month" | "year";

/** ‹ 2026 › — one calendar year at a time; › stops at the current year. */
export function YearNavigator({ year, onShift, canNext }: { year: number; onShift: (dir: -1 | 1) => void; canNext: boolean }) {
  const btn = "grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="inline-flex items-center gap-1 rounded-[10px] border bg-card p-0.5 text-[12px]">
      <button type="button" aria-label="Previous year" className={btn} onClick={() => onShift(-1)}><ChevronLeft className="h-3.5 w-3.5" /></button>
      <span className="min-w-[9.5rem] whitespace-nowrap px-2 text-center font-semibold">{year === istNow().getFullYear() ? "Current Year, " : ""}{year} (Jan – Dec)</span>
      <button type="button" aria-label="Next year" className={btn} disabled={!canNext} onClick={() => onShift(1)}><ChevronRight className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// The period pages have Category and Technology data (Variable Cost / Plants have no API yet).
const PERIOD_GRAPH_TYPES = GRAPH_TYPES.filter((g) => g.id === "category" || g.id === "technology");

/** Supply Availability · Week / Month / Year ahead on the Planning horizon: the Day-ahead page
 *  (Supply by Category or by Technology — one at a time, picked with the Graph Type dropdown like the
 *  week / month grids — with its distribution table at the picked block), filling the window,
 *  for the period's average day — every series averaged block by block over the period's days
 *  from plant-supply/by-category (cached in IndexedDB, Sync re-checks the API). Weeks and months
 *  are in the URL like the grid / calendar (forward up to the next one); years are calendar years. */
export function SupplyPeriodPage({ kind }: { kind: SupplyPeriodKind }) {
  const dispatch = useAppDispatch();
  const { period, periodLoading, periodError, day: dayDetail, dayDate, dayLoading, dayError } = useAppSelector((state) => state.supply);
  const search = useSearch({ strict: false }) as { date?: string; week?: string; month?: string; type?: string };
  const navigate = useNavigate();
  const [year, setYear] = useState(() => istNow().getFullYear());
  // Graph Type in the URL (?type=), like the week / month grids.
  const type = isGraphType(search.type) && (search.type === "category" || search.type === "technology") ? search.type : "category";
  const setType = (t: string) => navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, type: t }), replace: true });

  const { fromIso, toIso, nav } = useMemo(() => {
    if (kind === "day") {
      const today = todayIso(), t = parseIso(today); t.setDate(t.getDate() + 1);
      const tomorrow = isoOf(t);
      const date = isIsoDate(search.date) ? (search.date > tomorrow ? tomorrow : search.date) : today;
      const setDate = (iso: string) => navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, date: iso }), replace: true });
      return { fromIso: date, toIso: date, nav: <DayNavigator date={date} onChange={setDate} canNext={date < tomorrow} /> };
    }
    if (kind === "week") {
      const cur = getWeekRange(istNow()).monday;
      const max = new Date(cur); max.setDate(max.getDate() + 7);
      let mon = getWeekRange(isIsoDate(search.week) ? parseIso(search.week) : istNow()).monday;
      if (mon > max) mon = max;
      const days = getWeekRange(mon).days;
      const shift = (dir: -1 | 1) => { const d = new Date(mon); d.setDate(d.getDate() + dir * 7); navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, week: isoOf(d) }), replace: true }); };
      return { fromIso: isoOf(days[0]), toIso: isoOf(days[6]), nav: <WeekNavigator monday={mon} canNext={mon < max} onShift={shift} /> };
    }
    if (kind === "month") {
      const cur = monthStart(istNow());
      const max = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      let first = isMonthParam(search.month) ? parseIso(search.month + "-01") : cur;
      if (first > max) first = max;
      const days = monthDays(first);
      const shift = (dir: -1 | 1) => navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, month: monthParam(new Date(first.getFullYear(), first.getMonth() + dir, 1)) }), replace: true });
      return { fromIso: isoOf(days[0]), toIso: isoOf(days[days.length - 1]), nav: <MonthNavigator first={first} canNext={first < max} onShift={shift} /> };
    }
    const maxYear = istNow().getFullYear();
    return {
      fromIso: `${year}-01-01`, toIso: `${year}-12-31`,
      nav: <YearNavigator year={year} canNext={year < maxYear} onShift={(dir) => setYear((y) => Math.min(maxYear, y + dir))} />,
    };
  }, [kind, year, search.date, search.week, search.month, navigate]);

  useEffect(() => {
    if (kind === "day") dispatch(fetchDayPlantSupply({ date: fromIso }));
    // Week / Month: the API's own average (plant-supply/avg-supply); Year: the days averaged here.
    else if (kind === "week" || kind === "month") dispatch(fetchPeriodAvgSupply({ from_date: fromIso, to_date: toIso }));
    else dispatch(fetchPeriodPlantSupply({ from_date: fromIso, to_date: toIso }));
  }, [dispatch, kind, fromIso, toIso]);
  const syncDb = useCallback(async () => {
    const args = { from_date: fromIso, to_date: toIso, sync: true };
    const r = await (kind === "week" || kind === "month" ? dispatch(fetchPeriodAvgSupply(args)) : dispatch(fetchPeriodPlantSupply(args))).unwrap();
    return r.changed;
  }, [dispatch, kind, fromIso, toIso]);

  // The tables follow the picked block, which starts at the current one.
  const [block, setBlock] = useState(currentBlock);
  // Day ahead: the date's own data; Week / Month / Year: the period's average day.
  const ready = kind === "day" ? dayDate === fromIso && !dayLoading : period?.from === fromIso && period?.to === toIso && !periodLoading;
  const error = kind === "day" ? dayError : periodError;
  const loading = !ready && !error;
  const api = !ready ? null : kind === "day" ? dayDetail : period!.detail;
  const nDays = ready && kind !== "day" ? period!.days : 0;

  // Series with a value anywhere in the average day, in API order (central then state for Category).
  const catNames = useMemo(() => (api ? api.category.filter((s) => s.data.some((v) => v)).map((s) => s.name) : []), [api]);
  const techNames = useMemo(() => (api ? api.technology.filter((s) => s.data.some((v) => v)).map((s) => s.name) : []), [api]);
  const catDay = useMemo(() => (api ? fromApiDay({ date: api.date, series: api.category, demand: api.demand }, catNames) : null), [api, catNames]);
  const techDay = useMemo(() => (api ? fromApiDay({ date: api.date, series: api.technology, demand: api.demand }, techNames) : null), [api, techNames]);

  // Day ahead: solid up to the current block today, dotted ahead. An average day: solid all through.
  const [nowBlock, setNowBlock] = useState(currentBlock);
  useEffect(() => {
    if (kind !== "day") return;
    const id = window.setInterval(() => setNowBlock(currentBlock()), 30_000);
    return () => window.clearInterval(id);
  }, [kind]);
  const today = todayIso();
  const common = kind === "day"
    ? { isToday: fromIso === today, isPast: fromIso < today, currentBlock: nowBlock }
    : { isToday: false, isPast: true, currentBlock: block };
  const avg = nDays ? ` · ${nDays}-day average` : "";
  const row = type === "category"
    ? {
      chart: <DaySupplyChartCard title={`Supply by Category${avg}`} type="category" day={catDay} names={catNames} isLoading={loading} noDemand={kind === "week" || kind === "month"} {...common} />,
      table: <TableCard title="Category Wise Distribution">{loading ? <TableSkeleton /> : <CategoryTable detail={api} block={block} />}</TableCard>,
    }
    : {
      chart: <DaySupplyChartCard title={`Supply by Technology${avg}`} type="technology" day={techDay} names={techNames} isLoading={loading} noDemand={kind === "week" || kind === "month"} {...common} />,
      table: <TableCard title="Technology Wise Distribution">{loading ? <TableSkeleton /> : <TechnologyTable detail={api} block={block} />}</TableCard>,
    };

  // Fill the window below the page's top edge; negative margins take back most of the page padding.
  const rootRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(240);
  useLayoutEffect(() => {
    const measure = () => { if (rootRef.current) setTop(rootRef.current.getBoundingClientRect().top + window.scrollY); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div
      ref={rootRef}
      className="-mx-2 -mt-4 flex min-h-[560px] flex-col gap-2 rounded-[10px] border bg-card p-2 lg:-mx-6"
      // The bottom margin cancels the page's bottom padding so the page itself doesn't scroll.
      style={{ height: `calc(100vh - ${top}px - 8px)`, marginBottom: -72 }}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <GraphTypeDropdown value={type} onChange={setType} options={PERIOD_GRAPH_TYPES} />
        <div className="flex flex-wrap items-center gap-2">
          {nav}
          <BlockSelect block={block} onChange={setBlock} />
          {kind !== "day" && <SyncDbButton onSync={syncDb} />}
        </div>
      </div>
      {error && <p className="shrink-0 text-[12px] text-destructive">{error}</p>}
      {ready && !api && !error && <p className="shrink-0 text-[12px] text-muted-foreground">No supply data for this {kind === "day" ? "date" : kind}.</p>}
      {/* The one graph and its table fill the rest of the window; on narrow screens they stack. */}
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,2.7fr)_minmax(0,1fr)] max-lg:grid-rows-[420px_minmax(320px,auto)] max-lg:overflow-auto">
        {row.chart}
        {row.table}
      </div>
    </div>
  );
}

const TableSkeleton = () => (
  <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-7 animate-pulse rounded bg-muted" />)}</div>
);
