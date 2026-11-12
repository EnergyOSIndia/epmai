import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { istNow } from "@/data/engine";
import { SyncDbButton } from "@/components/SyncDbButton";
import { SupplyPeriodPage } from "@/components/weeksupply/SupplyPeriodPage";
import { SupplyDayModal } from "@/components/weeksupply/SupplyDayModal";
import { MonthDayBox } from "@/components/weeksupply/MonthDayBox";
import { GraphTypeDropdown } from "@/components/weeksupply/GraphTypeDropdown";
import { MonthNavigator } from "@/components/weeksupply/MonthNavigator";
import { currentBlock, dayLong, dayTitle, fromApiDay, isGraphType, isMonthParam, isoOf, mockDay, monthDays, monthParam, monthStart, parseIso, todayIso, type SupplyGraphType } from "@/components/weeksupply/weekSupplyData";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMonthPlantSupply } from "@/store/slice/supplyApiSlice";

// No legend on this page, so no series is ever hidden.
const NO_HIDDEN = new Set<string>();

/** MonthSupplyPage: Graph Type + month navigator over a Mon–Sun calendar of day boxes (Demand
 *  month-calendar style; click a day to open it full size, ← → step days; no Remarks).
 *  Category and Technology come from plant-supply/by-category (cached
 *  in IndexedDB, "Sync DB" re-checks the API); Variable Cost and Plants are still mock data. Graph
 *  type and month live in the URL (?type=category&month=2026-10). Months run back as far as the API
 *  has data, and forward up to next month. */
