import type { ReactNode } from "react";
import { ExchangeChart } from "./ExchangeChart";
import type { Exchange, Market, MarketDetailData } from "./marketDetailData";

export const CARD = "min-w-0 overflow-hidden rounded-[10px] border border-border bg-card";
export const LABEL_W = 24;

/** One market: the rotated name, one chart card per active exchange, then `after` (the table card). */
export function MarketRow({ market, exchanges, data, pointWidth, currentBlock, height, after, onOpen }: {
  market: Market;
  exchanges: Exchange[];
  data: MarketDetailData;
  pointWidth: number;
  currentBlock: number | null;
  height: number;
  after?: ReactNode;
  onOpen: (e: Exchange) => void;
}) {
  return (
    <div className="flex gap-2" style={{ height }}>
      <div className="grid shrink-0 place-items-center" style={{ width: LABEL_W }}>
        <span className="-rotate-90 whitespace-nowrap text-[11px] font-bold tracking-[0.15em] text-muted-foreground">{market}</span>
      </div>
      {exchanges.map((e) => (
        <div key={e} className={CARD + " flex-1"}>
          <ExchangeChart exchange={e} data={data[market][e]} pointWidth={pointWidth} currentBlock={currentBlock} height={height - 2} onOpen={() => onOpen(e)} />
        </div>
      ))}
      {after}
    </div>
  );
}
