import { blockToTime } from "./marketDetailData";

/* eslint-disable @typescript-eslint/no-explicit-any -- Highcharts formatter context */

/** Shared tooltip: "Block 46 (11:15–11:30)", a divider, then each visible series' name in its
 *  colour and value to 2 decimals, right-aligned. */
export function chartTooltipHtml(ctx: any): string {
  const block = Number(ctx.x);
  const [a, b] = blockToTime(block);
  const rows = (ctx.points ?? [])
    .map((p: any) => `<tr>
      <td style="color:${p.series.color};font-weight:600;padding:1px 12px 1px 0">${p.series.name}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;color:hsl(var(--popover-foreground))">${Number(p.y).toFixed(2)}</td>
    </tr>`)
    .join("");
  return `<div style="font-size:11px;min-width:150px">
    <div style="font-weight:700;color:hsl(var(--popover-foreground));padding-bottom:4px;margin-bottom:4px;border-bottom:1px solid hsl(var(--border))">Block ${block} (${a}–${b})</div>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
  </div>`;
}
