import { useState } from "react";
import { PageHead } from "@/components/layout";
import { DemandCalendar } from "@/components/DemandCalendar";
import { EXCHANGES, MARKETS } from "../shared/HorizonControls";
import { MarketDetailPage } from "@/components/marketdetail/MarketDetailPage";

/** Market Intelligence · Year ahead — Planning-horizon view. */
function MarketIntelligenceYearAheadPage() {
  // Market / Exchange are placeholders: they don't change the data yet.
  const [market, setMarket] = useState(MARKETS[0]);
  const [exchange, setExchange] = useState(EXCHANGES[0]);
  return (
    <>
      <PageHead title={null} />
      <div className="mt-5">
        <DemandCalendar
          section="year" supplyFocus hideKpis
          extraControls={
          <>
            <div className="dc-seg" role="group" aria-label="Market">
              <label className="dc-note" style={{ margin: 0, padding: "0 8px", alignSelf: "center" }}>Market</label>
              <select aria-label="Market" value={market} onChange={(e) => setMarket(e.target.value)}>
                {MARKETS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="dc-seg" role="group" aria-label="Exchange">
              <label className="dc-note" style={{ margin: 0, padding: "0 8px", alignSelf: "center" }}>Exchange</label>
              <select aria-label="Exchange" value={exchange} onChange={(e) => setExchange(e.target.value)}>
                {EXCHANGES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </>
          }
        />
      </div>
    </>
  );
}

/** Planning horizon: the Day-ahead Market Detail page for the year's average day. */
export const MarketIntelligenceYearAhead = () => <MarketDetailPage kind="year" />;

/** All modules (and Command centre's own views) keep the year-ahead page as it was. */
export const MarketIntelligenceYearAheadModule = MarketIntelligenceYearAheadPage;
