import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { istNow } from "@/data/engine";
import { BLOCKS, blockTime, todayIso, type Actuals } from "@/lib/dayahead";
import { cv } from "@/components/chart/colors";
import { InteractiveLegend, type LegendItem } from "./InteractiveLegend";

// Series colours come from the themed chart tokens (--ch-*) so the chart follows the palette and
// light/dark mode like the rest of the app. cv("--neg") → var(--ch-neg), etc.
const C = {
  actual: cv("--neg"),        // red
  forecast: cv("--c-isgs"),   // blue
  roast: cv("--c-store"),     // pink
  mape: cv("--pos"),          // green
  manual: cv("--c-ipp"),      // purple
  manualMape: cv("--c-hydro"),// cyan
  udm: cv("--c-solar"),       // gold
};

type Row = {
  b: number; t: string; forecast: number; actual?: number; roast?: [number, number]; roastV?: number;
  mape?: number; manual?: number; manualMape?: number; udm?: number;
  // Actual / UDM / Roastering split at the current block: solid up to it, dotted after (today only).
  actualSolid?: number; actualDot?: number; udmSolid?: number; udmDot?: number; roastSolid?: [number, number]; roastDot?: [number, number];
};

const blockNow = () => { const d = istNow(); return Math.min(BLOCKS - 1, Math.floor((d.getHours() * 60 + d.getMinutes()) / 15)); };

/** The current 15-min block, rechecked every 30 s so the marker moves on with the clock. */
function useLiveBlock(active: boolean) {
  const [b, setB] = useState(blockNow);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setB(blockNow()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  return b;
}

/** "13:45" → "56": the block number (1–96) of a block's start time. */
const blockNo = (t: string) => { const [h, m] = t.split(":").map(Number); return String(h * 4 + Math.floor(m / 15) + 1); };

// Small cards: label every 4th block and always the last one (1, 5, 9 … 93, 96), so the axis
// reads all the way to block 96.
const COMPACT_TICKS = [...Array.from({ length: 24 }, (_, i) => blockTime(i * 4)), blockTime(95)];
const kfmt = (v: number) => (Math.abs(v) >= 1000 ? +(v / 1000).toFixed(1) + "k" : String(Math.round(v)));

function ChartTip({ active, payload, hidden, items, coordinate, floatIn }: {
  active?: boolean; payload?: { payload: Row }[]; hidden: Set<string>; items: LegendItem[];
  coordinate?: { x: number; y: number };
  /** Tiny charts: float the box above the page (portal), beside the hovered block. */
  floatIn?: RefObject<HTMLDivElement | null>;
}) {
  if (!active || !payload?.length) return null;
  if (floatIn) return <FloatingTip box={floatIn} x={coordinate?.x ?? 0}><TipBody payload={payload} hidden={hidden} items={items} /></FloatingTip>;
  return <TipBody payload={payload} hidden={hidden} items={items} />;
}

/** The tooltip box laid on top of the whole page (fixed, via a portal) so a small card neither
 *  clips it nor gets covered by it: it sits to the right of the hovered block, or to the left when
 *  there's no room, and stays inside the window. Being outside the page flow, it can't make the
 *  page re-size (which was the hover flicker). */
function FloatingTip({ box, x, children }: { box: RefObject<HTMLDivElement | null>; x: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const b = box.current?.getBoundingClientRect(), el = ref.current;
    if (!b || !el) return;
    const w = el.offsetWidth, h = el.offsetHeight, gap = 14, pad = 6;
    const cx = b.left + x;
    const left = cx + gap + w <= window.innerWidth - pad ? cx + gap : Math.max(pad, cx - gap - w);
    const top = Math.min(Math.max(pad, b.top + b.height / 2 - h / 2), window.innerHeight - pad - h);
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  });
  return createPortal(
    <div ref={ref} style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? 0, zIndex: 80, pointerEvents: "none" }}>{children}</div>,
    document.body,
  );
}

