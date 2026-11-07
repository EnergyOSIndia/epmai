import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type {
    DemandApiResponse,
    DemandCalendarData,
    DemandQueryParams,
    DemandState,
    DayAheadApiResponse,
    DayAheadData,
    LongTermSeason,
    LongTermSeasonApiResponse,
    Season,
    SeasonApiResponse,
    WeatherApiResponse,
    WeatherBlocks,
} from "../features/demandTypes";
import BASE_URL from '../../../BASE_URL'
import { cachedJson } from "@/lib/idbCache";

const initialState: DemandState = {
    data: null,
    loading: false,
    error: null,
    weekData: null,
    weekLoading: false,
    weekError: null,
    dayData: null,
    dayDataId: null,
    dayLoading: false,
    dayError: null,
    dayRequestId: null,
    yearData: null,
    yearLoading: false,
    yearError: null,
    seasons: null,
    yearDay: null,
    yearDayRequestId: null,
    yearRequestId: null,
    weather: null,
    weatherLoading: false,
    weatherError: null,
    weatherRequestId: null,
    weekAhead: null,
    weekAheadLoading: false,
    weekAheadError: null,
    weekAheadRequestId: null,
    monthAhead: null,
    monthAheadLoading: false,
    monthAheadError: null,
    monthAheadRequestId: null,
    longTermData: null,
    longTermLoading: false,
    longTermError: null,
    longTermRequestId: null,
    longTermSeasons: null,
};

// Helper to transform API response rows into 96-block calendar format
function transformDemandRows(rows: DemandApiResponse["rows"]): DemandCalendarData {
    const dates: string[] = [];
    const dem: number[][] = [];
    const av: number[][] = [];
    const C: number[][][] = [];
    const P: number[][][] = [];

    rows.forEach((row) => {
        dates.push(row.ts_date);

        const blocks: number[] = [];
        for (let b = 1; b <= 96; b++) {
            blocks.push(Number(row[`block_${b}`]) || 0);
        }

        dem.push(blocks);
        av.push([...blocks]);
        C.push([[...blocks]]);
        P.push([new Array(96).fill(0)]);
    });

    return {
        dates,
        cats: ["Forecast Demand"],
        plants: ["System Forecast"],
        plantType: { "System Forecast": "ISGS" },
        C,
        P,
        dem,
        av,
    };
}

// 1. Month-ahead Thunk
export const fetchDemandForecast = createAsyncThunk<
    DemandCalendarData,
    DemandQueryParams | undefined
>("demand/fetchDemandForecast", async (params) => {
    const query = new URLSearchParams({
        data_id: String(params?.data_id ?? 102130),
        from_date: params?.from_date ?? "2026-11-01",
        to_date: params?.to_date ?? "2026-11-30",
        location_id: String(params?.location_id ?? 10030),
        forcasted_by: params?.forcasted_by ?? "System",
        table: params?.table ?? "daily",
    });

    const res = await fetch(`${BASE_URL}demand-forcast/?${query.toString()}`, {
        headers: { accept: "*/*" },
    });

    if (!res.ok) throw new Error(`Failed to fetch forecast: ${res.statusText}`);
    const json: DemandApiResponse = await res.json();
    return transformDemandRows(json.rows);
});

// 2. Week-ahead Thunk (data_id=102120)
export const fetchWeekDemandForecast = createAsyncThunk<
    DemandCalendarData,
    DemandQueryParams | undefined
>("demand/fetchWeekDemandForecast", async (params) => {
    const query = new URLSearchParams({
        data_id: String(params?.data_id ?? 102120),
        from_date: params?.from_date ?? "2026-10-19",
        to_date: params?.to_date ?? "2026-10-25",
        location_id: String(params?.location_id ?? 10030),
        forcasted_by: params?.forcasted_by ?? "System",
        table: params?.table ?? "daily",
    });

    const res = await fetch(`${BASE_URL}demand-forcast/?${query.toString()}`, {
        headers: { accept: "*/*" },
    });

    if (!res.ok) throw new Error(`Failed to fetch week forecast: ${res.statusText}`);
    const json: DemandApiResponse = await res.json();
    return transformDemandRows(json.rows);
});

