import type { ReactNode } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { DayNavigator } from "@/components/weeksupply/DayControls";
import { isoOf, parseIso } from "@/components/weeksupply/weekSupplyData";
import { BLOCKS, blockToTime, getTodayDate } from "./marketDetailData";

const LABEL = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

/** ‹ date › (back freely, forward up to tomorrow — the day-ahead market) and the BLOCK dropdown,
 *  styled like the exchange toggles. A spinner shows while the date loads. */
export function HeaderControls({ date, block, loading, onDate, onBlock, nav, extra }: {
  /** Week / Month / Year ahead: their period navigator, shown in place of the date. */
  nav?: ReactNode;
  /** After the block picker (e.g. the Sync button). */
  extra?: ReactNode;
  date: string;
  block: number;
  loading: boolean;
  onDate: (iso: string) => void;
  onBlock: (b: number) => void;
}) {
  const tomorrow = (() => { const d = parseIso(getTodayDate()); d.setDate(d.getDate() + 1); return isoOf(d); })();
  return (
    <div className="flex items-center gap-2.5">
        {nav ?? <DayNavigator date={date} onChange={onDate} canNext={date < tomorrow} className="h-8 rounded-md border-border bg-card text-foreground [&_button]:h-6 [&_button]:w-6 [&_button]:rounded [&_button:hover]:bg-accent [&_button:hover]:text-foreground" />}
        <span className={LABEL}>Block</span>
        <label className="relative inline-flex items-center">
          <span className="sr-only">Block</span>
          <select
            value={block} onChange={(e) => onBlock(Number(e.target.value))}
            className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-card pl-3 pr-8 text-[12px] font-medium text-foreground outline-none"
          >
            {Array.from({ length: BLOCKS }, (_, i) => {
              const [a, b] = blockToTime(i + 1);
              return <option key={i} value={i + 1}>{`${i + 1} (${a} to ${b})`}</option>;
            })}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted-foreground" />
        </label>
        {extra}
        {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" aria-label="Loading" />}
    </div>
  );
}
