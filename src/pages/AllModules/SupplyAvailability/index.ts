import type { ModulePages } from "../types";
import { SupplyAvailabilityOverview } from "./SupplyAvailabilityOverview";
import { SupplyAvailabilityRealTimeModule } from "./SupplyAvailabilityRealTime";
import { SupplyAvailabilityIntraDayModule } from "./SupplyAvailabilityIntraDay";
import { SupplyAvailabilityDayAhead, SupplyAvailabilityDayAheadModule, SupplyAvailabilityIntraDayPlan, SupplyAvailabilityRealTimePlan } from "./SupplyAvailabilityDayAhead";
import { SupplyAvailabilityWeekAhead, SupplyAvailabilityWeekAheadModule } from "./SupplyAvailabilityWeekAhead";
import { SupplyAvailabilityMonthAhead, SupplyAvailabilityMonthAheadModule } from "./SupplyAvailabilityMonthAhead";
import { SupplyAvailabilityYearAhead, SupplyAvailabilityYearAheadModule } from "./SupplyAvailabilityYearAhead";
import { SupplyAvailabilityLongTerm, SupplyAvailabilityLongTermModule } from "./SupplyAvailabilityLongTerm";

/** Every Supply Availability page: Overview plus one per horizon (Plan = Planning horizon, Module = All modules). */
export const SUPPLY_AVAILABILITY_PAGES: ModulePages = {
  Overview: SupplyAvailabilityOverview,
  horizons: {
    // Planning horizon Real-time / Intra-day: the Day-ahead page (today up to the current block /
    // yesterday–tomorrow). All modules keeps its own pages.
    dr: { Plan: SupplyAvailabilityRealTimePlan, Module: SupplyAvailabilityRealTimeModule },
    id: { Plan: SupplyAvailabilityIntraDayPlan, Module: SupplyAvailabilityIntraDayModule },
    da: { Plan: SupplyAvailabilityDayAhead, Module: SupplyAvailabilityDayAheadModule },
    wk: { Plan: SupplyAvailabilityWeekAhead, Module: SupplyAvailabilityWeekAheadModule },
    mo: { Plan: SupplyAvailabilityMonthAhead, Module: SupplyAvailabilityMonthAheadModule },
    yr: { Plan: SupplyAvailabilityYearAhead, Module: SupplyAvailabilityYearAheadModule },
    lt: { Plan: SupplyAvailabilityLongTerm, Module: SupplyAvailabilityLongTermModule },
  },
};
