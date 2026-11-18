# AGENTS.md

ResearchSphere: a self-updating directory of research opportunities. React 18 + Vite +
TypeScript frontend (`src/`), Express + `better-sqlite3` API (`server/`). These are two
independent npm projects (no workspaces). Listings are harvested into SQLite and read
at request time; pages do not hold hard-coded content.

## Setup and run

- Requires Node 20+ (native `better-sqlite3`).
- `npm run setup` installs both root and server dependencies. A root-only `npm install`
  is not enough.
- Copy `server/.env.example` to `server/.env`.
- `npm run dev` runs API on 5001 and Vite on 8080. Use `dev:web` or `dev:server` for one
  side. Port 5000 is intentionally avoided (macOS AirPlay).
- Frontend API base comes from `VITE_API_URL`, default `http://localhost:5001/api`.

## Verification

- No test suite and no typecheck script. `npm run build` only runs Vite and will not
  catch TypeScript errors.
- `npx tsc -p tsconfig.app.json --noEmit` typechecks `src/`. Baseline currently has one
  error in `fetchOpenAlexSources` in `src/services/apiClient.ts`.
- `npm run lint` currently has ~8 pre-existing errors (shadcn empty interfaces,
  `require()` in `tailwind.config.ts`, `any` in `analytics.ts`). Avoid adding errors;
  do not mass-refactor the generated `src/components/ui` kit.
- Server-side checks are scripts, not tests: `npm --prefix server run harvest:sources`
  (offline DB health), `smoke:assistant` (needs a populated DB), `harvest:refresh`
  (live network, slow). Server JavaScript is not linted.
- Do not run `probe:journals` / `build:journal-corpus` casually: Playwright, headed by
  default, scrapes live Springer/Elsevier.
- No CI or deploy config exists; these checks are manual.

## Architecture boundaries

- All frontend data goes through `src/services/apiClient.ts` to the Express API. Never
  call external research APIs directly from page components.
- Add an endpoint in `server/routes/api.js` (or a route module mounted there), put logic
  in `server/services/`, then add the client wrapper in `apiClient.ts`.
- Preserve response shapes: `{ success, data, count }` generally; harvest search returns
  `{ success, data, meta }`.
- Pages use React Query `useQuery` and `searchHarvestedData` /
  `searchHarvestedDataWithMeta`. Shared UI lives in `src/components/ui`; aliases are
  `@/*` -> `src/*`, and shadcn config is `components.json`.
- Listing sections are defined once in `src/lib/sections.ts` (navigation, home grid,
  footer). Add a section there rather than ad hoc.
- TypeScript is intentionally non-strict (`strict: false`, `noImplicitAny: false`,
  `strictNullChecks: false`). Do not tighten it globally as a drive-by change.

## Harvest and data gotchas

- Never hard-code listings. Sources live in `SOURCE_REGISTRY` in
  `server/services/harvest/sources.js`.
- `runSourceHarvester` dispatches on both `type` and source-id prefixes (`wikicfp-`,
  `call4paper-`, `jobsacuk-`, `ajo-`, `bookchapter-*`, Indian agency ids). Read it
  before adding a source. Source counts in docs are stale; trust the registry
  (currently 180).
- `server/data/harvest.db` is generated and gitignored. `readStore()` caches in-process:
  restart the API after external DB edits, and after changing journal corpus runs
  (the journal matcher also caches).
- With an empty DB, the first search waits for the full harvest (~2 minutes). After
  that, searches return cached data immediately and refresh in the background. Check
  `GET /api/harvest/status`.
- Use `server/services/harvest/dates.js` for date normalization and status. It adds
  `deadlineAt`, `startsAt`/`endsAt`, and `postedAt`; status is computed at read time.
  Yearless dates resolve against `postedAt`, not today. Do not re-parse dates in routes
  or pages.
- A failed source keeps its stored items without bumping `lastSeenAt`, so dead sources
  age out through the retention window.
- WikiCFP detail enrichment runs after harvest and can take ~40 minutes on the first
  pass; deadlines may be missing immediately after startup.
- Journal matching merges every
  `server/data/journal-finder-probe/*/journals-merged.json`. Raw probe captures are
  gitignored; only merged/summary/corpus files are tracked.

## Existing instructions

- `.github/copilot-instructions.md` has valid high-level conventions but cites removed
  files (`API_INTEGRATION_GUIDE.md`, `CORS_FIXES.md`, etc.). Treat `README.md`,
  `docs/architecture.md`, `docs/api.md`, and `docs/data-sources.md` as current.
- The assistant UI is intentionally disabled in `src/App.tsx` (route commented out)
  while `POST /api/assistant/query` remains. Do not re-enable it unless asked.
