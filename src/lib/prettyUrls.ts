import type { LocationRewrite } from "@tanstack/react-router";
import { MODS, TFS, type ModId, type TfId } from "@/data/engine";
import { SUBS } from "@/data/insights";

/**
 * Readable URLs.
 *
 * The app's routes and pages work on short internal ids (`/horizon?h=wk&mod=supply`,
 * `/cell/demand?m=wk&t=tuneup`). The browser shows readable paths instead:
 *
 *   /home                                             ← /   (the Command centre; /command-centre still opens)
 *   /details/week-ahead/demand/tune-up                ← /cell/demand?m=wk&t=tuneup
 *     (cell pages live under the header's Details menu; old /command-centre/demand/week-ahead/…
 *     links still open)
 *   /planning/week-ahead/supply-availability          ← /horizon?h=wk&mod=supply
 *   /planning/week-ahead/all-modules                  ← /horizon?h=wk&mod=overview
 *   /modules/demand/month-ahead                       ← /modules/demand?m=mo
 *   /modules/demand/month-ahead/all-horizons          ← /modules/demand/row?m=mo
 *   /snapshot/day-ahead                               ← /snapshot?h=da
 *
 * Filters stay as query params (`?week=2026-11-09&view=technology`; `view` is the internal `type`).
 * The router's rewrite (`input`: browser → internal, `output`: internal → browser) does the
 * translation, so pages, links and navigate() calls keep using the internal form.
 */

const kebab = (s: string) => s.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Horizons: da ↔ day-ahead …
const TF_TO = new Map<TfId, string>(TFS.map((t) => [t.id, kebab(t.name)]));
const TF_FROM = new Map<string, TfId>([...TF_TO].map(([id, slug]) => [slug, id]));

// Modules: supply ↔ supply-availability … ("overview" is the Planning horizon's all-modules view).
const MOD_TO = new Map<ModId, string>(MODS.map((m) => [m.id, kebab(m.name)]));
const MOD_FROM = new Map<string, ModId>([...MOD_TO].map(([id, slug]) => [slug, id]));

// Command-centre tabs per module, named after the tab without the module's first word
// ("Demand Tune up" → tune-up); the id is kept when two tabs would get the same name.
const EXTRA_TABS: Partial<Record<ModId, { id: string; n: string }[]>> = {
  supply: [{ id: "bifurcation", n: "Supply Bifurcation" }],
  mi: [{ id: "marketdetail", n: "Market Detail" }],
};
const TAB_TO = new Map<ModId, Map<string, string>>();
const TAB_FROM = new Map<ModId, Map<string, string>>();
for (const m of MODS) {
  const first = kebab(m.name).split("-")[0] + "-";
  const to = new Map<string, string>(), from = new Map<string, string>();
  for (const t of [...(EXTRA_TABS[m.id] ?? []), ...SUBS[m.id]]) {
    let slug = kebab(t.n);
    if (slug.startsWith(first) && slug.length > first.length) slug = slug.slice(first.length);
    if (from.has(slug) || TF_FROM.has(slug) || slug === "overview") slug = kebab(t.id);
    to.set(t.id, slug); from.set(slug, t.id);
  }
  TAB_TO.set(m.id, to); TAB_FROM.set(m.id, from);
}

const ALL = "all-modules"; // the Planning horizon's all-modules view (internal mod=overview)
const HORIZON = "horizon"; // browser name of the planning horizon left in the query (internal `h`)
const VIEW = "view"; // browser name of the internal `type` (graph type) param

/** Renames `type` → `view` and `h=wk` → `horizon=week-ahead` (and back), and drops the given
 *  internal keys (those moved into the path). */
function carrySearch(src: URLSearchParams, drop: string[], toBrowser: boolean): URLSearchParams {
  const out = new URLSearchParams();
  src.forEach((v, k) => {
    if (drop.includes(k)) return;
    if (toBrowser && k === "type") out.set(VIEW, v);
    else if (!toBrowser && k === VIEW) out.set("type", v);
    else if (toBrowser && k === "h" && TF_TO.has(v as TfId)) out.set(HORIZON, TF_TO.get(v as TfId)!);
    else if (!toBrowser && k === HORIZON && TF_FROM.has(v)) out.set("h", TF_FROM.get(v)!);
    else out.append(k, v);
  });
  return out;
}

function withPath(url: URL, path: string, search: URLSearchParams): URL {
  const u = new URL(url.href);
  u.pathname = path;
  const qs = search.toString();
  u.search = qs ? `?${qs}` : "";
  return u;
}

