import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { istNow } from "@/data/engine";
import { DayChartCard } from "@/components/weeksupply/DayChartCard";
import { GraphTypeDropdown } from "@/components/weeksupply/GraphTypeDropdown";
import { SupplyDayModal } from "@/components/weeksupply/SupplyDayModal";
import { WeekNavigator } from "@/components/weeksupply/WeekNavigator";
import { averageDays, currentBlock, dayLong, dayTitle, fromApiDay, getWeekRange, isGraphType, isIsoDate, isoOf, mockDay, parseIso, todayIso, type SupplyGraphType } from "@/components/weeksupply/weekSupplyData";
import { SyncDbButton } from "@/components/SyncDbButton";
import { SupplyPeriodPage } from "@/components/weeksupply/SupplyPeriodPage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchWeekPlantSupply } from "@/store/slice/supplyApiSlice";

// No legend on this page, so no series is ever hidden.
const NO_HIDDEN = new Set<string>();

/** WeekSupplyPage: Graph Type + week navigator over the week's day charts.
 *  Category and Technology come from plant-supply/by-category (cached in IndexedDB, "Sync DB"
 *  re-checks the API); Variable Cost and Plants are still mock data. Graph type and week live in
 *  the URL (?type=category&week=2026-10-26). Weeks run back as far as the API has data, and
 *  forward up to next week. */
