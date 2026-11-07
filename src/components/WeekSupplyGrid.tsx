import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DAY, MON } from "@/data/engine";
import { groupsFor, splitByGroup, type GroupBy } from "@/features/loadgrid/breakdown";
import { useDcData } from "@/features/loadgrid/data";
import type { DemandCalendarData } from "@/store/features/demandTypes";
import "./DemandCalendar.css";

const BLOCKS = 96;
export const WINDOW_START = "2019-04-01";

// Helper to format ISO date YYYY-MM-DD
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const mw = (v: number) => Math.round(v).toLocaleString("en-IN");

/** "HH:MM" for a 15-min block index (0-based): 0 -> "00:00", 95 -> "23:45". */
function blockTime(b: number): string {
  const mins = b * 15;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

type Geom = { x: (b: number) => number; y: (v: number) => number };
const linePath = (a: number[], g: Geom) => a.map((v, b) => (b ? "L" : "M") + g.x(b) + "," + g.y(v)).join("");
const areaPath = (lo: number[], hi: number[], g: Geom) => {
  let d = "M" + g.x(0) + "," + g.y(hi[0]);
  for (let b = 1; b < hi.length; b++) d += "L" + g.x(b) + "," + g.y(hi[b]);
  for (let b = hi.length - 1; b >= 0; b--) d += "L" + g.x(b) + "," + g.y(lo[b]);
  return d + "Z";
};
function niceStep(range: number, n: number) {
  const s = range / n, p = Math.pow(10, Math.floor(Math.log10(s || 1))), f = s / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

/** Peak/min/average/energy over a 96-block (15-min) series — used for Demand's
 *  single-series "day energy" chip and modal KPIs (mirrors Month-ahead's `sStats`). */
function singleStats(a: number[]) {
  let pk = 0, mn = 0, sum = 0;
  a.forEach((v, b) => { if (v > a[pk]) pk = b; if (v < a[mn]) mn = b; sum += v; });
  return { pk, mn, avg: sum / a.length, mu: (sum * 0.25) / 1000 };
}

type Layer = { name: string; color: string; v: number[] };
type DayData = { key: string; label: string; date: number; weekday: number; F: number[]; avail: number[]; layers: Layer[] };

/** Per-block tooltip content for a day (or a Remark's averaged "day") — same
 *  markup/classes as the month-ahead calendar's tooltip (`.dc-tip`'s `.r` / `.sw`
 *  / `.neg` / `.pos` / `<hr>`). */
function blockTipHtml(d: { label: string; layers: Layer[]; F: number[]; avail: number[] }, b: number): string {
  let html = `<h4>${d.label} · Block ${b + 1} · ${blockTime(b)}–${blockTime((b + 1) % BLOCKS)}</h4>`;
  for (let k = d.layers.length - 1; k >= 0; k--) {
    const l = d.layers[k];
    html += `<div class="r"><span><i class="sw" style="background:${l.color}"></i>${l.name}</span><b>${mw(l.v[b])}</b></div>`;
  }
  const dem = d.F[b], av = d.avail[b], gap = av - dem;
  html += `<hr><div class="r"><span>Total supply (DC)</span><b>${mw(av)}</b></div>` +
    `<div class="r"><span>Demand met</span><b>${mw(dem)}</b></div>` +
    `<div class="r"><span>${gap < 0 ? "Deficit" : "Surplus"}</span><b class="${gap < 0 ? "neg" : "pos"}">${gap < 0 ? "" : "+"}${mw(gap)}</b></div>`;
  return html;
}

// export function WeekSupplyGrid({ groupBy, weekOffset = 0, mod }: { groupBy: GroupBy; weekOffset?: number; mod: "supply" | "demand" }) {
//   const { D, err } = useDcData();
//   const isDemand = mod === "demand";
//   const groups = useMemo(() => groupsFor(groupBy), [groupBy]);

//   const perDay = useMemo((): DayData[] => {
//     if (!D) return [];
//     const anchor = Math.max(0, D.dates.indexOf(WINDOW_START));
//     // weekOffset shifts a full 7 days at a time (Previous/Current/Next week),
//     // clamped so the window never runs past either end of the dataset.
//     const idx = Math.max(0, Math.min(anchor + weekOffset * 7, D.dates.length - 7));
//     return D.dates.slice(idx, idx + 7).map((iso, k) => {
//       const i = idx + k;
//       const [y, m, d] = iso.split("-").map(Number);
//       const weekday = new Date(y, m - 1, d).getDay();
//       const avail = D.av[i];
//       // Demand has no stack: a single "Demand met" area, same as Month-ahead's
//       // plain "dem" mode — Graph Type (Category/Technology/...) is Supply-only.
//       const split = isDemand ? null : splitByGroup(avail, groups);
//       const layers = isDemand
//         ? [{ name: "Demand met", color: "var(--dc-sur)", v: D.dem[i] }]
//         : groups.map((g, gi) => ({ name: g.name, color: g.color, v: split![gi] }));
//       return {
//         key: iso, label: DAY[weekday] + " " + d + " " + MON[m - 1],
//         date: d, weekday,
//         F: D.dem[i], avail,
//         layers,
//       };
//     });
//   }, [D, groups, weekOffset, isDemand]);

//   const range = useMemo((): [number, number] => {
//     if (!perDay.length) return [0, 1];
//     const all = perDay.flatMap((d) => [...d.F, ...d.avail]);
//     return [0, Math.max(...all) || 1];
//   }, [perDay]);

//   const working = perDay.filter((d) => d.weekday >= 1 && d.weekday <= 5);
//   const weekend = perDay.filter((d) => d.weekday === 0 || d.weekday === 6);

//   const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
//   const showTip = useCallback((e: { clientX: number; clientY: number }, html: string) => {
//     const vw = window.innerWidth, vh = window.innerHeight, tw = 230, th = 180;
//     let lx = e.clientX + 16; if (lx + tw > vw - 8) lx = e.clientX - tw - 16; if (lx < 8) lx = 8;
//     setTip({ x: lx, y: Math.max(8, Math.min(e.clientY - th / 2, vh - th - 8)), html });
//   }, []);
//   const hideTip = useCallback(() => setTip(null), []);

//   const [openKey, setOpenKey] = useState<string | null>(null);
//   const openIdx = openKey != null ? perDay.findIndex((d) => d.key === openKey) : -1;

//   // 3x3: Mon/Tue/Wed · Thu/Fri/Remark(working) · Sat/Sun/Remark(weekend). Each
//   // Remark is built the same way as a day cell — a block-by-block average across
//   // its group's days, drawn as the same stacked-area + demand-line chart.
//   const row1 = working.slice(0, 3);
//   const row2 = working.slice(3, 5);
//   const dayCell = (d: DayData) => (
//     <WeekDayCell key={d.key} d={d} range={range} isDemand={isDemand} onOpen={() => setOpenKey(d.key)} showTip={showTip} hideTip={hideTip} />
//   );

//   if (err) return <p className="dc-note">Could not load the week's {isDemand ? "demand" : "supply"} data. Reload the page to try again.</p>;
//   if (!perDay.length) return <p className="dc-note">Loading week's {isDemand ? "demand" : "supply"} data…</p>;

//   return (
//     <div className="dc-root">
//       <div className="dc-cal-scroll">
//         <div className="dc-cal" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
//           {row1.map(dayCell)}
//           {row2.map(dayCell)}
//           <RemarkDayCell title="Remarks" days={working} range={range} isDemand={isDemand} showTip={showTip} hideTip={hideTip} />
//           {weekend.map(dayCell)}
//           <RemarkDayCell title="Remarks" days={weekend} range={range} isDemand={isDemand} showTip={showTip} hideTip={hideTip} />
//         </div>
//       </div>

//       <p className="dc-note">
//         {isDemand
//           ? "Pk = day's peak demand · chip = day energy (MU) · Remark = that group's block-by-block average, Mon–Fri or Sat–Sun, drawn the same way as a day · hover a day for block values · click a day to open it full size."
//           : "Pk = day's peak demand · chip = tightest block (blue surplus, red deficit) · Remark = that group's block-by-block average, Mon–Fri or Sat–Sun, drawn the same way as a day · hover a day for block values · click a day to open it full size."}
//       </p>

//       {openIdx >= 0 && (
//         <WeekDayModal
//           days={perDay} i={openIdx} range={range} isDemand={isDemand}
//           onClose={() => setOpenKey(null)} setDay={(k) => setOpenKey(perDay[k].key)}
//           showTip={showTip} hideTip={hideTip}
//         />
//       )}

//       {tip && <div className="dc-tip" style={{ left: tip.x, top: tip.y }} dangerouslySetInnerHTML={{ __html: tip.html }} />}
//     </div>
//   );
// }

export function WeekSupplyGrid({
  groupBy,
  weekOffset = 0,
  mod,
  externalData,
  loading = false,
  baseDate = new Date("2026-10-19"), // Default anchor Monday for the current API window
}: {
  groupBy: GroupBy;
  weekOffset?: number;
  mod: "supply" | "demand";
  externalData?: DemandCalendarData | null;
  loading?: boolean;
  baseDate?: Date;
}) {
  const { D: fallbackD, err } = useDcData();
  const isDemand = mod === "demand";
  const groups = useMemo(() => groupsFor(groupBy), [groupBy]);

  // Compute 7 days for current week window
  const perDay = useMemo((): DayData[] => {
    // 1. If externalData is passed (Demand module via Redux API)
    if (isDemand && externalData) {
      // Find Monday for this weekOffset
      const startMonday = new Date(baseDate);
      startMonday.setDate(startMonday.getDate() + weekOffset * 7);

      const days: DayData[] = [];
      for (let offset = 0; offset < 7; offset++) {
        const currentDate = new Date(startMonday);
        currentDate.setDate(currentDate.getDate() + offset);

        const iso = toIsoDate(currentDate);
        // const y = currentDate.getFullYear();
        const m = currentDate.getMonth() + 1;
        const d = currentDate.getDate();
        const weekday = currentDate.getDay();

        const dataIndex = externalData.dates.indexOf(iso);
        const hasData = dataIndex >= 0;

        const demSeries = hasData ? externalData.dem[dataIndex] : new Array(BLOCKS).fill(0);
        const availSeries = hasData ? externalData.av[dataIndex] : new Array(BLOCKS).fill(0);

        days.push({
          key: iso,
          label: `${DAY[weekday]} ${d} ${MON[m - 1]}`,
          date: d,
          weekday,
          F: demSeries,
          avail: availSeries,
          layers: [{ name: "Demand met", color: "var(--dc-sur)", v: demSeries }],
        });
      }
      return days;
    }

    // 2. Fallback to existing supply dataset
    if (!fallbackD) return [];
    const anchor = Math.max(0, fallbackD.dates.indexOf(WINDOW_START));
    const idx = Math.max(0, Math.min(anchor + weekOffset * 7, fallbackD.dates.length - 7));

    return fallbackD.dates.slice(idx, idx + 7).map((iso, k) => {
      const i = idx + k;
      const [y, m, d] = iso.split("-").map(Number);
      const weekday = new Date(y, m - 1, d).getDay();
      const avail = fallbackD.av[i];
      const split = isDemand ? null : splitByGroup(avail, groups);
      const layers = isDemand
        ? [{ name: "Demand met", color: "var(--dc-sur)", v: fallbackD.dem[i] }]
        : groups.map((g, gi) => ({ name: g.name, color: g.color, v: split![gi] }));

      return {
        key: iso,
        label: DAY[weekday] + " " + d + " " + MON[m - 1],
        date: d,
        weekday,
        F: fallbackD.dem[i],
        avail,
        layers,
      };
    });
  }, [isDemand, externalData, baseDate, weekOffset, fallbackD, groups]);

  const range = useMemo((): [number, number] => {
    if (!perDay.length) return [0, 1];
    const all = perDay.flatMap((d) => [...d.F, ...d.avail]);
    return [0, Math.max(...all) || 1];
  }, [perDay]);

  const working = perDay.filter((d) => d.weekday >= 1 && d.weekday <= 5);
  const weekend = perDay.filter((d) => d.weekday === 0 || d.weekday === 6);

  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
  const showTip = useCallback((e: { clientX: number; clientY: number }, html: string) => {
    const vw = window.innerWidth, vh = window.innerHeight, tw = 230, th = 180;
    let lx = e.clientX + 16;
    if (lx + tw > vw - 8) lx = e.clientX - tw - 16;
    if (lx < 8) lx = 8;
    setTip({ x: lx, y: Math.max(8, Math.min(e.clientY - th / 2, vh - th - 8)), html });
  }, []);
  const hideTip = useCallback(() => setTip(null), []);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const openIdx = openKey != null ? perDay.findIndex((d) => d.key === openKey) : -1;

  const row1 = working.slice(0, 3);
  const row2 = working.slice(3, 5);
  const dayCell = (d: DayData) => (
    <WeekDayCell
      key={d.key}
      d={d}
      range={range}
      isDemand={isDemand}
      onOpen={() => setOpenKey(d.key)}
      showTip={showTip}
      hideTip={hideTip}
    />
  );

  if (loading) return <p className="dc-note">Loading week's demand forecast data…</p>;
  if (!isDemand && err) return <p className="dc-note">Could not load the week's supply data. Reload the page to try again.</p>;
  if (!perDay.length) return <p className="dc-note">Loading week's {isDemand ? "demand" : "supply"} data…</p>;

  return (
    <div className="dc-root">
      <div className="dc-cal-scroll">
        <div className="dc-cal" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {row1.map(dayCell)}
          {row2.map(dayCell)}
          <RemarkDayCell title="Remarks" days={working} range={range} isDemand={isDemand} showTip={showTip} hideTip={hideTip} />
          {weekend.map(dayCell)}
          <RemarkDayCell title="Remarks" days={weekend} range={range} isDemand={isDemand} showTip={showTip} hideTip={hideTip} />
        </div>
      </div>

      <p className="dc-note">
        {isDemand
          ? "Pk = day's peak demand · chip = day energy (MU) · Remark = that group's block-by-block average, Mon–Fri or Sat–Sun · hover a day for block values · click a day to open it full size."
          : "Pk = day's peak demand · chip = tightest block (blue surplus, red deficit) · Remark = that group's block-by-block average, Mon–Fri or Sat–Sun · hover a day for block values · click a day to open it full size."}
      </p>

      {openIdx >= 0 && (
        <WeekDayModal
          days={perDay}
          i={openIdx}
          range={range}
          isDemand={isDemand}
          onClose={() => setOpenKey(null)}
          setDay={(k) => setOpenKey(perDay[k].key)}
          showTip={showTip}
          hideTip={hideTip}
        />
      )}

      {tip && <div className="dc-tip" style={{ left: tip.x, top: tip.y }} dangerouslySetInnerHTML={{ __html: tip.html }} />}
    </div>
  );
}

/** A Remark cell — the block-by-block average across a group's days (Mon–Fri or
 *  Sat–Sun), built exactly like a real day cell: same stacked-area + demand-line
 *  chart, same Pk/chip header, just averaged per block instead of one date's values. */
function RemarkDayCell({ title, days, range, isDemand, showTip, hideTip }: {
  title: string; days: DayData[]; range: [number, number]; isDemand: boolean;
  showTip: (e: { clientX: number; clientY: number }, html: string) => void; hideTip: () => void;
}) {
  const n = Math.max(1, days.length);
  const avgOf = (pick: (d: DayData) => number[]) => Array.from({ length: BLOCKS }, (_, b) => days.reduce((s, d) => s + pick(d)[b], 0) / n);
  const F = avgOf((d) => d.F);
  const avail = avgOf((d) => d.avail);
  const layers = (days[0]?.layers ?? []).map((l, li) => ({ name: l.name, color: l.color, v: avgOf((d) => d.layers[li].v) }));
  const avgDay = { label: title, F, avail, layers };

  const [hoverB, setHoverB] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 160, H = 64, mg = { l: 1, r: 1, t: 2, b: 1 };
  const [ymin, ymax] = range;
  const x = (b: number) => mg.l + (b * (W - mg.l - mg.r)) / (BLOCKS - 1);
  const y = (v: number) => mg.t + ((ymax - v) * (H - mg.t - mg.b)) / (ymax - ymin || 1);
  const g: Geom = { x, y };

  const cum = new Array(BLOCKS).fill(0);
  const bands = layers.map((l) => {
    const lo = cum.slice();
    for (let b = 0; b < BLOCKS; b++) cum[b] += l.v[b];
    return { lo, hi: cum.slice(), color: l.color };
  });

  const pk = Math.max(...F);
  const tight = Math.min(...avail.map((a, b) => a - F[b]));
  const ss = isDemand ? singleStats(F) : null;
  const chip = ss
    ? <span className="dc-chip nt">{(Math.abs(ss.mu) >= 100 ? ss.mu.toFixed(0) : ss.mu.toFixed(1)) + " MU"}</span>
    : <span className={"dc-chip" + (tight < 0 ? " neg" : "")}>{(tight >= 0 ? "+" : "") + mw(tight)}</span>;

  const blockFromEvent = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const xvb = ((e.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(BLOCKS - 1, Math.round(((xvb - mg.l) / (W - mg.l - mg.r)) * (BLOCKS - 1))));
  };
  const onMove = (e: React.PointerEvent) => { const b = blockFromEvent(e); setHoverB(b); showTip(e, blockTipHtml(avgDay, b)); };
  const onLeave = () => { setHoverB(null); hideTip(); };

  return (
    <div className="dc-cell" style={{ cursor: "default", background: "var(--dc-remark-bg)", borderColor: "hsl(var(--primary) / 0.3)" }}>
      <div className="top">
        <span className="dn">{title}</span>
        <span className="pk">Pk {mw(pk)}</span>
        {chip}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={onLeave} role="img" aria-hidden>
        {bands.map((b, k) => <path key={k} d={areaPath(b.lo, b.hi, g)} fill={b.color} />)}
        <path d={linePath(F, g)} fill="none" stroke="var(--dc-text)" strokeWidth={1.2} strokeLinejoin="round" />
        {hoverB != null && (
          <>
            <line x1={x(hoverB)} x2={x(hoverB)} y1={mg.t} y2={H - mg.b} stroke="var(--dc-text2)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hoverB)} cy={y(F[hoverB])} r={2.5} fill="var(--dc-text)" stroke="var(--dc-surface)" strokeWidth={1.5} />
          </>
        )}
      </svg>
      <div className="dc-remark-value" style={{ marginTop: 2 }}>
        {isDemand ? mw(F.reduce((a, v) => a + v, 0) / F.length) : mw(avail.reduce((a, v) => a + v, 0) / avail.length)} MW avg
      </div>
    </div>
  );
}

function WeekDayCell({ d, range, isDemand, onOpen, showTip, hideTip }: {
  d: DayData; range: [number, number]; isDemand: boolean; onOpen: () => void;
  showTip: (e: { clientX: number; clientY: number }, html: string) => void; hideTip: () => void;
}) {
  const [hoverB, setHoverB] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 160, H = 64, mg = { l: 1, r: 1, t: 2, b: 1 };
  const [ymin, ymax] = range;
  const x = (b: number) => mg.l + (b * (W - mg.l - mg.r)) / (BLOCKS - 1);
  const y = (v: number) => mg.t + ((ymax - v) * (H - mg.t - mg.b)) / (ymax - ymin || 1);
  const g: Geom = { x, y };

  const cum = new Array(BLOCKS).fill(0);
  const bands = d.layers.map((l) => {
    const lo = cum.slice();
    for (let b = 0; b < BLOCKS; b++) cum[b] += l.v[b];
    return { lo, hi: cum.slice(), color: l.color };
  });

  const pk = Math.max(...d.F);
  const tight = Math.min(...d.avail.map((a, b) => a - d.F[b]));
  const ss = isDemand ? singleStats(d.F) : null;
  const chip = ss
    ? <span className="dc-chip nt">{(Math.abs(ss.mu) >= 100 ? ss.mu.toFixed(0) : ss.mu.toFixed(1)) + " MU"}</span>
    : <span className={"dc-chip" + (tight < 0 ? " neg" : "")}>{(tight >= 0 ? "+" : "") + mw(tight)}</span>;

  const blockFromEvent = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const xvb = ((e.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(BLOCKS - 1, Math.round(((xvb - mg.l) / (W - mg.l - mg.r)) * (BLOCKS - 1))));
  };
  const onMove = (e: React.PointerEvent) => { const b = blockFromEvent(e); setHoverB(b); showTip(e, blockTipHtml(d, b)); };
  const onLeave = () => { setHoverB(null); hideTip(); };

  return (
    <button className="dc-cell" aria-label={`${d.label}: peak demand ${mw(pk)} MW`} onClick={onOpen}>
      <div className="top">
        <span className="dn">{DAY[d.weekday]} {d.date}</span>
        <span className="pk">Pk {mw(pk)}</span>
        {chip}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={onLeave} role="img" aria-hidden>
        {bands.map((b, k) => <path key={k} d={areaPath(b.lo, b.hi, g)} fill={b.color} />)}
        <path d={linePath(d.F, g)} fill="none" stroke="var(--dc-text)" strokeWidth={1.2} strokeLinejoin="round" />
        {hoverB != null && (
          <>
            <line x1={x(hoverB)} x2={x(hoverB)} y1={mg.t} y2={H - mg.b} stroke="var(--dc-text2)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hoverB)} cy={y(d.F[hoverB])} r={2.5} fill="var(--dc-text)" stroke="var(--dc-surface)" strokeWidth={1.5} />
          </>
        )}
      </svg>
    </button>
  );
}

/* ---------- click-to-expand day detail (reuses the month-ahead modal chrome) ---------- */
function WeekDayModal({ days, i, range, isDemand, onClose, setDay, showTip, hideTip }: {
  days: DayData[]; i: number; range: [number, number]; isDemand: boolean;
  onClose: () => void; setDay: (i: number) => void;
  showTip: (e: { clientX: number; clientY: number }, html: string) => void; hideTip: () => void;
}) {
  const d = days[i];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && i > 0) setDay(i - 1);
      else if (e.key === "ArrowRight" && i < days.length - 1) setDay(i + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [i, days.length, onClose, setDay]);

  const avPk = d.avail.reduce((mm, v, b) => (v > d.avail[mm] ? b : mm), 0);
  const demPk = d.F.reduce((mm, v, b) => (v > d.F[mm] ? b : mm), 0);
  let tb = 0; d.avail.forEach((a, b) => { if (a - d.F[b] < d.avail[tb] - d.F[tb]) tb = b; });
  const tight = d.avail[tb] - d.F[tb];
  const energy = (a: number[]) => a.reduce((x, v) => x + v, 0) * 0.25 / 1000; // 15-min MW blocks -> day MU
  const kpis: [string, string, string, string][] = isDemand
    ? (() => {
      const ss = singleStats(d.F);
      return [
        ["Peak", mw(d.F[ss.pk]) + " MW", "Block " + (ss.pk + 1) + " · " + blockTime(ss.pk), ""],
        ["Minimum", mw(d.F[ss.mn]) + " MW", "Block " + (ss.mn + 1) + " · " + blockTime(ss.mn), ""],
        ["Average", mw(ss.avg) + " MW", "96 blocks", ""],
        ["Energy", ss.mu.toFixed(1) + " MU", "Day total", ""],
      ] as [string, string, string, string][];
    })()
    : [
      ["Peak demand met", mw(d.F[demPk]) + " MW", "Block " + (demPk + 1) + " · " + blockTime(demPk), ""],
      ["Peak supply (DC)", mw(d.avail[avPk]) + " MW", "Block " + (avPk + 1) + " · " + blockTime(avPk), ""],
      ["Tightest block", (tight >= 0 ? "+" : "") + mw(tight) + " MW", "Block " + (tb + 1) + " · " + blockTime(tb), tight < 0 ? "neg" : "pos"],
      ["Energy (demand / DC)", energy(d.F).toFixed(1) + " / " + energy(d.avail).toFixed(1) + " MU", "Day total", ""],
    ];

  return (
    <div className="dc-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dc-modal" role="dialog" aria-modal="true" aria-label={(isDemand ? "Demand" : "Supply") + " detail for " + d.label}>
        <div className="dc-mhead">
          <div className="dc-monthbar">
            <button aria-label="Previous day" disabled={i === 0} onClick={() => setDay(i - 1)}>◀</button>
            <h3 style={{ minWidth: "16ch" }}>{d.label}</h3>
            <button aria-label="Next day" disabled={i === days.length - 1} onClick={() => setDay(i + 1)}>▶</button>
          </div>
          <button onClick={onClose}>Close</button>
        </div>

        <section className="dc-kpis">
          {kpis.map((k) => (
            <div className="dc-kpi" key={k[0]}>
              <div className="l">{k[0]}</div><div className={"v " + k[3]}>{k[1]}</div><div className="n">{k[2]}</div>
            </div>
          ))}
        </section>

        <ul className="dc-legend">
          {isDemand ? (
            <li><button aria-pressed="true" disabled><span className="dc-sw" style={{ background: "var(--dc-sur)" }} />Demand met</button></li>
          ) : (
            <>
              {d.layers.map((l) => <li key={l.name}><button aria-pressed="true" disabled><span className="dc-sw" style={{ background: l.color }} />{l.name}</button></li>)}
              <li><button aria-pressed="true" disabled><span className="dc-sw line" />Demand met</button></li>
            </>
          )}
        </ul>

        <div className="dc-note" style={{ margin: "2px 0 0" }}>{isDemand ? "Demand met · MW" : "Supply by source · stacked, MW · line = demand met"}</div>
        <BigWeekDayChart d={d} range={range} showTip={showTip} hideTip={hideTip} />
        <p className="dc-note">Hover for block values · ← → step days · Esc closes.</p>
      </div>
    </div>
  );
}

function BigWeekDayChart({ d, range, showTip, hideTip }: {
  d: DayData; range: [number, number];
  showTip: (e: { clientX: number; clientY: number }, html: string) => void; hideTip: () => void;
}) {
  const [hoverB, setHoverB] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 960, H = 420, mg = { l: 56, r: 16, t: 20, b: 30 };

  const [, hiIn] = range;
  const hi = (hiIn || 1) * 1.04;
  const step = niceStep(hi, 5);
  const ymax = Math.ceil(hi / step) * step, ymin = 0;
  const x = (b: number) => mg.l + (b * (W - mg.l - mg.r)) / (BLOCKS - 1);
  const yFn = (v: number) => mg.t + ((ymax - v) * (H - mg.t - mg.b)) / (ymax - ymin || 1);
  const g: Geom = { x, y: yFn };

  const cum = new Array(BLOCKS).fill(0);
  const bands = d.layers.map((l) => {
    const lo = cum.slice();
    for (let b = 0; b < BLOCKS; b++) cum[b] += l.v[b];
    return { lo, hi: cum.slice(), color: l.color };
  });

  const gridEls: React.ReactNode[] = [];
  for (let v = ymin; v <= ymax + 1e-6; v += step) {
    gridEls.push(<line key={"g" + v} x1={mg.l} x2={W - mg.r} y1={yFn(v)} y2={yFn(v)} stroke={v === 0 ? "var(--dc-muted)" : "var(--dc-grid)"} />);
    gridEls.push(<text key={"t" + v} x={mg.l - 8} y={yFn(v) + 4} textAnchor="end" className="num" fontSize={11} fill="var(--dc-muted)">{v === 0 ? "0" : (v / 1000).toLocaleString("en-IN") + "k"}</text>);
  }
  const xticks: React.ReactNode[] = [];
  for (let b = 0; b < BLOCKS; b += 8) xticks.push(<text key={"x" + b} x={x(b)} y={H - 8} textAnchor={b === 0 ? "start" : "middle"} className="num" fontSize={11} fill="var(--dc-muted)">{blockTime(b)}</text>);
  xticks.push(<text key="xend" x={x(BLOCKS - 1)} y={H - 8} textAnchor="end" className="num" fontSize={11} fill="var(--dc-muted)">{blockTime(BLOCKS - 1)}</text>);

  const demPk = d.F.reduce((mm, v, b) => (v > d.F[mm] ? b : mm), 0);

  const blockFromEvent = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const xvb = ((e.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(BLOCKS - 1, Math.round(((xvb - mg.l) / (W - mg.l - mg.r)) * (BLOCKS - 1))));
  };
  const onMove = (e: React.PointerEvent) => { const b = blockFromEvent(e); setHoverB(b); showTip(e, blockTipHtml(d, b)); };
  const onLeave = () => { setHoverB(null); hideTip(); };

  return (
    <div className="dc-bigwrap">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="dc-big" onPointerMove={onMove} onPointerLeave={onLeave} role="img" aria-label="Day detail chart">
        <g>{gridEls}</g>
        <g>{xticks}</g>
        {bands.map((b, k) => <path key={k} d={areaPath(b.lo, b.hi, g)} fill={b.color} stroke="var(--dc-surface)" strokeWidth={1} strokeLinejoin="round" />)}
        <path d={linePath(d.F, g)} fill="none" stroke="var(--dc-surface)" strokeWidth={5} strokeLinejoin="round" />
        <path d={linePath(d.F, g)} fill="none" stroke="var(--dc-text)" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(demPk)} cy={yFn(d.F[demPk])} r={4} fill="var(--dc-text)" stroke="var(--dc-surface)" strokeWidth={2} />
        <text x={x(demPk)} y={yFn(d.F[demPk]) - 10} textAnchor={demPk > 80 ? "end" : demPk < 10 ? "start" : "middle"} className="num" fontSize={12} fill="var(--dc-text)">{"Peak " + mw(d.F[demPk])}</text>
        {hoverB != null && (
          <>
            <line x1={x(hoverB)} x2={x(hoverB)} y1={mg.t} y2={H - mg.b} stroke="var(--dc-text2)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hoverB)} cy={yFn(d.F[hoverB])} r={4} fill="var(--dc-text)" stroke="var(--dc-surface)" strokeWidth={1.5} />
          </>
        )}
      </svg>
    </div>
  );
}
