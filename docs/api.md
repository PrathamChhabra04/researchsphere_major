# API reference

Base URL: `http://localhost:5001/api`. All responses are JSON.

## Harvested listings

### `GET /harvest/search`

| Param | Description |
|---|---|
| `kind` | `conference`, `journal` or `opportunity` |
| `subtype` | e.g. `phd`, `postdoc`, `internship`, `research`, `project-call`, `book-chapter` |
| `query` | Free-text search over title, summary, organisation, location and tags |
| `location` | Substring match on location |
| `sourceId` | Restrict to one source |
| `status` | Comma-separated: `open,closing-soon,upcoming,submissions-closed,expired,unknown` |
| `includeExpired` | `true` to include expired listings (hidden by default) |
| `year` / `fromYear` | Exact year / minimum year of the event or posting |
| `sort` | `relevance` (default), `deadline`, `start`, `newest` |
| `limit` / `page` | Page size (max 500) and page number |

Each result adds `status`, `daysUntilDeadline`, `deadlineAt`, `startsAt`, `endsAt`,
`postedAt` and `firstSeenAt`. The response is `{ success, data: [...], meta: { total, page, limit, updatedAt } }`.

### `GET /harvest/status`

Last refresh time, whether a refresh is running, the next scheduled run, item counts by
status, and a report for every source (`ok` / `error`, item count, error message).

### `POST /harvest/refresh?force=true`

Run a harvest now. Without `force`, it is skipped while the data is still fresh.

## Special issues

### `GET /special-issues`

Manually collected ScienceDirect calls for special issues (Computer Science only).

| Param | Description |
|---|---|
| `query` | Free-text match over title, guest editors, journal and secondary subject |
| `secondarySubject` | Exact secondary subject area, e.g. `Artificial Intelligence` |

Expired calls are removed at read time and the nearest deadline is returned first.
Response: `{ success, data, count, meta: { total, filtered, scrapedAt, subjectArea, subjectSlug, secondarySubjectAreas, closingSoonDays } }`.

The dataset is refreshed manually, not by the harvest scheduler:

```bash
node scripts/scrapeSpecialIssues.js
```

ScienceDirect blocks automated listing requests, so the script also parses a
manually saved capture; see
[`server/data/raw/README.md`](../server/data/raw/README.md).

## Other endpoints

### `GET /journals/match`

Recommend journals from the local Springer/Elsevier corpus.

| Param | Description |
|---|---|
| `query` | Keywords, aims & scope text, or an abstract |
| `mode` | `keyword` (default) or `abstract` |
| `provider` | `all` (default), `springer` or `elsevier` |
| `limit` | Max results (default 20) |

Response: `{ success, data, meta: { topics, totalCorpus, mode, semanticAvailable, indexBuiltAt }, count }`.
Each item keeps the journal fields (`title`, `provider`, `issn`, `subjectAreas`,
`impactFactor`, `citeScore`, `decisionDays`, `scope`, links, …) and adds
`score` (0–1), `matchPercent`, `semanticScore`, `bm25Score`, `qualityScore`,
`matchedSubjectAreas`, `matchedTopics`, `whyMatched`, `warnings` and `matchReasons`.

The embedding index is built manually (`node scripts/buildJournalIndex.js`); without it the
endpoint falls back to BM25 scoring.

| Endpoint | Purpose |
|---|---|
| `GET /papers/search`, `/papers/{arxiv,semantic-scholar,core,openalex,crossref,dblp}` | Live paper search |
| `GET /conferences`, `/journals`, `/books`, `/models/huggingface`, `/projects/opportunities` | Live lookups used by older pages |
| `GET /trending`, `/stats`, `/sources`, `/search/all` | Home-page widgets |
| `POST /collaboration/submit` | Research Collaboration form; sends email when SMTP is configured |
| `POST /assistant/query` | Rule-based assistant (the UI is currently disabled) |
| `GET /health` (no `/api` prefix) | Liveness check |