// 3. Day-ahead Thunk (data_id=102110 by default — 102120 / 102130 for the Week / Month-ahead
// forecast of a date; from_date = to_date): System Forecast for one date, plus —
// for today or earlier — Actual, Roastering, MAPE and UDM per block and the error bands.
// Also fetches the Manual forecast (if any) from the tuneup API.
export const fetchDayAhead = createAsyncThunk<DayAheadData, { date: string; data_id?: number }>(
    "demand/fetchDayAhead",
    async ({ date, data_id = 102110 }) => {
        const query = new URLSearchParams({
            data_id: String(data_id),
            from_date: date,
            to_date: date,
            location_id: "10030",
            forecasted_by: "System",
        });
        const res = await fetch(`${BASE_URL}day_ahead?${query.toString()}`, {
            headers: { accept: "*/*" },
        });

        // 404 = no forecast saved for that date: an empty day, not a failure.
        if (res.status === 404) return emptyDay(date);
        if (!res.ok) throw new Error(`Failed to fetch day-ahead forecast: ${res.statusText}`);
        const json: DayAheadApiResponse = await res.json();
        const day = dayFromApi(json.days?.find((d) => d.date === date) ?? json.days?.[0], date);

        // Fetch Manual forecast from demand-forcast API (same table, forecasted_by=Manual)
        try {
            const manualQuery = new URLSearchParams({
                data_id: String(data_id),
                from_date: date,
                to_date: date,
                location_id: "10030",
                forcasted_by: "Manual",
            });
            const manualRes = await fetch(`${BASE_URL}demand-forcast/?${manualQuery.toString()}`, {
                headers: { accept: "*/*" },
            });
            if (manualRes.ok) {
                const manualJson: DemandApiResponse = await manualRes.json();
                if (manualJson.rows?.length) {
                    const row = manualJson.rows[0];
                    const manualBlocks: number[] = [];
                    for (let b = 1; b <= 96; b++) {
                        manualBlocks.push(Number(row[`block_${b}`]) || 0);
                    }
                    day.manual = manualBlocks;
                    day.manualDayMape = Number(row.day_mape) || null;
                }
            }
        } catch {
            // Manual forecast not available — not an error
        }

        return day;
    },
);

const emptyDay = (date: string): DayAheadData =>
    ({ date, forecast: null, actual: null, mape: null, roastering: null, udm: null, errorRanges: null, dayMape: null, manual: null, manualDayMape: null });

/** One API day → 96-block arrays. Actual / Roastering / MAPE / UDM and the error bands only when
 *  the API has actuals for it (today or earlier). */
function dayFromApi(day: DayAheadApiResponse["days"][number] | undefined, date: string): DayAheadData {
    if (!day?.blocks?.length) return emptyDay(date);
    // One field of every block, in block order; null when any block lacks it.
    const byBlock = [...day.blocks].sort((a, b) => a.block - b.block);
    const col = (pick: (b: DayAheadApiResponse["days"][number]["blocks"][number]) => number | undefined) => {
        const a = Array.from({ length: 96 }, (_, i) => Number(pick(byBlock[i] ?? ({} as never))));
        return a.some((v) => Number.isNaN(v)) ? null : a;
    };
    const past = day.show_actuals;
    return {
        date,
        forecast: col((b) => b.forecast_value),
        actual: past ? col((b) => b.actual_value) : null,
        mape: past ? col((b) => b.mape) : null,
        roastering: past ? col((b) => b.roastering) : null,
        udm: past ? col((b) => b.udm) : null,
        errorRanges: past && day.mape_error_ranges?.length
            ? day.mape_error_ranges.map((r) => ({ range: r.error_range, blocks: r.blocks, percent: r.percent }))
            : null,
        dayMape: day.day_mape ?? null,
        manual: null,
        manualDayMape: null,
    };
}