function WeekSupplyPage() {
  const dispatch = useAppDispatch();
  const { week: apiWeek, weekLoading, weekError } = useAppSelector((state) => state.supply);
  const search = useSearch({ strict: false }) as { type?: string; week?: string };
  const navigate = useNavigate();
  const type: SupplyGraphType = isGraphType(search.type) ? search.type : "category";
  const isApi = type === "category" || type === "technology";

  const currentMonday = useMemo(() => getWeekRange(istNow()).monday, []);
  const maxMonday = useMemo(() => { const d = new Date(currentMonday); d.setDate(d.getDate() + 7); return d; }, [currentMonday]);
  const monday = useMemo(() => {
    const m = getWeekRange(isIsoDate(search.week) ? parseIso(search.week) : istNow()).monday;
    return m > maxMonday ? maxMonday : m;
  }, [search.week, maxMonday]);
  const mondayIso = isoOf(monday);
  const sundayIso = isoOf(getWeekRange(monday).sunday);
  const setParams = (next: { type?: SupplyGraphType; week?: string }) =>
    navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, type, week: mondayIso, ...next }), replace: true });

  useEffect(() => {
    if (isApi) dispatch(fetchWeekPlantSupply({ from_date: mondayIso, to_date: sundayIso, graph: type }));
  }, [dispatch, isApi, type, mondayIso, sundayIso]);
  const syncDb = useCallback(async () => {
    if (!isApi) return false;
    const r = await dispatch(fetchWeekPlantSupply({ from_date: mondayIso, to_date: sundayIso, graph: type, sync: true })).unwrap();
    return r.changed;
  }, [dispatch, isApi, type, mondayIso, sundayIso]);

  // The current block ticks forward on its own (checked every 30 s).
  const [block, setBlock] = useState(currentBlock);
  useEffect(() => {
    const id = window.setInterval(() => setBlock(currentBlock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Mock graph types: changing the week or graph type shows the skeletons briefly, then redraws.
  const [mockLoading, setMockLoading] = useState(true);
  useEffect(() => {
    setMockLoading(true);
    const id = window.setTimeout(() => setMockLoading(false), 350);
    return () => window.clearTimeout(id);
  }, [type, mondayIso]);
  // API graph types: loading until the response for exactly this week and graph is in.
  const apiReady = !!apiWeek && apiWeek.graph === type && apiWeek.from === mondayIso;
  const loading = isApi ? weekLoading || (!apiReady && !weekError) : mockLoading;


  // API series shown this week: every name that has a non-zero value on any day, in API order —
  // that order also fixes each name's colour across the cards.
  const apiNames = useMemo(() => {
    if (!isApi || !apiReady) return [] as string[];
    const names: string[] = [];
    apiWeek.days.forEach((d) => d?.series.forEach((s) => {
      if (!names.includes(s.name) && s.data.some((v) => v)) names.push(s.name);
    }));
    return names;
  }, [isApi, apiReady, apiWeek]);

  const today = todayIso();
  // Mon Tue Wed / Thu Fri Remarks (Mon–Fri average) / Sat Sun Remarks (Sat–Sun average).
  const cards = useMemo(() => {
    const days = getWeekRange(monday).days.map((d) => {
      const iso = isoOf(d);
      const api = isApi && apiReady ? apiWeek.days.find((x) => x?.date === iso) ?? null : null;
      return { date: d, iso, data: isApi ? (api ? fromApiDay(api, apiNames) : null) : mockDay(iso, type) };
    });
    const remarks = (key: string, group: typeof days) => {
      const data = averageDays(group.flatMap((g) => (g.data ? [g.data] : [])), key);
      const longTitle = key === "weekday" ? "Remarks · Mon–Fri average" : "Remarks · Sat–Sun average";
      return { key, title: "Remarks", longTitle, iso: null, data, footer: data ? `${Math.round(data.demand.reduce((a, b) => a + b, 0) / data.demand.length).toLocaleString("en-IN")} MW avg` : undefined };
    };
    const day = (d: (typeof days)[number]) => ({ key: d.iso, title: dayTitle(d.date), longTitle: dayLong(d.date), iso: d.iso, data: d.data, footer: undefined });
    return [...days.slice(0, 5).map(day), remarks("weekday", days.slice(0, 5)), ...days.slice(5).map(day), remarks("weekend", days.slice(5))];
  }, [monday, type, isApi, apiReady, apiWeek, apiNames]);

  // Clicking a card opens it full size; ← → in the pop-up step through all nine cards.
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useEffect(() => { setOpenIdx(null); }, [type, mondayIso]);
  const modalCards = cards.map((c) => ({ title: c.longTitle, data: c.data, isToday: c.iso === today, isPast: c.iso === null || c.iso < today }));

  // All nine cards on one screen: the page fills the window below its top edge and, on a wide
  // screen (3 columns), the 3 rows share the grid's height. Narrower screens keep fixed-height
  // cards and scroll.
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
      className="flex flex-col rounded-[10px] border bg-card p-3 xl:min-h-[640px]"
      // Negative bottom margin cancels the page's bottom padding so nothing scrolls.
      style={{ height: `calc(100vh - ${top}px - 16px)`, marginBottom: -64 }}
    >
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <GraphTypeDropdown value={type} onChange={(t) => setParams({ type: t })} />
        <div className="flex items-center gap-2">
          <WeekNavigator
            monday={monday}
            canNext={monday < maxMonday}
            onShift={(dir) => { const d = new Date(monday); d.setDate(d.getDate() + dir * 7); setParams({ week: isoOf(d) }); }}
          />
          {isApi && <SyncDbButton onSync={syncDb} />}
        </div>
      </div>
      {isApi && weekError && <p className="mb-2 shrink-0 text-[12px] text-destructive">{weekError}</p>}
      <div ref={gridRef} className="grid min-h-0 flex-1 content-start gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-3 xl:overflow-hidden">
        {cards.map((c, i) => (
          <DayChartCard
            onOpen={loading ? undefined : () => setOpenIdx(i)}
            key={c.key}
            title={c.title}
            isToday={c.iso === today}
            isPast={c.iso === null || c.iso < today}
            currentBlock={block}
            type={type}
            day={c.data}
            isLoading={loading}
            hidden={NO_HIDDEN}
            footer={c.footer}
            names={isApi ? apiNames : undefined}
            height={cardH}
          />
        ))}
      </div>
      {openIdx !== null && (
        <SupplyDayModal
          cards={modalCards} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)}
          type={type} names={isApi ? apiNames : undefined} currentBlock={block}
        />
      )}
    </div>
  );
}

/** Supply Availability · Week ahead — Planning-horizon view. */
/** Planning horizon: the Day-ahead page for the week's average day (see SupplyPeriodPage). */
export const SupplyAvailabilityWeekAhead = () => <SupplyPeriodPage kind="week" />;

/** All modules (and Command centre) keep the Graph Type grid / calendar. */
export const SupplyAvailabilityWeekAheadModule = WeekSupplyPage;
