import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type {
    BlockPoint,
    Exchange,
    Market,
    MarketDetailData,
    MarketGraphApiResponse,
    MarketQueryParams,
    MarketState,
} from "../features/marketTypes";
import BASE_URL from '../../../BASE_URL'
import { cachedJson } from "@/lib/idbCache";

const initialState: MarketState = {
    day: null,
    dayLoading: false,
    dayError: null,
    dayRequestId: null,
    range: null,
    rangeLoading: false,
    rangeError: null,
    rangeRequestId: null,
    period: null,
    periodLoading: false,
    periodError: null,
    periodRequestId: null,
};

const BLOCKS = 96;
const MARKETS: Market[] = ["DAM", "RTM", "GDAM", "HPDAM"];
const EXCHANGES: Exchange[] = ["IEX", "PXIL", "HPX"];

const nullBlock = (b: number): BlockPoint => ({ block: b, buyMW: null, sellMW: null, mcvMW: null, acvMW: null, mcpPrice: null, acpPrice: null });

/** A day with nothing from the API: every chart shows "No data available". */
export function emptyMarketDetail(): MarketDetailData {
    const out = {} as MarketDetailData;
    for (const m of MARKETS) {
        out[m] = {} as Record<Exchange, BlockPoint[]>;
        for (const e of EXCHANGES) out[m][e] = Array.from({ length: BLOCKS }, (_, i) => nullBlock(i + 1));
    }
    return out;
}

/** API → 96 blocks per market per exchange for one date. Blocks the API doesn't send are null.
 *  PXIL sends its ACV as "sv"; a null price is shown as 0. */
function transformMarketDay(json: MarketGraphApiResponse, date: string): MarketDetailData {
    const out = {} as MarketDetailData;
    for (const m of MARKETS) {
        out[m] = {} as Record<Exchange, BlockPoint[]>;
        for (const e of EXCHANGES) {
            const blocks = Array.from({ length: BLOCKS }, (_, i) => nullBlock(i + 1));
            const day = json[e.toLowerCase() as "iex"]?.find((x) => x.Market === m)?.dates.find((d) => d.Date === date) ?? null;
            for (const b of day?.blocks ?? []) {
                if (b.Block < 1 || b.Block > BLOCKS) continue;
                blocks[b.Block - 1] = {
                    block: b.Block,
                    buyMW: b.purchase ?? 0, sellMW: b.sell ?? 0, mcvMW: b.mcv ?? 0, acvMW: b.acv ?? b.sv ?? 0,
                    mcpPrice: b.mcp ?? 0, acpPrice: b.acp ?? 0,
                };
            }
            out[m][e] = blocks;
        }
    }
    return out;
}