/** Internal → browser. Unknown paths pass through unchanged. */
function toBrowser(url: URL): URL | undefined {
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const q = url.searchParams;
  const seg = p.split("/").filter(Boolean);
  const tf = (k: "h" | "m") => { const v = q.get(k); return v ? TF_TO.get(v as TfId) : undefined; };

  // Params a page doesn't use (carried over from the last page, e.g. a cell's `m` / `t`) are dropped.
  // The planning horizon (`h`) is left out too on the Command centre / Overview / Reports … pages:
  // they fall back to the last picked horizon, remembered in the browser (lib/horizon.ts).
  if (p === "/") return withPath(url, "/home", carrySearch(q, ["m", "t", "h"], true));

  if (seg[0] === "cell" && seg[1] && MOD_TO.has(seg[1] as ModId)) {
    const mod = seg[1] as ModId, t = q.get("t");
    const tab = t && t !== "overview" ? TAB_TO.get(mod)?.get(t) ?? t : undefined;
    const parts = ["details", tf("m") ?? TF_TO.get("da")!, MOD_TO.get(mod)!, tab].filter(Boolean);
    return withPath(url, "/" + parts.join("/"), carrySearch(q, ["m", "t", "h"], true));
  }

  if (p === "/horizon") {
    const mod = q.get("mod");
    const modSlug = mod === "overview" ? ALL : mod ? MOD_TO.get(mod as ModId) : undefined;
    const parts = ["planning", tf("h"), modSlug].filter(Boolean);
    return withPath(url, "/" + parts.join("/"), carrySearch(q, ["h", "mod", "m", "t"], true));
  }

  if (p === "/snapshot") return withPath(url, "/" + ["snapshot", tf("h")].filter(Boolean).join("/"), carrySearch(q, ["h", "m", "t"], true));

  if (seg[0] === "modules") {
    if (seg.length === 1) return withPath(url, "/" + ["modules", tf("m")].filter(Boolean).join("/"), carrySearch(q, ["m", "t"], true));
    const modSlug = MOD_TO.get(seg[1] as ModId);
    if (!modSlug) return undefined;
    const parts = ["modules", modSlug, tf("m"), seg[2] === "row" ? "all-horizons" : undefined].filter(Boolean);
    return withPath(url, "/" + parts.join("/"), carrySearch(q, ["m", "t"], true));
  }

  // /overview, /reports, /glossary …: only the param renames.
  return q.has("type") || q.has("h") || q.has("m") || q.has("t") ? withPath(url, p, carrySearch(q, ["m", "t", "h"], true)) : undefined;
}

/** Browser → internal. Old internal URLs (/horizon?h=…) also still work. */
function toInternal(url: URL): URL | undefined {
  const seg = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const q = carrySearch(url.searchParams, [], false);
  const set = (k: string, v: string | undefined) => { if (v) q.set(k, v); };

  // The Command centre: /home (old links: /command-centre).
  if (seg[0] === "home" && seg.length === 1) return withPath(url, "/", q);
  if (seg[0] === "command-centre") {
    if (seg.length === 1) return withPath(url, "/", q);
    const mod = MOD_FROM.get(seg[1]);
    if (!mod) return undefined;
    // /command-centre/<module>[/<horizon>][/<tab>]
    let rest = seg.slice(2);
    if (rest[0] && TF_FROM.has(rest[0])) { set("m", TF_FROM.get(rest[0])); rest = rest.slice(1); }
    if (rest[0]) set("t", TAB_FROM.get(mod)?.get(rest[0]) ?? rest[0]);
    return withPath(url, `/cell/${mod}`, q);
  }

  if (seg[0] === "details") {
    // /details/<horizon>/<module>[/<tab>]
    let rest = seg.slice(1);
    if (rest[0] && TF_FROM.has(rest[0])) { set("m", TF_FROM.get(rest[0])); rest = rest.slice(1); }
    const mod = rest[0] ? MOD_FROM.get(rest[0]) : undefined;
    if (!mod) return undefined;
    if (rest[1]) set("t", TAB_FROM.get(mod)?.get(rest[1]) ?? rest[1]);
    return withPath(url, `/cell/${mod}`, q);
  }

  if (seg[0] === "planning") {
    // Either segment may be left out: /planning, /planning/day-ahead, /planning/day-ahead/demand.
    for (const s of seg.slice(1)) {
      if (TF_FROM.has(s)) set("h", TF_FROM.get(s));
      else if (s === ALL) q.set("mod", "overview");
      else if (MOD_FROM.has(s)) set("mod", MOD_FROM.get(s));
    }
    return withPath(url, "/horizon", q);
  }

  if (seg[0] === "snapshot") {
    set("h", TF_FROM.get(seg[1] ?? ""));
    return withPath(url, "/snapshot", q);
  }

  if (seg[0] === "modules") {
    if (seg.length === 1) return withPath(url, "/modules", q);
    if (TF_FROM.has(seg[1])) { set("m", TF_FROM.get(seg[1])); return withPath(url, "/modules", q); }
    const mod = MOD_FROM.get(seg[1]);
    if (!mod) return undefined; // an internal id (/modules/demand) — already the internal form
    let rest = seg.slice(2);
    if (rest[0] && TF_FROM.has(rest[0])) { set("m", TF_FROM.get(rest[0])); rest = rest.slice(1); }
    return withPath(url, `/modules/${mod}${rest[0] === "all-horizons" ? "/row" : ""}`, q);
  }

  return url.searchParams.has(VIEW) || url.searchParams.has(HORIZON) ? withPath(url, url.pathname, q) : undefined;
}

export const prettyUrls: LocationRewrite = {
  input: ({ url }) => toInternal(url),
  output: ({ url }) => toBrowser(url),
};

/** Before the router starts: move old hash links (/#/horizon?h=wk…) into the path, and show the
 *  readable form of an internal URL (/horizon?h=wk → /planning/week-ahead). */
export function upgradeHashUrl(): void {
  if (typeof window === "undefined") return;
  const { hash } = window.location;
  if (hash.startsWith("#/")) window.history.replaceState(window.history.state, "", hash.slice(1));
  const here = new URL(window.location.href);
  const internal = toInternal(here) ?? here;
  const pretty = toBrowser(internal) ?? internal;
  if (pretty.href !== here.href) window.history.replaceState(window.history.state, "", pretty.pathname + pretty.search + pretty.hash);
}
