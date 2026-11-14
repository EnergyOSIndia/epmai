import { useMemo } from "react";
import { Chart, type ChartOptions } from "@highcharts/react";
import { cn } from "@/lib/utils";
import { supplyTooltipHtml } from "./SupplyTooltip";
import {
  BLOCKS, CUMULATIVE_COLOR, DEMAND_COLOR, PLANT_ROSTERING_COLOR, ROSTERING_COLOR, SG_COLOR,
  blockRange, colorOf, type DayData, type SupplyGraphType,
} from "./weekSupplyData";

const AXIS = { color: "#64748b", fontSize: "10px" };
const TICKS = Array.from({ length: 24 }, (_, i) => i * 4); // blocks 1, 5, 9 … 93
// Card is CARD_H tall; the chart fills what's left under the header (and the Remarks footer).
const CARD_H = 300, HEAD_H = 40, FOOT_H = 18;

/* eslint-disable @typescript-eslint/no-explicit-any -- Highcharts callback contexts */

/** Highcharts options for one day: stacked supply areas (Plants: a column per plant) with Demand
 *  and Rostering lines, a y-axis fitted to the data and the block tooltip. `compact` drops the axis
 *  labels and grid for the small month-calendar boxes. */
export function dayChartOptions({ day, type, hidden, isToday, isPast, currentBlock, height, names, compact = false, upTo }: {
  day: DayData;
  type: SupplyGraphType;
  hidden: Set<string>;
  isToday: boolean;
  isPast: boolean;
  currentBlock: number;
  height: number;
  names?: string[];
  compact?: boolean;
  /** Last block shown (0-based): the x-axis stops there (Real-time: the current block). All 96 if unset. */
  upTo?: number;
}): ChartOptions {
  // Line style: solid on past days (and Remarks), dotted on future days, and on today solid
  // up to the current block then dotted.
  const style = (base: "Solid" | "ShortDash") => isToday
    ? { dashStyle: base, zoneAxis: "x" as const, zones: [{ value: currentBlock, dashStyle: base }, { dashStyle: "Dot" as const }] }
    : { dashStyle: isPast ? base : ("Dot" as const) };
  // The y-axis spans exactly the data shown (visible series): from the lowest point (0 unless
  // something goes negative) to the highest stack or line — no rounding out to the next tick.
  const fit = (lo: number, hi: number) => ({
    min: Math.min(0, lo), max: hi > Math.min(0, lo) ? hi : Math.min(0, lo) + 1,
    startOnTick: false, endOnTick: false, minPadding: 0, maxPadding: 0,
  });
  const common: ChartOptions = {
    chart: {
      animation: false, height, spacing: compact ? [2, 0, 0, 0] : [8, 6, 6, 4], backgroundColor: "transparent", style: { fontFamily: "inherit" },
      // The tooltip is drawn outside the chart, so leaving the chart doesn't always hide it — and
      // moving across the grid left one stuck open per card. Hide it as soon as the mouse leaves.
      events: {
        load(this: any) {
          const c = this;
          c.container.addEventListener("mouseleave", () => { c.pointer?.reset(false, 0); c.tooltip?.hide(0); });
        },
      },
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    accessibility: { enabled: false },
    yAxis: compact
      ? { title: { text: undefined }, labels: { enabled: false }, gridLineWidth: 0 }
      : { title: { text: "MW", style: AXIS }, labels: { style: AXIS }, gridLineDashStyle: "Dash", gridLineColor: "#e2e8f0" },
    tooltip: {
      shared: true, useHTML: true, outside: true, hideDelay: 0,
      // No sliding between blocks — it made the tooltip (and the page) look jittery.
      animation: false,
      backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 6, padding: 8,
      shadow: { color: "rgba(15,23,42,0.12)", offsetX: 0, offsetY: 2, width: 6 },
      // Keep the tooltip inside the visible window. Drawn "outside" the chart, a tall tooltip near
      // the bottom would otherwise poke past the window edge, briefly add a page scrollbar, narrow
      // the page and make every chart re-size — the flicker on hover.
      positioner(this: any, w: number, h: number, point: any) {
        const pos = this.getPosition(w, h, point);
        const r = this.chart.container.getBoundingClientRect();
        // The outside tooltip's layer is ~20px bigger than the box (shadow + padding), so keep a
        // wider margin on the right and bottom edges.
        const pad = 6, edge = 32;
        const x = Math.max(pad - r.left, Math.min(pos.x, window.innerWidth - edge - w - r.left));
        const y = Math.max(pad - r.top, Math.min(pos.y, window.innerHeight - edge - h - r.top));
        return { x, y };
      },
    },
    plotOptions: {
      series: { animation: false, marker: { enabled: false }, states: { inactive: { enabled: false } } },
    },
  };

  if (type === "plants") {
    const avgDemand = Math.round((day.demand.reduce((a, b) => a + b, 0) / BLOCKS) * 100) / 100;
    const avgRoster = Math.round((day.rostering.reduce((a, b) => a + b, 0) / BLOCKS) * 100) / 100;
    const tops = day.plants.map((p) => (hidden.has("Cumulative") ? (hidden.has("SG") ? 0 : p.sg) : hidden.has("SG") ? p.cumulative - p.sg : p.cumulative));
    const lines = [...(hidden.has("Demand") ? [] : [avgDemand]), ...(hidden.has("Rostering") ? [] : [avgRoster])];
    return {
      ...common,
      yAxis: { ...common.yAxis, ...fit(Math.min(0, ...lines), Math.max(0, ...tops, ...lines)) },
      xAxis: {
        categories: day.plants.map((p) => p.name),
        labels: compact ? { enabled: false } : { style: { ...AXIS, fontSize: "8px" }, rotation: -45 },
        ...(compact ? { tickLength: 0, lineWidth: 0 } : {}),
        crosshair: false,
      },
      tooltip: {
        ...common.tooltip,
        formatter(this: any) {
          const i = this.points?.[0]?.point?.index ?? this.point?.index ?? 0, p = day.plants[i];
          const rows = [
            { name: "Cumulative", color: CUMULATIVE_COLOR, value: p.cumulative },
            { name: "SG", color: SG_COLOR, value: p.sg },
            { name: "Demand", color: DEMAND_COLOR, value: avgDemand },
            { name: "Rostering", color: PLANT_ROSTERING_COLOR, value: avgRoster },
          ].filter((r) => !hidden.has(r.name));
          return supplyTooltipHtml(p.name, rows);
        },
      },
      plotOptions: { ...common.plotOptions, column: { stacking: "normal", borderWidth: 0, groupPadding: 0.08, pointPadding: 0.04 } },
      series: [
        // The peach part sits on top of SG, so each column's top is the running total.
        { type: "column", name: "Cumulative", color: CUMULATIVE_COLOR, visible: !hidden.has("Cumulative"), data: day.plants.map((p) => Math.round((p.cumulative - p.sg) * 10) / 10) },
        { type: "column", name: "SG", color: SG_COLOR, visible: !hidden.has("SG"), data: day.plants.map((p) => p.sg) },
        { type: "line", name: "Demand", color: DEMAND_COLOR, lineWidth: 2, zIndex: 5, visible: !hidden.has("Demand"), data: day.plants.map(() => avgDemand) },
        { type: "line", name: "Rostering", color: PLANT_ROSTERING_COLOR, lineWidth: 1.5, dashStyle: "Dash", zIndex: 5, visible: !hidden.has("Rostering"), data: day.plants.map(() => avgRoster) },
      ],
    };
  }

  // Highest positive stack / lowest negative stack per block, plus the Demand and Rostering lines.
  const shown = day.seriesList.filter((s) => !hidden.has(s.name));
  let hi = 0, lo = 0;
  for (let b = 0; b < BLOCKS; b++) {
    let pos = 0, neg = 0;
    shown.forEach((s) => { const v = s.data[b]; if (v > 0) pos += v; else neg += v; });
    hi = Math.max(hi, pos); lo = Math.min(lo, neg);
  }
  const lineVals = [
    ...(hidden.has("Demand") ? [] : day.demand),
    ...(hidden.has("Rostering") ? [] : day.rostering),
  ];
  if (lineVals.length) { hi = Math.max(hi, ...lineVals); lo = Math.min(lo, ...lineVals); }

  return {
    ...common,
    yAxis: { ...common.yAxis, ...fit(lo, hi) },
    xAxis: {
      min: 0, max: upTo ?? BLOCKS - 1, tickPositions: upTo == null ? TICKS : TICKS.filter((t) => t <= upTo),
      labels: compact ? { enabled: false } : { style: AXIS, formatter(this: any) { return String(this.value + 1); } },
      ...(compact ? { tickLength: 0, lineWidth: 0 } : {}),
      crosshair: false,
      plotBands: isToday ? [{ from: currentBlock - 0.5, to: currentBlock + 0.5, color: "rgba(226,196,254,0.35)", zIndex: 3 }] : [],
    },
    tooltip: {
      ...common.tooltip,
      formatter(this: any) {
        const b = this.points?.[0]?.point?.x ?? this.x ?? 0;
        const rows = [
          // Only the series with a value in this block (zeros are left out).
          ...day.seriesList.filter((s) => Math.abs(s.data[b]) >= 0.005).map((s) => ({ name: s.name, color: colorOf(type, s.name, names), value: s.data[b] })),
          { name: "Demand", color: DEMAND_COLOR, value: day.demand[b] },
          ...(day.rostering.length ? [{ name: "Rostering", color: ROSTERING_COLOR, value: day.rostering[b] }] : []),
        ].filter((r) => !hidden.has(r.name));
        return supplyTooltipHtml(`Block ${b + 1} · ${blockRange(b)}`, rows);
      },
    },
    plotOptions: { ...common.plotOptions, areaspline: { stacking: "normal", fillOpacity: 0.65, lineWidth: 1 } },
    series: [
      ...day.seriesList.map((s) => ({
        type: "areaspline" as const, name: s.name, data: s.data, color: colorOf(type, s.name, names),
        visible: !hidden.has(s.name), ...style("Solid"),
      })),
      { type: "spline" as const, name: "Demand", data: day.demand, color: DEMAND_COLOR, lineWidth: 2, zIndex: 5, visible: !hidden.has("Demand"), ...style("Solid") },
      // The supply API has no rostering, so API days skip the line.
      ...(day.rostering.length
        ? [{ type: "spline" as const, name: "Rostering", data: day.rostering, color: ROSTERING_COLOR, lineWidth: 1.5, zIndex: 5, visible: !hidden.has("Rostering"), ...style("ShortDash") }]
        : []),
    ],
  };
}

/** One card of the week grid: a day, or a "Remarks" average (`footer` set). Header shows the
 *  title, peak and surplus over a 96-block supply chart (Plants: a column per plant). */
export function DayChartCard({ title, isToday, isPast, currentBlock, type, day, isLoading, hidden, footer, names, onOpen, height = CARD_H }: {
  title: string;
  isToday: boolean;
  isPast: boolean;
  currentBlock: number;
  type: SupplyGraphType;
  day: DayData | null;
  isLoading: boolean;
  hidden: Set<string>;
  /** Remarks cards: the line under the chart, e.g. "412 MW avg". */
  footer?: string;
  /** Series order that fixes each name's colour (the week's API series); default = the graph type's. */
  names?: string[];
  /** Click the card to open it full size. */
  onOpen?: () => void;
  /** Card height in px (the week page fits its 3 rows into the window); default CARD_H. */
  height?: number;
}) {
  const chartH = Math.max(80, height - HEAD_H - (footer ? FOOT_H : 0));
  const options = useMemo<ChartOptions | null>(
    () => (day ? dayChartOptions({ day, type, hidden, isToday, isPast, currentBlock, height: chartH, names }) : null),
    [day, type, hidden, isToday, isPast, currentBlock, chartH, names],
  );

  return (
    <div
      className={cn("flex min-w-0 flex-col rounded-[10px] border bg-card p-2", isToday && "border-teal-500 ring-1 ring-teal-500/40", footer && "bg-muted/40",
        onOpen && day && "cursor-pointer transition-colors hover:border-slate-400")}
      style={{ height }}
      {...(onOpen && day ? {
        role: "button", tabIndex: 0, "aria-label": `Open ${title} full size`, onClick: onOpen,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") onOpen(); },
      } : {})}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 text-[12px]">
        <span className="flex items-center gap-1.5 font-semibold">
          {title}
          {isToday && <span className="rounded bg-teal-500 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">Today</span>}
        </span>
        <span className="font-mono text-[10px] text-slate-500">{day && !isLoading ? `Pk ${day.peak.toLocaleString("en-IN")}` : ""}</span>
        <span className="justify-self-end">
          {day && !isLoading && (
            <span className={cn("rounded-full px-1.5 py-px font-mono text-[10px] font-semibold",
              day.surplus >= 0 ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300")}>
              {(day.surplus >= 0 ? "+" : "") + day.surplus.toLocaleString("en-IN")}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="h-full w-full animate-pulse rounded-md bg-muted" />
        ) : options ? (
          <Chart options={options} containerProps={{ style: { height: "100%", width: "100%" } }} />
        ) : (
          <div className="grid h-full place-items-center text-[12px] text-muted-foreground">No data</div>
        )}
      </div>
      {footer && !isLoading && day && <div className="px-1 font-mono text-[11px] font-semibold">{footer}</div>}
    </div>
  );
}
