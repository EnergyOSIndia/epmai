import { useEffect, useMemo, useRef, useState } from "react";
import { Chart, type ChartOptions } from "@highcharts/react";
import { dayChartOptions } from "./DayChartCard";
import { SharedLegend, type LegendEntry } from "./SharedLegend";
import {
  DEMAND_COLOR, PLANT_ROSTERING_COLOR, ROSTERING_COLOR, colorOf, seriesNames, type DayData, type SupplyGraphType,
} from "./weekSupplyData";

// The chart fills whatever height its card gets (measured), never shorter than this.
const MIN_CHART_H = 220;

/** Day-ahead chart card: title, one day's stacked supply chart (Plants: columns per plant) and its
 *  own clickable legend. The card fills its parent's height and the chart takes all the space left
 *  under the title and above the legend, re-sizing with the window. `names` fixes the series order /
 *  colours for API graphs. */
export function DaySupplyChartCard({ title, type, day, names, isToday, isPast, currentBlock, isLoading, noDemand = false, upTo }: {
  /** Last block shown (0-based; Real-time: the current block). All 96 if unset. */
  upTo?: number;
  /** No Demand line or legend item (the data has no demand). */
  noDemand?: boolean;
  title: string;
  type: SupplyGraphType;
  day: DayData | null;
  names?: string[];
  isToday: boolean;
  isPast: boolean;
  currentBlock: number;
  isLoading: boolean;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  useEffect(() => { setHidden(new Set()); }, [day?.date]);
  const toggle = (name: string) => setHidden((h) => { const n = new Set(h); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  // Measure the chart slot so the chart height follows the card (and the window).
  const slotRef = useRef<HTMLDivElement>(null);
  const [chartH, setChartH] = useState(MIN_CHART_H);
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setChartH(Math.max(MIN_CHART_H, Math.floor(e.contentRect.height))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const options = useMemo<ChartOptions | null>(
    () => (day ? dayChartOptions({ day, type, hidden: noDemand ? new Set([...hidden, "Demand"]) : hidden, isToday, isPast, currentBlock, height: chartH, names, upTo }) : null),
    [day, type, hidden, isToday, isPast, currentBlock, names, chartH, noDemand, upTo],
  );
  const legend: LegendEntry[] = [
    ...(names ?? seriesNames(type)).map((n) => ({ name: n, color: colorOf(type, n, names) })),
    ...(noDemand ? [] : [{ name: "Demand", color: DEMAND_COLOR }]),
    ...(day?.rostering.length ? [{ name: "Rostering", color: type === "plants" ? PLANT_ROSTERING_COLOR : ROSTERING_COLOR, dashed: true }] : []),
  ];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-[10px] border bg-card p-3">
      <h3 className="mb-1 text-[13px] font-semibold">{title}</h3>
      <div ref={slotRef} className="min-h-0 flex-1 overflow-hidden" style={{ minHeight: MIN_CHART_H }}>
        {isLoading ? (
          <div className="h-full w-full animate-pulse rounded-md bg-muted" />
        ) : options ? (
          // Keyed on the graph type so switching (e.g. Plants → Category) builds a fresh chart instead
          // of updating in place, which would keep the old x-axis categories.
          <Chart key={type} options={options} containerProps={{ style: { height: "100%", width: "100%" } }} />
        ) : (
          <div className="grid h-full place-items-center text-[12px] text-muted-foreground">No data for this date</div>
        )}
      </div>
      {!isLoading && day && <div className="mt-1"><SharedLegend items={legend} hidden={hidden} onToggle={toggle} /></div>}
    </div>
  );
}
