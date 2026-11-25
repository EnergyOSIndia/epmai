import { Link, useParams } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { CAD, isMod, modName, tfIdx, tfName } from "@/data/engine";
import { G, statusText } from "@/data/model";
import { SUBS, det } from "@/data/insights";
import { Chart, Legend } from "@/components/chart/Chart";
import { DemandTuneupPanel } from "@/components/DemandTuneupPanel";
import { BlockView, VizView } from "@/components/blocks";
import { Kpis } from "@/components/Kpis";
import { PageHead, Section } from "@/components/layout";
import { Pill } from "@/components/status";
import { keepH, useCellTab, useModuleTf } from "@/lib/horizon";
import { usePanels } from "@/lib/panels";
import { chartTitle } from "@/pages/AllModules/shared/ModuleSections";
import { NotFoundPage } from "@/pages/NotFound/NotFoundPage";
import { ReportLibrary } from "@/components/ReportLibrary";
import { MODULE_PAGES } from "@/pages/AllModules";
import { MarketOverviewChart, isMiTf } from "@/components/marketdetail/MarketOverviewChart";
import { ZoneDemandForecast, type ZoneKind } from "@/components/dayahead/ZoneDemandForecast";
import { OptMethodSelector } from "@/components/OptMethodSelector";
import { useOptimization } from "@/hooks/useOptimization";
import { PlantDCvsSG } from "@/components/PlantDCvsSG";
import type { TfId } from "@/data/engine";

/** One grid cell (a single module at a single horizon) opened on its own page. The view — Overview
 *  (the blown-up chart) or one of the module's detail metrics — is picked from the header strip (?t). */
