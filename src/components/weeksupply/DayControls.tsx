import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BLOCKS, blockRange, isoOf, parseIso, todayIso } from "./weekSupplyData";

/** "28-10-2026, Today" / ", Tomorrow" / ", Yesterday", or just the date. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  const t = parseIso(todayIso());
  const diff = Math.round((parseIso(iso).getTime() - t.getTime()) / 86400000);
  const rel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : null;
  return `${d}-${m}-${y}` + (rel ? `, ${rel}` : "");
}

/** ‹ date › — one day at a time; › is disabled when `canNext` is false. */
export function DayNavigator({ date, onChange, canNext, canPrev = true, className }: { date: string; onChange: (iso: string) => void; canNext: boolean; canPrev?: boolean; className?: string }) {
  const shift = (dir: -1 | 1) => { const d = parseIso(date); d.setDate(d.getDate() + dir); onChange(isoOf(d)); };
  const btn = "grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-[10px] border bg-card p-0.5 text-[12px]", className)}>
      <button type="button" aria-label="Previous day" className={btn} disabled={!canPrev} onClick={() => shift(-1)}><ChevronLeft className="h-3.5 w-3.5" /></button>
      <span className="min-w-[9.5rem] whitespace-nowrap px-2 text-center font-semibold">{dayLabel(date)}</span>
      <button type="button" aria-label="Next day" className={btn} disabled={!canNext} onClick={() => shift(1)}><ChevronRight className="h-3.5 w-3.5" /></button>
    </div>
  );
}

/** "12:45 - 13:00" block picker for the tables. `max` (optional) is the last block offered. */
export function BlockSelect({ block, onChange, max }: { block: number; onChange: (b: number) => void; max?: number }) {
  return (
    <label className="relative inline-flex items-center rounded-[10px] border bg-card text-[12px]">
      <span className="sr-only">Time block</span>
      <select
        value={block} onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 cursor-pointer appearance-none rounded-[10px] bg-transparent pl-3 pr-8 font-semibold outline-none"
      >
        {Array.from({ length: max == null ? BLOCKS : max + 1 }, (_, b) => <option key={b} value={b}>{blockRange(b).replace("–", " - ")}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted-foreground" />
    </label>
  );
}
