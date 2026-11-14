import { useEffect, useState } from "react";
import type { TfId } from "@/data/engine";
import type { ChartSpec } from "@/data/model";
import type { MarketDetailData } from "@/store/features/marketTypes";
import { useAppDispatch } from "@/store/hooks";
import { fetchMarketDay } from "@/store/slice/marketApiSlice";
import { Spark } from "@/components/chart/Spark";
import { ExchangeChart } from "@/components/marketdetail/ExchangeChart";
import { loadMiPick } from "@/components/marketdetail/MarketOverviewChart";
import { getCurrentBlock, getTodayDate } from "@/components/marketdetail/marketDetailData";

export const hasMarketPlanSpark = (tf: TfId): tf is "da" | "id" => tf === "da" || tf === "id";

// Today's market-graph, one request per day for the session (the grid re-renders often).
const loads = new Map<string, Promise<MarketDetailData | null>>();

/** Home · Market Intelligence Intra-day / Day-ahead cell: the Details Overview chart in miniature —
 *  today's market + exchange picked there (saved in Session / Local storage, `epm.mi.<horizon>`;
 *  default Intra-day IEX RTM, Day-ahead IEX DAM). Just a picture: no hover or tooltip. Falls back to
 *  `fallback` (the sample chart) when there is no data. */
export function MarketPlanSpark({ tf, fallback, height = 20 }: { tf: "da" | "id"; fallback?: ChartSpec; height?: number }) {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<MarketDetailData | null | "none">(null);
  // Re-read the pick whenever the grid shows (e.g. back from the Details page).
  const { market, exchange } = loadMiPick(tf);
  useEffect(() => {
    const date = getTodayDate();
    if (!loads.has(date)) loads.set(date, dispatch(fetchMarketDay({ date })).unwrap().then((r) => r.detail).catch(() => null));
    let live = true;
    loads.get(date)!.then((d) => { if (live) setData(d ?? "none"); });
    return () => { live = false; };
  }, [dispatch]);

  const points = data && data !== "none" ? data[market][exchange] : null;
  if (data === "none" || (points && !points.some((p) => p.buyMW !== null))) return fallback ? <Spark spec={fallback} height={height} /> : null;
  if (!points) return null;
  return (
    <span className="pointer-events-none block" style={{ height }}>
      <ExchangeChart key={`${market}-${exchange}`} exchange={exchange} data={points} pointWidth={4} currentBlock={getCurrentBlock()} height={height} compact />
    </span>
  );
}
