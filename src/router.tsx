import { createBrowserHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { isMod, isTf, type ModId, type TfId } from "@/data/engine";
import { AppShell } from "@/components/AppShell";
import { OverviewPage } from "@/pages/Overview/OverviewPage";
import { CommandCentrePage } from "@/pages/CommandCentre/CommandCentrePage";
import { AllModulesPage } from "@/pages/AllModules/AllModulesPage";
import { ModulePage } from "@/pages/AllModules/ModulePage";
import { ModuleOverviewPage } from "@/pages/AllModules/ModuleOverviewPage";
import { CellPage } from "@/pages/CommandCentre/CellPage";
import { SnapshotPage } from "@/pages/AllModules/SnapshotPage";
import { PlanningHorizonPage } from "@/pages/PlanningHorizon/PlanningHorizonPage";
import { ReportsPage } from "@/pages/Reports/ReportsPage";
import { GlossaryPage } from "@/pages/Glossary/GlossaryPage";
import { NotFoundPage } from "@/pages/NotFound/NotFoundPage";
import { prettyUrls, upgradeHashUrl } from "@/lib/prettyUrls";

const rootRoute = createRootRoute({
  // h = planning horizon, m = module horizon (single-module pages), mod = module focused on the
  // all-horizons page, t = the open tab on a cell page — all kept separate. type / week / month / date = the
  // Supply pages' graph type, Monday (YYYY-MM-DD), month (YYYY-MM) and day (YYYY-MM-DD).
  validateSearch: (s: Record<string, unknown>): { h?: TfId; m?: TfId; mod?: ModId | "overview"; t?: string; type?: string; week?: string; month?: string; date?: string } => ({
    ...(isTf(s.h) ? { h: s.h } : {}),
    ...(isTf(s.m) ? { m: s.m } : {}),
    ...(isMod(s.mod) || s.mod === "overview" ? { mod: s.mod as ModId | "overview" } : {}),
    ...(typeof s.t === "string" ? { t: s.t } : {}),
    ...(typeof s.type === "string" ? { type: s.type } : {}),
    ...(typeof s.week === "string" ? { week: s.week } : {}),
    ...(typeof s.month === "string" ? { month: s.month } : {}),
    ...(typeof s.date === "string" ? { date: s.date } : {}),
  }),
  component: AppShell,
  notFoundComponent: NotFoundPage,
});

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: CommandCentrePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/overview", component: OverviewPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/modules", component: AllModulesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/modules/$moduleId", component: ModulePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/modules/$moduleId/row", component: ModuleOverviewPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/cell/$moduleId", component: CellPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/snapshot", component: SnapshotPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/horizon", component: PlanningHorizonPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/reports", component: ReportsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/glossary", component: GlossaryPage }),
]);

// Browser history with readable URLs (/planning/week-ahead/supply-availability …): `prettyUrls`
// translates them to the routes above and back. The server must answer every path with
// index.html (SPA fallback) — see README "Deployment". Old /#/… links are moved into the path.
upgradeHashUrl();
export const router = createRouter({
  routeTree, history: createBrowserHistory(), rewrite: prettyUrls, scrollRestoration: true, defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
