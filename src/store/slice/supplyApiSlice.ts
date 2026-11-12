import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { AvgSupply, AvgSupplyApiResponse, PlantSupplyApiResponse, SupplyDay, SupplyDayDetail, SupplyGraph, SupplyState } from "../features/supplyTypes";
import BASE_URL from '../../../BASE_URL'
import { cachedJson } from "@/lib/idbCache";

const initialState: SupplyState = {
    week: null,
    weekLoading: false,
    weekError: null,
    weekRequestId: null,
    month: null,
    monthLoading: false,
    monthError: null,
    monthRequestId: null,
    day: null,
    dayDate: null,
    dayLoading: false,
    dayError: null,
    dayRequestId: null,
    period: null,
    periodLoading: false,
    periodError: null,
    periodRequestId: null,
    avg: null,
    avgLoading: false,
    avgError: null,
    avgRequestId: null,
};

const BLOCKS = 96;

/** API days → per-series 96-block arrays (in API order) + demand. A day whose SG and demand are
 *  all zero has no data yet and becomes `null`. */
function transformDays(json: PlantSupplyApiResponse, graph: SupplyGraph): (SupplyDay | null)[] {
    return json.data.map((day) => {
        const series = new Map<string, number[]>();
        const demand = new Array(BLOCKS).fill(0);
        const add = (name: string, b: number, v: number) => {
            if (!series.has(name)) series.set(name, new Array(BLOCKS).fill(0));
            series.get(name)![b] = Math.round((Number(v) || 0) * 100) / 100;
        };
        if (graph === "category") {
            (day.category_graph ?? []).forEach((blk) => {
                const b = blk.block - 1;
                if (b < 0 || b >= BLOCKS) return;
                demand[b] = Number(blk.demand) || 0;
                [...blk.central, ...blk.state].forEach((c) => add(c.category, b, c.sg));
            });
        } else {
            (day.technology_graph ?? []).forEach((blk) => {
                const b = blk.block - 1;
                if (b < 0 || b >= BLOCKS) return;
                demand[b] = Number(blk.demand) || 0;
                blk.data_list.forEach((t) => add(t.technology, b, t.sg));
            });
        }
        const list = [...series.entries()].map(([name, data]) => ({ name, data }));
        const empty = demand.every((v) => !v) && list.every((s) => s.data.every((v) => !v));
        return empty ? null : { date: day.date, series: list, demand };
    });
}

type RangeArgs = { from_date: string; to_date: string; graph: SupplyGraph; sync?: boolean };
type RangeResult = { graph: SupplyGraph; from: string; to: string; days: (SupplyDay | null)[]; changed: boolean };

/** plant-supply/by-category for a date range. Cache-first: the saved IndexedDB copy is used when
 *  there is one; `sync: true` calls the API and saves the response if it differs. */
async function loadRange({ from_date, to_date, graph, sync }: RangeArgs): Promise<RangeResult> {
    const query = new URLSearchParams({ from_date, to_date, graph });
    const { value: json, changed } = await cachedJson(`plant-supply:${query.toString()}`, async () => {
        const res = await fetch(`${BASE_URL}plant-supply/by-category?${query.toString()}`, {
            headers: { accept: "*/*" },
        });
        if (!res.ok) throw new Error(`Failed to fetch plant supply: ${res.statusText}`);
        return (await res.json()) as PlantSupplyApiResponse;
    }, sync);
    return { graph, from: from_date, to: to_date, days: transformDays(json, graph), changed };
}

// Week-ahead Supply Availability (one Monday–Sunday week).
export const fetchWeekPlantSupply = createAsyncThunk<RangeResult, RangeArgs>("supply/fetchWeekPlantSupply", loadRange);

// Month-ahead Supply Availability (one calendar month).
export const fetchMonthPlantSupply = createAsyncThunk<RangeResult, RangeArgs>("supply/fetchMonthPlantSupply", loadRange);

/** One API day → both graphs as 96-block arrays, keeping central / state; `null` when the day has
 *  no supply and no demand yet. */
function transformDetail(json: PlantSupplyApiResponse): SupplyDayDetail | null {
    return detailOfDay(json.data[0]);
}

