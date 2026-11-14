import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { istNow } from "@/data/engine";
import { SyncDbButton } from "@/components/SyncDbButton";
import { MonthNavigator } from "@/components/weeksupply/MonthNavigator";
import { YearNavigator } from "@/components/weeksupply/SupplyPeriodPage";
import { WeekNavigator } from "@/components/weeksupply/WeekNavigator";
import { getWeekRange, isIsoDate, isMonthParam, isoOf, monthDays, monthParam, monthStart, parseIso } from "@/components/weeksupply/weekSupplyData";
import { AlertTriangle } from "lucide-react";
import { MarketTable, panelWidth } from "./DetailTablePanel";
import { ExchangeToggles } from "./ExchangeToggles";
import { HeaderControls } from "./HeaderControls";
import { MarketChartModal, type ModalChart } from "./MarketChartModal";
import { LABEL_W, MarketRow } from "./MarketRow";
import {
  EXCHANGES, MARKETS, MIN_ROW_H, getCurrentBlock, getTodayDate, type Exchange,
} from "./marketDetailData";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMarketAverage, fetchMarketDay, fetchMarketPeriod } from "@/store/slice/marketApiSlice";

/** Market Detail: RTM / DAM / GDAM / HPDAM clearing per exchange (IEX, PXIL, HPX) for a date,
 *  with an optional table of the chosen block. Fills the window; only the chart area scrolls.
 *  `kind` week / month / year (Planning horizon): the same page for the period's average day —
 *  every value averaged block by block over its days (market-graph, cached; Sync re-checks) —
 *  with the week / month / year navigator in place of the date. */
