import type { TfId } from "@/data/engine";
import type { ChartSpec } from "@/data/model";
import { Spark } from "@/components/chart/Spark";
import { ExchangeChart } from "@/components/marketdetail/ExchangeChart";
import { isMiTf, loadMiPick, useMiShown, type MiTf } from "@/components/marketdetail/MarketOverviewChart";
import { getCurrentBlock } from "@/components/marketdetail/marketDetailData";

export const hasMarketPlanSpark = (tf: TfId): tf is MiTf => isMiTf(tf);

/** Home · Market Intelligence Intra-day / Day / Week / Month ahead cell: the Details Overview chart
 *  in miniature — the market + exchange picked there (saved in Session / Local storage,
 *  `epm.mi.<horizon>`; default IEX DAM, Intra-day IEX RTM), for today or the current week's /
 *  month's average day. Just a picture: no hover or tooltip. Falls back to `fallback` (the sample
 *  chart) when there is no data. */
export function MarketPlanSpark({ tf, fallback, height = 20 }: { tf: MiTf; fallback?: ChartSpec; height?: number }) {
  const { shown, loading } = useMiShown(tf);
  // Re-read the pick whenever the grid shows (e.g. back from the Details page).
  const { market, exchange } = loadMiPick(tf);
  const points = shown.detail ? shown.detail[market][exchange] : null;
  if (loading) return null;
  if (!points || !points.some((p) => p.buyMW !== null)) return fallback ? <Spark spec={fallback} height={height} /> : null;
  return (
    <span className="pointer-events-none block" style={{ height }}>
      <ExchangeChart key={`${market}-${exchange}`} exchange={exchange} data={points} pointWidth={4} currentBlock={shown.isDay ? getCurrentBlock() : null} height={height} compact />
    </span>
  );
}
