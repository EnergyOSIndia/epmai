import type { ModulePages } from "../types";
import { MarketIntelligenceOverview } from "./MarketIntelligenceOverview";
import { MarketIntelligenceRealTime, MarketIntelligenceRealTimeModule } from "./MarketIntelligenceRealTime";
import { MarketIntelligenceIntraDayModule } from "./MarketIntelligenceIntraDay";
import { MarketIntelligenceDayAhead, MarketIntelligenceDayAheadModule } from "./MarketIntelligenceDayAhead";
import { MarketIntelligenceWeekAhead, MarketIntelligenceWeekAheadModule } from "./MarketIntelligenceWeekAhead";
import { MarketIntelligenceMonthAhead, MarketIntelligenceMonthAheadModule } from "./MarketIntelligenceMonthAhead";
import { MarketIntelligenceYearAhead, MarketIntelligenceYearAheadModule } from "./MarketIntelligenceYearAhead";
import { MarketIntelligenceLongTerm, MarketIntelligenceLongTermModule } from "./MarketIntelligenceLongTerm";

/** Every Market Intelligence page: Overview plus one per horizon (Plan = Planning horizon, Module = All modules). */
export const MARKET_INTELLIGENCE_PAGES: ModulePages = {
  Overview: MarketIntelligenceOverview,
  horizons: {
    dr: { Plan: MarketIntelligenceRealTime, Module: MarketIntelligenceRealTimeModule },
    // Intra-day (Planning horizon): the same Market Detail page as Day-ahead.
    id: { Plan: MarketIntelligenceDayAhead, Module: MarketIntelligenceIntraDayModule },
    da: { Plan: MarketIntelligenceDayAhead, Module: MarketIntelligenceDayAheadModule },
    wk: { Plan: MarketIntelligenceWeekAhead, Module: MarketIntelligenceWeekAheadModule },
    mo: { Plan: MarketIntelligenceMonthAhead, Module: MarketIntelligenceMonthAheadModule },
    yr: { Plan: MarketIntelligenceYearAhead, Module: MarketIntelligenceYearAheadModule },
    lt: { Plan: MarketIntelligenceLongTerm, Module: MarketIntelligenceLongTermModule },
  },
};
