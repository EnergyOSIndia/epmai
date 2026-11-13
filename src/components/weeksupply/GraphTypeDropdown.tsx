import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GRAPH_TYPES, type SupplyGraphType } from "./weekSupplyData";

/** "Graph Type: Category ⌄" — border turns teal while open; the selected option is tinted and ticked.
 *  `options` limits the list (default: every graph type). */
export function GraphTypeDropdown({ value, onChange, options = GRAPH_TYPES }: { value: SupplyGraphType; onChange: (v: SupplyGraphType) => void; options?: typeof GRAPH_TYPES }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const label = options.find((g) => g.id === value)?.label ?? value;
  return (
    <div ref={ref} className="relative">
      <button
        type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-[10px] border bg-card px-3 text-[12px] transition-colors",
          open ? "border-teal-500" : "hover:border-teal-400")}
      >
        <span className="text-[11px] text-muted-foreground">Graph Type:</span>
        <span className="font-semibold">{label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Graph Type" className="absolute left-0 top-full z-30 mt-1 min-w-[170px] rounded-[10px] border bg-card p-1 shadow-lg">
          {options.map((g) => {
            const on = g.id === value;
            return (
              <li key={g.id} role="option" aria-selected={on}>
                <button
                  type="button" onClick={() => { onChange(g.id); setOpen(false); }}
                  className={cn("flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[12px]",
                    on ? "bg-teal-50 font-semibold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" : "hover:bg-accent")}
                >
                  {g.label}
                  {on && <Check className="h-3.5 w-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
