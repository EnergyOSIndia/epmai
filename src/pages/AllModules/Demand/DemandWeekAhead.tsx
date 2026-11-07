import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { istNow } from "@/data/engine";
import { DemandWeekCard, averageDayAhead } from "@/components/dayahead/DemandWeekCard";
import { SyncDbButton } from "@/components/SyncDbButton";
import { WeekNavigator } from "@/components/weeksupply/WeekNavigator";
import { dayTitle, getWeekRange, isIsoDate, isoOf, parseIso, todayIso } from "@/components/weeksupply/weekSupplyData";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchWeekDayAhead } from "@/store/slice/demandApiSlice";
import { DemandPeriodForecast } from "@/components/dayahead/DemandPeriodForecast";

/** Demand · Week ahead — Planning-horizon view. Same grid as Supply's week ahead: Mon Tue Wed /
 *  Thu Fri Remarks (Mon–Fri average) / Sat Sun Remarks (Sat–Sun average), each card the Day-ahead
 *  forecast chart (Actual, UDM, System Forecast, Roastering, MAPE) from the day_ahead API with
 *  data_id 102120, cached in IndexedDB (Sync DB re-checks the API). Weeks run back freely and forward up to next week; the week lives in the URL
 *  (?week=2026-10-26). */
function DemandWeekAheadGrid() {
  const dispatch = useAppDispatch();
  const { weekAhead, weekAheadLoading, weekAheadError } = useAppSelector((state) => state.demand);
  const search = useSearch({ strict: false }) as { week?: string };
  const navigate = useNavigate();

  const currentMonday = useMemo(() => getWeekRange(istNow()).monday, []);
  const maxMonday = useMemo(() => { const d = new Date(currentMonday); d.setDate(d.getDate() + 7); return d; }, [currentMonday]);
  const monday = useMemo(() => {
    const m = getWeekRange(isIsoDate(search.week) ? parseIso(search.week) : istNow()).monday;
    return m > maxMonday ? maxMonday : m;
  }, [search.week, maxMonday]);
  const mondayIso = isoOf(monday);
  const sundayIso = isoOf(getWeekRange(monday).sunday);
  const setWeek = (iso: string) =>
    navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, week: iso }), replace: true });

  useEffect(() => { dispatch(fetchWeekDayAhead({ from_date: mondayIso, to_date: sundayIso })); }, [dispatch, mondayIso, sundayIso]);
  // Sync DB: re-call the API for this week and save any differences to IndexedDB.
  const syncDb = useCallback(async () => {
    const r = await dispatch(fetchWeekDayAhead({ from_date: mondayIso, to_date: sundayIso, sync: true })).unwrap();
    return r.changed;
  }, [dispatch, mondayIso, sundayIso]);
  const ready = weekAhead?.from === mondayIso && !weekAheadLoading;
  const loading = !ready && !weekAheadError;

  const today = todayIso();
  // Mon Tue Wed / Thu Fri Remarks (Mon–Fri average) / Sat Sun Remarks (Sat–Sun average).
  const cards = useMemo(() => {
    const days = getWeekRange(monday).days.map((d) => {
      const iso = isoOf(d);
      return { key: iso, title: dayTitle(d), iso, data: ready ? weekAhead.days.find((x) => x.date === iso) ?? null : null, footer: undefined as string | undefined };
    });
    const remarks = (key: string, group: typeof days) => {
      const data = averageDayAhead(group.flatMap((g) => (g.data ? [g.data] : [])), key);
      const avg = data?.forecast ? Math.round(data.forecast.reduce((a, b) => a + b, 0) / 96) : null;
      return { key, title: "Remarks", iso: key, data, footer: avg != null ? `${avg.toLocaleString("en-IN")} MW avg` : undefined };
    };
    return [...days.slice(0, 5), remarks("weekday", days.slice(0, 5)), ...days.slice(5), remarks("weekend", days.slice(5))];
  }, [monday, ready, weekAhead]);

  // All nine cards on one screen: the page fills the window below its top edge and, on a wide
  // screen (3 columns), the 3 rows share the grid's height. Narrower screens scroll.
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(240);
  const [cardH, setCardH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const measure = () => { if (rootRef.current) setTop(rootRef.current.getBoundingClientRect().top + window.scrollY); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const GAP = 8, MIN_CARD = 170;
    const ro = new ResizeObserver(([e]) => {
      const threeCols = window.matchMedia("(min-width: 1280px)").matches;
      setCardH(threeCols ? Math.max(MIN_CARD, Math.floor((e.contentRect.height - 2 * GAP) / 3)) : undefined);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      // Negative margins take back most of the page padding so the grid uses the whole window;
      // the bottom one cancels the page's bottom padding so nothing scrolls.
      className="-mx-2 -mt-4 flex flex-col rounded-[10px] border bg-card p-2 lg:-mx-6 xl:min-h-[640px]"
      style={{ height: `calc(100vh - ${top}px - 8px)`, marginBottom: -72 }}
    >
      <div className="mb-2 flex shrink-0 items-center justify-end gap-2">
        <WeekNavigator
          monday={monday}
          canNext={monday < maxMonday}
          onShift={(dir) => { const d = new Date(monday); d.setDate(d.getDate() + dir * 7); setWeek(isoOf(d)); }}
        />
        <SyncDbButton onSync={syncDb} />
      </div>
      {weekAheadError && <p className="mb-2 shrink-0 text-[12px] text-destructive">{weekAheadError}</p>}
      <div ref={gridRef} className="grid min-h-0 flex-1 content-start gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-3 xl:overflow-hidden">
        {cards.map((c) => (
          <DemandWeekCard
            key={c.key}
            title={c.title}
            iso={c.iso}
            isToday={c.iso === today}
            day={c.data}
            isLoading={loading}
            height={cardH}
            footer={c.footer}
          />
        ))}
      </div>
    </div>
  );
}

/** Demand · Week ahead — Planning horizon: the Forecast page for the whole week on one screen
 *  (every day's 96-block average in one chart, the average 96-block profile, error analysis and
 *  period breakdown) — see components/dayahead/DemandPeriodForecast.tsx. */
export function DemandWeekAhead() {
  return <DemandPeriodForecast kind="week" />;
}

/** All modules → Demand (and Command centre → Demand Forecast) keep the 9-card week grid. */
export const DemandWeekAheadModule = DemandWeekAheadGrid;
