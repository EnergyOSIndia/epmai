export type Market = "DAM" | "RTM" | "GDAM" | "HPDAM";
export type Exchange = "IEX" | "PXIL" | "HPX";

/** One 15-min block of one market on one exchange. null = no value for that block yet (e.g. RTM
 *  blocks still to come today), so the lines stop there. */
export interface BlockPoint {
    block: number;
    buyMW: number | null;
    sellMW: number | null;
    mcvMW: number | null;
    acvMW: number | null;
    mcpPrice: number | null;
    acpPrice: number | null;
}

/** 96 blocks per market per exchange. */
export type MarketDetailData = Record<Market, Record<Exchange, BlockPoint[]>>;

/** market-graph?from_date&to_date — per exchange, per market, per date, the blocks. PXIL sends
 *  its ACV as `sv`. */
export interface MarketGraphApiBlock {
    Block: number;
    mcp: number | null;
    acp: number | null;
    mcv: number | null;
    acv?: number | null;
    sv?: number | null;
    sell: number | null;
    purchase: number | null;
}

export interface MarketGraphApiMarket {
    Market: string;
    dates: { Date: string; blocks: MarketGraphApiBlock[] }[];
}

export type MarketGraphApiResponse = Partial<Record<"iex" | "pxil" | "hpx", MarketGraphApiMarket[]>>;

export interface MarketQueryParams {
    from_date: string;
    to_date: string;
    sync?: boolean;
}

export interface MarketState {
    // Day ahead: one date, every market and exchange (not cached — today's RTM fills in).
    day: { date: string; detail: MarketDetailData } | null;
    dayLoading: boolean;
    dayError: string | null;
    dayRequestId: string | null;
    // Week / Month ahead: a date range, cached in IndexedDB (Sync re-checks the API).
    range: { from: string; to: string; days: Record<string, MarketDetailData> } | null;
    rangeLoading: boolean;
    rangeError: string | null;
    rangeRequestId: string | null;
}
