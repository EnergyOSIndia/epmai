import { PageHead } from "@/components/layout";
import { DemandCalendar } from "@/components/DemandCalendar";
import { SupplyPeriodPage } from "@/components/weeksupply/SupplyPeriodPage";

/** Supply Availability · Year ahead — the year calendar. */
function SupplyYearCalendar() {
  return (
    <>
      <PageHead title={null} />
      <div className="mt-5">
        <DemandCalendar
          section="year" supplyFocus hideKpis
        />
      </div>
    </>
  );
}

/** Planning horizon: the Day-ahead page for the calendar year's average day (see SupplyPeriodPage). */
export const SupplyAvailabilityYearAhead = () => <SupplyPeriodPage kind="year" />;

/** All modules (and Command centre) keep the year calendar. */
export const SupplyAvailabilityYearAheadModule = SupplyYearCalendar;
