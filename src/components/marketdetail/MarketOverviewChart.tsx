import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMarketDay } from "@/store/slice/marketApiSlice";
import { ExchangeChart } from "./ExchangeChart";
import { ToggleGroup } from "./ExchangeToggles";
import { CARD } from "./MarketRow";
import { EXCHANGES, MARKETS, formatDateLabel, getCurrentBlock, getTodayDate, type Exchange, type Market } from "./marketDetailData";

/** The Overview's market + exchange pick per horizon ("da" / "id"), kept under the key
 *  `epm.mi.<horizon>` (JSON { market, exchange }) in both Session storage and Local storage, so the
 *  Home grid's Market Intelligence cell shows the same combination. Session storage wins when set. */
export type MiPick = { market: Market; exchange: Exchange };
const pickKey = (tf: "da" | "id") => `epm.mi.${tf}`;
export const defaultMiPick = (tf: "da" | "id"): MiPick => ({ market: tf === "id" ? "RTM" : "DAM", exchange: "IEX" });
export function loadMiPick(tf: "da" | "id"): MiPick {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const v = JSON.parse(store().getItem(pickKey(tf)) ?? "null") as Partial<MiPick> | null;
      if (v && MARKETS.includes(v.market as Market) && EXCHANGES.includes(v.exchange as Exchange)) return v as MiPick;
    } catch { /* storage blocked or bad value: try the next */ }
  }
  return defaultMiPick(tf);
}
function saveMiPick(tf: "da" | "id", pick: MiPick) {
  const v = JSON.stringify(pick);
  try { sessionStorage.setItem(pickKey(tf), v); } catch { /* ignore */ }
  try { localStorage.setItem(pickKey(tf), v); } catch { /* ignore */ }
}

/** Details · Market Intelligence Overview (Day-ahead / Intra-day): only one Market Detail chart for
 *  today — a market (DAM / RTM / GDAM / HPDAM) on one exchange (IEX / PXIL / HPX), picked above it —
 *  filling the window. Opens on the saved pick (default Day-ahead IEX DAM, Intra-day IEX RTM). */
export function MarketOverviewChart({ tf }: { tf: "da" | "id" }) {
  const dispatch = useAppDispatch();
  const { day, dayLoading, dayError } = useAppSelector((s) => s.market);
  const date = getTodayDate();
  const [{ market, exchange }, setPick] = useState<MiPick>(() => loadMiPick(tf));
  const pick = (p: MiPick) => { setPick(p); saveMiPick(tf, p); };
  const setMarket = (m: Market) => pick({ market: m, exchange });
  const setExchange = (e: Exchange) => pick({ market, exchange: e });
  useEffect(() => { dispatch(fetchMarketDay({ date })); }, [dispatch, date]);

  const data = day?.date === date ? day.detail[market][exchange] : null;

  // Fill the window below the page's top edge (like the Market Detail page).
  const rootRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(160);
  useLayoutEffect(() => {
    const measure = () => { if (rootRef.current) setTop(rootRef.current.getBoundingClientRect().top + window.scrollY); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // The chart takes the card's height.
  const cardRef = useRef<HTMLDivElement>(null);
  const [chartH, setChartH] = useState(0);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setChartH(Math.floor(e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className="-mx-2 -mt-4 flex min-h-[420px] flex-col gap-2 lg:-mx-6"
      style={{ height: `calc(100vh - ${top}px - 8px)`, marginBottom: -72 }}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <ToggleGroup label="Market" options={MARKETS} value={market} onChange={setMarket} />
          <ToggleGroup label="Exchange" options={EXCHANGES} value={exchange} onChange={setExchange} />
        </div>
        <span className="text-[12px] font-medium text-muted-foreground">{formatDateLabel(date)} · Today</span>
      </div>
      {dayError && (
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" />Live data unreachable ({dayError})
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="grid w-6 shrink-0 place-items-center">
          <span className="-rotate-90 whitespace-nowrap text-[11px] font-bold tracking-[0.15em] text-muted-foreground">{market}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="h-[22px] shrink-0 text-center text-[12px] font-bold tracking-wide text-foreground">{exchange}</div>
          <div ref={cardRef} className={CARD + " min-h-0 flex-1"}>
            {data && chartH > 0 ? (
              <ExchangeChart key={`${market}-${exchange}`} exchange={exchange} data={data} pointWidth={24} currentBlock={getCurrentBlock()} height={chartH} />
            ) : (
              <div className={"h-full " + (dayLoading || (!data && !dayError) ? "animate-pulse bg-muted" : "")} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
