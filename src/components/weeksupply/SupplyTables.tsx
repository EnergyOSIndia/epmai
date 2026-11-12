// The four Day-ahead tables beside the charts, all at one selected block: Category Wise
// Distribution, Technology Wise Distribution, Variable Cost (VC) Distribution and Plant Generation.
import type { ReactNode } from "react";
import type { SupplyDayDetail } from "@/store/features/supplyTypes";
import { cn } from "@/lib/utils";
import { plantMeta, type DayData } from "./weekSupplyData";

const f2 = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TH = "px-2 py-2 text-left text-[12px] font-semibold text-muted-foreground";
const TD = "px-2 py-2.5 text-[12px]";
const TOTAL = "font-semibold text-primary";
const ZEBRA = "bg-muted/50";

/** Card with a title and a table body that fills the card's height and scrolls inside it. */
export function TableCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-[10px] border bg-card p-3">
      <h3 className="mb-2 text-[13px] font-semibold">{title}</h3>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

const Empty = () => <p className="py-8 text-center text-[12px] text-muted-foreground">No data for this date</p>;

/** Ownership (Central / State) → its categories' SG at the block, with a total per ownership. */
export function CategoryTable({ detail, block }: { detail: SupplyDayDetail | null; block: number }) {
  if (!detail) return <Empty />;
  // Categories with a value anywhere in the day.
  const rows = detail.category.filter((c) => c.data.some((v) => v));
  const groups = (["Central", "State"] as const)
    .map((g) => ({ g, items: rows.filter((r) => r.group === g) }))
    .filter((x) => x.items.length);
  return (
    <table className="w-full border-collapse">
      <thead><tr className="border-b">
        <th className={TH}>Ownership</th><th className={TH}>Category</th>
        <th className={cn(TH, "text-right")}>Value</th><th className={cn(TH, "text-right")}>Total</th>
      </tr></thead>
      <tbody>
        {groups.map(({ g, items }) => {
          const total = items.reduce((s, r) => s + r.data[block], 0);
          return items.map((r, i) => (
            <tr key={g + r.name} className={cn(i === items.length - 1 && "border-b")}>
              {i === 0 && <td rowSpan={items.length} className={cn(TD, "align-middle font-semibold")}>{g}</td>}
              <td className={cn(TD, ZEBRA, "font-medium")}>{r.name}</td>
              <td className={cn(TD, ZEBRA, "text-right tabular-nums")}>{f2(r.data[block])}</td>
              {i === 0 && <td rowSpan={items.length} className={cn(TD, TOTAL, "text-right align-middle tabular-nums")}>{f2(total)}</td>}
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}

/** Technology → central, state and total SG at the block. */
export function TechnologyTable({ detail, block }: { detail: SupplyDayDetail | null; block: number }) {
  if (!detail) return <Empty />;
  const rows = detail.technology.filter((t) => t.data.some((v) => v));
  return (
    <table className="w-full border-collapse">
      <thead><tr className="border-b">
        <th className={TH}>Technology</th><th className={cn(TH, "text-right")}>Central</th>
        <th className={cn(TH, "text-right")}>State</th><th className={cn(TH, "text-right")}>Total</th>
      </tr></thead>
      <tbody>
        {rows.map((t, i) => (
          <tr key={t.name} className={cn(i % 2 === 0 && ZEBRA)}>
            <td className={cn(TD, "font-medium")}>{t.name}</td>
            {/* No central / state split (Week / Month ahead's avg-supply) shows "—". */}
            <td className={cn(TD, "text-right tabular-nums")}>{t.central.length ? f2(t.central[block]) : "—"}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{t.state.length ? f2(t.state[block]) : "—"}</td>
            <td className={cn(TD, TOTAL, "text-right tabular-nums")}>{f2(t.data[block])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Price group → central / state / total MW at the block (mock: all central, no price range yet). */
export function VcTable({ day, block }: { day: DayData | null; block: number }) {
  if (!day) return <Empty />;
  const rows = [...day.seriesList].sort((a, b) => b.data[block] - a.data[block]);
  return (
    <table className="w-full border-collapse">
      <thead><tr className="border-b">
        <th className={TH}>Price Group</th><th className={TH}>Price Range</th><th className={cn(TH, "text-right")}>Central</th>
        <th className={cn(TH, "text-right")}>State</th><th className={cn(TH, "text-right")}>Total (MW)</th>
      </tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.name} className={cn(i % 2 === 0 && ZEBRA)}>
            <td className={cn(TD, "font-medium")}>{s.name}</td>
            <td className={TD}>-</td>
            <td className={cn(TD, "text-right tabular-nums")}>{f2(s.data[block])}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{f2(0)}</td>
            <td className={cn(TD, TOTAL, "text-right tabular-nums")}>{f2(s.data[block])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Plant → central / state, variable cost, SG and running total (mock day values). */
export function PlantTable({ day }: { day: DayData | null }) {
  if (!day) return <Empty />;
  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 bg-card"><tr className="border-b">
        <th className={TH}>Plant ID</th><th className={TH}>C/S</th><th className={cn(TH, "text-right")}>VC</th>
        <th className={cn(TH, "text-right")}>SG</th><th className={cn(TH, "text-right")}>Cumulative</th>
      </tr></thead>
      <tbody>
        {day.plants.map((p, i) => {
          const m = plantMeta(p.name);
          return (
            <tr key={p.name} className={cn(i % 2 === 0 && ZEBRA)}>
              <td className={cn(TD, "font-medium")}>{p.name}</td>
              <td className={TD}>{m.cs}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{f2(m.vc)}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{f2(p.sg)}</td>
              <td className={cn(TD, TOTAL, "text-right tabular-nums")}>{f2(p.cumulative)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
