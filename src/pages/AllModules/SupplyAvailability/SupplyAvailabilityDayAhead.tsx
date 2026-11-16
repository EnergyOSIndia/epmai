import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BlockSelect, DayNavigator } from "@/components/weeksupply/DayControls";
import { DaySupplyChartCard } from "@/components/weeksupply/DaySupplyChartCard";
// Variable Cost and Plants rows are commented out below until their APIs exist.
// import { PlantTable, VcTable } from "@/components/weeksupply/SupplyTables";
import { CategoryTable, TableCard, TechnologyTable } from "@/components/weeksupply/SupplyTables";
import { currentBlock, fromApiDay, isIsoDate, isoOf, parseIso, todayIso } from "@/components/weeksupply/weekSupplyData";
// import { mockDay } from "@/components/weeksupply/weekSupplyData";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchDayPlantSupply } from "@/store/slice/supplyApiSlice";

/** DaySupplyPage: one date's supply as chart + table rows — Category and Technology (Variable
 *  Cost and Plants are commented out until their APIs exist) — with a date navigator and a time-block picker for the tables. Category and
 *  Technology come straight from plant-supply/by-category (not cached); Variable Cost and Plants are
 *  still mock data. Opens on today; goes forward up to tomorrow and back as far as the API has data.
 *  The date lives in the URL (?date=2026-10-28).
 *  Modes (Planning horizon): "day" (Day-ahead, above); "intraday" — yesterday, today or tomorrow,
 *  today by default; "realtime" — today up to the current block (charts stop there, the block picker
 *  goes up to it and starts on it), following the clock. */