/** One API day → both graphs with the central / state split; null when it has no data. */
function detailOfDay(day: PlantSupplyApiResponse["data"][number] | undefined): SupplyDayDetail | null {
    if (!day) return null;
    const r2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
    const demand = new Array(BLOCKS).fill(0);
    const cat = new Map<string, { name: string; group: "Central" | "State"; data: number[] }>();
    (day.category_graph ?? []).forEach((blk) => {
        const b = blk.block - 1;
        if (b < 0 || b >= BLOCKS) return;
        demand[b] = r2(blk.demand);
        const put = (group: "Central" | "State", name: string, v: number) => {
            const key = group + "|" + name;
            if (!cat.has(key)) cat.set(key, { name, group, data: new Array(BLOCKS).fill(0) });
            cat.get(key)!.data[b] = r2(v);
        };
        blk.central.forEach((c) => put("Central", c.category, c.sg));
        blk.state.forEach((c) => put("State", c.category, c.sg));
    });
    const tech = new Map<string, { name: string; central: number[]; state: number[]; data: number[] }>();
    (day.technology_graph ?? []).forEach((blk) => {
        const b = blk.block - 1;
        if (b < 0 || b >= BLOCKS) return;
        if (!demand[b]) demand[b] = r2(blk.demand);
        blk.data_list.forEach((t) => {
            if (!tech.has(t.technology)) tech.set(t.technology, { name: t.technology, central: new Array(BLOCKS).fill(0), state: new Array(BLOCKS).fill(0), data: new Array(BLOCKS).fill(0) });
            const row = tech.get(t.technology)!;
            row.central[b] = r2(t.central_sg); row.state[b] = r2(t.state_sg); row.data[b] = r2(t.sg);
        });
    });
    const category = [...cat.values()], technology = [...tech.values()];
    const empty = demand.every((v) => !v) && category.every((s) => s.data.every((v) => !v));
    return empty ? null : { date: day.date, demand, category, technology };
}

// Day-ahead Supply Availability: one date, both graphs (no `graph` = both). Not cached — always
// straight from the API.
export const fetchDayPlantSupply = createAsyncThunk<{ date: string; detail: SupplyDayDetail | null }, { date: string }>(
    "supply/fetchDayPlantSupply",
    async ({ date }) => {
        const query = new URLSearchParams({ from_date: date, to_date: date });
        const res = await fetch(`${BASE_URL}plant-supply/by-category?${query.toString()}`, {
            headers: { accept: "*/*" },
        });
        if (!res.ok) throw new Error(`Failed to fetch plant supply: ${res.statusText}`);
        const json: PlantSupplyApiResponse = await res.json();
        return { date, detail: transformDetail(json) };
    }
);

/** Block-by-block average of several days' detail: each series (and demand) is averaged over the
 *  days that have data; a series missing on a day counts as 0 that day. */
function averageDetails(days: SupplyDayDetail[], label: string): SupplyDayDetail | null {
    if (!days.length) return null;
    const n = days.length;
    const avg = (rows: number[][]) => Array.from({ length: BLOCKS }, (_, b) => Math.round((rows.reduce((s, r) => s + (r[b] ?? 0), 0) / n) * 100) / 100);
    const cat = new Map<string, { name: string; group: "Central" | "State"; rows: number[][] }>();
    const tech = new Map<string, { name: string; central: number[][]; state: number[][]; data: number[][] }>();
    for (const d of days) {
        for (const r of d.category) {
            const key = r.group + "|" + r.name;
            if (!cat.has(key)) cat.set(key, { name: r.name, group: r.group, rows: [] });
            cat.get(key)!.rows.push(r.data);
        }
        for (const r of d.technology) {
            if (!tech.has(r.name)) tech.set(r.name, { name: r.name, central: [], state: [], data: [] });
            const t = tech.get(r.name)!;
            t.central.push(r.central); t.state.push(r.state); t.data.push(r.data);
        }
    }
    return {
        date: label,
        demand: avg(days.map((d) => d.demand)),
        category: [...cat.values()].map((r) => ({ name: r.name, group: r.group, data: avg(r.rows) })),
        technology: [...tech.values()].map((r) => ({ name: r.name, central: avg(r.central), state: avg(r.state), data: avg(r.data) })),
    };
}

// Planning horizon Week / Month / Year ahead: plant-supply/by-category for the whole period (both
// graphs), averaged block by block into one "average day". Only the small average is cached in
// IndexedDB (a year of raw data is ~27 MB); `sync: true` re-calls the API.
export const fetchPeriodPlantSupply = createAsyncThunk<
    { from: string; to: string; days: number; detail: SupplyDayDetail | null; changed: boolean },
    { from_date: string; to_date: string; sync?: boolean }
