import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { fetchMarketDay } from "@/store/slice/marketApiSlice";

/** Market Detail: RTM / DAM / GDAM / HPDAM clearing per exchange (IEX, PXIL, HPX) for a date,
 *  with an optional table of the chosen block. Fills the window; only the chart area scrolls. */
export function MarketDetailPage() {
  // The date loads as soon as it changes; the block only picks the table's column of numbers.
  const [date, setDate] = useState(getTodayDate);
  const [block, setBlock] = useState(getCurrentBlock);
  const dispatch = useAppDispatch();
  const { day: data, dayLoading: loading, dayError: error } = useAppSelector((state) => state.market);

  const [active, setActive] = useState<Set<Exchange>>(() => new Set(EXCHANGES));
  const [table, setTable] = useState(false);

  // Stepping quickly through dates: the slice keeps only the latest date's answer.
  useEffect(() => { dispatch(fetchMarketDay({ date })); }, [dispatch, date]);

  const exchanges = EXCHANGES.filter((e) => active.has(e));
  // At least one exchange always stays on.
  const toggle = (e: Exchange) => setActive((s) => {
    const n = new Set(s);
    if (n.has(e)) { if (n.size > 1) n.delete(e); } else n.add(e);
    return n;
  });
  // Bars widen as exchanges are turned off; a bit narrower with the table open.
  const pointWidth = Math.round(({ 1: 24, 2: 12, 3: 6 }[exchanges.length] ?? 6) * (table ? 0.75 : 1));
  const currentBlock = data?.date === getTodayDate() ? getCurrentBlock() : null;

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
  useEffect(() => { setOpenIdx(null); }, [date]);

  const HEAD_H = 26, GAP = 8;
  const rowH = Math.max(MIN_ROW_H, Math.floor((areaH - HEAD_H - GAP * 4) / 3));

  return (
    <div
      ref={rootRef}
      // Negative margins take back most of the page padding so the card uses the whole window;
      // the bottom one cancels the page's bottom padding so the page itself doesn't scroll.
      className="-mx-2 -mt-4 flex min-h-[480px] flex-col overflow-hidden rounded-[10px] border border-[#eef0f4] bg-[#f5f6f8] lg:-mx-6"
      style={{ height: `calc(100vh - ${top}px - 8px)`, marginBottom: -72 }}
    >
      {/* One toolbar: date and block on the left, exchange / table toggles on the right. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#eef0f4] bg-white px-3 py-2">
        <HeaderControls date={date} block={block} loading={loading} onDate={setDate} onBlock={setBlock} />
        <ExchangeToggles active={active} onToggle={toggle} table={table} onTable={() => setTable((t) => !t)} />
      </div>
      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[12px] text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" />Live data unreachable ({error})
        </div>
      )}
      {/* Charts (and table cards) share one scroll area; the exchange names head their columns. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="sticky top-0 z-10 flex gap-2 bg-[#f5f6f8] pt-2" style={{ height: HEAD_H + GAP }}>
          <div className="shrink-0" style={{ width: LABEL_W }} />
          {exchanges.map((e) => (
            <div key={e} className="flex-1 self-center text-center text-[12px] font-bold tracking-wide text-slate-700">{e}</div>
          ))}
          {table && (
            <div className="shrink-0 self-center px-1 text-[12px] font-semibold text-slate-800" style={{ width: panelWidth(exchanges.length) }}>Market Exchange Detail</div>
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
        {!data && loading && <div className="mt-2 h-64 animate-pulse rounded-[10px] bg-slate-200/60" />}
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
