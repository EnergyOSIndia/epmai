import { useEffect, useMemo } from "react";
import "@/components/DemandCalendar.css";
import type { DayAheadData } from "@/store/features/demandTypes";
import { blockTime, buildActuals } from "@/lib/dayahead";
import { ForecastChart } from "./ForecastChart";

const BOX_CHART_H = 95;

/** Forecast energy for a day in MU: 96 × 15-min MW blocks → MWh (÷4) → MU (÷1000). */
const muOf = (f: number[]) => f.reduce((a, b) => a + b, 0) / 4 / 1000;
const actualsOf = (day: DayAheadData | null) =>
  day?.forecast ? buildActuals(day.forecast, { actual: day.actual, mape: day.mape, roastering: day.roastering, udm: day.udm, manual: day.manual }) : null;

/** One day of the Demand month calendar, in the Supply month box style: day number, peak forecast
 *  ("Pk") and forecast energy (MU) over a tiny Day-ahead forecast chart. Click opens it full size.
 *  Must sit inside a `.dc-root`. */
export function DemandMonthBox({ dayNum, iso, isToday, day, isLoading, onOpen, chartH = BOX_CHART_H }: {
  dayNum: number; iso: string; isToday: boolean; day: DayAheadData | null; isLoading: boolean; onOpen: () => void;
  /** Chart height in px; the page sizes it so the whole month fits the window. */
  chartH?: number;
}) {
  const actuals = useMemo(() => actualsOf(day), [day]);
  const f = day?.forecast ?? null;
  return (
    <div
      role="button" tabIndex={0} aria-label={`Open day ${dayNum}`}
      onClick={() => { if (f) onOpen(); }} onKeyDown={(e) => { if (f && (e.key === "Enter" || e.key === " ")) onOpen(); }}
      className="dc-cell"
      style={isToday ? { borderColor: "#14b8a6", boxShadow: "0 0 0 1px #14b8a6" } : undefined}
    >
      <div className="top">
        <span className="dn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{dayNum}{isToday && <span className="rounded bg-teal-500 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">Today</span>}</span>
        {f && !isLoading && <span className="pk">Pk {Math.round(Math.max(...f)).toLocaleString("en-IN")}</span>}
        {f && !isLoading && <span className="dc-chip nt">{Math.round(muOf(f)).toLocaleString("en-IN")} MU</span>}
      </div>
      <div style={{ height: chartH }}>
        {isLoading ? (
          <div className="h-full w-full animate-pulse rounded bg-muted" />
        ) : f ? (
          <ForecastChart forecast={f} actuals={actuals} date={iso} bare />
        ) : (
          <div className="grid h-full place-items-center text-[11px] text-muted-foreground">No data</div>
        )}
      </div>
    </div>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longTitle = (iso: string) => { const d = new Date(iso + "T00:00:00"); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };

/** A Demand month day opened full size — same look as the Supply day pop-up: ◀ day ▶ + Close,
 *  Peak / Minimum / Average / Energy of the System Forecast, and the full Day-ahead forecast chart.
 *  ← → step through the days that have a forecast, Esc closes. */
export function DemandDayModal({ days, index, onIndex, onClose }: {
  days: DayAheadData[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const day = days[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      else if (e.key === "ArrowRight" && index < days.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, days.length, onIndex, onClose]);

  const actuals = useMemo(() => actualsOf(day), [day]);
  const kpis = useMemo(() => {
    const f = day.forecast;
    if (!f) return null;
    let pk = 0, mn = 0;
    f.forEach((v, b) => { if (v > f[pk]) pk = b; if (v < f[mn]) mn = b; });
    const mw = (v: number) => Math.round(v).toLocaleString("en-IN") + " MW";
    return [
      ["Peak", mw(f[pk]), `Block ${pk + 1} · ${blockTime(pk)}`],
      ["Minimum", mw(f[mn]), `Block ${mn + 1} · ${blockTime(mn)}`],
      ["Average", mw(f.reduce((a, b) => a + b, 0) / 96), "96 blocks"],
      ["Energy", muOf(f).toFixed(1) + " MU", day.dayMape != null ? `Day total · MAPE ${day.dayMape.toFixed(2)}%` : "Day total"],
    ];
  }, [day]);

  return (
    <div className="dc-root">
      <div className="dc-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="dc-modal" role="dialog" aria-modal="true" aria-label={"Demand detail for " + longTitle(day.date)}>
          <div className="dc-mhead">
            <div className="dc-monthbar">
              <button aria-label="Previous day" disabled={index === 0} onClick={() => onIndex(index - 1)}>◀</button>
              <h3 style={{ minWidth: "14ch" }}>{longTitle(day.date)}</h3>
              <button aria-label="Next day" disabled={index === days.length - 1} onClick={() => onIndex(index + 1)}>▶</button>
            </div>
            <button onClick={onClose}>Close</button>
          </div>
          {kpis && (
            <section className="dc-kpis">
              {kpis.map((k) => (
                <div className="dc-kpi" key={k[0]}>
                  <div className="l">{k[0]}</div><div className="v">{k[1]}</div><div className="n">{k[2]}</div>
                </div>
              ))}
            </section>
          )}
          <div style={{ height: 470 }}>
            {day.forecast && <ForecastChart forecast={day.forecast} actuals={actuals} date={day.date} />}
          </div>
          <p className="dc-note">Hover for block values · ← → step days · Esc closes.</p>
        </div>
      </div>
    </div>
  );
}
