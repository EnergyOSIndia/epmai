import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { istNow } from "@/data/engine";
import { useAppDispatch } from "@/store/hooks";
import { fetchMarketAverage, fetchMarketDay } from "@/store/slice/marketApiSlice";
import { getWeekRange, isoOf, monthDays } from "@/components/weeksupply/weekSupplyData";
import { ExchangeChart } from "./ExchangeChart";
import { ToggleGroup } from "./ExchangeToggles";
import { CARD } from "./MarketRow";
import {
  EXCHANGES, MARKETS, formatDateLabel, getCurrentBlock, getTodayDate,
  type Exchange, type Market, type MarketDetailData,
} from "./marketDetailData";

/** The horizons with the one-chart Market Intelligence Overview. */
export type MiTf = "id" | "da" | "wk" | "mo";
export const isMiTf = (tf: string): tf is MiTf => tf === "id" || tf === "da" || tf === "wk" || tf === "mo";

/** The Overview's market + exchange pick per horizon, kept under the key `epm.mi.<horizon>`
 *  (JSON { market, exchange }) in both Session storage and Local storage, so the Home grid's
 *  Market Intelligence cell shows the same combination. Session storage wins when set. */
export type MiPick = { market: Market; exchange: Exchange };
const pickKey = (tf: MiTf) => `epm.mi.${tf}`;
/** Intra-day opens on IEX RTM; Day / Week / Month ahead on IEX DAM. */
export const defaultMiPick = (tf: MiTf): MiPick => ({ market: tf === "id" ? "RTM" : "DAM", exchange: "IEX" });
export function loadMiPick(tf: MiTf): MiPick {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const v = JSON.parse(store().getItem(pickKey(tf)) ?? "null") as Partial<MiPick> | null;
      if (v && MARKETS.includes(v.market as Market) && EXCHANGES.includes(v.exchange as Exchange)) return v as MiPick;
    } catch { /* storage blocked or bad value: try the next */ }
  }
  return defaultMiPick(tf);
}
function saveMiPick(tf: MiTf, pick: MiPick) {
  const v = JSON.stringify(pick);
  try { sessionStorage.setItem(pickKey(tf), v); } catch { /* ignore */ }
  try { localStorage.setItem(pickKey(tf), v); } catch { /* ignore */ }
}

/** What each horizon shows: Intra-day / Day-ahead today's day (market-graph); Week / Month ahead
 *  the current Mon–Sun week's / calendar month's average day (market-graph/average). */
export type MiShown = { detail: MarketDetailData | null; label: string; isDay: boolean };
const fmtShort = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
function periodOf(tf: MiTf): { key: string; from: string; to: string; label: string; isDay: boolean } {
  if (tf === "wk") {
    const days = getWeekRange(istNow()).days;
    return { key: `wk:${isoOf(days[0])}`, from: isoOf(days[0]), to: isoOf(days[6]), label: `Week ${fmtShort(days[0])} – ${fmtShort(days[6])} ${days[6].getFullYear()}`, isDay: false };
  }
  if (tf === "mo") {
    const n = istNow(), days = monthDays(new Date(n.getFullYear(), n.getMonth(), 1));
    return { key: `mo:${isoOf(days[0])}`, from: isoOf(days[0]), to: isoOf(days[days.length - 1]), label: days[0].toLocaleDateString("en-GB", { month: "long", year: "numeric" }), isDay: false };
  }
  const t = getTodayDate();
  return { key: `day:${t}`, from: t, to: t, label: `${formatDateLabel(t)} · Today`, isDay: true };
}

// One request per period for the session (the Home grid re-renders often; the Overview reuses it).
const loads = new Map<string, Promise<{ detail: MarketDetailData; days: number } | null>>();
/** Loads (once) the market data a horizon's Overview shows. */
export function useMiShown(tf: MiTf): { shown: MiShown; loading: boolean; error: string | null } {
  const dispatch = useAppDispatch();
  const p = periodOf(tf);
  const [res, setRes] = useState<{ key: string; detail: MarketDetailData | null; days: number; error: string | null } | null>(null);
  useEffect(() => {
    if (!loads.has(p.key)) {
      const req = p.isDay
        ? dispatch(fetchMarketDay({ date: p.from })).unwrap().then((r) => ({ detail: r.detail, days: 1 }))
        : dispatch(fetchMarketAverage({ from_date: p.from, to_date: p.to })).unwrap().then((r) => ({ detail: r.detail, days: r.days }));
      // A failed load is dropped so a later visit tries again.
      loads.set(p.key, req.catch((e) => { loads.delete(p.key); throw e; }));
    }
    let live = true;
    loads.get(p.key)!.then(
      (r) => { if (live) setRes({ key: p.key, detail: r?.detail ?? null, days: r?.days ?? 0, error: null }); },
      (e) => { if (live) setRes({ key: p.key, detail: null, days: 0, error: e?.message ?? String(e) }); },
    );
    return () => { live = false; };
  }, [dispatch, p.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = res?.key === p.key;
  const label = p.isDay || !ready || !res.days ? p.label : `${p.label} · ${res.days}-day average`;
  return { shown: { detail: ready ? res.detail : null, label, isDay: p.isDay }, loading: !ready, error: ready ? res.error : null };
}

/** Details · Market Intelligence Overview (Intra-day / Day / Week / Month ahead): only one Market
 *  Detail chart — a market (DAM / RTM / GDAM / HPDAM) on one exchange (IEX / PXIL / HPX), picked
 *  above it — filling the window: today's day (Intra-day, Day-ahead) or the current week's / month's
 *  average day (Week, Month ahead). Opens on the saved pick (default IEX DAM, Intra-day IEX RTM). */
export function MarketOverviewChart({ tf }: { tf: MiTf }) {
  const { shown, loading, error } = useMiShown(tf);
  const [{ market, exchange }, setPick] = useState<MiPick>(() => loadMiPick(tf));
  const pick = (p: MiPick) => { setPick(p); saveMiPick(tf, p); };
  const setMarket = (m: Market) => pick({ market: m, exchange });
  const setExchange = (e: Exchange) => pick({ market, exchange: e });

  const data = shown.detail ? shown.detail[market][exchange] : null;

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
        <span className="text-[12px] font-medium text-muted-foreground">{shown.label}</span>
      </div>
      {error && (
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" />Live data unreachable ({error})
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
              <ExchangeChart key={`${market}-${exchange}`} exchange={exchange} data={data} pointWidth={24} currentBlock={shown.isDay ? getCurrentBlock() : null} height={chartH} />
            ) : (
              <div className={"h-full " + (loading ? "animate-pulse bg-muted" : "")} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
