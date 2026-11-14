import { createElement } from "react";
import type { ModulePages } from "../types";
import { DemandPeriodForecast } from "@/components/dayahead/DemandPeriodForecast";
import { DemandOverview } from "./DemandOverview";
import { DemandRealTimeModule } from "./DemandRealTime";
import { DemandIntraDayModule } from "./DemandIntraDay";
import { DemandDayAhead, DemandDayAheadModule } from "./DemandDayAhead";
import { DemandWeekAhead, DemandWeekAheadModule } from "./DemandWeekAhead";
import { DemandMonthAhead, DemandMonthAheadModule } from "./DemandMonthAhead";
import { DemandYearAhead, DemandYearAheadModule } from "./DemandYearAhead";
import { DemandLongTerm, DemandLongTermModule } from "./DemandLongTerm";

/** Every Demand page: Overview plus one per horizon (Plan = Planning horizon, Module = All modules). */
export const DEMAND_PAGES: ModulePages = {
  Overview: DemandOverview,
  horizons: {
    // Planning horizon Real-time / Intra-day: the Day-ahead Forecast page (today up to the current
    // block / yesterday–tomorrow). All modules keeps its own pages.
    dr: { Plan: () => createElement(DemandPeriodForecast, { kind: "realtime" }), Module: DemandRealTimeModule },
    id: { Plan: () => createElement(DemandPeriodForecast, { kind: "intraday" }), Module: DemandIntraDayModule },
    da: { Plan: DemandDayAhead, Module: DemandDayAheadModule },
    wk: { Plan: DemandWeekAhead, Module: DemandWeekAheadModule },
    mo: { Plan: DemandMonthAhead, Module: DemandMonthAheadModule },
    yr: { Plan: DemandYearAhead, Module: DemandYearAheadModule },
    lt: { Plan: DemandLongTerm, Module: DemandLongTermModule },
  },
};
