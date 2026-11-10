export interface DemandApiRow {
    data_id: number;
    client_id: string | null;
    forecasted_by: string;
    ts_period: string;
    ts_date: string;
    location_id: number;
    created_at: string;
    /** Day MAPE (Manual rows of demand-forcast). */
    day_mape?: number | null;
    [key: `block_${number}`]: number;
}

export interface DemandApiResponse {
    data_id: number;
    horizon: string;
    table: string;
    from_date: string;
    to_date: string;
    location_id: number;
    forcasted_by: string;
    count: number;
    rows: DemandApiRow[];
}

export interface DemandCalendarData {
    dates: string[];
    cats: string[];
    plants: string[];
    plantType: Record<string, string>;
    C: number[][][]; // [day][category][96]
    P: number[][][]; // [day][plantGroup][96]
    dem: number[][]; // [day][96]
    av: number[][];  // [day][96]
}

export interface DemandQueryParams {
    data_id?: number;
    from_date?: string;
    to_date?: string;
    location_id?: number;
    forcasted_by?: string;
    table?: string;
}

export interface Season {
    cal_year: number;
    period_code: string;
    period_name: string;
    season_start: string;
    season_end: string;
    from_date: string;
    to_date: string;
    days_in_range: number;
}

/** One season of a calendar year (period/seasons?year=). */
export interface LongTermSeason {
    cal_year: number;
    period_code: string;
    period_name: string;
    from_date: string;
    to_date: string;
}

export interface LongTermSeasonApiResponse {
    year: number;
    count: number;
    seasons: LongTermSeason[];
}

export interface SeasonApiResponse {
    start_date: string;
    end_date: string;
    count: number;
    seasons: Season[];
}

/** One location's weather for a day: each field is 96 blocks keyed "1".."96". */
export type WeatherBlocks = Record<
    "cloudCover" | "relativeHumidity" | "temperature" | "temperatureDewPoint" | "temperatureFeelsLike" | "windGust" | "windSpeed",
    Record<string, number>
>;

export interface WeatherApiResponse {
    date: string;
    ref_date: string | null;
    client_id: string;
    locations: Record<string, { current: WeatherBlocks; reference: unknown }>;
}

/** GET /day_ahead?date= — the day's System Forecast plus, for today or earlier, the actuals. */
/** day_ahead?data_id=102110&from_date&to_date&location_id&forecasted_by — one entry per day;
 *  past days (`show_actuals`) also carry actual, roastering, MAPE and UDM per block. */
export interface DayAheadApiResponse {
    data_id: number;
    horizon: string;
    from_date: string;
    to_date: string;
    today: string;
    count: number;
    days: {
        date: string;
        show_actuals: boolean;
        blocks: {
            block: number;
            forecast_value: number;
            actual_value?: number;
            roastering?: number;
            mape?: number;
            udm?: number;
        }[];
        mape_error_ranges?: { error_range: string; blocks: number; percent: number }[];
        day_mape?: number;
    }[];
}

/** One day from the day-ahead API, as 96-block arrays; `forecast` null when none is saved. */
export interface DayAheadData {
    date: string;
    forecast: number[] | null;
    actual: number[] | null;
    mape: number[] | null;
    roastering: number[] | null;
    /** UDM per block (past days only). */
    udm: number[] | null;
    /** System Forecast error bands (share of blocks per MAPE range), as the API computes them. */
    errorRanges: { range: string; blocks: number; percent: number }[] | null;
    dayMape: number | null;
    /** Manual forecast blocks from tuneup (null if no Manual row exists). */
    manual: number[] | null;
    /** Manual day MAPE from demand_forecast.day_mape (null if no Manual row). */
    manualDayMape: number | null;
}

export interface DemandState {
    data: DemandCalendarData | null;
    loading: boolean;
    error: string | null;
    weekData: DemandCalendarData | null;
    weekLoading: boolean;
    weekError: string | null;
    dayData: DayAheadData | null;
    /** The day_ahead data_id `dayData` came from: 102110 Day / 102120 Week / 102130 Month ahead. */
    dayDataId: number | null;
    dayLoading: boolean;
    dayError: string | null;
    dayRequestId: string | null;
    yearData: DemandCalendarData | null;
    yearLoading: boolean;
    yearError: string | null;
    seasons: Season[] | null;
    // One day of the year-ahead series, fetched when a day is opened.
    yearDay: { date: string; dem: number[] } | null;
    yearDayRequestId: string | null;
    yearRequestId: string | null;
    // Weather for every location on one date (weather/multi).
    weather: { date: string; locations: Record<string, WeatherBlocks> } | null;
    weatherLoading: boolean;
    weatherError: string | null;
    weatherRequestId: string | null;
    // Week ahead (day_ahead API, data_id=102120): one DayAheadData per day of the Monday–Sunday week.
    weekAhead: { from: string; days: DayAheadData[] } | null;
    weekAheadLoading: boolean;
    weekAheadError: string | null;
    weekAheadRequestId: string | null;
    // Month ahead (day_ahead API, data_id=102130): one DayAheadData per day of the calendar month.
    monthAhead: { from: string; days: DayAheadData[] } | null;
    monthAheadLoading: boolean;
    monthAheadError: string | null;
    monthAheadRequestId: string | null;
    // Long term (data_id=102150): daily 96-block forecast + the seasons of each year it spans.
    longTermData: DemandCalendarData | null;
    longTermLoading: boolean;
    longTermError: string | null;
    longTermRequestId: string | null;
    longTermSeasons: LongTermSeason[] | null;
}