function TipBody({ payload, hidden, items }: { payload: { payload: Row }[]; hidden: Set<string>; items: LegendItem[] }) {
  const r = payload[0].payload;
  const val: Record<string, string | undefined> = {
    mape: r.mape?.toFixed(2), manualMape: r.manualMape?.toFixed(2), roast: r.roastV?.toFixed(2),
    actual: r.actual?.toFixed(2), forecast: r.forecast.toFixed(2), manual: r.manual?.toFixed(2), udm: r.udm?.toFixed(2),
  };
  return (
    <div className="min-w-[200px] rounded-lg border bg-popover px-3 py-2 text-[12px] text-popover-foreground shadow-lg">
      <div className="mb-1 font-semibold">Block {r.b + 1} · {r.t}–{blockTime(r.b + 1)}</div>
      {items.filter((it) => !hidden.has(it.key) && val[it.key] != null).map((it) => (
        <div key={it.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground"><i className="inline-block h-2 w-2 rounded-full" style={{ background: it.color }} />{it.label}:</span>
          <span className="num font-semibold">{val[it.key]}</span>
        </div>
      ))}
    </div>
  );
}

function download(name: string, href: string) {
  const a = document.createElement("a"); a.href = href; a.download = name; a.click();
}

/** Card A: 96-block day-ahead forecast. Actual / UDM (yellow) / Roastering / MAPE only when `actuals` is given
 *  (today or earlier); Manual Forecast + Manual MAPE only when that data exists. */
export function ForecastChart({ forecast, actuals, date, compact: compactProp = false, bare = false, title = "96-Block Day-Ahead Forecast" }: {
  forecast: number[]; actuals: Actuals | null; date: string;
  /** Title over the full-size chart. */
  title?: string;
  /** Small-card mode (Week ahead grid): no title bar, export menu or legend; smaller axes. */
  compact?: boolean;
  /** Tiny-box mode (Month ahead calendar): compact and no axes at all — just the plot and tooltip. */
  bare?: boolean;
}) {
  const compact = compactProp || bare;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const isToday = date === todayIso();
  const liveB = useLiveBlock(isToday);
  // Past days are all "done": solid to the end. Today splits at the current block.
  const cut = isToday ? liveB : BLOCKS - 1;

  const rows = useMemo((): Row[] => Array.from({ length: BLOCKS }, (_, b) => {
    const r: Row = { b, t: blockTime(b), forecast: forecast[b] };
    if (actuals) {
      const a = actuals.actual[b], roast: [number, number] = [a, a + actuals.roastering[b]];
      Object.assign(r, { actual: a, roastV: actuals.roastering[b], roast, mape: actuals.mape[b] });
      // Both halves include the current block so the two segments join up.
      if (b <= cut) { r.actualSolid = a; r.roastSolid = roast; }
      if (b >= cut) { r.actualDot = a; r.roastDot = roast; }
      if (actuals.udm) {
        const u = actuals.udm[b];
        r.udm = u;
        if (b <= cut) r.udmSolid = u;
        if (b >= cut) r.udmDot = u;
      }
    }
    if (actuals?.manual) r.manual = actuals.manual[b];
    if (actuals?.manualMape) r.manualMape = actuals.manualMape[b];
    return r;
  }), [forecast, actuals, cut]);

  const items = useMemo((): LegendItem[] => [
    ...(actuals ? [{ key: "actual", label: "Actual (MW)", color: C.actual }] : []),
    ...(actuals?.udm ? [{ key: "udm", label: "UDM (MW)", color: C.udm }] : []),
    { key: "forecast", label: "System Forecast (MW)", color: C.forecast },
    ...(actuals?.manual ? [{ key: "manual", label: "Manual Forecast (MW)", color: C.manual }] : []),
    ...(actuals ? [{ key: "roast", label: "Roastering", color: C.roast }, { key: "mape", label: "System MAPE %", color: C.mape }] : []),
    ...(actuals?.manualMape ? [{ key: "manualMape", label: "Manual MAPE %", color: C.manualMape }] : []),
  ], [actuals]);

  // Left axis hugs the visible MW series: ~97% of the lowest visible value, rescaling on toggle.
  const [lo, hi] = useMemo(() => {
    const vals: number[] = [];
    rows.forEach((r) => {
      if (!hidden.has("forecast")) vals.push(r.forecast);
      if (r.actual != null && !hidden.has("actual")) vals.push(r.actual);
      if (r.udm != null && !hidden.has("udm")) vals.push(r.udm);
      if (r.roast && !hidden.has("roast")) vals.push(r.roast[1]);
      if (r.manual != null && !hidden.has("manual")) vals.push(r.manual);
    });
    if (!vals.length) return [0, 1];
    return [Math.floor((Math.min(...vals) * 0.97) / 100) * 100, Math.ceil((Math.max(...vals) * 1.02) / 100) * 100];
  }, [rows, hidden]);

  // Right axis is 0–9% by default, stretched in steps of 3 when MAPE runs higher.
  const pctMax = Math.max(9, Math.ceil(Math.max(0, ...rows.map((r) => Math.max(r.mape ?? 0, r.manualMape ?? 0))) / 3) * 3);
  const pctTicks = Array.from({ length: pctMax / 3 + 1 }, (_, k) => k * 3);

  const toggle = (k: string) => setHidden((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const on = (k: string) => !hidden.has(k) && items.some((it) => it.key === k);

  const exportCsv = () => {
    const withUdm = !!actuals?.udm;
    const cols = ["Time", "System Forecast (MW)", ...(actuals ? ["Actual (MW)", "Roastering", "System MAPE %"] : []), ...(withUdm ? ["UDM (MW)"] : [])];
    const lines = rows.map((r) => [r.t, r.forecast, ...(actuals ? [r.actual, r.roastV, r.mape] : []), ...(withUdm ? [r.udm] : [])].join(","));
    download(`day-ahead-forecast-${date}.csv`, "data:text/csv;charset=utf-8," + encodeURIComponent([cols.join(","), ...lines].join("\n")));
    setMenu(false);
  };
  const exportPng = () => {
    const svg = boxRef.current?.querySelector("svg.recharts-surface");
    setMenu(false);
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = width * 2; c.height = height * 2;
      const ctx = c.getContext("2d")!; ctx.scale(2, 2); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
      download(`day-ahead-forecast-${date}.png`, c.toDataURL("image/png"));
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[13px] font-bold">{title}</div>
        <div className="relative">
          <button type="button" aria-label="Export chart" onClick={() => setMenu((m) => !m)}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Menu className="h-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-8 z-20 w-36 rounded-md border bg-popover py-1 text-[12px] shadow-lg">
              <button type="button" onClick={exportCsv} className="block w-full px-3 py-1.5 text-left hover:bg-accent">Download CSV</button>
              <button type="button" onClick={exportPng} className="block w-full px-3 py-1.5 text-left hover:bg-accent">Download PNG</button>
            </div>
          )}
        </div>
      </div>
      )}
      <div ref={boxRef} className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={bare ? { top: 2, right: 0, bottom: 0, left: 0 } : { top: 6, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            {/* x-axis in block numbers (1–96, every other one labelled); the tooltip keeps the time range */}
            <XAxis hide={bare} dataKey="t" ticks={compact ? COMPACT_TICKS : undefined} interval={compact ? 0 : 1} height={compact ? 18 : 22} tickLine={false} axisLine={false} tick={{ fontSize: compact ? 9 : 9.5 }} tickFormatter={blockNo} />
            <YAxis hide={bare} yAxisId="mw" domain={[lo, hi]} allowDataOverflow tickFormatter={kfmt} tickLine={false} axisLine={false} width={compact ? 42 : 40} tick={{ fontSize: compact ? 9 : 10 }} />
            <YAxis hide={bare} yAxisId="pct" orientation="right" domain={[0, pctMax]} ticks={pctTicks} allowDataOverflow tickLine={false} axisLine={false} width={compact ? 18 : 24} tick={{ fontSize: compact ? 9 : 10 }} />
            {/* bars first so they sit behind the lines */}
            {on("mape") && <Bar yAxisId="pct" dataKey="mape" fill={C.mape} fillOpacity={0.3} isAnimationActive={false} />}
            {on("manualMape") && <Area yAxisId="pct" dataKey="manualMape" stroke={C.manualMape} fill={C.manualMape} fillOpacity={0.25} isAnimationActive={false} />}
            {/* current block (today only): a plain bar over that block's own 15-min slot (x1 = x2 fills
                its whole band, e.g. 12:15–12:30), moving with the clock */}
            {isToday && (
              <ReferenceArea yAxisId="mw" x1={blockTime(liveB)} x2={blockTime(liveB)} fill={cv("--accent")} fillOpacity={0.18} ifOverflow="visible" />
            )}
            {on("roast") && <Area yAxisId="mw" dataKey="roastSolid" stroke={C.roast} strokeWidth={1} fill={C.roast} fillOpacity={0.3} isAnimationActive={false} activeDot={false} />}
            {on("roast") && isToday && <Area yAxisId="mw" dataKey="roastDot" stroke={C.roast} strokeWidth={1} strokeDasharray="2 3" fill={C.roast} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />}
            {on("actual") && <Line yAxisId="mw" dataKey="actualSolid" stroke={C.actual} strokeWidth={2} dot={false} isAnimationActive={false} />}
            {on("actual") && isToday && <Line yAxisId="mw" dataKey="actualDot" stroke={C.actual} strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} />}
            {on("udm") && <Line yAxisId="mw" dataKey="udmSolid" stroke={C.udm} strokeWidth={2} dot={false} isAnimationActive={false} />}
            {on("udm") && isToday && <Line yAxisId="mw" dataKey="udmDot" stroke={C.udm} strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} />}
            {on("forecast") && <Line yAxisId="mw" dataKey="forecast" stroke={C.forecast} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />}
            {on("manual") && <Line yAxisId="mw" dataKey="manual" stroke={C.manual} strokeWidth={2} dot={false} isAnimationActive={false} />}
            {/* No slide animation: it made the box trail and jump between blocks. */}
            <Tooltip isAnimationActive={false} wrapperStyle={{ zIndex: 60 }} {...(bare ? { position: { x: 0, y: 0 } } : {})} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "4 4" }}
              content={<ChartTip hidden={hidden} items={items} floatIn={bare ? boxRef : undefined} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!compact && <div className="pt-1"><InteractiveLegend items={items} hidden={hidden} onToggle={toggle} /></div>}
    </div>
  );
}