>("supply/fetchPeriodPlantSupply", async ({ from_date, to_date, sync }) => {
    const { value, changed } = await cachedJson(`plant-supply-avg:${from_date}:${to_date}`, async () => {
        const query = new URLSearchParams({ from_date, to_date });
        const res = await fetch(`${BASE_URL}plant-supply/by-category?${query.toString()}`, {
            headers: { accept: "*/*" },
        });
        if (!res.ok) throw new Error(`Failed to fetch plant supply: ${res.statusText}`);
        const json: PlantSupplyApiResponse = await res.json();
        const days = (json.data ?? []).map(detailOfDay).filter((d): d is SupplyDayDetail => !!d);
        return { days: days.length, detail: averageDetails(days, `${from_date}:${to_date}`) };
    }, sync);
    return { from: from_date, to: to_date, ...value, changed };
});

// Planning horizon Day / Week / Month ahead: plant-supply/avg-supply for the period, one graph type
// (category or technology) — each group's 96 block averages and overall average, straight from the
// API (not cached). No location filter: the API's per-location averages are empty.
export const fetchAvgSupply = createAsyncThunk<AvgSupply, { from_date: string; to_date: string; group_by: SupplyGraph }>(
    "supply/fetchAvgSupply",
    async ({ from_date, to_date, group_by }) => {
        const query = new URLSearchParams({ from_date, to_date, group_by, include_blocks: "true" });
        const res = await fetch(`${BASE_URL}plant-supply/avg-supply?${query.toString()}`, {
            headers: { accept: "*/*" },
        });
        if (!res.ok) throw new Error(`Failed to fetch average supply: ${res.statusText}`);
        const json: AvgSupplyApiResponse = await res.json();
        const rows = group_by === "category"
            ? (json.category_avg ?? []).map((r) => ({ name: r.category, avg: r.avg_sg, blocks: r.blocks }))
            : (json.technology_avg ?? []).map((r) => ({ name: r.technology, avg: r.avg_sg, blocks: r.blocks }));
        const r2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
        return {
            from: from_date, to: to_date, groupBy: group_by, days: json.days ?? 0,
            series: rows.map((r) => ({ name: r.name, avg: r2(r.avg), data: Array.from({ length: BLOCKS }, (_, b) => r2(r.blocks?.[b])) })),
        };
    },
);

// avg-supply splits each group into central and state rows.
type AvgSupplyRow = { category?: string; technology?: string; avg_sg: number; blocks?: number[] };
type AvgSupplyResponse = { days: number; central?: AvgSupplyRow[]; state?: AvgSupplyRow[] };

// Planning horizon Week / Month ahead: plant-supply/avg-supply — the API's own 96-block average SG
// per category and per technology over the range, split central / state (no demand). Cached in
// IndexedDB; `sync: true` re-calls the API.
export const fetchPeriodAvgSupply = createAsyncThunk<
    { from: string; to: string; days: number; detail: SupplyDayDetail | null; changed: boolean },
    { from_date: string; to_date: string; sync?: boolean }
>("supply/fetchPeriodAvgSupply", async ({ from_date, to_date, sync }) => {
    const { value, changed } = await cachedJson(`avg-supply-cs:${from_date}:${to_date}`, async () => {
        const load = async (group_by: "category" | "technology") => {
            const query = new URLSearchParams({ from_date, to_date, group_by, include_blocks: "true" });
            const res = await fetch(`${BASE_URL}plant-supply/avg-supply?${query.toString()}`, { headers: { accept: "*/*" } });
            if (!res.ok) throw new Error(`Failed to fetch average supply: ${res.statusText}`);
            return (await res.json()) as AvgSupplyResponse;
        };
        const [cat, tech] = await Promise.all([load("category"), load("technology")]);
        const r2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
        const blocks = (b: number[] | undefined) => Array.from({ length: BLOCKS }, (_, i) => r2(b?.[i]));
        // Category: central rows first, then state.
        const category = [
            ...(cat.central ?? []).map((x) => ({ name: x.category ?? "", group: "Central" as const, data: blocks(x.blocks) })),
            ...(cat.state ?? []).map((x) => ({ name: x.category ?? "", group: "State" as const, data: blocks(x.blocks) })),
        ];
        // Technology: one row per technology with its central and state parts, data = their sum.
        const tmap = new Map<string, { name: string; central: number[]; state: number[]; data: number[] }>();
        const zero = () => new Array<number>(BLOCKS).fill(0);
        const techRow = (name: string) => tmap.get(name) ?? (tmap.set(name, { name, central: zero(), state: zero(), data: zero() }), tmap.get(name)!);
        for (const [side, rows] of [["central", tech.central ?? []], ["state", tech.state ?? []]] as const) {
            for (const x of rows) {
                const t = techRow(x.technology ?? ""), b = blocks(x.blocks);
                b.forEach((v, i) => { t[side][i] = v; t.data[i] = r2(t.data[i] + v); });
            }
        }
        const technology = [...tmap.values()];
        const empty = category.every((x) => x.data.every((v) => !v)) && technology.every((x) => x.data.every((v) => !v));
        return {
            days: cat.days ?? 0,
            detail: empty ? null : { date: `${from_date}:${to_date}`, demand: new Array(BLOCKS).fill(0), category, technology },
        };
    }, sync);
    return { from: from_date, to: to_date, ...value, changed };
});

