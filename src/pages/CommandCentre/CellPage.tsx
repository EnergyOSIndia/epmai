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
    // Year ahead shows the Planning-horizon Forecast page (the whole year on one screen).
    const Page = tf === "yr" ? MODULE_PAGES[mod].horizons[tf].Plan : MODULE_PAGES[mod].horizons[tf].Module;
    return <Page />;
  }

  // Demand Tune up fills the page on its own (no section header or footer links).
  if (isTuneupPanel) return <DemandTuneupPanel tf={tf} />;

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
            return (
              <Section title={activeSub.n} desc={activeSub.d}
                action={
                  <Link to="/modules/$moduleId" params={{ moduleId: mod }} search={{ m: tf }}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                    Open full module <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="num text-2xl font-semibold">{v.big}{v.u && <span className="ml-1 text-sm font-normal text-muted-foreground">{v.u}</span>}</span>
                  {v.tag && <Pill st={v.tag[1]}>{v.tag[0]}</Pill>}
                </div>
                {v.viz && <div className="mt-4 max-w-xl"><VizView v={v.viz} /></div>}
                {v.sub && <p className="mt-2 text-sm text-muted-foreground">{v.sub}</p>}
                {d && <div className="mt-5"><BlockView b={d} tf={tf} /></div>}
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
