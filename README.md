# EPM AI · Energy Portfolio Management (React rebuild)

React 19 + TypeScript + TanStack Router + Vite + Tailwind + shadcn/ui + Recharts.
All data is a seeded simulation (no backend) ported from the original `EPM_AI1.html`.

## Run
```bash
pnpm i
pnpm dev        # http://localhost:5173
pnpm build      # -> dist/
```



## Structure
```
src/
  data/engine.ts     simulation: 96 blocks, plants, merit-order optimise, WK/MO/YR/LT aggregates, DR, catalogs
  data/model.ts      per module × horizon KPIs + chart specs (G(mod, tf)), alerts, home KPIs
  data/insights.ts   sub-metrics, AI recs, workflow steps, lenses, drill-downs, report content
  theme/             ThemeProvider (4 palettes × light/dark/system) + themes.css (generated)
  lib/               glossary (35 terms, KPI ⓘ tooltips), horizon (?h= in URL), side-panel context
  components/        AppShell, HorizonRuler, Kpis, Chart/Spark, SidePanel, blocks
  pages/             Overview, Module, Horizon, Reports, Glossary, NotFound
  router.tsx         /  /modules/$moduleId  /horizon  /reports  /glossary   (search: ?h=dr|id|da|wk|mo|yr|lt)
```

## Customise
- Themes: edit `scripts/gen-themes.py`, then `python3 scripts/gen-themes.py` → `src/theme/themes.css`.
- Router uses browser history with readable URLs (see "Deployment" below).
- Real data: replace the generators in `src/data/engine.ts`; `model.ts`/`insights.ts` only read from it.

## Deployment (readable URLs)

The app uses normal URLs such as `/planning/week-ahead/supply-availability?week=2026-11-09` (no `#`).
Routes are handled in the browser, so the web server must answer **every path** with `index.html`
(SPA fallback); otherwise refreshing a deep link gives a 404. `npm run dev` / `npm run preview` already do this.

- **Nginx**: in the frontend's `server` block: `location / { try_files $uri $uri/ /index.html; }`
- **FastAPI serving `dist/`**: add a catch-all route that returns `index.html` for paths that are not `/api/…` or a real file.

Old links (`/#/horizon?h=wk&mod=supply`) still work: they are moved to the readable form on load.
The URL ↔ route mapping is in `src/lib/prettyUrls.ts`.
