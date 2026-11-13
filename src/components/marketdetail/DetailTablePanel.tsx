import { CARD } from "./MarketRow";
import { type BlockPoint, type Exchange, type Market, type MarketDetailData } from "./marketDetailData";

const ROWS: { key: keyof BlockPoint; label: string; price?: boolean }[] = [
  { key: "buyMW", label: "Buy (MW)" },
  { key: "sellMW", label: "Sell (MW)" },
  { key: "mcvMW", label: "MCV (MW)" },
  { key: "acvMW", label: "ACV (MW)" },
  { key: "mcpPrice", label: "MCP (₹/MWh)", price: true },
  { key: "acpPrice", label: "ACP (₹/MWh)", price: true },
];

const fmt = (v: number | null) => (v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** One market's numbers for the chosen block. Total: MW rows are summed; MCP / ACP are the
 *  averages weighted by MCV / ACV (a plain sum of prices means nothing). */
export function MarketTable({ market, exchanges, data, block }: { market: Market; exchanges: Exchange[]; data: MarketDetailData; block: number }) {
  // A block with no value yet (null) counts as 0.
  const at = (e: Exchange) => {
    const p = data[market][e][block - 1];
    return (k: keyof BlockPoint) => p[k] ?? 0;
  };
  const total = (key: keyof BlockPoint, price?: boolean) => {
    if (!price) return exchanges.reduce((s, e) => s + at(e)(key), 0);
    const w: keyof BlockPoint = key === "mcpPrice" ? "mcvMW" : "acvMW";
    const vol = exchanges.reduce((s, e) => s + at(e)(w), 0);
    return vol ? exchanges.reduce((s, e) => s + at(e)(key) * at(e)(w), 0) / vol : 0;
  };
  return (
    <div className={CARD + " flex shrink-0 flex-col px-2.5 py-2"} style={{ width: panelWidth(exchanges.length) }}>
      <div className="mb-1 text-center text-[11px] font-bold tracking-[0.15em] text-muted-foreground">{market}</div>
      {/* The table fills the card; its rows share the height, so it scales with the row. */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
        {/* Fixed layout: the label column keeps its width and the value columns share the rest
            equally, however many exchanges are on. */}
        <table className="h-full w-full table-fixed border-collapse text-[10px]">
          <colgroup>
            <col style={{ width: exchanges.length === 1 ? "40%" : "30%" }} />
            {[...exchanges, "Total"].map((c) => <col key={c} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/50 text-muted-foreground">
              <th className="px-2 py-1" />
              {exchanges.map((e) => <th key={e} className="px-2 py-1.5 text-right font-semibold">{e}</th>)}
              <th className="px-2 py-1.5 text-right font-bold text-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0 hover:bg-accent">
                <td className="truncate whitespace-nowrap px-2 font-medium text-muted-foreground">{r.label}</td>
                {exchanges.map((e) => <td key={e} className="px-2 text-right tabular-nums text-foreground">{fmt(at(e)(r.key))}</td>)}
                <td className="px-2 text-right font-bold tabular-nums text-foreground">{fmt(total(r.key, r.price))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Panel width for the number of exchanges on: 384px with 3, narrower with fewer. */
export const panelWidth = (n: number) => ({ 1: 280, 2: 330, 3: 384 }[n] ?? 384);
