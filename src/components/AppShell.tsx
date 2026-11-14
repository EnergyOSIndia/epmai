import { useState } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { BookOpen, FileText, Globe, Home } from "lucide-react";
import { Toaster } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PanelProvider } from "@/lib/panels";
import { keepH } from "@/lib/horizon";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/ThemeProvider";
import { CellTabStrip } from "./CellTabStrip";
import { DetailsNav } from "./DetailsNav";
import { Clock } from "./Clock";
import { HorizonNav } from "./HorizonNav";
import { HorizonStrip } from "./HorizonStrip";
import { ModuleRuler } from "./ModuleRuler";
import { ModuleNav } from "./ModuleNav";
import { SidePanel } from "./SidePanel";
import { ThemeMenu } from "./ThemeMenu";

const navCls = "rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
const navActive = { className: "!bg-accent !text-foreground font-semibold" };

const dockCls = "grid h-10 w-10 place-items-center rounded-full border bg-card text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground";
const dockActive = { className: "!border-primary !bg-primary !text-primary-foreground" };

// Mirror useModuleTf's localStorage fallback so the full-width check matches what the page renders.
const readLocalTf = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

export function AppShell() {
  const [discom, setDiscom] = useState("north");
  const { palette, mode } = useTheme();
  const location = useLocation();
  const { pathname } = location;
  const toastTheme = palette === "tech" ? "dark" : mode === "system" ? "system" : mode;
  const isCommand = pathname === "/";
  const isHorizon = pathname === "/horizon";
  const isModulesIndex = pathname === "/modules";
  const isOverview = pathname === "/overview";
  // The Overview page, the all-modules gallery (/modules), a single module's page (/modules/X)
  // and its complete-row view (/modules/X/row) all carry the time-horizon strip, which leads with
  // the Overview tab — scoped to the open module on the module/row pages.
  const showHorizonStrip = isOverview || isModulesIndex || pathname.startsWith("/modules/");
  const isCell = pathname.startsWith("/cell/");
  // Demand's "Demand Tune up" cell page drops its title/KPI row for a full-bleed
  // 96-block chart + tuneup panel — same page at every horizon — same reasoning as
  // the horizon pages above.
  const cellMod = isCell ? pathname.split("/")[2] : null;
  const cellTab = (location.search as { t?: string }).t;
  const isCellTuneup = isCell && cellMod === "demand" && cellTab === "tuneup";
  // Demand's "Forecast accuracy" cell page gets the same full-bleed dummy-dashboard
  // treatment — same page at every horizon.
  const isCellForecastAcc = isCell && cellMod === "demand" && cellTab === "acc";
  // Supply's "Supply Bifurcation" cell view (the grids / calendar) uses the full window too.
  const isCellSupplyBifurcation = isCell && ((cellMod === "supply" && cellTab === "bifurcation") || (cellMod === "mi" && cellTab === "marketdetail"));
  // Market Intelligence's Overview cell view at Day-ahead / Intra-day: just the one market chart, full window.
  const cellTf = isCell ? (location.search as { m?: string }).m ?? readLocalTf("epm.m") : null;
  const isCellMiOverview = isCell && cellMod === "mi" && (!cellTab || cellTab === "overview") && (cellTf === "da" || cellTf === "id");
  // The Planning-horizon page at Month ahead is the UP DC demand calendar, which wants the full window.
  // All modules → a module's horizon page (/modules/X?m=) shows the same view as the Planning
  // horizon, so it follows the same width rules, read from its own module and horizon.
  const moduleSeg = pathname.startsWith("/modules/") && !pathname.endsWith("/row") ? pathname.split("/")[2] : null;
  const isModulePage = !!moduleSeg;
  const planTf = isModulePage
    ? (location.search as { m?: string }).m ?? readLocalTf("epm.m")
    : (location.search as { h?: string }).h ?? readLocalTf("epm.h");
  const planMod = isModulePage ? moduleSeg : (location.search as { mod?: string }).mod ?? readLocalTf("epm.mod") ?? "overview";
  const monthCalMod = planMod === "overview" || planMod === "demand" || planMod === "supply" || planMod === "opt" || planMod === "mi";
  // Week ahead for Supply/Demand renders the same small-multiples day grid as Month ahead,
  // so it claims the full window too.
  const weekGridMod = planMod === "supply" || planMod === "demand" || planMod === "mi";
  // Day ahead for Supply/Demand drops its title/KPI row for a day-badge control row (Market
  // Intelligence's is the full-window Market Detail page),
  // same reasoning as Week ahead above.
  const dayGridMod = planMod === "supply" || planMod === "demand" || planMod === "mi";
  const isHorizonCalendar = (pathname === "/horizon" || isModulePage) &&
    ((planTf === "mo" && monthCalMod) || (planTf === "yr" && (planMod === "overview" || planMod === "demand" || planMod === "supply" || planMod === "mi")) || (planTf === "wk" && weekGridMod) || (planTf === "da" && dayGridMod)) ||
    // Planning horizon Real-time / Intra-day Demand and Supply (and Intra-day Market Intelligence)
    // are the Day-ahead page too.
    (pathname === "/horizon" && (planTf === "dr" || planTf === "id") && (planMod === "demand" || planMod === "supply")) ||
    (pathname === "/horizon" && planTf === "id" && planMod === "mi");
  // The Long-term horizon lays out the full-screen load-profile / box-plot grids and the wide
  // analytics view, so it claims the full window too.
  const isHorizonLongTerm = (pathname === "/horizon" || isModulePage) && planTf === "lt";
  // Pages that lay out every module or every horizon use the full window; focused pages stay capped.
  const fullWidth = isCommand || isModulesIndex || pathname === "/snapshot" || pathname.endsWith("/row") || isHorizonCalendar || isHorizonLongTerm || isCellTuneup || isCellForecastAcc || isCellSupplyBifurcation || isCellMiOverview;

  return (
    <TooltipProvider delayDuration={150}>
      <PanelProvider>
        <div className="min-h-full">
          <header className="sticky z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85" style={{ top: "env(safe-area-inset-top, 0px)" }}>
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 pt-2.5 lg:px-8">
              {/* Same size as with the old tagline line, so the header layout doesn't shift. */}
              <Link to="/" search={keepH} className="shrink-0 leading-none sm:min-h-[38px] sm:min-w-[131px]">
                <span className="condensed block text-lg font-bold tracking-tight">EPM AI</span>
              </Link>

              <nav className="flex flex-wrap items-center gap-1.5" aria-label="Main">
                {/* Command centre (home) as an icon; the EPM AI logo also goes here. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link to="/" search={keepH} aria-label="Home" className={cn(navCls, "grid place-items-center px-2")} activeProps={navActive} activeOptions={{ exact: true, includeSearch: false }}>
                      <Home className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Home</TooltipContent>
                </Tooltip>
                <HorizonNav />
                <ModuleNav />
                <DetailsNav />
              </nav>

              <span className="flex-1" />

              <span className="hidden rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn sm:inline">Sample data</span>
              <Clock />

              <Select value={discom} onValueChange={setDiscom}>
                <SelectTrigger aria-label="Discom" className="h-8 w-[172px] gap-1.5 text-[13px]">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="north">Sample Discom (North)</SelectItem>
                  <SelectItem value="south">Sample Discom (South)</SelectItem>
                </SelectContent>
              </Select>

              <ThemeMenu />
            </div>

            {/* module selector, only on the all-horizons page */}
            {isHorizon && (
              <div className="border-t bg-muted/20 px-4 pt-2 lg:px-8">
                <ModuleRuler />
              </div>
            )}

            {/* time-horizon strip, on the all-modules gallery and a single module's page */}
            {showHorizonStrip && (
              <div className="border-t bg-muted/20 px-4 pt-2 lg:px-8">
                <HorizonStrip />
              </div>
            )}

            {/* cell view strip (Overview + each detail metric) */}
            {isCell && (
              <div className="border-t bg-muted/20 px-4 pt-2 lg:px-8">
                <CellTabStrip />
              </div>
            )}
          </header>

          {/* The Command centre fits the window (its grid grows to the bottom edge), so it drops the tall
              bottom padding the other pages keep. */}
          <main className={cn("mx-auto px-4 pt-6 lg:px-8", isCommand ? "pb-3" : "pb-20", fullWidth ? "max-w-none" : "max-w-[1400px]")}>
            <Outlet />
          </main>
        </div>

        {/* bottom-right dock: library & guide as icons with tooltips */}
        <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/reports" search={keepH} aria-label="Report library" className={dockCls} activeProps={dockActive} activeOptions={{ includeSearch: false }}>
                <FileText className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="left">Report library</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/glossary" search={keepH} aria-label="Glossary & guide" className={dockCls} activeProps={dockActive} activeOptions={{ includeSearch: false }}>
                <BookOpen className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="left">Glossary &amp; guide</TooltipContent>
          </Tooltip>
        </div>

        <SidePanel />
        <Toaster position="bottom-right" theme={toastTheme} richColors closeButton />
      </PanelProvider>
    </TooltipProvider>
  );
}
