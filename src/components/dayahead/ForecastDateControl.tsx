import { useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { KpiCard } from "./KpiCard";

const shift = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00"); d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const ddmmyyyy = (iso: string) => iso.slice(8) + "-" + iso.slice(5, 7) + "-" + iso.slice(0, 4);

/** FORECAST DATE card: ← date → , clicking the date opens the native date picker. `max` caps
 *  how far ahead it can go. Stays usable while the page loads. */
/** Date picker card. `min` (optional) is the earliest date allowed; `max` the latest. */
export function ForecastDateControl({ date, onChange, max, min }: { date: string; onChange: (d: string) => void; max: string; min?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const btn = "grid h-7 w-7 place-items-center rounded-md border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";
  return (
    <KpiCard title="Forecast date" className="bg-muted/60">
      <div className="mt-1.5 flex items-center gap-3">
        <button type="button" aria-label="Previous day" className={btn} disabled={!!min && date <= min} onClick={() => onChange(shift(date, -1))}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="num relative text-[15px] font-semibold hover:text-primary"
          onClick={() => inputRef.current?.showPicker?.()}>
          {ddmmyyyy(date)}
          <input ref={inputRef} type="date" value={date} max={max} min={min} aria-label="Forecast date"
            onChange={(e) => e.target.value && onChange(e.target.value > max ? max : min && e.target.value < min ? min : e.target.value)}
            className="pointer-events-none absolute inset-0 opacity-0" tabIndex={-1} />
        </button>
        <button type="button" aria-label="Next day" className={btn} disabled={date >= max} onClick={() => onChange(shift(date, 1))}>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </KpiCard>
  );
}
