import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { istNow } from "@/data/engine";
import { SyncDbButton } from "@/components/SyncDbButton";
import { MonthNavigator } from "@/components/weeksupply/MonthNavigator";
import { dayLong, isMonthParam, isoOf, monthDays, monthParam, monthStart, parseIso, todayIso } from "@/components/weeksupply/weekSupplyData";
import { MarketMonthBox } from "@/components/marketdetail/MarketCalendarCards";
import { MarketChartModal, type ModalChart } from "@/components/marketdetail/MarketChartModal";
import { ToggleGroup } from "@/components/marketdetail/ExchangeToggles";
import { EXCHANGES, MARKETS, getCurrentBlock, type Exchange, type Market } from "@/components/marketdetail/marketDetailData";
import { useMarketRange } from "@/components/marketdetail/useMarketRange";
import { MarketDetailPage } from "@/components/marketdetail/MarketDetailPage";

/** Market Intelligence · Month ahead — Planning-horizon view. Same Mon–Sun calendar as Supply /
 *  Demand's month ahead: one box per date (day number, peak MCP, cleared energy) with a tiny
 *  market chart for the chosen market and exchange (DAM · IEX by default) from /market-graph,
 *  cached in IndexedDB (Sync DB re-checks the API). Click a day to open it full size. Opens on
 *  the current month; goes forward up to next month and back freely (?month=2026-10). */
function MarketIntelligenceMonthAheadPage() {
  const search = useSearch({ strict: false }) as { month?: string };
  const navigate = useNavigate();
  const [market, setMarket] = useState<Market>("DAM");
  const [exchange, setExchange] = useState<Exchange>("IEX");

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

  const { days: range, loading, error, sync } = useMarketRange(fromIso, toIso);

  const today = todayIso();
  const nowBlock = getCurrentBlock();
  const days = useMemo(() => dates.map((d) => {
    const iso = isoOf(d);
    return { iso, date: d, data: range ? range[iso]?.[market][exchange] ?? null : null };
  }), [dates, range, market, exchange]);

  // Mon–Sun calendar slots, like the Demand / Supply month calendars: a month that would need a 6th
  // row wraps its last day(s) into row 1's empty leading cells, so it stays at 5 rows.
  const slots = useMemo(() => {
    const first0 = (dates[0].getDay() + 6) % 7, n = dates.length;
    const total = first0 + n > 35 ? 35 : Math.ceil((first0 + n) / 7) * 7;
    const s: (number | null)[] = new Array(total).fill(null);
    for (let i = 0; i < n; i++) s[(first0 + i) % total] = i;
    return s;
  }, [dates]);

  // The pop-up steps through the month's days.
  const modalCharts = useMemo<ModalChart[]>(
    () => days.flatMap((d) => (d.data ? [{ market, exchange, data: d.data, title: `${dayLong(d.date)} · ${exchange} ${market}`, currentBlock: d.iso === today ? nowBlock : null }] : [])),
    [days, market, exchange, today, nowBlock],
  );
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useEffect(() => { setOpenIdx(null); }, [fromIso, market, exchange]);

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
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <ToggleGroup label="Market" options={MARKETS} value={market} onChange={setMarket} />
          <ToggleGroup label="Exchange" options={EXCHANGES} value={exchange} onChange={setExchange} />
        </div>
        <div className="flex items-center gap-2">
          <MonthNavigator
            first={first}
            canNext={first < maxFirst}
            onShift={(dir) => setMonth(monthParam(new Date(first.getFullYear(), first.getMonth() + dir, 1)))}
          />
          <SyncDbButton onSync={sync} />
        </div>
      </div>
      {error && <p className="mb-2 shrink-0 text-[12px] text-destructive">Live data unreachable ({error})</p>}
      <div className="dc-root min-h-0 flex-1">
        <div ref={calRef} className="dc-cal-scroll min-h-0 flex-1 overflow-hidden">
          <div className="dc-cal">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <div key={w} className="dc-dow">{w}</div>)}
            {slots.map((i, k) => {
              if (i == null) return <div key={"e" + k} className="dc-cell empty" />;
              const d = days[i];
              return (
                <MarketMonthBox
                  key={d.iso + market + exchange}
                  dayNum={d.date.getDate()}
                  exchange={exchange}
                  data={d.data}
                  isToday={d.iso === today}
                  currentBlock={d.iso === today ? nowBlock : null}
                  isLoading={loading}
                  chartH={chartH}
                  onOpen={() => { const j = modalCharts.findIndex((m) => m.data === d.data); if (j >= 0) setOpenIdx(j); }}
                />
              );
            })}
          </div>
        </div>
        <p className="shrink-0 text-[11px] text-muted-foreground">
          Pk = highest MCP of the day · chip = cleared energy (MCV, MU) · hover a day for block values · click a day to open it full size.
        </p>
      </div>
      {openIdx !== null && modalCharts[openIdx] && (
        <MarketChartModal charts={modalCharts} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)} pointWidth={6} currentBlock={null} />
      )}
    </div>
  );
}

/** Planning horizon: the Day-ahead Market Detail page for the month's average day. */
export const MarketIntelligenceMonthAhead = () => <MarketDetailPage kind="month" />;

/** All modules (and Command centre's own views) keep the month-ahead page as it was. */
export const MarketIntelligenceMonthAheadModule = MarketIntelligenceMonthAheadPage;
