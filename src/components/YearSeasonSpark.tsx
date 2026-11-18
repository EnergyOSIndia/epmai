import { useEffect, useMemo, useState } from "react";
import { NOW } from "@/data/engine";
import type { ChartSpec } from "@/data/model";
import type { DemandCalendarData, Season } from "@/store/features/demandTypes";
import { useAppDispatch } from "@/store/hooks";
import { fetchSeasons, fetchYearDemandForecast } from "@/store/slice/demandApiSlice";
import { Spark } from "@/components/chart/Spark";
import { formatIso } from "@/pages/AllModules/shared/HorizonControls";

type Box = { name: string; min: number; q1: number; med: number; q3: number; max: number };

/** The window the Year-ahead calendar opens on (Current Year): 12 months from the current month,
 *  never before Nov 2026 where the forecast begins — as in DemandYearAhead's useYearRange. */
function currentYearRange() {
  const cur = new Date(NOW.getFullYear(), NOW.getMonth(), 1), first = new Date(2026, 10, 1);
  const start = cur < first ? first : cur;
  const end = new Date(start.getFullYear() + 1, start.getMonth(), 0);
  return { from: formatIso(start), to: formatIso(end) };
}

/** Min / Q1 / median / Q3 / max of one day's 96 blocks (same as the calendar's box plot). */
function boxStats(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b), n = s.length;
  const q = (p: number) => { const pos = (n - 1) * p, b = Math.floor(pos), r = pos - b; return s[b + 1] !== undefined ? s[b] + r * (s[b + 1] - s[b]) : s[b]; };
  return { min: s[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: s[n - 1] };
}

// One load per window for the session (the grid re-renders often).
const loads = new Map<string, Promise<Box[] | null>>();

/** Home · Demand Year-ahead cell: the Details Year-ahead Demand Forecast's daily distribution in
 *  miniature — one box per season (from the season API), each the season's days averaged: the mean
 *  of their min, Q1, median, Q3 and max. Just a picture; falls back to `fallback` without data. */
export function YearSeasonSpark({ fallback, height = 20 }: { fallback?: ChartSpec; height?: number }) {
  const dispatch = useAppDispatch();
  const [boxes, setBoxes] = useState<Box[] | null | "none">(null);
  useEffect(() => {
    const { from, to } = currentYearRange();
    const key = `${from}:${to}`;
    if (!loads.has(key)) {
      loads.set(key, Promise.all([
        dispatch(fetchYearDemandForecast({ data_id: 102140, from_date: from, to_date: to, location_id: 10030, forcasted_by: "System", table: "daily" })).unwrap(),
        dispatch(fetchSeasons({ start_date: from, end_date: to })).unwrap(),
      ]).then(([y, s]) => seasonBoxes(y.data, s.seasons)).catch(() => null));
    }
    let live = true;
    loads.get(key)!.then((b) => { if (live) setBoxes(b && b.length ? b : "none"); });
    return () => { live = false; };
  }, [dispatch]);

  const scale = useMemo(() => {
    if (!boxes || boxes === "none") return null;
    const lo = Math.min(...boxes.map((b) => b.min)), hi = Math.max(...boxes.map((b) => b.max));
    return { lo, span: hi - lo || 1 };
  }, [boxes]);

  if (boxes === "none") return fallback ? <Spark spec={fallback} height={height} /> : null;
  if (!boxes || !scale) return null;
  // viewBox: 100 wide per season slot, 100 tall; stretched to the cell.
  const W = boxes.length * 100, PAD = 4;
  const y = (v: number) => PAD + (1 - (v - scale.lo) / scale.span) * (100 - 2 * PAD);
  return (
    <span className="pointer-events-none block" style={{ height }}>
      <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" width="100%" height="100%" aria-hidden>
        {boxes.map((b, i) => {
          const cx = i * 100 + 50, bw = 44, cap = 24;
          return (
            <g key={b.name} stroke="var(--ch-buy, #2D8B8B)" vectorEffect="non-scaling-stroke">
              {/* Whisker min–max with caps. */}
              <line x1={cx} x2={cx} y1={y(b.max)} y2={y(b.min)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <line x1={cx - cap / 2} x2={cx + cap / 2} y1={y(b.max)} y2={y(b.max)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <line x1={cx - cap / 2} x2={cx + cap / 2} y1={y(b.min)} y2={y(b.min)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {/* Box Q1–Q3. */}
              <rect x={cx - bw / 2} width={bw} y={y(b.q3)} height={Math.max(0.5, y(b.q1) - y(b.q3))}
                fill="var(--ch-buy, #2D8B8B)" fillOpacity={0.25} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {/* Median. */}
              <line x1={cx - bw / 2} x2={cx + bw / 2} y1={y(b.med)} y2={y(b.med)} stroke="var(--ch-neg, #ef4444)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>
    </span>
  );
}

/** Each season's days (its from–to dates in the window) → the mean of their daily box stats. */
function seasonBoxes(D: DemandCalendarData, seasons: Season[]): Box[] {
  const out: Box[] = [];
  for (const s of seasons) {
    const days = D.dates.map((d, i) => (d >= s.from_date && d <= s.to_date && D.dem[i]?.length ? boxStats(D.dem[i]) : null)).filter((b): b is ReturnType<typeof boxStats> => !!b);
    if (!days.length) continue;
    const avg = (k: keyof ReturnType<typeof boxStats>) => days.reduce((t, b) => t + b[k], 0) / days.length;
    out.push({ name: s.period_name + s.from_date, min: avg("min"), q1: avg("q1"), med: avg("med"), q3: avg("q3"), max: avg("max") });
  }
  return out;
}
