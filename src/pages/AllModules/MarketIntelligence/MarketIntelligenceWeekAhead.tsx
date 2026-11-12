import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { istNow } from "@/data/engine";
import { SyncDbButton } from "@/components/SyncDbButton";
import { WeekNavigator } from "@/components/weeksupply/WeekNavigator";
import { dayLong, dayTitle, getWeekRange, isIsoDate, isoOf, parseIso, todayIso } from "@/components/weeksupply/weekSupplyData";
import { MarketWeekCard } from "@/components/marketdetail/MarketCalendarCards";
import { MarketChartModal, type ModalChart } from "@/components/marketdetail/MarketChartModal";
import { ToggleGroup } from "@/components/marketdetail/ExchangeToggles";
import { EXCHANGES, MARKETS, averageBlocks, getCurrentBlock, type BlockPoint, type Exchange, type Market } from "@/components/marketdetail/marketDetailData";
import { useMarketRange } from "@/components/marketdetail/useMarketRange";
import { MarketDetailPage } from "@/components/marketdetail/MarketDetailPage";

/** Market Intelligence · Week ahead — Planning-horizon view. Same grid as Supply / Demand's week
 *  ahead: Mon Tue Wed / Thu Fri Remarks (Mon–Fri average) / Sat Sun Remarks (Sat–Sun average),
 *  each card the day's market chart (Buy, Sell, MCP, ACP, ACV, MCV) for the chosen market and
 *  exchange (DAM · IEX by default) from /market-graph, cached in IndexedDB (Sync DB re-checks the
 *  API). Weeks run back freely and forward up to next week; the week lives in the URL (?week=…). */
function MarketIntelligenceWeekAheadPage() {
  const search = useSearch({ strict: false }) as { week?: string };
  const navigate = useNavigate();
  const [market, setMarket] = useState<Market>("DAM");
  const [exchange, setExchange] = useState<Exchange>("IEX");

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

  const { days, loading, error, sync } = useMarketRange(mondayIso, sundayIso);

  const today = todayIso();
  const nowBlock = getCurrentBlock();
  // Mon Tue Wed / Thu Fri Remarks (Mon–Fri average) / Sat Sun Remarks (Sat–Sun average).
  const cards = useMemo(() => {
    const week = getWeekRange(monday).days.map((d) => {
      const iso = isoOf(d);
      return { key: iso, title: dayTitle(d), long: dayLong(d), iso, data: days ? days[iso]?.[market][exchange] ?? null : null, footer: undefined as string | undefined };
    });
    const remarks = (key: string, long: string, group: typeof week) => {
      const sent = group.flatMap((g) => (g.data?.some((p) => p.mcpPrice !== null) ? [g.data] : []));
      const data: BlockPoint[] | null = days ? averageBlocks(sent.length ? sent : group.flatMap((g) => (g.data ? [g.data] : []))) : null;
      const mcps = data?.flatMap((p) => (p.mcpPrice !== null ? [p.mcpPrice] : [])) ?? [];
      const avg = mcps.length ? Math.round(mcps.reduce((a, b) => a + b, 0) / mcps.length) : null;
      return { key, title: "Remarks", long, iso: key, data, footer: avg != null ? `₹${avg.toLocaleString("en-IN")} avg MCP` : undefined };
    };
    return [...week.slice(0, 5), remarks("weekday", "Remarks · Mon–Fri", week.slice(0, 5)), ...week.slice(5), remarks("weekend", "Remarks · Sat–Sun", week.slice(5))];
  }, [monday, days, market, exchange]);

  // Pop-up: steps through the nine cards in grid order.
  const modalCharts = useMemo<ModalChart[]>(
    () => cards.flatMap((c) => (c.data ? [{ market, exchange, data: c.data, title: `${c.long} · ${exchange} ${market}`, currentBlock: c.iso === today ? nowBlock : null }] : [])),
    [cards, market, exchange, today, nowBlock],
  );
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  useEffect(() => { setOpenIdx(null); }, [mondayIso, market, exchange]);
  const open = (key: string) => {
    const c = cards.find((x) => x.key === key);
    const i = c ? modalCharts.findIndex((m) => m.data === c.data) : -1;
    if (i >= 0) setOpenIdx(i);
  };

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
    const GAP = 8, MIN_CARD = 190;
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
        <div className="flex flex-wrap items-center gap-4">
          <ToggleGroup label="Market" options={MARKETS} value={market} onChange={setMarket} />
          <ToggleGroup label="Exchange" options={EXCHANGES} value={exchange} onChange={setExchange} />
        </div>
        <div className="flex items-center gap-2">
          <WeekNavigator
            monday={monday}
            canNext={monday < maxMonday}
            onShift={(dir) => { const d = new Date(monday); d.setDate(d.getDate() + dir * 7); setWeek(isoOf(d)); }}
          />
          <SyncDbButton onSync={sync} />
        </div>
      </div>
      {error && <p className="mb-2 shrink-0 text-[12px] text-destructive">Live data unreachable ({error})</p>}
      <div ref={gridRef} className="grid min-h-0 flex-1 content-start gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-3 xl:overflow-hidden">
        {cards.map((c) => (
          <MarketWeekCard
            key={c.key + market + exchange}
            title={c.title}
            exchange={exchange}
            data={c.data}
            isToday={c.iso === today}
            currentBlock={c.iso === today ? nowBlock : null}
            isLoading={loading}
            height={cardH}
            footer={c.footer}
            onOpen={() => open(c.key)}
          />
        ))}
      </div>
      {openIdx !== null && modalCharts[openIdx] && (
        <MarketChartModal charts={modalCharts} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)} pointWidth={6} currentBlock={null} />
      )}
    </div>
  );
}

/** Planning horizon: the Day-ahead Market Detail page for the week's average day. */
export const MarketIntelligenceWeekAhead = () => <MarketDetailPage kind="week" />;

/** All modules (and Command centre's own views) keep the week-ahead page as it was. */
export const MarketIntelligenceWeekAheadModule = MarketIntelligenceWeekAheadPage;
