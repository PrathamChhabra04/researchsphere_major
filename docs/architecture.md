# Architecture

```
 sources.js ──► harvestService ──► dates.js ──► store.js (SQLite) ──► /api/harvest/search ──► pages
 (registry +     (scheduler,        (deadline,    (upsert, prune)       (filter, status,
  scrapers)       concurrency,       event and                            sort, paginate)
                  fallback)          posted dates)
```

## Harvesting (`server/services/harvest/`)

- **`sources.js`**: the source registry (`SOURCE_REGISTRY`) and one harvester per source
  type. Every harvester returns items of the same shape: `kind` (`conference`, `journal`,
  `opportunity`), `subtype` (`phd`, `postdoc`, `internship`, `research`, `project-call`,
  `book-chapter`, …), `title`, `summary`, `url`, `location`, `deadline`, `eventDate`.
- **Politeness**: requests to the same host are serialised with a minimum gap
  (1.2 s; 3.5 s for arXiv; 5 s for WikiCFP per its robots.txt), so parallel sources never
  trigger rate limits.
- **Detail enrichment**: `wikicfpDetails.js` adds CFP milestones and the official site from
  WikiCFP event pages in a background pass after each harvest (cached in `detail_cache`).
- **Classification**: `classifyOpportunitySubtype` decides the category from the
  *title* first (an internship source can still publish a lecturer job); the source's
  subtype is only a fallback. Relevance filters match whole words, so "ai" never matches
  "said".
- **Scheduler**: `startHarvestScheduler()` (called from `server.js`) refreshes on startup
  and every `HARVEST_INTERVAL_HOURS`. Searches never wait for a harvest: they read the
  database and, if the data is stale, start a background refresh.
- **Failures**: when a source fails, its previously stored items are kept, but their
  `lastSeenAt` is not bumped, so a permanently dead source ages out.

## Dates and status (`dates.js`)

`enrichItemDates` adds normalised ISO fields to every item:

| Field | Meaning |
|---|---|
| `deadlineAt` | Applications or submissions close. Taken from structured fields or text such as "Apply by Sep 25", "Deadline: January 15, 2027", "Closes 08 Nov" |
| `startsAt` / `endsAt` | Event dates (conferences) |
| `postedAt` | When the listing was published |

A date without a year is resolved against the post's publish date, not today.

`getItemStatus` is computed **at read time**, so it never goes stale:
`open`, `closing-soon` (≤ 14 days), `submissions-closed` (a conference whose CFP closed
but the event is still ahead), `upcoming`, `expired` or `unknown`.

## Storage (`store.js`)

SQLite via `better-sqlite3` at `server/data/harvest.db` (configurable with `HARVEST_DB_PATH`).

- `items` holds one row per listing. The id is a hash of kind, title and URL
  (conferences use the title only, because aggregators list one event under several
  URLs), so dedupe and storage agree. `firstSeenAt` survives later refreshes.
- Pruning after each harvest removes listings unseen for `HARVEST_UNSEEN_RETENTION_DAYS`
  (21), listings expired for more than `HARVEST_EXPIRED_RETENTION_DAYS` (30), and items
  from sources that were removed from the registry.
- An old `harvest-cache.json` is imported automatically once and renamed `*.migrated`.

## Frontend

Each listing page calls `searchHarvestedData({ kind, subtype, … })` from
`src/services/apiClient.ts`, shows a `DeadlineStatusBadge`, and sorts with the helpers
in `src/lib/itemDates.ts`. Opportunity pages sort by soonest deadline by default;
Conferences sorts by soonest event.