export function MarketDetailPage({ kind = "day" }: { kind?: "day" | "week" | "month" | "year" } = {}) {
  // The date loads as soon as it changes; the block only picks the table's column of numbers.
  const [date, setDate] = useState(getTodayDate);
  const [block, setBlock] = useState(getCurrentBlock);
  const dispatch = useAppDispatch();
  const market = useAppSelector((state) => state.market);
  const search = useSearch({ strict: false }) as { week?: string; month?: string };
  const navigate = useNavigate();
  const [year, setYear] = useState(() => istNow().getFullYear());

  // Week / Month / Year: the shown period (week / month in the URL like the other pages, forward up
  // to the next one; calendar years up to the current one) and its navigator.
  const period = useMemo(() => {
    if (kind === "week") {
      const cur = getWeekRange(istNow()).monday;
      const max = new Date(cur); max.setDate(max.getDate() + 7);
      let mon = getWeekRange(isIsoDate(search.week) ? parseIso(search.week) : istNow()).monday;
      if (mon > max) mon = max;
      const days = getWeekRange(mon).days;
      const shift = (dir: -1 | 1) => { const d = new Date(mon); d.setDate(d.getDate() + dir * 7); navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, week: isoOf(d) }), replace: true }); };
      return { from: isoOf(days[0]), to: isoOf(days[6]), nav: <WeekNavigator monday={mon} canNext={mon < max} onShift={shift} /> };
    }
    if (kind === "month") {
      const cur = monthStart(istNow());
      const max = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      let first = isMonthParam(search.month) ? parseIso(search.month + "-01") : cur;
      if (first > max) first = max;
      const days = monthDays(first);
      const shift = (dir: -1 | 1) => navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, month: monthParam(new Date(first.getFullYear(), first.getMonth() + dir, 1)) }), replace: true });
      return { from: isoOf(days[0]), to: isoOf(days[days.length - 1]), nav: <MonthNavigator first={first} canNext={first < max} onShift={shift} /> };
    }
    if (kind === "year") {
      const maxYear = istNow().getFullYear();
      return { from: `${year}-01-01`, to: `${year}-12-31`, nav: <YearNavigator year={year} canNext={year < maxYear} onShift={(dir) => setYear((y) => Math.min(maxYear, y + dir))} /> };
    }
    return null;
  }, [kind, year, search.week, search.month, navigate]);

  // Week / Month: the API's own average (market-graph/average); Year: market-graph averaged here.
  const periodThunk = kind === "week" || kind === "month" ? fetchMarketAverage : fetchMarketPeriod;
  useEffect(() => { if (period) dispatch(periodThunk({ from_date: period.from, to_date: period.to })); }, [dispatch, period?.from, period?.to, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const syncPeriod = useCallback(async () => {
    if (!period) return false;
    const r = await dispatch(periodThunk({ from_date: period.from, to_date: period.to, sync: true })).unwrap();
    return r.changed;
  }, [dispatch, period, periodThunk]);
  const periodReady = !!period && market.period?.from === period.from && market.period?.to === period.to;

  // The shown data: the date's (Day ahead) or the period's average day.
  const data = period
    ? (periodReady && !market.periodLoading ? { date: kind, detail: market.period!.detail } : null)
    : market.day;
  const loading = period ? market.periodLoading || !periodReady : market.dayLoading;
  const error = period ? market.periodError : market.dayError;
  const nDays = periodReady ? market.period!.days : 0;

  const [active, setActive] = useState<Set<Exchange>>(() => new Set(EXCHANGES));
  const [table, setTable] = useState(false);

  // Stepping quickly through dates: the slice keeps only the latest date's answer.
  useEffect(() => { if (!period) dispatch(fetchMarketDay({ date })); }, [dispatch, date, period]);

  const exchanges = EXCHANGES.filter((e) => active.has(e));
  // At least one exchange always stays on.
  const toggle = (e: Exchange) => setActive((s) => {
    const n = new Set(s);
    if (n.has(e)) { if (n.size > 1) n.delete(e); } else n.add(e);
    return n;
  });
  // Bars widen as exchanges are turned off; a bit narrower with the table open.
  const pointWidth = Math.round(({ 1: 24, 2: 12, 3: 6 }[exchanges.length] ?? 6) * (table ? 0.75 : 1));
  const currentBlock = !period && data?.date === getTodayDate() ? getCurrentBlock() : null;

  // Fill the window below the page's top edge.
  const rootRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(160);
  useLayoutEffect(() => {
    const measure = () => { if (rootRef.current) setTop(rootRef.current.getBoundingClientRect().top + window.scrollY); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Three market rows share the scroll area's height (so 9 charts show at a time with all three
  // exchanges on); the fourth scrolls into view. Never below MIN_ROW_H.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [areaH, setAreaH] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAreaH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Pop-up: the grid's charts in order (market by market, exchange by exchange); click opens one.
  const modalCharts = useMemo<ModalChart[]>(
    () => (data ? MARKETS.flatMap((m) => exchanges.map((e) => ({ market: m, exchange: e, data: data.detail[m][e] }))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exchanges is derived from active
    [data, active],
  );
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useEffect(() => { setOpenIdx(null); }, [date, period?.from]);

  const HEAD_H = 26, GAP = 8;
  const rowH = Math.max(MIN_ROW_H, Math.floor((areaH - HEAD_H - GAP * 4) / 3));

  return (
    <div
      ref={rootRef}
      // Negative margins take back most of the page padding so the card uses the whole window;
      // the bottom one cancels the page's bottom padding so the page itself doesn't scroll.
      className="-mx-2 -mt-4 flex min-h-[480px] flex-col overflow-hidden rounded-[10px] border border-border bg-background lg:-mx-6"
      style={{ height: `calc(100vh - ${top}px - 8px)`, marginBottom: -72 }}
    >
      {/* One toolbar: date and block on the left, exchange / table toggles on the right. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <HeaderControls
          date={date} block={block} loading={loading} onDate={setDate} onBlock={setBlock}
          nav={period?.nav}
          extra={period ? (
            <>
              {nDays > 0 && <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">{nDays}-day average</span>}
              <SyncDbButton onSync={syncPeriod} />
            </>
          ) : undefined}
        />
        <ExchangeToggles active={active} onToggle={toggle} table={table} onTable={() => setTable((t) => !t)} />
      </div>
      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[12px] text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" />Live data unreachable ({error})
        </div>
      )}
      {/* Charts (and table cards) share one scroll area; the exchange names head their columns. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="sticky top-0 z-10 flex gap-2 bg-background pt-2" style={{ height: HEAD_H + GAP }}>
          <div className="shrink-0" style={{ width: LABEL_W }} />
          {exchanges.map((e) => (
            <div key={e} className="flex-1 self-center text-center text-[12px] font-bold tracking-wide text-foreground">{e}</div>
          ))}
          {table && (
            <div className="shrink-0 self-center px-1 text-[12px] font-semibold text-foreground" style={{ width: panelWidth(exchanges.length) }}>Market Exchange Detail</div>
          )}
        </div>
        {data && (
          <div className="flex flex-col" style={{ gap: GAP }}>
            {MARKETS.map((m) => (
              <MarketRow
                key={m} market={m} exchanges={exchanges} data={data.detail} pointWidth={pointWidth} currentBlock={currentBlock} height={rowH}
                onOpen={(e) => setOpenIdx(modalCharts.findIndex((c) => c.market === m && c.exchange === e))}
                after={table ? <MarketTable market={m} exchanges={exchanges} data={data.detail} block={block} /> : undefined}
              />
            ))}
          </div>
        )}
        {!data && loading && <div className="mt-2 h-64 animate-pulse rounded-[10px] bg-muted" />}
      </div>
      {openIdx !== null && modalCharts[openIdx] && (
        <MarketChartModal
          charts={modalCharts} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)}
          pointWidth={pointWidth} currentBlock={currentBlock}
        />
      )}
    </div>
  );
}
