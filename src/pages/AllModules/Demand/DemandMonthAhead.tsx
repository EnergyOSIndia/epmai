import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { istNow } from "@/data/engine";
import { DemandDayModal, DemandMonthBox } from "@/components/dayahead/DemandMonthBox";
import { SyncDbButton } from "@/components/SyncDbButton";
import { MonthNavigator } from "@/components/weeksupply/MonthNavigator";
import { isMonthParam, isoOf, monthDays, monthParam, monthStart, parseIso, todayIso } from "@/components/weeksupply/weekSupplyData";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMonthDayAhead } from "@/store/slice/demandApiSlice";
import { DemandPeriodForecast } from "@/components/dayahead/DemandPeriodForecast";

/** Demand · Month ahead — Planning-horizon view. Same Mon–Sun calendar as Supply's month ahead:
 *  one box per date (day number, peak forecast, forecast energy) with a tiny Day-ahead forecast
 *  chart (Actual, UDM, System Forecast, Roastering, MAPE) from the day_ahead API with data_id 102130, cached in IndexedDB (Sync DB re-checks the API).
 *  Click a day to open it full size. Opens on the current month; goes forward up to next month and
 *  back freely. The month lives in the URL (?month=2026-10). */
function DemandMonthAheadCalendar() {
  const dispatch = useAppDispatch();
  const { monthAhead, monthAheadLoading, monthAheadError } = useAppSelector((state) => state.demand);
  const search = useSearch({ strict: false }) as { month?: string };
  const navigate = useNavigate();

  const currentFirst = useMemo(() => monthStart(istNow()), []);
  const maxFirst = useMemo(() => new Date(currentFirst.getFullYear(), currentFirst.getMonth() + 1, 1), [currentFirst]);
  const first = useMemo(() => {
    const f = isMonthParam(search.month) ? parseIso(search.month + "-01") : currentFirst;
    return f > maxFirst ? maxFirst : f;
  }, [search.month, currentFirst, maxFirst]);
  const dates = useMemo(() => monthDays(first), [first]);
  const fromIso = isoOf(dates[0]), toIso = isoOf(dates[dates.length - 1]);
  const setMonth = (m: string) =>
    navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, month: m }), replace: true });

  useEffect(() => { dispatch(fetchMonthDayAhead({ from_date: fromIso, to_date: toIso })); }, [dispatch, fromIso, toIso]);
  // Sync DB: re-call the API for this month and save any differences to IndexedDB.
  const syncDb = useCallback(async () => {
    const r = await dispatch(fetchMonthDayAhead({ from_date: fromIso, to_date: toIso, sync: true })).unwrap();
    return r.changed;
  }, [dispatch, fromIso, toIso]);
  const ready = monthAhead?.from === fromIso && !monthAheadLoading;
  const loading = !ready && !monthAheadError;

  const today = todayIso();
  const days = useMemo(() => dates.map((d) => {
    const iso = isoOf(d);
    return { iso, date: d, data: ready ? monthAhead.days.find((x) => x.date === iso) ?? null : null };
  }), [dates, ready, monthAhead]);

  // Mon–Sun calendar slots, like the Demand / Supply month calendars: a month that would need a 6th
  // row wraps its last day(s) into row 1's empty leading cells, so it stays at 5 rows.
  const slots = useMemo(() => {
    const first0 = (dates[0].getDay() + 6) % 7, n = dates.length;
    const total = first0 + n > 35 ? 35 : Math.ceil((first0 + n) / 7) * 7;
    const s: (number | null)[] = new Array(total).fill(null);
    for (let i = 0; i < n; i++) s[(first0 + i) % total] = i;
    return s;
  }, [dates]);

  // The pop-up steps through the days that have a forecast.
  const withForecast = useMemo(() => days.flatMap((d) => (d.data?.forecast ? [d.data] : [])), [days]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useEffect(() => { setOpenIdx(null); }, [fromIso]);

  // Whole month on one screen: the card fills the window below its top edge and the calendar's
  // rows share the space left, so every box's chart grows or shrinks with the window.
  const rootRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(240);
  const [calH, setCalH] = useState(0);
  useLayoutEffect(() => {
    const measure = () => { if (rootRef.current) setTop(rootRef.current.getBoundingClientRect().top + window.scrollY); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    const el = calRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCalH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Per row: 4px gap, box padding/border ~6px, header ~19px. The day-name row takes ~20px.
  const rows = slots.length / 7;
  const chartH = calH ? Math.max(48, Math.floor((calH - 20 - rows * 4) / rows) - 25) : undefined;

  return (
    <div
      ref={rootRef}
      className="flex min-h-[520px] flex-col rounded-[10px] border bg-card p-3"
      // Negative bottom margin cancels the page's bottom padding so nothing scrolls.
      style={{ height: `calc(100vh - ${top}px - 16px)`, marginBottom: -64 }}
    >
      <div className="mb-2 flex shrink-0 items-center justify-end gap-2">
        <MonthNavigator
          first={first}
          canNext={first < maxFirst}
          onShift={(dir) => setMonth(monthParam(new Date(first.getFullYear(), first.getMonth() + dir, 1)))}
        />
        <SyncDbButton onSync={syncDb} />
      </div>
      {monthAheadError && <p className="mb-2 shrink-0 text-[12px] text-destructive">{monthAheadError}</p>}
      <div className="dc-root min-h-0 flex-1">
        <div ref={calRef} className="dc-cal-scroll min-h-0 flex-1 overflow-hidden">
          <div className="dc-cal">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <div key={w} className="dc-dow">{w}</div>)}
            {slots.map((i, k) => {
              if (i == null) return <div key={"e" + k} className="dc-cell empty" />;
              const d = days[i];
              return (
                <DemandMonthBox
                  key={d.iso}
                  dayNum={d.date.getDate()}
                  iso={d.iso}
                  isToday={d.iso === today}
                  day={d.data}
                  isLoading={loading}
                  onOpen={() => setOpenIdx(withForecast.findIndex((x) => x.date === d.iso))}
                  chartH={chartH}
                />
              );
            })}
          </div>
        </div>
        <p className="shrink-0 text-[11px] text-muted-foreground">
          Pk = highest block of the System Forecast · chip = day forecast energy (MU) · hover a day for block values · click a day to open it full size.
        </p>
      </div>
      {openIdx !== null && openIdx >= 0 && withForecast[openIdx] && (
        <DemandDayModal days={withForecast} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)} />
      )}
    </div>
  );
}

/** Demand · Month ahead — Planning horizon: the Forecast page for the whole month on one screen
 *  (every day's 96-block average in one chart, the average 96-block profile, error analysis and
 *  period breakdown) — see components/dayahead/DemandPeriodForecast.tsx. */
export function DemandMonthAhead() {
  return <DemandPeriodForecast kind="month" />;
}

/** All modules → Demand (and Command centre → Demand Forecast) keep the month calendar. */
export const DemandMonthAheadModule = DemandMonthAheadCalendar;
