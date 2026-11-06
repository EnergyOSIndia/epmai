import { useMemo } from "react";
import type { DayAheadData } from "@/store/features/demandTypes";
import { buildActuals } from "@/lib/dayahead";
import { cn } from "@/lib/utils";
import { ForecastChart } from "./ForecastChart";

const HEAD_H = 26, FOOT_H = 18;

/** Block-by-block average of several days (a Remarks card). Forecast averages every day that has
 *  one; Actual / Roastering / MAPE / UDM average the days that have actuals (null when none do). */
export function averageDayAhead(days: DayAheadData[], key: string): DayAheadData | null {
  const avg = (pick: (d: DayAheadData) => number[] | null) => {
    const rows = days.map(pick).filter((a): a is number[] => !!a);
    if (!rows.length) return null;
    return Array.from({ length: 96 }, (_, b) => +(rows.reduce((s, a) => s + a[b], 0) / rows.length).toFixed(3));
  };
  const forecast = avg((d) => d.forecast);
  if (!forecast) return null;
  const mapes = days.map((d) => d.dayMape).filter((v): v is number => v != null);
  return {
    date: key, forecast,
    actual: avg((d) => d.actual), mape: avg((d) => d.mape), roastering: avg((d) => d.roastering), udm: avg((d) => d.udm),
    errorRanges: null,
    dayMape: mapes.length ? +(mapes.reduce((a, b) => a + b, 0) / mapes.length).toFixed(4) : null,
    manual: null, manualDayMape: null,
  };
}

/** One card of the Demand week grid: header (day, peak forecast, day MAPE) over the Day-ahead
 *  forecast chart in compact form — Actual, UDM, System Forecast, Roastering and MAPE. */
export function DemandWeekCard({ title, iso, isToday, day, isLoading, height, footer }: {
  title: string;
  /** The date (YYYY-MM-DD), or a non-date key for a Remarks card. */
  iso: string;
  isToday: boolean;
  day: DayAheadData | null;
  isLoading: boolean;
  height?: number;
  /** Remarks cards: the line under the chart, e.g. "9,713 MW avg". */
  footer?: string;
}) {
  const actuals = useMemo(
    () => (day?.forecast ? buildActuals(day.forecast, { actual: day.actual, mape: day.mape, roastering: day.roastering, udm: day.udm, manual: day.manual }) : null),
    [day],
  );
  const peak = day?.forecast ? Math.round(Math.max(...day.forecast)) : null;
  const chartH = (height ?? 300) - HEAD_H - (footer ? FOOT_H : 0) - 16;

  return (
    <div
      className={cn("flex min-w-0 flex-col rounded-[10px] border bg-card p-2", isToday && "border-teal-500 ring-1 ring-teal-500/40", footer && "bg-muted/40")}
      style={{ height: height ?? 300 }}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 text-[12px]" style={{ height: HEAD_H }}>
        <span className="flex items-center gap-1.5 font-semibold">
          {title}
          {isToday && <span className="rounded bg-teal-500 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">Today</span>}
        </span>
        <span className="font-mono text-[10px] text-slate-500">{!isLoading && peak != null ? `Pk ${peak.toLocaleString("en-IN")}` : ""}</span>
        <span className="justify-self-end">
          {!isLoading && day?.dayMape != null && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-px font-mono text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              MAPE {day.dayMape.toFixed(2)}%
            </span>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1" style={{ height: chartH }}>
        {isLoading ? (
          <div className="h-full w-full animate-pulse rounded-md bg-muted" />
        ) : day?.forecast ? (
          <ForecastChart forecast={day.forecast} actuals={actuals} date={iso} compact />
        ) : (
          <div className="grid h-full place-items-center text-[12px] text-muted-foreground">No forecast data</div>
        )}
      </div>
      {footer && !isLoading && day && <div className="px-1 font-mono text-[11px] font-semibold" style={{ height: FOOT_H }}>{footer}</div>}
    </div>
  );
}
