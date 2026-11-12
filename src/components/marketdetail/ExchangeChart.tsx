import { useMemo, useRef } from "react";
import { Chart, type ChartOptions } from "@highcharts/react";
import "@highcharts/react/options/Exporting";
// Highcharts' no-data module (from the same es-modules build @highcharts/react uses): a chart whose
// series are all empty shows "No data available".
import "highcharts/es-modules/masters/modules/no-data-to-display.src.js";
import { chartTooltipHtml } from "./ChartTooltip";
import { BLOCKS, SERIES, type BlockPoint, type Exchange } from "./marketDetailData";

const AXIS = { color: "#64748b", fontSize: "9px" };
const TICKS = Array.from({ length: 24 }, (_, i) => 1 + i * 4); // 1, 5, 9 … 93

/* eslint-disable @typescript-eslint/no-explicit-any -- Highcharts callback contexts */

/** One exchange's day in one market: Buy / Sell bars and MCV / ACV lines on MW (left), MCP / ACP
 *  lines on ₹/MWh (right, fixed 0–10k). The current block is shaded when `currentBlock` is set.
 *  `onOpen`: clicking the plot (not the legend or menu) opens the chart full size.
 *  `tooltipOutside` false keeps the tooltip inside the chart (needed in the pop-up). */
export function ExchangeChart({ exchange, data, pointWidth, currentBlock, height, onOpen, tooltipOutside = true, compact = false }: {
  exchange: Exchange;
  /** Month-calendar boxes: no axis labels, grid, legend or export menu. */
  compact?: boolean;
  height: number;
  onOpen?: () => void;
  tooltipOutside?: boolean;
  data: BlockPoint[];
  pointWidth: number;
  currentBlock: number | null;
}) {
  // No data = the API sent no blocks for this market on this exchange: the series go empty and
  // Highcharts shows "No data available" over the axes. Blocks sent as 0 are data — flat lines.
  const hasData = data.some((d) => d.buyMW !== null);
  const hasMW = data.some((d) => d.buyMW || d.sellMW || d.mcvMW || d.acvMW);
  // Kept in a ref so a new callback each render doesn't rebuild the chart options.
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const clickable = !!onOpen;
  const options = useMemo<ChartOptions>(() => {
    const open = () => openRef.current?.();
    const line = { type: "spline" as const, marker: { enabled: false } };
    const seriesOf = (key: (typeof SERIES)[number]["key"]) => (hasData ? data.map((d) => [d.block, d[key]]) : []);
    const cfg = Object.fromEntries(SERIES.map((s) => [s.name, s]));
    const o: ChartOptions = {
      chart: {
        animation: false, height, spacing: [10, 8, 6, 4], backgroundColor: "transparent",
        style: { fontFamily: "inherit", cursor: clickable ? "pointer" : "default" },
        // The tooltip is drawn outside the chart; hide it as soon as the mouse leaves.
        events: {
          click: open,
          load(this: any) {
            const c = this;
            c.container.addEventListener("mouseleave", () => { c.pointer?.reset(false, 0); c.tooltip?.hide(0); });
          },
        },
      },
      // No title: the exchange names head the columns above the grid.
      title: { text: undefined },
      credits: { enabled: false },
      lang: { noData: "No data available" },
      noData: { style: { fontSize: "12px", fontWeight: "600", color: "#94a3b8" } },
      accessibility: { enabled: false },
      exporting: {
        buttons: {
          contextButton: {
            menuItems: ["viewFullscreen", "separator", "downloadPNG", "downloadCSV"],
            symbolSize: 10, height: 18, width: 20, symbolX: 10, symbolY: 9, y: -2,
            theme: { fill: "transparent", stroke: "none" } as any,
          },
        },
        filename: `market-${exchange}`,
      },
      xAxis: {
        min: 0.5, max: BLOCKS + 0.5, tickPositions: TICKS, startOnTick: false, endOnTick: false,
        // Every tick labelled (no auto step / rotation, which could leave just "1 5 9" after a resize).
        labels: { style: AXIS, step: 1, autoRotation: [] }, lineColor: "hsl(var(--border))", tickLength: 0,
        plotBands: currentBlock ? [{ from: currentBlock - 0.5, to: currentBlock + 0.5, color: "hsl(var(--accent) / 0.7)", zIndex: 0 }] : [],
      },
      yAxis: [
        {
          title: { text: undefined }, labels: { style: AXIS }, lineWidth: 0, min: 0,
          gridLineDashStyle: "Dash", gridLineColor: "hsl(var(--border))",
          ...(hasMW ? {} : { max: 4, tickPositions: [0, 2, 4] }),
        },
        {
          title: { text: undefined }, labels: { style: AXIS }, opposite: true, lineWidth: 0,
          min: 0, max: 10000, tickPositions: [0, 5000, 10000], gridLineWidth: 0,
        },
      ],
      legend: {
        align: "center", verticalAlign: "bottom", margin: 4, padding: 2, itemDistance: 10,
        // Highcharts' own symbols: square-ified rectangles with a full radius give Buy / Sell
        // circles; the lines get a short line (MCV dashed). Click hides / shows a series.
        symbolWidth: 14, symbolHeight: 8, symbolRadius: 4, squareSymbol: true,
        itemStyle: { fontSize: "9px", fontWeight: "600", color: "hsl(var(--foreground))" },
        itemHoverStyle: { color: "hsl(var(--foreground))" },
        itemHiddenStyle: { color: "hsl(var(--muted-foreground) / 0.5)" },
      },
      tooltip: {
        shared: true, useHTML: true, outside: tooltipOutside, hideDelay: 0, animation: false,
        backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: 8, padding: 8,
        shadow: { color: "rgba(15,23,42,0.12)", offsetX: 0, offsetY: 2, width: 6 },
        formatter(this: any) { return chartTooltipHtml(this); },
        // Keep the outside tooltip inside the window so it can't add a page scrollbar.
        positioner(this: any, w: number, h: number, point: any) {
          const pos = this.getPosition(w, h, point);
          const r = this.chart.container.getBoundingClientRect();
          const pad = 6, edge = 32;
          return {
            x: Math.max(pad - r.left, Math.min(pos.x, window.innerWidth - edge - w - r.left)),
            y: Math.max(pad - r.top, Math.min(pos.y, window.innerHeight - edge - h - r.top)),
          };
        },
      },
      plotOptions: {
        // Hovering a legend item (or a series) highlights it: the others fade, a line thickens.
        series: { animation: false, cursor: clickable ? "pointer" : undefined, point: { events: { click: open } }, states: { normal: { animation: { duration: 0 } }, inactive: { enabled: true, opacity: 0.15, animation: { duration: 0 } }, hover: { lineWidthPlus: 1, animation: { duration: 0 } } } },
        // Bars fill ~70% of a block's slot, capped at pointWidth, so they never run into each other.
        column: { grouping: false, borderWidth: 0, maxPointWidth: pointWidth, pointPadding: 0.15, groupPadding: 0 },
      },
      series: [
        // Buy / Sell: overlapping bars.
        { type: "column", name: "Buy", color: cfg.Buy.color, data: seriesOf("buyMW"), yAxis: 0 },
        { type: "column", name: "Sell", color: cfg.Sell.color, data: seriesOf("sellMW"), yAxis: 0, opacity: 0.85 },
        { ...line, name: "MCP", color: cfg.MCP.color, data: seriesOf("mcpPrice"), yAxis: 1, lineWidth: 2 },
        { ...line, name: "ACP", color: cfg.ACP.color, data: seriesOf("acpPrice"), yAxis: 1, lineWidth: 1.5 },
        { ...line, name: "ACV", color: cfg.ACV.color, data: seriesOf("acvMW"), yAxis: 0, lineWidth: 1.5 },
        { ...line, name: "MCV", color: cfg.MCV.color, data: seriesOf("mcvMW"), yAxis: 0, lineWidth: 1.5, dashStyle: "Dash" },
      ],
    };
    if (compact) {
      o.chart = { ...o.chart, spacing: [2, 0, 0, 0] };
      o.legend = { enabled: false };
      o.exporting = { enabled: false };
      o.noData = { style: { fontSize: "10px", fontWeight: "600", color: "#94a3b8" } };
      o.xAxis = { ...(o.xAxis as object), labels: { enabled: false }, lineWidth: 0 };
      o.yAxis = (o.yAxis as object[]).map((a) => ({ ...a, labels: { enabled: false }, gridLineWidth: 0 }));
    }
    return o;
  }, [exchange, data, pointWidth, currentBlock, hasData, hasMW, height, clickable, tooltipOutside, compact]);

  // Remount when the left axis switches between fitted and the fixed empty 0–4: a chart update
  // keeps the old max / tickPositions, which squashed real data into 0–4.
  return <Chart key={`${hasData ? "d" : "none"}-${hasMW ? "mw" : "flat"}`} options={options} containerProps={{ style: { height, width: "100%" } }} />;
}
