import { useMemo } from "react";
import "@/components/DemandCalendar.css";
import { cn } from "@/lib/utils";
import { ExchangeChart } from "./ExchangeChart";
import { dayStats, type BlockPoint, type Exchange } from "./marketDetailData";

const HEAD_H = 26, FOOT_H = 18;
const rs = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");

/** The header chips: peak MCP ("Pk ₹…") and cleared energy (MU). */
function useStats(data: BlockPoint[] | null) {
  return useMemo(() => (data ? dayStats(data) : null), [data]);
}

/** One card of the Market Intelligence week grid (Supply / Demand week style): day, TODAY badge,
 *  peak MCP and cleared energy over the day's market chart. Click the chart to open it full size. */
export function MarketWeekCard({ title, exchange, data, isToday, currentBlock, isLoading, height, footer, onOpen }: {
  title: string;
  exchange: Exchange;
  data: BlockPoint[] | null;
  isToday: boolean;
  currentBlock: number | null;
  isLoading: boolean;
  height?: number;
  /** Remarks cards: the line under the chart, e.g. "₹4,210 avg MCP". */
  footer?: string;
  onOpen: () => void;
}) {
  const stats = useStats(data);
  const h = height ?? 300;
  const chartH = h - HEAD_H - (footer ? FOOT_H : 0) - 16;
  return (
    <div
      className={cn("flex min-w-0 flex-col rounded-[10px] border bg-card p-2", isToday && "border-teal-500 ring-1 ring-teal-500/40", footer && "bg-muted/40")}
      style={{ height: h }}
    >
      <div className="grid cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 text-[12px]" style={{ height: HEAD_H }} onClick={onOpen}>
        <span className="flex items-center gap-1.5 font-semibold">
          {title}
          {isToday && <span className="rounded bg-teal-500 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">Today</span>}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{!isLoading && stats ? `Pk ${rs(stats.peakMcp)}` : ""}</span>
        <span className="justify-self-end">
          {!isLoading && stats && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-px font-mono text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              {stats.mu.toFixed(1)} MU
            </span>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md bg-card" style={{ height: chartH }}>
        {isLoading || !data ? (
          <div className="h-full w-full animate-pulse rounded-md bg-muted" />
        ) : (
          <ExchangeChart exchange={exchange} data={data} pointWidth={6} currentBlock={currentBlock} height={chartH} onOpen={onOpen} />
        )}
      </div>
      {footer && !isLoading && stats && <div className="px-1 font-mono text-[11px] font-semibold" style={{ height: FOOT_H }}>{footer}</div>}
    </div>
  );
}

/** One day of the Market Intelligence month calendar (Demand / Supply month box style): day
 *  number, peak MCP and cleared energy over a tiny chart. Click opens it full size. Must sit
 *  inside a `.dc-root`. */
export function MarketMonthBox({ dayNum, exchange, data, isToday, currentBlock, isLoading, chartH, onOpen }: {
  dayNum: number;
  exchange: Exchange;
  data: BlockPoint[] | null;
  isToday: boolean;
  currentBlock: number | null;
  isLoading: boolean;
  chartH?: number;
  onOpen: () => void;
}) {
  const stats = useStats(data);
  const h = chartH ?? 95;
  return (
    <div
      role="button" tabIndex={0} aria-label={`Open day ${dayNum}`}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      className="dc-cell"
      style={isToday ? { borderColor: "hsl(var(--primary))", boxShadow: "0 0 0 1px hsl(var(--primary))" } : undefined}
    >
      <div className="top">
        <span className="dn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{dayNum}{isToday && <span className="rounded bg-teal-500 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">Today</span>}</span>
        {stats && !isLoading && <span className="pk">Pk {rs(stats.peakMcp)}</span>}
        {stats && !isLoading && <span className="dc-chip nt">{Math.round(stats.mu).toLocaleString("en-IN")} MU</span>}
      </div>
      <div className="overflow-hidden rounded bg-card" style={{ height: h }}>
        {isLoading || !data ? (
          <div className="h-full w-full animate-pulse rounded bg-muted" />
        ) : (
          <ExchangeChart exchange={exchange} data={data} pointWidth={3} currentBlock={currentBlock} height={h} compact />
        )}
      </div>
    </div>
  );
}
