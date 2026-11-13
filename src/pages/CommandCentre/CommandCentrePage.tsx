import { useLayoutEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Download, GitCompare, SquareArrowOutUpRight } from "lucide-react";
import { toast } from "sonner";
import { MODS, TFS, modName, type ModId, type Status, type TfId } from "@/data/engine";
import { G } from "@/data/model";
import { SUBS, type SubVal } from "@/data/insights";
import { Spark } from "@/components/chart/Spark";
import { DemandPlanSpark, hasDemandPlanSpark } from "@/components/DemandPlanSpark";
import { SupplyPlanSpark, hasSupplyPlanSpark } from "@/components/SupplyPlanSpark";

// A chart-only cell (Demand / Supply Day / Week / Month) fills the height of a regular cell's
// number row + mini chart + text line: the mini chart's height plus this.
const PLAN_EXTRA_H = 47;
// The grid fills the window: each module row's mini charts grow from MIN_CHART_H to take the free
// height (no page scroll), up to MAX_CHART_H.
const MIN_CHART_H = 20, MAX_CHART_H = 160;
// Module rows whose cells have charts (Reports' cells are text only, so they don't grow).
const CHART_ROWS = MODS.filter((m) => TFS.some((t) => G(m.id, t.id).chart)).length;
import { VizView } from "@/components/blocks";
import { Section } from "@/components/layout";
import { Dot, Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { useHorizon } from "@/lib/horizon";
import { cn } from "@/lib/utils";
// Imports only used by the hidden header/KPI/alerts block (see below):
// dLabel, nowB, NOW from "@/data/engine"; alerts, homeKpis from "@/data/model";
// Kpis from "@/components/Kpis"; PageHead from "@/components/layout";
// AlertTriangle, Info, OctagonAlert from "lucide-react".

/* each cell is its own bordered card so every chart reads as a distinct tile;
   the border + wash are status-coloured so trouble spots pop at a glance */
const CELL_CARD: Record<Status, string> = {
  crit: "border-bad/45 bg-bad-soft/40 hover:border-bad/80 hover:bg-bad-soft",
  warn: "border-warn/45 bg-warn-soft/30 hover:border-warn/80 hover:bg-warn-soft",
  info: "border-border bg-card hover:border-primary/60 hover:bg-accent",
  ok: "border-border bg-card hover:border-primary/60 hover:bg-accent",
};

type Filter = Status | "all";
type View = "charts" | "values";

export function CommandCentrePage() {
  // The last Planning-horizon pick: only the "Row" / detail links open at it. No column is highlighted
  // — nothing on this page selects a horizon.
  const { tf } = useHorizon();
  const [expanded, setExpanded] = useState<Set<ModId>>(new Set());
  const [view, setView] = useState<Record<ModId, View>>({} as Record<ModId, View>);
  // setFilter is unused while the filter-pills UI is hidden (see below) — filter stays "all".
  const [filter] = useState<Filter>("all");

  // Mini-chart height that makes the grid end at the window's bottom edge: measured after layout,
  // the free height (or overflow) is shared between the chart rows. Re-fit on resize and when a
  // module's details open / close (open details may still need a scroll).
  const [chartH, setChartH] = useState(MIN_CHART_H);
  useLayoutEffect(() => {
    const fit = () => {
      const el = document.getElementById("cc-grid");
      if (!el) return;
      const bottom = el.getBoundingClientRect().bottom + window.scrollY;
      const room = window.innerHeight - 12 - bottom; // 12 = the page's bottom padding here
      setChartH((h) => Math.max(MIN_CHART_H, Math.min(MAX_CHART_H, h + Math.floor(room / CHART_ROWS))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [expanded, chartH]);

  const isOpen = (m: ModId) => expanded.has(m);
  const viewOf = (m: ModId): View => view[m] ?? "charts";
  const toggle = (m: ModId) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  // tally (every module × horizon, how many need action) is unused while the
  // filter-pills UI is hidden (see below).
  // const tally = useMemo(() => {
  //   const t: Record<Status, number> = { ok: 0, warn: 0, crit: 0, info: 0 };
  //   for (const m of MODS) for (const h of TFS) t[G(m.id, h.id).sum.st]++;
  //   return t;
  // }, []);

  // FILTERS is unused while the filter-pills UI is hidden (see below).
  // const FILTERS: { id: Filter; label: string; n?: number }[] = [
  //   { id: "all", label: "Everything" },
  //   { id: "crit", label: "Act now", n: tally.crit },
  //   { id: "warn", label: "Watch", n: tally.warn },
  //   { id: "ok", label: "On track", n: tally.ok },
  // ];
  const dim = (st: Status) => filter !== "all" && st !== filter;

  return (
    <>
      {/* Page header + KPI strip + live-exceptions alerts — hidden so the modules table
          fits on one screen without scrolling. Kept here (commented out) in case it's
          wanted back later.
      <PageHead
        crumb={dLabel(NOW) + " · Block " + (nowB + 1) + " of 96"}
        title="Power purchase command centre"
      />

      <Kpis items={homeKpis()} />

      <div className="scroll-x mt-3 -mx-4 px-4 sm:-mx-5 sm:px-5">
        <div className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 lg:grid-flow-row lg:grid-cols-2 xl:grid-cols-4">
          {alerts().map((a) => {
            const Icon = ALERT_ICON[a.st];
            return (
              <Link key={a.title} to="/modules/$moduleId" params={{ moduleId: a.mod }} search={{ m: a.tf }}
                className={cn("flex min-w-0 gap-2.5 rounded-md border border-l-[3px] bg-card p-3 transition-colors hover:bg-accent", ALERT_EDGE[a.st])}>
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ALERT_TONE[a.st])} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{a.title}</span>
                  <span className="block text-[13px] leading-snug text-muted-foreground">{a.text}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
      */}

      <Section id="cc-grid">
        {/* title/desc + status-filter pills hidden so the module boxes get the extra space —
            kept here (commented out) in case it's wanted back later.
        <>
          <h2 className="mb-0.5 text-lg font-semibold leading-snug">Modules × planning horizon</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">Click a cell to open it on its own page · expand a module in place, or open its complete row · click a column heading for that horizon's snapshot.</p>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  filter === f.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
                {f.id !== "all" && <Dot st={f.id as Status} className={filter === f.id ? "ring-2 ring-primary-foreground/40" : ""} />}
                {f.label}
                {f.n != null && <span className={cn("num", filter === f.id ? "text-primary-foreground/80" : "text-muted-foreground")}>{f.n}</span>}
              </button>
            ))}
          </div>
        </>
        */}

        <div className="scroll-x -mx-4 px-4 sm:-mx-5 sm:px-5">
          <table className="w-full min-w-[1360px] table-fixed border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-[210px] bg-card py-1 pr-3 text-left align-bottom">
                  <div className="text-xs font-medium text-muted-foreground">Modules</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setExpanded(new Set(MODS.map((m) => m.id)))}>Expand all</Button>
                    <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setExpanded(new Set())}>Collapse all</Button>
                  </div>
                </th>
                {TFS.map((t) => (
                  <th key={t.id} className="px-1 pb-0.5 align-bottom">
                    <Link to="/horizon" search={(prev: Record<string, unknown>) => ({ ...prev, h: t.id, mod: "overview" })} title={"Open planning horizon · " + t.name}
                      className="group block w-full rounded px-1.5 py-0.5 text-left hover:bg-accent">
                      <span className="flex items-center gap-1 text-[13px] font-semibold">
                        {t.name}
                        <SquareArrowOutUpRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      <span className="block text-[11px] font-normal text-muted-foreground">{t.hz}</span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODS.map((m) => {
                const open = isOpen(m.id);
                const subs = SUBS[m.id];
                return (
                  <ModuleRows key={m.id} mod={m.id} name={m.name} sub={m.sub} subN={subs.length}
                    open={open} view={viewOf(m.id)} tf={tf} dim={dim} chartH={chartH} onToggle={() => toggle(m.id)}
                    onView={(v) => setView((p) => ({ ...p, [m.id]: v }))} />
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Dot st="ok" />On track</span>
          <span className="flex items-center gap-1.5"><Dot st="warn" />Watch</span>
          <span className="flex items-center gap-1.5"><Dot st="crit" />Act now</span>
          <span className="ml-auto flex items-center gap-1"><SquareArrowOutUpRight className="h-3 w-3" />Click a cell to open it on its own page</span>
        </div>
      </Section>
    </>
  );
}

/* ---------- one module: summary row + (when open) a detail-options bar and its detail rows ---------- */
function ModuleRows({ mod, name, sub, subN, open, view, tf, dim, chartH, onToggle, onView }: {
  mod: ModId; name: string; sub: string; subN: number; open: boolean; view: View; tf: TfId; chartH: number;
  dim: (st: Status) => boolean; onToggle: () => void; onView: (v: View) => void;
}) {
  const subs = SUBS[mod];
  return (
    <>
      {/* summary row — always shows the headline chart for every horizon */}
      <tr className="align-top">
        <th scope="row" className="sticky left-0 z-10 border-t border-border/70 bg-card py-1 pr-3 text-left align-top">
          <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-1.5 rounded text-left hover:text-primary">
            <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md transition-colors", open ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold leading-snug">{name}</span>
              <span className="block truncate text-[11px] font-normal leading-snug text-muted-foreground">{sub}</span>
            </span>
          </button>
          <div className="mt-1 flex flex-nowrap items-center gap-1">
            <button onClick={onToggle} title={(open ? "Hide" : "Show") + " details · " + subN + " rows"}
              className="inline-flex shrink-0 items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
              {open ? "Hide" : "Show"} ({subN})
            </button>
            <Link to="/modules/$moduleId/row" params={{ moduleId: mod }} search={{ m: tf }}
              title={"Open the complete row for " + name}
              className="inline-flex shrink-0 items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-accent">
              <SquareArrowOutUpRight className="h-3 w-3" />Row
            </Link>
          </div>
        </th>

        {TFS.map((t) => {
          const g = G(mod, t.id), s = g.sum, faded = dim(s.st);
          const planChart = (mod === "demand" && hasDemandPlanSpark(t.id)) || (mod === "supply" && hasSupplyPlanSpark(t.id));
          return (
            <td key={t.id} className={cn("border-t border-border/70 p-1 align-top", faded && "opacity-25")}>
              <Link to="/cell/$moduleId" params={{ moduleId: mod }} search={{ m: t.id }}
                title={"Open " + modName(mod, t.id) + " · " + t.name}
                className={cn("group/cell relative block h-full w-full rounded-lg border p-1.5 text-left shadow-sm transition-colors", CELL_CARD[s.st])}>
                {planChart ? (
                  // Demand / Supply Day / Week / Month ahead: just the Planning horizon's chart, filling
                  // the box (same height as the other cells' number + chart + text).
                  <>
                    <span className="block" style={{ height: chartH + PLAN_EXTRA_H }}>
                      {mod === "demand" ? <DemandPlanSpark tf={t.id} fallback={g.chart} height={chartH + PLAN_EXTRA_H} />
                        : <SupplyPlanSpark tf={t.id} fallback={g.chart} height={chartH + PLAN_EXTRA_H} />}
                    </span>
                    <SquareArrowOutUpRight className="absolute right-1.5 top-1.5 h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100" />
                  </>
                ) : (<>
                <span className="flex items-center gap-1.5">
                  <Dot st={s.st} />
                  <span className="num truncate text-[14px] font-semibold">{s.big}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">{s.u}</span>
                </span>
                {g.chart ? (
                  <>
                    <span className="mt-1 block" style={{ height: chartH }}><Spark spec={g.chart} height={chartH} /></span>
                    <span className="mt-1 block truncate text-[12px] text-muted-foreground">{s.sub}</span>
                    <SquareArrowOutUpRight className="absolute right-1.5 top-1.5 h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100" />
                  </>
                ) : (
                  <span className="mt-1 block h-[20px] text-[12px] leading-snug text-muted-foreground">{s.sub}</span>
                )}
                </>)}
              </Link>
            </td>
          );
        })}
      </tr>

      {open && (
        <>
          {/* detail options bar */}
          <tr>
            <td colSpan={TFS.length + 1} className="border-t bg-muted/40 p-0">
              <div className="sticky left-0 flex w-max max-w-[100vw] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{name} · detail options</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Show <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Detail rows ({subN})</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  View
                  <span className="inline-flex overflow-hidden rounded-full border">
                    {(["charts", "values"] as View[]).map((v) => (
                      <button key={v} onClick={() => onView(v)}
                        className={cn("px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors", view === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
                        {v === "charts" ? "Charts" : "Values only"}
                      </button>
                    ))}
                  </span>
                </span>
                <Link to="/modules/$moduleId" params={{ moduleId: mod }} search={{ m: tf }}
                  className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-[11px] font-medium hover:bg-accent">
                  <GitCompare className="h-3 w-3" />Compare horizons
                </Link>
                <Link to="/modules/$moduleId" params={{ moduleId: mod }} search={{ m: tf }}
                  className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-[11px] font-medium hover:bg-accent">
                  <SquareArrowOutUpRight className="h-3 w-3" />Open module
                </Link>
                <button onClick={() => toast.success(name + " detail export queued (sample)")}
                  className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-[11px] font-medium hover:bg-accent">
                  <Download className="h-3 w-3" />Export
                </button>
              </div>
            </td>
          </tr>

          {/* one row per detail metric, across every horizon */}
          {subs.map((S) => (
            <tr key={S.id} className="align-top">
              <th scope="row" className="sticky left-0 z-10 bg-card py-2 pr-3 text-left align-top">
                <div className="border-l-2 border-primary/50 py-0.5 pl-2.5">
                  <div className="text-[13px] font-semibold leading-snug">{S.n}</div>
                  <div className="text-[11px] font-normal leading-snug text-muted-foreground">{S.d}</div>
                </div>
              </th>
              {TFS.map((t) => (
                <td key={t.id} className="bg-muted/20 p-1 align-top">
                  <DetailCell v={S.f(t.id)} view={view} />
                </td>
              ))}
            </tr>
          ))}
        </>
      )}
    </>
  );
}

function DetailCell({ v, view }: { v: SubVal; view: View }) {
  return (
    <div className="h-full rounded-md border border-border/50 bg-card/50 px-2 py-1.5">
      <div className="flex items-baseline justify-between gap-1.5">
        <span className="min-w-0 truncate">
          <span className="num text-[15px] font-semibold">{v.big}</span>
          {v.u && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{v.u}</span>}
        </span>
        {v.tag && <Pill st={v.tag[1]} className="shrink-0">{v.tag[0]}</Pill>}
      </div>
      {view === "charts" && v.viz && <div className="mt-1.5">{<VizView v={v.viz} />}</div>}
      {v.sub && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{v.sub}</div>}
    </div>
  );
}
