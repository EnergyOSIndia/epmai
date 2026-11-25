import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cv } from "@/components/chart/colors";
import { BLOCKS, blockTime } from "@/lib/dayahead";
import { ZONES, type ZoneId, type ZoneLine } from "@/lib/zoneDemand";

/** Zone colours: EZ blue, WZ gold, CZ green (themed chart tokens, light / dark). */
export const ZONE_COLOR: Record<ZoneId, string> = { east: cv("--c-isgs"), west: cv("--c-solar"), central: cv("--pos") };

type Zone = (typeof ZONES)[number];
type Row = { b: number; t: string } & Record<string, number | string | undefined>;

/** Zone-wise demand: EZ, WZ and CZ stacked on one 96-block chart (like Supply by Category) — the
 *  lowest zone (by average) at the bottom, then the middle one, the highest on top; the stack's top
 *  is the three zones' total. Each zone's value is its actual where the API has one and its
 *  forecast after that: actual blocks are drawn solid with a stronger fill, forecast blocks dotted
 *  with a lighter fill — the Demand Forecast rule (past day solid, future day dotted, today solid up
 *  to the current block then dotted). Click a zone in the legend to hide / show it. */
export function ZoneDemandChart({ lines, title }: { lines: Record<ZoneId, ZoneLine>; title: string }) {
  const [hidden, setHidden] = useState<Set<ZoneId>>(new Set());

  // Stack order: lowest average first (bottom) → highest (top). The tooltip lists them the same way.
  const order = useMemo((): Zone[] => {
    const mean = (z: ZoneId) => {
      const v = Array.from({ length: BLOCKS }, (_, b) => lines[z].actual[b] ?? lines[z].forecast[b]).filter((x): x is number => x != null);
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
    };
    return [...ZONES].sort((a, b) => mean(a.id) - mean(b.id));
  }, [lines]);
  const shown = order.filter((z) => !hidden.has(z.id));

  const rows = useMemo((): Row[] => {
    // Last block with an actual, per zone: solid up to it, dotted from it (the outline segments
    // share that block so they join).
    const lastA = Object.fromEntries(ZONES.map((z) => {
      let k = -1; lines[z.id].actual.forEach((v, i) => { if (v != null) k = i; });
      return [z.id, k];
    })) as Record<ZoneId, number>;
    return Array.from({ length: BLOCKS }, (_, b) => {
      const r: Row = { b, t: blockTime(b) };
      let top = 0;
      for (const z of shown) {
        const l = lines[z.id], a = l.actual[b], f = l.forecast[b];
        const v = a ?? f ?? 0;
        top += v;
        // Stacked fills: one of the two is the value, the other 0 — so the stack adds up once.
        r[`${z.id}_sa`] = a != null ? v : 0;
        r[`${z.id}_sf`] = a != null ? 0 : v;
        // The zone's outline at its stacked top: solid over actual blocks, dotted after.
        if (b <= lastA[z.id]) r[`${z.id}_ta`] = top;
        if (b >= lastA[z.id]) r[`${z.id}_tf`] = top;
        // Raw values for the tooltip.
        r[`${z.id}_act`] = a ?? undefined; r[`${z.id}_fc`] = f ?? undefined;
        r[`${z.id}_udm`] = l.udm[b] ?? undefined; r[`${z.id}_mape`] = l.mape[b] ?? undefined;
      }
      r.total = top;
      return r;
    });
  }, [lines, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (z: ZoneId) => setHidden((s) => { const n = new Set(s); if (n.has(z)) n.delete(z); else n.add(z); return n; });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-bold">{title}</div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {order.map((z) => (
            <button key={z.id} type="button" onClick={() => toggle(z.id)}
              className={"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium " + (hidden.has(z.id) ? "text-muted-foreground opacity-50" : "")}>
              <span className="h-2 w-3.5 rounded-sm" style={{ background: ZONE_COLOR[z.id], opacity: 0.6 }} />{z.code} (MW)
            </button>
          ))}
          <span className="text-muted-foreground">— actual · ┄ forecast</span>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="b" tickFormatter={(b: number) => String(b + 1)} interval={1} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis width={44} domain={[0, "auto"]} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <Tooltip isAnimationActive={false} wrapperStyle={{ zIndex: 60 }} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "4 4" }}
              content={<ZoneTip order={shown} />} />
            {/* Stacked fills, bottom (lowest zone) to top: actual part stronger, forecast part lighter. */}
            {shown.flatMap((z) => [
              <Area key={`${z.id}_sa`} dataKey={`${z.id}_sa`} stackId="zones" type="linear" stroke="none" fill={ZONE_COLOR[z.id]} fillOpacity={0.5} isAnimationActive={false} activeDot={false} />,
              <Area key={`${z.id}_sf`} dataKey={`${z.id}_sf`} stackId="zones" type="linear" stroke="none" fill={ZONE_COLOR[z.id]} fillOpacity={0.25} isAnimationActive={false} activeDot={false} />,
            ])}
            {/* Each zone's top edge: solid over actual blocks, dotted over forecast blocks. */}
            {shown.flatMap((z) => [
              <Line key={`${z.id}_ta`} dataKey={`${z.id}_ta`} type="linear" stroke={ZONE_COLOR[z.id]} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls={false} activeDot={false} />,
              <Line key={`${z.id}_tf`} dataKey={`${z.id}_tf`} type="linear" stroke={ZONE_COLOR[z.id]} strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false} activeDot={false} />,
            ])}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Tooltip like the Demand Forecast chart's: "Block N · from–to", then each shown zone in
 *  descending order (highest first, as the stack reads top to bottom) with its Actual, UDM, Forecast (MW) and MAPE % — only the values the API
 *  has for that block — and the three zones' total. */
function ZoneTip({ active, payload, order }: { active?: boolean; payload?: { payload: Row }[]; order: Zone[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const f = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : null);
  return (
    <div className="min-w-[220px] rounded-lg border bg-popover px-3 py-2 text-[12px] text-popover-foreground shadow-lg">
      <div className="mb-1 font-semibold">Block {r.b + 1} · {r.t}–{blockTime(r.b + 1)}</div>
      {[...order].reverse().map((z) => {
        const rows = [
          ["Actual (MW)", f(r[`${z.id}_act`])], ["UDM (MW)", f(r[`${z.id}_udm`])],
          ["Forecast (MW)", f(r[`${z.id}_fc`])], ["MAPE %", f(r[`${z.id}_mape`])],
        ].filter(([, v]) => v != null);
        if (!rows.length) return null;
        return (
          <div key={z.id} className="border-t py-0.5 first-of-type:border-t-0">
            {rows.map(([label, v]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-0.5">
                <span className="flex items-center gap-1.5 text-muted-foreground"><i className="inline-block h-2 w-2 rounded-full" style={{ background: ZONE_COLOR[z.id] }} />{z.code} {label}:</span>
                <span className="num font-semibold">{v}</span>
              </div>
            ))}
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
