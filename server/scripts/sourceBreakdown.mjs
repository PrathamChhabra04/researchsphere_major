// Per-source health report from the harvest database (no network calls).
// Usage: npm run harvest:sources
import { readStore } from "../services/harvest/store.js";

const store = await readStore();
const counts = new Map();
for (const item of store.items) {
  counts.set(item.sourceId, (counts.get(item.sourceId) ?? 0) + 1);
}

const sources = store.sourceReports
  .map((report) => ({
    sourceId: report.sourceId,
    status: report.status,
    lastRunCount: report.count,
    storedItems: counts.get(report.sourceId) ?? 0,
    error: report.error,
  }))
  .sort((a, b) => b.storedItems - a.storedItems);

console.log(
  JSON.stringify(
    {
      updatedAt: store.updatedAt,
      totalItems: store.items.length,
      failing: sources.filter((source) => source.status === "error"),
      empty: sources.filter((source) => source.status === "ok" && !source.lastRunCount),
      top: sources.slice(0, 20),
    },
    null,
    2,
  ),
);
