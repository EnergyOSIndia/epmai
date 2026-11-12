import { MANUAL_RANGES, SYSTEM_RANGES } from "@/lib/dayahead";

/** Forecast Error Analysis: System and Manual column groups, seven bands each, rows sharing the
 *  available height. `system` / `manual` are percent-of-blocks per band; null → empty state. */
export function ErrorAnalysisTable({ system, manual }: { system: number[] | null; manual: number[] | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 text-[13px] font-bold">Forecast Error Analysis</div>
      {!system ? (
        <div className="grid flex-1 place-items-center text-[12px] text-muted-foreground">No error data available</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border text-[12px]">
          <div className="grid grid-cols-2 bg-muted text-center font-semibold text-foreground">
            <div className="border-r border-border py-1.5">System Forecast</div>
            <div className="py-1.5">Manual Forecast</div>
          </div>
          <div className="grid grid-cols-4 bg-muted/40 text-center text-[11px] font-medium text-muted-foreground">
            <div className="py-1">Error Range</div><div className="border-r py-1">Percent</div>
            <div className="py-1">Error Range</div><div className="py-1">Percent</div>
          </div>
          {SYSTEM_RANGES.map((r, k) => (
            <div key={r} className={"grid flex-1 grid-cols-4 items-center text-center " + (k % 2 ? "bg-muted/40" : "bg-card")}>
              <div>{r}</div>
              <div className="num h-full content-center border-r">{+system[k].toFixed(2)}%</div>
              <div className="text-sky-500">{MANUAL_RANGES[k]}</div>
              <div className="num">{manual ? manual[k] : 0}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
