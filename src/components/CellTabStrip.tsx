import { useParams } from "@tanstack/react-router";
import { isMod } from "@/data/engine";
import { SUBS } from "@/data/insights";
import { useCellTab } from "@/lib/horizon";
import { cn } from "@/lib/utils";

/** The cell page's views (Overview + each detail metric) as a segmented strip in the header,
 *  matching the module ruler and time-horizon strip. Selecting one sets ?t. */
export function CellTabStrip() {
  const { moduleId } = useParams({ strict: false }) as { moduleId?: string };
  const { tab, setTab } = useCellTab();
  if (!isMod(moduleId)) return null;

  // Supply Availability also gets "Supply Bifurcation" (second): its Graph Type day / week / month
  // grids and year calendar, as All modules shows them.
  // Market Intelligence gets "Market Detail" (second): the Planning-horizon Market Detail page.
  const extra = moduleId === "supply" ? [{ id: "bifurcation", n: "Supply Bifurcation" }]
    : moduleId === "mi" ? [{ id: "marketdetail", n: "Market Detail" }] : [];
  const items = [{ id: "overview", n: "Overview" }, ...extra, ...SUBS[moduleId].map((s) => ({ id: s.id, n: s.n }))];
  const active = items.some((i) => i.id === tab) ? tab : "overview";

  return (
    <div className="flex items-center gap-3">
      <span className="hidden shrink-0 text-xs text-muted-foreground xl:block">View</span>
      <div role="radiogroup" aria-label="Cell view" className="scroll-x -mx-1 flex-1 px-1 pb-2">
        <div className="grid overflow-visible rounded-md border bg-card"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`, minWidth: items.length * 128 }}>
          {items.map((it, k) => {
            const on = it.id === active;
            return (
              <button
                key={it.id}
                role="radio"
                aria-checked={on}
                data-on={on}
                onClick={() => setTab(it.id)}
                className={cn("ruler-seg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-accent",
                  k > 0 && "border-l", k === 0 && "rounded-l-[5px]", k === items.length - 1 && "rounded-r-[5px]")}
              >
                <span className="block truncate">{it.n}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