function DaySupplyPage({ mode = "day" }: { mode?: "day" | "intraday" | "realtime" }) {
  const dispatch = useAppDispatch();
  const { day: detail, dayDate, dayLoading, dayError } = useAppSelector((state) => state.supply);
  const search = useSearch({ strict: false }) as { date?: string };
  const navigate = useNavigate();

  const today = todayIso();
  const tomorrow = useMemo(() => { const d = parseIso(today); d.setDate(d.getDate() + 1); return isoOf(d); }, [today]);
  const yesterday = useMemo(() => { const d = parseIso(today); d.setDate(d.getDate() - 1); return isoOf(d); }, [today]);
  // Day ahead: opens on tomorrow, forward up to today + 7. Intra-day: up to tomorrow, today by default.
  const lastDay = useMemo(() => { const d = parseIso(today); d.setDate(d.getDate() + (mode === "day" ? 7 : 1)); return isoOf(d); }, [today, mode]);
  const asked = isIsoDate(search.date) ? (search.date > lastDay ? lastDay : search.date) : mode === "day" ? tomorrow : today;
  const date = mode === "realtime" ? today : mode === "intraday" && asked < yesterday ? yesterday : asked;
  const setDate = (iso: string) =>
    navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, date: iso }), replace: true });

  useEffect(() => { dispatch(fetchDayPlantSupply({ date })); }, [dispatch, date]);

  // The current block ticks forward on its own (checked every 30 s); the tables follow the
  // picked block, which starts at the current one.
  const [nowBlock, setNowBlock] = useState(currentBlock);
  useEffect(() => {
    const id = window.setInterval(() => setNowBlock(currentBlock()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [block, setBlock] = useState(currentBlock);
  // Real-time: nothing after the current block.
  const upTo = mode === "realtime" ? nowBlock : undefined;
  const shownBlock = upTo != null && block > upTo ? upTo : block;

  const ready = dayDate === date && !dayLoading;
  const loading = !ready && !dayError;
  const api = ready ? detail : null;

  // API series with a value anywhere in the day, in API order (central then state for Category).
  const catNames = useMemo(() => (api ? api.category.filter((s) => s.data.some((v) => v)).map((s) => s.name) : []), [api]);
  const techNames = useMemo(() => (api ? api.technology.filter((s) => s.data.some((v) => v)).map((s) => s.name) : []), [api]);
  const catDay = useMemo(() => (api ? fromApiDay({ date, series: api.category, demand: api.demand }, catNames) : null), [api, date, catNames]);
  const techDay = useMemo(() => (api ? fromApiDay({ date, series: api.technology, demand: api.demand }, techNames) : null), [api, date, techNames]);
  // No Variable Cost / Plants API yet — their mock rows are commented out.
  // const vcDay = useMemo(() => mockDay(date, "vc"), [date]);
  // const plantDay = useMemo(() => mockDay(date, "plants"), [date]);

  const common = { isToday: date === today, isPast: date < today, currentBlock: nowBlock, upTo };

  // Four rows: each graph type's chart with its table beside it.
  const rows = [
    {
      chart: <DaySupplyChartCard title="Supply by Category" type="category" day={catDay} names={catNames} isLoading={loading} {...common} />,
      table: <TableCard title="Category Wise Distribution">{loading ? <TableSkeleton /> : <CategoryTable detail={api} block={shownBlock} />}</TableCard>,
    },
    {
      chart: <DaySupplyChartCard title="Supply by Technology" type="technology" day={techDay} names={techNames} isLoading={loading} {...common} />,
      table: <TableCard title="Technology Wise Distribution">{loading ? <TableSkeleton /> : <TechnologyTable detail={api} block={shownBlock} />}</TableCard>,
    },
    // Variable Cost and Plants: no API yet, so these rows are off for now.
    // {
    //   chart: <DaySupplyChartCard title="Supply by Variable Cost" type="vc" day={vcDay} isLoading={false} {...common} />,
    //   table: <TableCard title="Variable Cost (VC) Distribution"><VcTable day={vcDay} block={block} /></TableCard>,
    // },
    // {
    //   chart: <DaySupplyChartCard title="Plant-wise SG & Cumulative vs Demand" type="plants" day={plantDay} isLoading={false} {...common} />,
    //   table: <TableCard title="Plant Generation"><PlantTable day={plantDay} /></TableCard>,
    // },
  ];

  return (
    <div className="space-y-3 rounded-[10px] border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === "realtime"
          ? <span className="inline-flex h-8 items-center rounded-[10px] border bg-card px-3 text-[12px] font-semibold">Today · Real time</span>
          : <DayNavigator date={date} onChange={setDate} canNext={date < lastDay} canPrev={mode !== "intraday" || date > yesterday} />}
        <BlockSelect block={shownBlock} onChange={setBlock} max={upTo} />
      </div>
      {dayError && <p className="text-[12px] text-destructive">{dayError}</p>}
      {rows.map((r, i) => (
        // Each row is a fixed height the chart and table both fill; on narrow screens they stack.
        <div key={i} className="grid gap-3 lg:h-[440px] lg:grid-cols-[minmax(0,2.7fr)_minmax(0,1fr)] max-lg:grid-rows-[420px_minmax(320px,auto)]">
          {r.chart}
          {r.table}
        </div>
      ))}
    </div>
  );
}

const TableSkeleton = () => (
  <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-7 animate-pulse rounded bg-muted" />)}</div>
);

/** Supply Availability · Day-ahead — Planning horizon: the Day-ahead page (Category and Technology
 *  rows, each with its table). Command centre → Supply Bifurcation shows the same page. */
export const SupplyAvailabilityDayAhead = DaySupplyPage;

/** All modules shows the same view as the Planning horizon. */
export const SupplyAvailabilityDayAheadModule = SupplyAvailabilityDayAhead;

/** Planning horizon Real-time / Intra-day: the Day-ahead page for today up to the current block /
 *  for yesterday, today or tomorrow. */
export const SupplyAvailabilityRealTimePlan = () => <DaySupplyPage mode="realtime" />;
export const SupplyAvailabilityIntraDayPlan = () => <DaySupplyPage mode="intraday" />;
