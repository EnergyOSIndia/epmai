/**
 * Optimization Method Selector
 * Iterative / PyPSA (MILP) toggle — the solver every optimization view uses (shared, see
 * data/optimizationApi). Styled like the app's other one-of-many toggles (themed, light / dark).
 */
import { useEffect, useState } from "react";
import { getOptMethod, onMethodChange, setOptMethod, type OptMethod } from "@/data/optimizationApi";
import { cn } from "@/lib/utils";

const METHODS: { id: OptMethod; label: string; desc: string }[] = [
  { id: "iterative", label: "Iterative", desc: "Greedy merit-order (instant)" },
  { id: "milp", label: "PyPSA (MILP)", desc: "LP solver (1–5 sec)" },
];

export function OptMethodSelector({ compact = false }: { compact?: boolean }) {
  const [method, setM] = useState<OptMethod>(getOptMethod());

  useEffect(() => onMethodChange(() => setM(getOptMethod())), []);

  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Solver">
      {!compact && <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Solver</span>}
      {METHODS.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={method === m.id}
          onClick={() => { setOptMethod(m.id); setM(m.id); }}
          title={m.desc}
          className={cn(
            "rounded-md border font-semibold transition-colors",
            compact ? "h-7 px-2 text-[11px]" : "h-8 px-3 text-[12px]",
            method === m.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