/** day_ahead for a date range and horizon (data_id): one DayAheadData per date from `from_date` to
 *  `to_date`, in order; dates the API has nothing for (or a 404 for the whole range) come back empty. */
async function loadDayAheadRange(
    dataId: number, from_date: string, to_date: string, sync = false,
): Promise<{ from: string; days: DayAheadData[]; changed: boolean }> {
    const query = new URLSearchParams({
        data_id: String(dataId),
        from_date,
        to_date,
        location_id: "10030",
        forecasted_by: "System",
    });
    // Cache-first (IndexedDB, see lib/idbCache.ts): the saved response is used when there is one;
    // `sync` calls the API and saves it if it differs. A 404 (nothing saved) is cached as null.
    const { value: json, changed } = await cachedJson<DayAheadApiResponse | null>(`day-ahead:${query.toString()}`, async () => {
        const res = await fetch(`${BASE_URL}day_ahead?${query.toString()}`, {
            headers: { accept: "*/*" },
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Failed to fetch forecast: ${res.statusText}`);
        return (await res.json()) as DayAheadApiResponse;
    }, sync);
    const dates: string[] = [];
    for (const d = new Date(from_date + "T00:00:00"), end = new Date(to_date + "T00:00:00"); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return { from: from_date, changed, days: dates.map((date) => dayFromApi(json?.days?.find((d) => d.date === date), date)) };
}

type RangeArgs = { from_date: string; to_date: string; sync?: boolean };
type RangeOut = { from: string; days: DayAheadData[]; changed: boolean };

// 3b. Week-ahead Thunk (day_ahead API, data_id=102120): the Monday–Sunday week.
export const fetchWeekDayAhead = createAsyncThunk<RangeOut, RangeArgs>(
    "demand/fetchWeekDayAhead",
    ({ from_date, to_date, sync }) => loadDayAheadRange(102120, from_date, to_date, sync),
);

// 3c. Month-ahead Thunk (day_ahead API, data_id=102130): one calendar month.
export const fetchMonthDayAhead = createAsyncThunk<RangeOut, RangeArgs>(
    "demand/fetchMonthDayAhead",
    ({ from_date, to_date, sync }) => loadDayAheadRange(102130, from_date, to_date, sync),
);

// 4. Year-ahead Thunk (data_id=102140). Cache-first: the saved IndexedDB copy is used when there
// is one; `sync: true` calls the API and saves the response if it differs (see lib/idbCache.ts).
export const fetchYearDemandForecast = createAsyncThunk<
    { data: DemandCalendarData; changed: boolean },
    (DemandQueryParams & { sync?: boolean }) | undefined
>("demand/fetchYearDemandForecast", async (params) => {
    const query = new URLSearchParams({
        data_id: String(params?.data_id ?? 102140),
        from_date: params?.from_date ?? "2026-11-01",
        to_date: params?.to_date ?? "2027-10-31",
        location_id: String(params?.location_id ?? 10030),
        forcasted_by: params?.forcasted_by ?? "System",
        table: params?.table ?? "daily",
    });

    const { value: rows, changed } = await cachedJson(`year:${query.toString()}`, async () => {
        const res = await fetch(`${BASE_URL}demand-forcast/?${query.toString()}`, {
            headers: { accept: "*/*" },
        });
        if (!res.ok) throw new Error(`Failed to fetch year forecast: ${res.statusText}`);
        const json: DemandApiResponse = await res.json();
        return json.rows;
    }, params?.sync);
    return { data: transformDemandRows(rows), changed };
});

// 5. Year-ahead single day (data_id=102140, from_date = to_date) — opened from the year grid.
// Cached under "year-day:"; a year-ahead Sync DB clears these so days re-load fresh.
export const fetchYearDayDemand = createAsyncThunk<
    { date: string; dem: number[] },
    DemandQueryParams & { date: string }
>("demand/fetchYearDayDemand", async (params) => {
    const query = new URLSearchParams({
        data_id: String(params.data_id ?? 102140),
        from_date: params.date,
        to_date: params.date,
        location_id: String(params.location_id ?? 10030),
        forcasted_by: params.forcasted_by ?? "System",
        table: params.table ?? "daily",
    });

    const { value: rows } = await cachedJson(`year-day:${query.toString()}`, async () => {
        const res = await fetch(`${BASE_URL}demand-forcast/?${query.toString()}`, {
            headers: { accept: "*/*" },
        });
        if (!res.ok) throw new Error(`Failed to fetch day forecast: ${res.statusText}`);
        const json: DemandApiResponse = await res.json();
        return json.rows;
    });
    const data = transformDemandRows(rows);
    return { date: params.date, dem: data.dem[0] ?? [] };
});

// 6. Seasons covering a date range (cache-first, like the year-ahead forecast)
export const fetchSeasons = createAsyncThunk<
    { seasons: Season[]; changed: boolean },
    { start_date: string; end_date: string; sync?: boolean }
>("demand/fetchSeasons", async ({ start_date, end_date, sync }) => {
    const query = new URLSearchParams({ start_date, end_date });
    const { value: seasons, changed } = await cachedJson(`season-by-date:${query.toString()}`, async () => {
        const res = await fetch(`${BASE_URL}period/season-by-date?${query.toString()}`, {
            headers: { accept: "*/*" },
        });
        if (!res.ok) throw new Error(`Failed to fetch seasons: ${res.statusText}`);
        const json: SeasonApiResponse = await res.json();
        return json.seasons;
    }, sync);
    return { seasons, changed };
});

// 7. Weather for every location on one date
export const fetchWeather = createAsyncThunk<
    { date: string; locations: Record<string, WeatherBlocks> },
    { date: string; client_id: string; location_id?: string }
>("demand/fetchWeather", async ({ date, client_id, location_id }) => {
    const query = new URLSearchParams({ date, client_id });
    if (location_id) query.set("location_id", location_id);
    const res = await fetch(`${BASE_URL}weather/multi?${query.toString()}`, {
        headers: { accept: "*/*" },
    });

    if (!res.ok) throw new Error(`Failed to fetch weather: ${res.statusText}`);
    const json: WeatherApiResponse = await res.json();
    const locations: Record<string, WeatherBlocks> = {};
    Object.entries(json.locations ?? {}).forEach(([id, l]) => { if (l?.current) locations[id] = l.current; });
    return { date, locations };
});

// 8. Long-term Thunk (data_id=102150). The API caps a request at 1830 days, so the range is
// fetched one calendar year at a time and merged in date order. Cache-first like the year ahead.
export const fetchLongTermDemandForecast = createAsyncThunk<
    { data: DemandCalendarData; changed: boolean },
    (DemandQueryParams & { sync?: boolean }) | undefined
>("demand/fetchLongTermDemandForecast", async (params) => {
    const from = params?.from_date ?? "2026-11-01";
    const to = params?.to_date ?? "2031-12-31";
    const base = {
        data_id: String(params?.data_id ?? 102150),
        location_id: String(params?.location_id ?? 10030),
        forcasted_by: params?.forcasted_by ?? "System",
        table: params?.table ?? "daily",
    };
    const chunks: { from_date: string; to_date: string }[] = [];
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
        chunks.push({
            from_date: y === Number(from.slice(0, 4)) ? from : `${y}-01-01`,
            to_date: y === Number(to.slice(0, 4)) ? to : `${y}-12-31`,
        });
    }

    const key = `longterm:${new URLSearchParams({ ...base, from_date: from, to_date: to }).toString()}`;
    const { value: rows, changed } = await cachedJson(key, async () => {
        const parts = await Promise.all(chunks.map(async ({ from_date, to_date }) => {
            const query = new URLSearchParams({ ...base, from_date, to_date });
            const res = await fetch(`${BASE_URL}demand-forcast/?${query.toString()}`, {
                headers: { accept: "*/*" },
            });
            if (!res.ok) throw new Error(`Failed to fetch long-term forecast: ${res.statusText}`);
            const json: DemandApiResponse = await res.json();
            return json.rows ?? [];
        }));
        return parts.flat().sort((a, b) => a.ts_date.localeCompare(b.ts_date));
    }, params?.sync);
    return { data: transformDemandRows(rows), changed };
});

// 9. Seasons of each calendar year (period/seasons?year=), merged. Cache-first.
export const fetchLongTermSeasons = createAsyncThunk<
    { seasons: LongTermSeason[]; changed: boolean },
    { years: number[]; sync?: boolean }
>(
    "demand/fetchLongTermSeasons",
    async ({ years, sync }) => {
        const { value: seasons, changed } = await cachedJson(`longterm-seasons:${years.join(",")}`, async () => {
            const all = await Promise.all(years.map(async (year) => {
                const res = await fetch(`${BASE_URL}period/seasons?${new URLSearchParams({ year: String(year) }).toString()}`, {
                    headers: { accept: "*/*" },
                });
                if (!res.ok) throw new Error(`Failed to fetch seasons for ${year}: ${res.statusText}`);
                const json: LongTermSeasonApiResponse = await res.json();
                return json.seasons ?? [];
            }));
            return all.flat();
        }, sync);
        return { seasons, changed };
    }
);

export const demandSlice = createSlice({
    name: "demand",
    initialState,
    reducers: {
        resetDemandState: (state) => {
            state.data = null;
            state.error = null;
            state.loading = false;
            state.weekData = null;
            state.weekLoading = false;
            state.weekError = null;
            state.dayData = null;
            state.dayLoading = false;
            state.dayError = null;
            state.yearData = null;
            state.yearLoading = false;
            state.yearError = null;
            state.seasons = null;
            state.yearDay = null;
        },
    },
    extraReducers: (builder) => {
        // Month Ahead Handlers
        builder
            .addCase(fetchDemandForecast.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchDemandForecast.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload;
            })
            .addCase(fetchDemandForecast.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message || "Failed to load month forecast";
            });

        // Week Ahead Handlers
        builder
            .addCase(fetchWeekDemandForecast.pending, (state) => {
                state.weekLoading = true;
                state.weekError = null;
            })
            .addCase(fetchWeekDemandForecast.fulfilled, (state, action) => {
                state.weekLoading = false;
                state.weekData = action.payload;
            })
            .addCase(fetchWeekDemandForecast.rejected, (state, action) => {
                state.weekLoading = false;
                state.weekError = action.error.message || "Failed to load week forecast";
            });

        // Day Ahead Handlers
        builder
            // Only the latest request may land — paging quickly fires several.
            .addCase(fetchDayAhead.pending, (state, action) => {
                state.dayRequestId = action.meta.requestId;
                state.dayLoading = true;
                state.dayError = null;
            })
            .addCase(fetchDayAhead.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.dayRequestId) return;
                state.dayLoading = false;
                state.dayData = action.payload;
                state.dayDataId = action.meta.arg.data_id ?? 102110;
            })
            .addCase(fetchDayAhead.rejected, (state, action) => {
                if (action.meta.requestId !== state.dayRequestId) return;
                state.dayLoading = false;
                state.dayData = null;
                state.dayError = action.error.message || "Failed to load day forecast";
            });

        // Week Ahead (day_ahead, 102120) Handlers
        builder
            .addCase(fetchWeekDayAhead.pending, (state, action) => {
                state.weekAheadRequestId = action.meta.requestId;
                // A Sync DB keeps the current cards on screen while it checks the API.
                if (!action.meta.arg.sync) state.weekAheadLoading = true;
                state.weekAheadError = null;
            })
            .addCase(fetchWeekDayAhead.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.weekAheadRequestId) return;
                state.weekAheadLoading = false;
                state.weekAhead = { from: action.payload.from, days: action.payload.days };
            })
            .addCase(fetchWeekDayAhead.rejected, (state, action) => {
                if (action.meta.requestId !== state.weekAheadRequestId) return;
                state.weekAheadLoading = false;
                state.weekAheadError = action.error.message || "Failed to load week forecast";
            });

        // Month Ahead (day_ahead, 102130) Handlers
        builder
            .addCase(fetchMonthDayAhead.pending, (state, action) => {
                state.monthAheadRequestId = action.meta.requestId;
                if (!action.meta.arg.sync) state.monthAheadLoading = true;
                state.monthAheadError = null;
            })
            .addCase(fetchMonthDayAhead.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.monthAheadRequestId) return;
                state.monthAheadLoading = false;
                state.monthAhead = { from: action.payload.from, days: action.payload.days };
            })
            .addCase(fetchMonthDayAhead.rejected, (state, action) => {
                if (action.meta.requestId !== state.monthAheadRequestId) return;
                state.monthAheadLoading = false;
                state.monthAheadError = action.error.message || "Failed to load month forecast";
            });

        // Year Ahead Handlers
        builder
            .addCase(fetchYearDemandForecast.pending, (state, action) => {
                state.yearRequestId = action.meta.requestId;
                // A Sync DB keeps the current calendar on screen while it checks the API.
                if (!action.meta.arg?.sync) state.yearLoading = true;
                state.yearError = null;
            })
            .addCase(fetchYearDemandForecast.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.yearRequestId) return;
                state.yearLoading = false;
                state.yearData = action.payload.data;
            })
            .addCase(fetchYearDemandForecast.rejected, (state, action) => {
                if (action.meta.requestId !== state.yearRequestId) return;
                state.yearLoading = false;
                state.yearError = action.error.message || "Failed to load year forecast";
            });

        // Year Ahead single-day Handlers (only the latest request may land)
        builder
            .addCase(fetchYearDayDemand.pending, (state, action) => {
                state.yearDayRequestId = action.meta.requestId;
            })
            .addCase(fetchYearDayDemand.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.yearDayRequestId) return;
                state.yearDay = action.payload;
            });

        // Weather Handlers (only the latest request may land)
        builder
            .addCase(fetchWeather.pending, (state, action) => {
                state.weatherRequestId = action.meta.requestId;
                state.weatherLoading = true;
                state.weatherError = null;
            })
            .addCase(fetchWeather.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.weatherRequestId) return;
                state.weatherLoading = false;
                state.weather = action.payload;
            })
            .addCase(fetchWeather.rejected, (state, action) => {
                if (action.meta.requestId !== state.weatherRequestId) return;
                state.weatherLoading = false;
                state.weather = null;
                state.weatherError = action.error.message || "Failed to load weather";
            });

        // Long-term Handlers
        builder
            .addCase(fetchLongTermDemandForecast.pending, (state, action) => {
                state.longTermRequestId = action.meta.requestId;
                if (!action.meta.arg?.sync) state.longTermLoading = true;
                state.longTermError = null;
            })
            .addCase(fetchLongTermDemandForecast.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.longTermRequestId) return;
                state.longTermLoading = false;
                state.longTermData = action.payload.data;
            })
            .addCase(fetchLongTermDemandForecast.rejected, (state, action) => {
                if (action.meta.requestId !== state.longTermRequestId) return;
                state.longTermLoading = false;
                state.longTermError = action.error.message || "Failed to load long-term forecast";
            })
            .addCase(fetchLongTermSeasons.fulfilled, (state, action) => {
                state.longTermSeasons = action.payload.seasons;
            });

        // Season Handlers
        builder
            .addCase(fetchSeasons.pending, (state, action) => {
                if (!action.meta.arg.sync) state.seasons = null;
            })
            .addCase(fetchSeasons.fulfilled, (state, action) => {
                state.seasons = action.payload.seasons;
            });
    },
});

export const { resetDemandState } = demandSlice.actions;
export default demandSlice.reducer;
