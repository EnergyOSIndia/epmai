/** Blocks are 1..96, keyed as strings by the API; values may be null when unknown. */
export type BlockMap = Record<string, number | null>;

export interface ModelStats {
    peak: number;
    min: number;
    avg: number;
    offpeak: number;
    energy_mwh: number;
}

/** tuneup/config — locations, weather locations, models and the allowed date range. */
export interface TuneupConfig {
    locations: number[];
    weather_locations: string[];
    selected_location: number;
    models: string[];
    date_range: { min: string; max: string };
    weather_weights: Record<string, number>;
}

/** tuneup/forecast?date&location_id — every model's 96 blocks (System, Manual …) for a date. */
export interface TuneupForecast {
    date: string;
    location_id: number;
    models: Record<string, BlockMap>;
    available_models: string[];
    model_stats: Record<string, ModelStats>;
    mape: Record<string, number>;
    actual: BlockMap | null;
    roastering: BlockMap | null;
    ensemble: BlockMap | null;
    ensemble_stats: ModelStats | null;
}

export interface RuleIn {
    from_block: number;
    to_block: number;
    action: string;
    from_value: number;
    to_value: number;
    ref_date?: string | null;
    enabled?: boolean;
}

/** A rule as the server returns it — RuleIn plus an id the edit/delete/reorder endpoints key on. */
export interface Rule extends RuleIn {
    id: string;
    enabled: boolean;
}

export interface RuleHistory {
    undo_count: number;
    redo_count: number;
    can_undo: boolean;
    can_redo: boolean;
    last_label: string | null;
}

export interface RulesResponse {
    rules: Rule[];
    history: RuleHistory;
}

/** /setline and /apply both return the recomputed 96-block line plus stats + a single MAPE number. */
export interface ModifiedResult {
    modified: BlockMap;
    stats: ModelStats | null;
    mape: number | null;
    rules_applied?: number;
    rules_total?: number;
    history?: RuleHistory;
}

export interface SimilarDay {
    date: string;
    score: number;
    per_block?: number[];
}

export interface SimilarDaysApiResponse {
    similar_days: SimilarDay[];
}

/** tuneup/weather-multi — each location's weather for the date and (with ref_date) a reference day. */
export interface WeatherMulti {
    date: string;
    ref_date: string | null;
    location_id: number;
    locations: Record<string, { current: Record<string, BlockMap>; reference: Record<string, BlockMap> | null }>;
}

export interface SetLineRequest {
    date: string;
    location_id: number;
    base_model: string;
    rules: RuleIn[];
    edit_blocks?: Record<string, number> | null;
    enabled_blocks?: Record<string, boolean> | null;
}

export interface ManualForecastRequest {
    date: string;
    location_id: number;
    blocks: Record<string, number>;
}

export interface EnsembleRequest {
    date: string;
    location_id: number;
    ref_dates: Record<string, number>;
    mpe_factor?: number;
    top_n?: number;
}

export interface ApplyRequest {
    date: string;
    location_id: number;
    base_model: string;
    edit_blocks?: Record<string, number> | null;
    enabled_blocks?: Record<string, boolean> | null;
}

/** Rules endpoints are keyed by location and date. */
export interface RuleScope {
    location_id: number;
    date: string;
}

export interface TuneupState {
    // The last answer per request, shown at once when the tab opens again while a fresh copy
    // loads (the tuneup API is slow: config ≈3 s, forecast ≈2.5 s). Keys: see tuneupApiSlice.ts.
    config: TuneupConfig | null;
    forecasts: Record<string, TuneupForecast>;
    rules: Record<string, RulesResponse>;
    similarDays: Record<string, SimilarDay[]>;
    weather: Record<string, WeatherMulti>;
}