export const supplySlice = createSlice({
    name: "supply",
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchWeekPlantSupply.pending, (state, action) => {
                state.weekRequestId = action.meta.requestId;
                // A Sync DB keeps the current charts on screen while it checks the API.
                if (!action.meta.arg.sync) state.weekLoading = true;
                state.weekError = null;
            })
            .addCase(fetchWeekPlantSupply.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.weekRequestId) return;
                state.weekLoading = false;
                const { graph, from, to, days } = action.payload;
                state.week = { graph, from, to, days };
            })
            .addCase(fetchWeekPlantSupply.rejected, (state, action) => {
                if (action.meta.requestId !== state.weekRequestId) return;
                state.weekLoading = false;
                state.weekError = action.error.message || "Failed to load plant supply";
            })
            .addCase(fetchMonthPlantSupply.pending, (state, action) => {
                state.monthRequestId = action.meta.requestId;
                if (!action.meta.arg.sync) state.monthLoading = true;
                state.monthError = null;
            })
            .addCase(fetchMonthPlantSupply.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.monthRequestId) return;
                state.monthLoading = false;
                const { graph, from, to, days } = action.payload;
                state.month = { graph, from, to, days };
            })
            .addCase(fetchMonthPlantSupply.rejected, (state, action) => {
                if (action.meta.requestId !== state.monthRequestId) return;
                state.monthLoading = false;
                state.monthError = action.error.message || "Failed to load plant supply";
            })
            .addCase(fetchAvgSupply.pending, (state, action) => {
                state.avgRequestId = action.meta.requestId;
                state.avgLoading = true;
                state.avgError = null;
            })
            .addCase(fetchAvgSupply.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.avgRequestId) return;
                state.avgLoading = false;
                state.avg = action.payload;
            })
            .addCase(fetchAvgSupply.rejected, (state, action) => {
                if (action.meta.requestId !== state.avgRequestId) return;
                state.avgLoading = false;
                state.avg = null;
                state.avgError = action.error.message || "Failed to load average supply";
            })
            .addCase(fetchPeriodAvgSupply.pending, (state, action) => {
                state.periodRequestId = action.meta.requestId;
                if (!action.meta.arg.sync) state.periodLoading = true;
                state.periodError = null;
            })
            .addCase(fetchPeriodAvgSupply.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.periodRequestId) return;
                state.periodLoading = false;
                const { from, to, days, detail } = action.payload;
                state.period = { from, to, days, detail };
            })
            .addCase(fetchPeriodAvgSupply.rejected, (state, action) => {
                if (action.meta.requestId !== state.periodRequestId) return;
                state.periodLoading = false;
                if (!action.meta.arg.sync) state.periodError = action.error.message || "Failed to load average supply";
            })
            .addCase(fetchPeriodPlantSupply.pending, (state, action) => {
                state.periodRequestId = action.meta.requestId;
                // A Sync keeps the current charts on screen while it checks the API.
                if (!action.meta.arg.sync) state.periodLoading = true;
                state.periodError = null;
            })
            .addCase(fetchPeriodPlantSupply.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.periodRequestId) return;
                state.periodLoading = false;
                const { from, to, days, detail } = action.payload;
                state.period = { from, to, days, detail };
            })
            .addCase(fetchPeriodPlantSupply.rejected, (state, action) => {
                if (action.meta.requestId !== state.periodRequestId) return;
                state.periodLoading = false;
                if (!action.meta.arg.sync) state.periodError = action.error.message || "Failed to load plant supply";
            })
            .addCase(fetchDayPlantSupply.pending, (state, action) => {
                state.dayRequestId = action.meta.requestId;
                state.dayLoading = true;
                state.dayError = null;
            })
            .addCase(fetchDayPlantSupply.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.dayRequestId) return;
                state.dayLoading = false;
                state.day = action.payload.detail;
                state.dayDate = action.payload.date;
            })
            .addCase(fetchDayPlantSupply.rejected, (state, action) => {
                if (action.meta.requestId !== state.dayRequestId) return;
                state.dayLoading = false;
                state.dayError = action.error.message || "Failed to load plant supply";
            });
    },
});

export default supplySlice.reducer;