/** Every date in from..to (inclusive), as yyyy-mm-dd. */
function datesBetween(from: string, to: string): string[] {
    const out: string[] = [];
    for (const d = new Date(from + "T00:00:00"), end = new Date(to + "T00:00:00"); d <= end; d.setDate(d.getDate() + 1)) {
        out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return out;
}

async function getMarketGraph(from_date: string, to_date: string): Promise<MarketGraphApiResponse> {
    const query = new URLSearchParams({ from_date, to_date });
    const res = await fetch(`${BASE_URL}market-graph?${query.toString()}`, {
        headers: { accept: "*/*" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
    return res.json();
}

// 1. Day-ahead Thunk: one date, all markets and exchanges. Not cached — today's RTM fills in
// through the day.
export const fetchMarketDay = createAsyncThunk<{ date: string; detail: MarketDetailData }, { date: string }>(
    "market/fetchMarketDay",
    async ({ date }) => ({ date, detail: transformMarketDay(await getMarketGraph(date, date), date) }),
);

// 2. Week / Month-ahead Thunk: a date range in one call. Cache-first (IndexedDB, key
// market-graph:<from>:<to>); `sync: true` calls the API and saves the response if it differs.
export const fetchMarketRange = createAsyncThunk<
    { from: string; to: string; days: Record<string, MarketDetailData>; changed: boolean },
    MarketQueryParams
>("market/fetchMarketRange", async ({ from_date, to_date, sync }) => {
    const { value, changed } = await cachedJson(`market-graph:${from_date}:${to_date}`, () => getMarketGraph(from_date, to_date), sync);
    const days: Record<string, MarketDetailData> = {};
    for (const date of datesBetween(from_date, to_date)) days[date] = transformMarketDay(value, date);
    return { from: from_date, to: to_date, days, changed };
});

/** Block-by-block average of several days, per market and exchange: each value averages the days
 *  that have it; null where none do. */
function averageMarketDays(days: MarketDetailData[]): MarketDetailData {
    const keys = ["buyMW", "sellMW", "mcvMW", "acvMW", "mcpPrice", "acpPrice"] as const;
    const out = emptyMarketDetail();
    for (const m of MARKETS) for (const e of EXCHANGES) {
        out[m][e] = out[m][e].map((p, i) => {
            const q = { ...p };
            for (const k of keys) {
                const vals = days.map((d) => d[m][e][i][k]).filter((v): v is number => v !== null);
                q[k] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
            }
            return q;
        });
    }
    return out;
}

/** from..to split into ranges of at most 31 days (the API's limit), by calendar month. */
function chunks31(from: string, to: string): [string, string][] {
    const out: [string, string][] = [];
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (let d = new Date(from + "T00:00:00"); iso(d) <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const end = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        out.push([iso(d), end < to ? end : to]);
    }
    return out;
}

// 3. Planning horizon Week / Month / Year ahead: market-graph for the whole period (one call per
// ≤31 days), averaged block by block into one "average day". Only the small average is cached in
// IndexedDB (key market-graph-avg:<from>:<to>); `sync: true` re-calls the API.
export const fetchMarketPeriod = createAsyncThunk<
    { from: string; to: string; days: number; detail: MarketDetailData; changed: boolean },
    MarketQueryParams
>("market/fetchMarketPeriod", async ({ from_date, to_date, sync }) => {
    const { value, changed } = await cachedJson(`market-graph-avg:${from_date}:${to_date}`, async () => {
        const parts = await Promise.all(chunks31(from_date, to_date).map(([f, t]) => getMarketGraph(f, t).then((json) => ({ json, f, t }))));
        const days: MarketDetailData[] = [];
        for (const { json, f, t } of parts) {
            for (const date of datesBetween(f, t)) {
                const d = transformMarketDay(json, date);
                if (MARKETS.some((m) => EXCHANGES.some((e) => d[m][e].some((p) => p.buyMW !== null)))) days.push(d);
            }
        }
        return { days: days.length, detail: days.length ? averageMarketDays(days) : emptyMarketDetail() };
    }, sync);
    return { from: from_date, to: to_date, ...value, changed };
});

export const marketSlice = createSlice({
    name: "market",
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        // Day Ahead Handlers (only the latest request may land — stepping quickly through dates)
        builder
            .addCase(fetchMarketDay.pending, (state, action) => {
                state.dayRequestId = action.meta.requestId;
                state.dayLoading = true;
            })
            .addCase(fetchMarketDay.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.dayRequestId) return;
                state.dayLoading = false;
                state.dayError = null;
                state.day = action.payload;
            })
            .addCase(fetchMarketDay.rejected, (state, action) => {
                if (action.meta.requestId !== state.dayRequestId) return;
                state.dayLoading = false;
                // API only: on failure every chart shows "No data available" under the error.
                state.day = { date: action.meta.arg.date, detail: emptyMarketDetail() };
                state.dayError = action.error.message || "Failed to load market data";
            });

        // Planning horizon Week / Month / Year (average day) Handlers
        builder
            .addCase(fetchMarketPeriod.pending, (state, action) => {
                state.periodRequestId = action.meta.requestId;
                // A Sync keeps the current charts on screen while it checks the API.
                if (!action.meta.arg.sync) state.periodLoading = true;
                state.periodError = null;
            })
            .addCase(fetchMarketPeriod.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.periodRequestId) return;
                state.periodLoading = false;
                const { from, to, days, detail } = action.payload;
                state.period = { from, to, days, detail };
            })
            .addCase(fetchMarketPeriod.rejected, (state, action) => {
                if (action.meta.requestId !== state.periodRequestId) return;
                state.periodLoading = false;
                if (action.meta.arg.sync) return;
                state.period = { from: action.meta.arg.from_date, to: action.meta.arg.to_date, days: 0, detail: emptyMarketDetail() };
                state.periodError = action.error.message || "Failed to load market data";
            });

        // Week / Month Ahead Handlers
        builder
            .addCase(fetchMarketRange.pending, (state, action) => {
                state.rangeRequestId = action.meta.requestId;
                // A Sync keeps the current cards on screen while it checks the API.
                if (!action.meta.arg.sync) state.rangeLoading = true;
                state.rangeError = null;
            })
            .addCase(fetchMarketRange.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.rangeRequestId) return;
                state.rangeLoading = false;
                state.range = { from: action.payload.from, to: action.payload.to, days: action.payload.days };
            })
            .addCase(fetchMarketRange.rejected, (state, action) => {
                if (action.meta.requestId !== state.rangeRequestId) return;
                state.rangeLoading = false;
                // A failed Sync leaves the shown data as it was (the Sync button reports the error).
                if (action.meta.arg.sync) return;
                state.range = { from: action.meta.arg.from_date, to: action.meta.arg.to_date, days: {} };
                state.rangeError = action.error.message || "Failed to load market data";
            });
    },
});

export default marketSlice.reducer;
