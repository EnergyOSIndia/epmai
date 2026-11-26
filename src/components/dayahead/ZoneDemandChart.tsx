import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cv } from "@/components/chart/colors";
import { BLOCKS, blockTime } from "@/lib/dayahead";
import { cn } from "@/lib/utils";
import { ZONES, type ZoneId, type ZoneLine } from "@/lib/zoneDemand";

/** Zone colours: EZ blue, WZ gold, CZ green (themed chart tokens, light / dark). */
export const ZONE_COLOR: Record<ZoneId, string> = { east: cv("--c-isgs"), west: cv("--c-solar"), central: cv("--pos") };

type Zone = (typeof ZONES)[number];
type Row = { b: number; t: string } & Record<string, number | string | undefined>;
type View = "stacked" | "load";

/** Zone-wise demand forecast: EZ, WZ and CZ on one 96-block chart — the forecast only (dotted, as
 *  the Demand Forecast draws its forecast). Two views:
 *   · Stacked — areas stacked like Supply by Category: the lowest zone (by average) at the bottom,
 *     then the middle one, the highest on top; the stack's top is the three zones' total.
 *   · Load    — each zone's own forecast line.
 *  Click a zone in the legend to hide / show it. */
export function ZoneDemandChart({ lines, title }: { lines: Record<ZoneId, ZoneLine>; title: string }) {
  const [hidden, setHidden] = useState<Set<ZoneId>>(new Set());
  const [view, setView] = useState<View>("stacked");

  // Lowest average first (bottom of the stack) → highest. The legend follows it; the tooltip reads
  // it the other way (highest first).
  const order = useMemo((): Zone[] => {
    const mean = (z: ZoneId) => {
      const v = lines[z].forecast.filter((x): x is number => x != null);
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
    };
    return [...ZONES].sort((a, b) => mean(a.id) - mean(b.id));
  }, [lines]);
  const shown = order.filter((z) => !hidden.has(z.id));

  const rows = useMemo((): Row[] => Array.from({ length: BLOCKS }, (_, b) => {
    const r: Row = { b, t: blockTime(b) };
    let top = 0;
    for (const z of shown) {
      const f = lines[z.id].forecast[b];
      r[`${z.id}_fc`] = f ?? undefined;      // the zone's forecast (Load view, tooltip)
      r[`${z.id}_st`] = f ?? 0;              // stacked fill
      top += f ?? 0;
      r[`${z.id}_top`] = top;                // the zone's stacked top edge
    }
    r.total = top;
    return r;
  }), [lines, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (z: ZoneId) => setHidden((s) => { const n = new Set(s); if (n.has(z)) n.delete(z); else n.add(z); return n; });
  const seg = (v: View, label: string) => (
    <button type="button" onClick={() => setView(v)} aria-pressed={view === v}
      className={cn("h-6 px-2.5 text-[11px] font-semibold", view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="text-[13px] font-bold">{title}</div>
          <div className="flex overflow-hidden rounded-md border" role="radiogroup" aria-label="Chart view">
            {seg("stacked", "Stacked")}
            <span className="w-px bg-border" />
            {seg("load", "Load")}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {order.map((z) => (
            <button key={z.id} type="button" onClick={() => toggle(z.id)}
              className={"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium " + (hidden.has(z.id) ? "text-muted-foreground opacity-50" : "")}>
              <span className={view === "stacked" ? "h-2 w-3.5 rounded-sm" : "h-0.5 w-3.5 rounded"} style={{ background: ZONE_COLOR[z.id], opacity: view === "stacked" ? 0.6 : 1 }} />{z.code} Forecast (MW)
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="b" tickFormatter={(b: number) => String(b + 1)} interval={1} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis width={44} domain={view === "stacked" ? [0, "auto"] : ["auto", "auto"]} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <Tooltip isAnimationActive={false} wrapperStyle={{ zIndex: 60 }} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "4 4" }}
              content={<ZoneTip order={shown} />} />
            {view === "stacked"
              ? [
                  // Stacked fills, bottom (lowest zone) to top, then each zone's dotted top edge.
                  ...shown.map((z) => <Area key={`${z.id}_st`} dataKey={`${z.id}_st`} stackId="zones" type="linear" stroke="none" fill={ZONE_COLOR[z.id]} fillOpacity={0.3} isAnimationActive={false} activeDot={false} />),
                  ...shown.map((z) => <Line key={`${z.id}_top`} dataKey={`${z.id}_top`} type="linear" stroke={ZONE_COLOR[z.id]} strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} activeDot={false} />),
                ]
              : shown.map((z) => <Line key={`${z.id}_fc`} dataKey={`${z.id}_fc`} type="linear" stroke={ZONE_COLOR[z.id]} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />)}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Tooltip like the Demand Forecast chart's: "Block N · from–to", then each shown zone's forecast
 *  in descending order (highest first) and the three zones' total. */
function ZoneTip({ active, payload, order }: { active?: boolean; payload?: { payload: Row }[]; order: Zone[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const f = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : null);
  return (
    <div className="min-w-[220px] rounded-lg border bg-popover px-3 py-2 text-[12px] text-popover-foreground shadow-lg">
      <div className="mb-1 font-semibold">Block {r.b + 1} · {r.t}–{blockTime(r.b + 1)}</div>
      {[...order].reverse().map((z) => {
        const v = f(r[`${z.id}_fc`]);
        if (v == null) return null;
        return (
          <div key={z.id} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-muted-foreground"><i className="inline-block h-2 w-2 rounded-full" style={{ background: ZONE_COLOR[z.id] }} />{z.code} Forecast (MW):</span>
            <span className="num font-semibold">{v}</span>
          </div>
        );
      })}
      {order.length > 1 && (
        <div className="mt-0.5 flex items-center justify-between gap-4 border-t pt-1">
          <span className="font-medium">Total (MW):</span>
          <span className="num font-semibold">{f(r.total)}</span>
        </div>
      )}
    </div>
  );
}
