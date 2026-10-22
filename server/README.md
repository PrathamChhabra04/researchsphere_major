# ResearchSphere API

Express backend for ResearchSphere. It harvests opportunity listings in the background
into SQLite and serves search, journal matching and live paper lookups under `/api`.

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:5001  (health: /health)
```

See the root [README](../README.md) for scripts and configuration, and
[docs/](../docs) for the architecture, API reference and data-source guide.
