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

## Journal matching (`server/services/journalMatch/`)

The Journals page is served by a fully local matcher (no LLM, no external API at query time).

- **Corpus**: every `server/data/journal-finder-probe/*/journals-merged.json` is merged by
  `provider + ISSN` (or title) in `corpus.js`. Springer cards only expose subject areas, so
  `server/scripts/enrichJournalScopes.mjs` (run manually, Playwright, polite delay) scrapes each
  journal's public `link.springer.com/journal/<id>/aims-and-scope` page into
  `server/data/journal-scope-enrichment.json`; `corpus.js` merges it at load and prefers the
  longer scope. Invalid decision/acceptance times (>365 days) are nulled here.
  `scripts/importIeee.js` (run manually) parses the IEEE Title List PDF in
  `server/data/raw/` into `server/data/ieee-journals.json` (provider `ieee`, Transactions
  only by default) and `corpus.js` merges it at load. IEEE entries have no links, decision
  times or APCs; their subject areas come from title keywords and their one-line scope is
  generated (`scopeSource: "generated"`) until real aims/scope text is added.
- **Index**: `scripts/buildJournalIndex.js` (run manually) cleans HTML entities/boilerplate,
  builds one identity chunk per journal (title + subjectAreas + articleTypes) and 180-word
  scope chunks, then embeds them with `Xenova/all-MiniLM-L6-v2` (mean pooling, normalized).
  Output is a single `server/data/journal-match-index.json` holding vectors, the chunk → journal
  map, and per-journal excluded-topic rules. The model is cached in
  `server/data/journal-match-model-cache/`. Both are generated and gitignored.
- **Runtime** (`journalMatcherService.js`): loads the index once (warmup from `server.js`), and
  the model lazily on first search. Final score =
  `0.6 * semantic + 0.3 * bm25 + 0.1 * quality` (weights in `journalMatch/config.js`).
  Keyword queries are split on commas/`+`/`and`/newlines and combined with a geometric mean so
  journals covering every topic outrank single-topic matches. Acronyms are expanded with a
  curated CS map (`acronyms.js`, on by default, `JOURNAL_MATCH_ACRONYMS=off` to disable). Chunk
  scores are pooled as the mean of the best 3 passages (`semantic.chunkPooling`), which avoids
  favouring journals that simply have longer scopes. If the index or model is missing, the
  service degrades to BM25 + quality and the route keeps working.
- **Excluded topics**: clauses around "will not be considered", "out of scope", "excluded",
  "moratorium" and "do not accept" are stored per journal; matching topics multiply the score
  by 0.4 and attach a warning.
- Sanity check: `node scripts/testMatching.js`. Offline evaluation against the harvested
  finder rankings: `node scripts/evaluateMatching.js` (NDCG/Recall/MRR, deterministic
  train/test split, `--tune` grid-searches the blend weights on train only).

## Frontend

Each listing page calls `searchHarvestedData({ kind, subtype, … })` from
`src/services/apiClient.ts`, shows a `DeadlineStatusBadge`, and sorts with the helpers
in `src/lib/itemDates.ts`. Opportunity pages sort by soonest deadline by default;
Conferences sorts by soonest event.