export function CellPage() {
  const { moduleId } = useParams({ strict: false }) as { moduleId?: string };
  const { tf } = useModuleTf();
  const { tab } = useCellTab();
  const { openDrill } = usePanels();
  if (!isMod(moduleId)) return <NotFoundPage />;
  const mod = moduleId, g = G(mod, tf), s = g.sum, ti = tfIdx(tf);
  const subs = SUBS[mod];
  const activeSub = subs.find((S) => S.id === tab);

  const isDashboard = mod === "demand" && activeSub?.id === "acc";

  const isTuneupPanel = mod === "demand" && activeSub?.id === "tuneup";

  // Demand's "Demand Forecast" (acc) cell view is the same full dashboard as the Planning
  // horizon for this horizon — rendered bare (no PageHead/Section/footer), exactly like /horizon.
  if (isDashboard) {
    // The All-modules page: Week / Month ahead keep their grid / calendar here (Day ahead is the same);
    // Year ahead its average-demand-per-date heatmap and daily distribution. Intra-day shows the
    // Planning-horizon Intra-day Forecast page (the same page as there).
    const Page = tf === "id" ? MODULE_PAGES[mod].horizons[tf].Plan : MODULE_PAGES[mod].horizons[tf].Module;
    return <Page />;
  }

  // Demand → Zone-wise demand at Intra-day / Day / Week / Month ahead: the Demand Forecast layout for
  // the three zones (EZ, WZ, CZ) on one chart, with zone weather — rendered bare, full window.
  const ZONE_KIND: Partial<Record<string, ZoneKind>> = { id: "intraday", da: "day", wk: "week", mo: "month" };
  if (mod === "demand" && tab === "zone" && ZONE_KIND[tf]) return <ZoneDemandForecast key={tf} kind={ZONE_KIND[tf]!} />;

  // Supply Availability → Supply Bifurcation: the All-modules page for this horizon (Day ahead's
  // date page, Week / Month ahead's Graph Type grids, Year ahead's calendar), rendered bare.
  // Day ahead and Intra-day show the Planning-horizon Supply page instead (the same page as there).
  if (mod === "supply" && tab === "bifurcation") {
    const Page = tf === "da" || tf === "id" ? MODULE_PAGES[mod].horizons[tf].Plan : MODULE_PAGES[mod].horizons[tf].Module;
    return <Page />;
  }

  // Market Intelligence → Market Detail: Week / Month ahead show the All-modules week grid / month
  // calendar (a chart per day); the other horizons the Planning-horizon page (Day ahead's Market
  // Detail, the year's average day), rendered bare.
  if (mod === "mi" && tab === "marketdetail") {
    const Page = tf === "wk" || tf === "mo" ? MODULE_PAGES[mod].horizons[tf].Module : MODULE_PAGES[mod].horizons[tf].Plan;
    return <Page />;
  }

  // Market Intelligence Overview at Intra-day / Day / Week / Month ahead: only one market chart (market
  // and exchange picked above it) filling the window: today, or the current week's / month's average day.
  if (mod === "mi" && !activeSub && isMiTf(tf)) return <MarketOverviewChart key={tf} tf={tf} />;

  // Demand Tune up fills the page on its own (no section header or footer links).
  if (isTuneupPanel) return <DemandTuneupPanel key={tf} tf={tf} />;

  return (
    <>
      {!isTuneupPanel && (
        <PageHead
          crumb={<><Link to="/" search={keepH} className="hover:text-foreground hover:underline">Command centre</Link> / Cell</>}
          title={<>{modName(mod, tf)} <span className="font-normal text-muted-foreground">· {tfName(tf)}</span></>}
          after={<Pill st={s.st}>{statusText[s.st]}</Pill>}
        >
          <dl className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-[13px]">
            <div className="flex gap-1.5"><dt className="text-muted-foreground">Headline</dt><dd className="num">{s.big} {s.u}</dd></div>
            <div className="flex gap-1.5"><dt className="text-muted-foreground">Refresh</dt><dd>{CAD[mod][ti]}</dd></div>
          </dl>
        </PageHead>
      )}

      <div className={isTuneupPanel ? "" : "mt-6"}>
        {activeSub ? (
          /* one of the module's detail metrics */
          (() => {
            if (isTuneupPanel) {
              // The tuneup panel carries its own date control (bounded by the API's date range),
              // so no dummy header nav here.
              return (
                <Section title={activeSub.n} desc={activeSub.d}>
                  <DemandTuneupPanel tf={tf} />
                </Section>
              );
            }
            const v = activeSub.f(tf), d = det(mod, tf, activeSub.id);
            // Optimization module: the solver switch plus the real optimization API data (OptApiPanel)
            // in place of the sample detail block.
            const isOpt = mod === "opt";
            return (
              <Section title={activeSub.n} desc={activeSub.d}
                action={
                  <div className="flex items-center gap-4">
                    {isOpt && <OptMethodSelector compact />}
                    <Link to="/modules/$moduleId" params={{ moduleId: mod }} search={{ m: tf }}
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                      Open full module <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                }>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="num text-2xl font-semibold">{v.big}{v.u && <span className="ml-1 text-sm font-normal text-muted-foreground">{v.u}</span>}</span>
                  {v.tag && <Pill st={v.tag[1]}>{v.tag[0]}</Pill>}
                </div>
                {v.viz && <div className="mt-4 max-w-xl"><VizView v={v.viz} /></div>}
                {v.sub && <p className="mt-2 text-sm text-muted-foreground">{v.sub}</p>}
                {isOpt && <OptApiPanel subId={activeSub.id} tf={tf} />}
                {d && !isOpt && <div className="mt-5"><BlockView b={d} tf={tf} /></div>}
              </Section>
            );
          })()
        ) : mod === "reports" ? (
          <ReportLibrary tf={tf} />
        ) : (
          /* Overview — the blown-up chart */
          <Section title={chartTitle(mod, tf) || modName(mod, tf)} desc={s.sub}
            action={
              <Link to="/modules/$moduleId" params={{ moduleId: mod }} search={{ m: tf }}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                Open full module <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }>
            {g.kpis && <Kpis className="mb-4" items={g.kpis.slice(0, 6)} />}
            {g.chart ? (
              <>
                <Legend spec={g.chart} />
                <div className="mt-3"><Chart spec={g.chart} height={360} onPick={(i) => openDrill(mod, tf, i)} /></div>
                <p className="mt-3 text-xs text-muted-foreground">Click any point for its full period breakdown.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{s.sub}</p>
            )}
          </Section>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <Link to="/modules/$moduleId" params={{ moduleId: mod }} search={{ m: tf }}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Open full module <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link to="/modules/$moduleId/row" params={{ moduleId: mod }} search={{ m: tf }}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            See this module across every horizon <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </>
  );
}

/** Optimization tabs (Merit-order, Market position, Savings): real optimization API data — the
 *  chosen solver's run for this horizon (see data/optimizationApi) — in place of the sample data. */
function OptApiPanel({ subId, tf = "da" }: { subId: string; tf?: TfId }) {
  const { api, loading, error, method } = useOptimization(tf);

  if (loading) return <div className="mt-4 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Loading real optimization data ({method})…</div>;
  if (error) return <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">API: {error}</div>;
  if (!api) return null;

  // Merit-order tab
  if (subId === "mo") {
    const plants = [...api.plants].sort((a, b) => a.rate_rs_mwh - b.rate_rs_mwh);
    const on = plants.filter(p => p.scheduled_mw > 1).length;
    const mg = [...plants].reverse().find(p => p.scheduled_mw > 1 && !p.must_run);
    return (
      <div className="mt-6 rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold">{on}/{plants.length}</span>
            <span className="ml-1 text-sm text-muted-foreground">plants on</span>
            <span className="ml-3 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{api.method}</span>
            <span className="ml-2 text-xs text-muted-foreground">{api.runtime_s}s · {api.date}</span>
          </div>
          {mg && <span className="text-xs text-muted-foreground">Marginal: {mg.name} ₹{mg.rate_rs_mwh.toLocaleString("en-IN")}</span>}
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {plants.map((p, i) => (
            <div key={i} className="h-4 w-4 rounded-sm" style={{ background: p.scheduled_mw > 1 ? "hsl(var(--primary))" : "hsl(var(--muted))" }} title={p.name} />
          ))}
        </div>
        {/* Graphs first (each plant's DC vs optimized SG), then the dispatch table. */}
        <PlantDCvsSG tf={tf} />
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground">
            <th className="px-2 py-2 text-left">Plant</th>
            <th className="px-2 py-2 text-right">VC ₹/MWh</th>
            <th className="px-2 py-2 text-right">DC (MW)</th>
            <th className="px-2 py-2 text-right">Scheduled (MW)</th>
            <th className="px-2 py-2 text-right">Status</th>
          </tr></thead>
          <tbody>{plants.map((p, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="px-2 py-1.5 font-medium">{p.name}</td>
              <td className="px-2 py-1.5 text-right">{p.rate_rs_mwh.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
              <td className="px-2 py-1.5 text-right">{Math.round(p.dc_avg_mw).toLocaleString("en-IN")}</td>
              <td className="px-2 py-1.5 text-right">{Math.round(p.scheduled_mw).toLocaleString("en-IN")}</td>
              <td className="px-2 py-1.5 text-right">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${p.decision === "Full" ? "bg-ok-soft text-ok" : p.decision === "OFF" ? "bg-muted text-muted-foreground" : "bg-warn-soft text-warn"}`}>{p.decision}</span>
              </td>
            </tr>
          ))}</tbody>
        </table>
        {api.saving_rs > 0 && <div className="mt-3 text-sm font-semibold text-ok">Saving: ₹{api.saving_lakh.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakh</div>}
      </div>
    );
  }

  // Market position tab
  if (subId === "mkt") {
    const maxV = Math.max(...api.buy, ...api.sell, 1);
    return (
      <div className="mt-6 rounded-lg border bg-card p-4">
        <div className="mb-3 flex gap-6">
          <div><span className="text-2xl font-bold">{api.buy_mu}</span><span className="ml-1 text-sm text-muted-foreground">MU buy</span></div>
          <div><span className="text-2xl font-bold">{api.sell_mu}</span><span className="ml-1 text-sm text-muted-foreground">MU sell</span></div>
          <span className="self-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{api.method} · {api.date}</span>
        </div>
        <div className="flex h-40 items-end gap-px">
          {api.gap.map((g, i) => (
            <div key={i} title={`Block ${(api.start_block ?? 1) + i}: ${g < 0 ? "Buy" : "Sell"} ${Math.abs(Math.round(g))} MW`}
              className="flex-1 self-end rounded-t-sm" style={{ height: Math.max(1, Math.abs(g) / maxV * 140), background: g < 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))", opacity: 0.7 }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      </div>
    );
  }

  // Savings tab
  if (subId === "sav") {
    const top = [...api.plants].filter(p => p.saving_rs > 0).sort((a, b) => b.saving_rs - a.saving_rs).slice(0, 8);
    return (
      <div className="mt-6 rounded-lg border bg-card p-4">
        <div className="text-3xl font-bold text-ok">₹{api.saving_lakh.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakh</div>
        <div className="mt-1 text-sm text-muted-foreground">Baseline ₹{(api.baseline_cost_rs / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L → Optimized ₹{(api.optimized_cost_rs / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L</div>
        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{api.method} · {api.runtime_s}s · {api.date}</span>
        {top.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 text-left">Plant</th>
              <th className="py-2 text-right">Curtailed (MWh)</th>
              <th className="py-2 text-right">Saving (₹ Lakh)</th>
            </tr></thead>
            <tbody>{top.map((p, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5">{p.name}</td>
                <td className="py-1.5 text-right">{p.curtailed_mwh.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</td>
                <td className="py-1.5 text-right font-medium text-ok">₹{(p.saving_rs / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    );
  }

  return null;
}
