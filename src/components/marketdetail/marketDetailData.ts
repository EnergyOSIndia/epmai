import { istNow } from "@/data/engine";
import type { BlockPoint, Exchange, Market, MarketDetailData } from "@/store/features/marketTypes";

// Types live with the API slice (store/features/marketTypes.ts); re-exported for the components.
export type { BlockPoint, Exchange, Market, MarketDetailData };

export const MARKETS: readonly Market[] = ["DAM", "RTM", "GDAM", "HPDAM"];
export const EXCHANGES: readonly Exchange[] = ["IEX", "PXIL", "HPX"];

export const BLOCKS = 96;
/** Smallest market-row height; rows otherwise share the window so three fit on screen. */
export const MIN_ROW_H = 200;

export const SERIES = [
  { key: "buyMW", name: "Buy", color: "#10b981" },
  { key: "sellMW", name: "Sell", color: "#ef4444" },
  { key: "mcpPrice", name: "MCP", color: "#111827" },
  { key: "acpPrice", name: "ACP", color: "#f43f5e" },
  { key: "acvMW", name: "ACV", color: "#2563eb" },
  { key: "mcvMW", name: "MCV", color: "#8b5cf6" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** Today (IST) as yyyy-mm-dd. */
export function getTodayDate(): string {
  const d = istNow();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The current 15-minute block, 1–96 (IST). */
export function getCurrentBlock(): number {
  const d = istNow();
  return Math.min(BLOCKS, Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) + 1);
}

/** Block 46 → ["11:15", "11:30"]. */
export function blockToTime(n: number): [string, string] {
  const start = (n - 1) * 15;
  return [hhmm(start), hhmm(start + 15)];
}

/** "2026-10-29" → "29 Oct 2026". */
export function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const nullBlock = (b: number): BlockPoint => ({ block: b, buyMW: null, sellMW: null, mcvMW: null, acvMW: null, mcpPrice: null, acpPrice: null });

/** Block-by-block average of several days (a Remarks card): each value averages the days that
 *  have it; null where none do. */
export function averageBlocks(days: BlockPoint[][]): BlockPoint[] {
  const keys = ["buyMW", "sellMW", "mcvMW", "acvMW", "mcpPrice", "acpPrice"] as const;
  return Array.from({ length: BLOCKS }, (_, i) => {
    const p = nullBlock(i + 1);
    for (const k of keys) {
      const vals = days.map((d) => d[i][k]).filter((v): v is number => v !== null);
      p[k] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    }
    return p;
  });
}

/** Peak MCP and cleared energy (MCV, MW per 15 min → MU) of one day's blocks; null without data. */
export function dayStats(data: BlockPoint[]): { peakMcp: number; mu: number } | null {
  const sent = data.filter((d) => d.mcpPrice !== null);
  if (!sent.length) return null;
  return {
    peakMcp: Math.max(...sent.map((d) => d.mcpPrice ?? 0)),
    mu: sent.reduce((s, d) => s + (d.mcvMW ?? 0), 0) / 4 / 1000,
  };
}
