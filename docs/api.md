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

## Other endpoints

| Endpoint | Purpose |
|---|---|
| `GET /journals/match?query=…` | Recommend journals for an abstract or keywords (local Springer/Elsevier corpus) |
| `GET /papers/search`, `/papers/{arxiv,semantic-scholar,core,openalex,crossref,dblp}` | Live paper search |
| `GET /conferences`, `/journals`, `/books`, `/models/huggingface`, `/projects/opportunities` | Live lookups used by older pages |
| `GET /trending`, `/stats`, `/sources`, `/search/all` | Home-page widgets |
| `POST /collaboration/submit` | Research Collaboration form; sends email when SMTP is configured |
| `POST /assistant/query` | Rule-based assistant (the UI is currently disabled) |
| `GET /health` (no `/api` prefix) | Liveness check |
