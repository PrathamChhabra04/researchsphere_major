# ResearchSphere

A self-updating directory of technology research opportunities — AI, cloud, Web3, cybersecurity, data, systems and more:
conferences, journals, book-chapter calls, project/funding calls, PhD programmes,
postdocs, internships and research jobs (universities and industry AI labs).

Content is never edited by hand. A background harvester pulls listings from ~140
public sources (RSS feeds, job-board APIs and scraped pages) every few hours, parses
their deadlines and event dates, stores them in SQLite, and hides listings once they
expire.

## Quick start

Requires Node.js 20+.

```bash
npm run setup       # installs frontend and server dependencies
cp server/.env.example server/.env
npm run dev         # API on http://localhost:5001, web on http://localhost:8080
```

On first start the server harvests every source in the background (about 2 minutes);
pages fill in as soon as it finishes.

## Project structure

```
├── src/                     React + TypeScript frontend (Vite, Tailwind, shadcn/ui)
│   ├── pages/               One page per section (Conferences, PhDPrograms, ResearchJobs, …)
│   ├── components/          Shared components; ui/ holds the shadcn kit
│   ├── services/apiClient.ts  All calls to the backend
│   └── lib/                 Helpers (item date sorting, personalisation, analytics)
├── server/                  Express API
│   ├── server.js            App entry; starts the harvest scheduler
│   ├── routes/              /api routes (harvest, journals, papers, collaboration, assistant)
│   ├── services/
│   │   ├── harvest/         Source registry, scrapers, date parsing, SQLite store, scheduler
│   │   ├── journalMatcherService.js  Journal recommendations from the local corpus
│   │   ├── researchService.js        Live paper search (arXiv, OpenAlex, Crossref, …)
│   │   └── assistantService.js       Rule-based assistant (UI currently disabled)
│   ├── scripts/             Maintenance scripts (see below)
│   └── data/                harvest.db (generated) and the journal-finder corpus
└── docs/                    Architecture, API and data-source guides
```

## Scripts

| Where | Command | What it does |
|---|---|---|
| root | `npm run dev` | Run API and web together |
| root | `npm run build` / `npm run lint` | Production build / lint the frontend |
| root | `npm run eval:journal-match` | Offline NDCG/Recall/MRR against harvested rankings |
| server | `npm run harvest:refresh` | Harvest every source now and print counts and failures |
| server | `npm run harvest:sources` | Per-source health report from the database (no network) |
| server | `npm run smoke:assistant` | Exercise the assistant with sample queries |
| server | `npm run probe:journals` / `build:journal-corpus` | Rebuild the journal-finder corpus |
| server | `npm run enrich:journal-scopes` | Scrape missing Springer aims-and-scope text (slow, one-time) |

## Configuration

Backend settings live in `server/.env` (see [`server/.env.example`](server/.env.example)):
port, CORS origin, harvest interval, data retention and the SMTP account used by the
Research Collaboration form. The frontend reads `VITE_API_URL`
(default `http://localhost:5001/api`).

> Port 5000 is avoided on purpose: macOS uses it for AirPlay Receiver.

## Documentation

- [Architecture](docs/architecture.md): how harvesting, dates, storage and expiry work
- [API reference](docs/api.md)
- [Data sources](docs/data-sources.md): what is harvested and how to add a source