function MonthSupplyPage() {
  const dispatch = useAppDispatch();
  const { month: apiMonth, monthLoading, monthError } = useAppSelector((state) => state.supply);
  const search = useSearch({ strict: false }) as { type?: string; month?: string };
  const navigate = useNavigate();
  const type: SupplyGraphType = isGraphType(search.type) ? search.type : "category";
  const isApi = type === "category" || type === "technology";

  const currentFirst = useMemo(() => monthStart(istNow()), []);
  const maxFirst = useMemo(() => new Date(currentFirst.getFullYear(), currentFirst.getMonth() + 1, 1), [currentFirst]);
  const first = useMemo(() => {
    const f = isMonthParam(search.month) ? parseIso(search.month + "-01") : currentFirst;
    return f > maxFirst ? maxFirst : f;
  }, [search.month, currentFirst, maxFirst]);
  const dates = useMemo(() => monthDays(first), [first]);
  const fromIso = isoOf(dates[0]), toIso = isoOf(dates[dates.length - 1]);
  const setParams = (next: { type?: SupplyGraphType; month?: string }) =>
    navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, type, month: monthParam(first), ...next }), replace: true });

  useEffect(() => {
    if (isApi) dispatch(fetchMonthPlantSupply({ from_date: fromIso, to_date: toIso, graph: type }));
  }, [dispatch, isApi, type, fromIso, toIso]);
  const syncDb = useCallback(async () => {
    if (!isApi) return false;
    const r = await dispatch(fetchMonthPlantSupply({ from_date: fromIso, to_date: toIso, graph: type, sync: true })).unwrap();
    return r.changed;
  }, [dispatch, isApi, type, fromIso, toIso]);

  // The current block ticks forward on its own (checked every 30 s).
  const [block, setBlock] = useState(currentBlock);
  useEffect(() => {
    const id = window.setInterval(() => setBlock(currentBlock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Mock graph types: changing the month or graph type shows the skeletons briefly, then redraws.
  const [mockLoading, setMockLoading] = useState(true);
  useEffect(() => {
    setMockLoading(true);
    const id = window.setTimeout(() => setMockLoading(false), 350);
    return () => window.clearTimeout(id);
  }, [type, fromIso]);
  // API graph types: loading until the response for exactly this month and graph is in.
  const apiReady = !!apiMonth && apiMonth.graph === type && apiMonth.from === fromIso;
  const loading = isApi ? monthLoading || (!apiReady && !monthError) : mockLoading;


  // API series shown this month: every name with a non-zero value on any day, in API order —
  // that order also fixes each name's colour across the cards.
  const apiNames = useMemo(() => {
    if (!isApi || !apiReady) return [] as string[];
    const names: string[] = [];
    apiMonth.days.forEach((d) => d?.series.forEach((s) => {
      if (!names.includes(s.name) && s.data.some((v) => v)) names.push(s.name);
    }));
    return names;
  }, [isApi, apiReady, apiMonth]);

  const today = todayIso();
  // One card per date of the month, in date order.
  const cards = useMemo(() => dates.map((d) => {
    const iso = isoOf(d);
    const api = isApi && apiReady ? apiMonth.days.find((x) => x?.date === iso) ?? null : null;
    return { iso, date: d, title: dayTitle(d), data: isApi ? (api ? fromApiDay(api, apiNames) : null) : mockDay(iso, type) };
  }), [dates, type, isApi, apiReady, apiMonth, apiNames]);
  // Mon–Sun calendar slots, like the Demand month calendar: a month that would need a 6th row
  // wraps its last day(s) into row 1's empty leading cells, so it stays at 5 rows.
  const slots = useMemo(() => {
    const first0 = (dates[0].getDay() + 6) % 7, n = dates.length;
    const total = first0 + n > 35 ? 35 : Math.ceil((first0 + n) / 7) * 7;
    const s: (number | null)[] = new Array(total).fill(null);
    for (let i = 0; i < n; i++) s[(first0 + i) % total] = i;
    return s;
  }, [dates]);
  // Clicking a day opens it full size (same pop-up as the week view); ← → step through the month.
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useEffect(() => { setOpenIdx(null); }, [type, fromIso]);
  const modalCards = cards.map((c) => ({ title: dayLong(c.date), data: c.data, isToday: c.iso === today, isPast: c.iso < today }));

  return (
    <div className="rounded-[10px] border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <GraphTypeDropdown value={type} onChange={(t) => setParams({ type: t })} />
        <div className="flex items-center gap-2">
          <MonthNavigator
            first={first}
            canNext={first < maxFirst}
            onShift={(dir) => setParams({ month: monthParam(new Date(first.getFullYear(), first.getMonth() + dir, 1)) })}
          />
          {isApi && <SyncDbButton onSync={syncDb} />}
        </div>
      </div>
      {isApi && monthError && <p className="mb-2 text-[12px] text-destructive">{monthError}</p>}
      <div className="dc-root">
        <div className="dc-cal-scroll">
          <div className="dc-cal">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <div key={w} className="dc-dow">{w}</div>)}
            {slots.map((i, k) => {
              if (i == null) return <div key={"e" + k} className="dc-cell empty" />;
              const c = cards[i];
              return (
                <MonthDayBox
                  key={c.iso}
                  dayNum={c.date.getDate()}
                  isToday={c.iso === today}
                  isPast={c.iso < today}
                  currentBlock={block}
                  type={type}
                  day={c.data}
                  isLoading={loading}
                  hidden={NO_HIDDEN}
                  names={isApi ? apiNames : undefined}
                  onOpen={() => setOpenIdx(i)}
                />
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Pk = highest block of total supply · chip = day supply energy (MU) · hover a day for block values · click a day to open it full size.
        </p>
      </div>
      {openIdx !== null && !loading && (
        <SupplyDayModal
          cards={modalCards} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)}
          type={type} names={isApi ? apiNames : undefined} currentBlock={block}
        />
      )}
    </div>
  );
}

/** Supply Availability · Month ahead — Planning-horizon view. */
/** Planning horizon: the Day-ahead page for the month's average day (see SupplyPeriodPage). */
export const SupplyAvailabilityMonthAhead = () => <SupplyPeriodPage kind="month" />;

/** All modules (and Command centre) keep the Graph Type grid / calendar. */
export const SupplyAvailabilityMonthAheadModule = MonthSupplyPage;
