// WikiCFP RSS feeds carry only event dates and location; the submission deadline,
// notification date and official conference link live on each event page. This
// module scrapes those pages in the background (WikiCFP asks for a 5 s crawl delay,
// enforced by fetchText's per-host queue) and caches the result per URL.
import { fetchText } from "./sources.js";
import { getDetailCache, readStore, setDetailCache, updateItemsByUrl } from "./store.js";
import { getItemStatus } from "./dates.js";

const DETAIL_MAX_AGE_DAYS = 14; // deadlines get extended; re-check every two weeks
const DAY_MS = 24 * 60 * 60 * 1000;

const MILESTONE_LABELS = {
  "abstract registration due": "abstract",
  "submission deadline": "submission",
  "notification due": "notification",
  "final version due": "cameraReady",
};

let enrichment = { running: false, done: 0, pending: 0, failed: 0, lastRunAt: null };
let rerunRequested = false;

export const isWikiCfpEventUrl = (url) => /wikicfp\.com\/cfp\/servlet\/event\.showcfp/i.test(url || "");

/** Extract milestone dates and the official site from a WikiCFP event page. */
export const parseWikiCfpDetail = (html) => {
  const milestones = {};
  // Each date is exposed as RDFa: <span property="v:summary" content="Submission Deadline"> … <span property="v:startDate" content="2026-10-30T00:00:00">
  const pattern = /property="v:summary" content="([^"]+)"[\s\S]*?property="v:startDate" content="(\d{4}-\d{2}-\d{2})/g;
  let match;
  while ((match = pattern.exec(html))) {
    const key = MILESTONE_LABELS[match[1].trim().toLowerCase()];
    if (key) milestones[key] = `${match[2]}T00:00:00.000Z`;
  }
  const officialUrl = html.match(/Link:\s*<a href="(https?:\/\/[^"]+)"/i)?.[1] ?? null;
  return { milestones, officialUrl };
};

/** Item fields derived from a parsed detail page. */
export const detailFields = (detail) => {
  const deadline = detail?.milestones?.submission || detail?.milestones?.abstract || null;
  return {
    milestones: detail?.milestones ?? {},
    officialUrl: detail?.officialUrl ?? null,
    ...(deadline ? { deadline, deadlineAt: deadline } : {}),
  };
};

/** Merge cached detail data into freshly harvested items (synchronous, no network). */
export const applyCachedWikiCfpDetails = (items) => {
  const urls = items.filter((item) => isWikiCfpEventUrl(item.url)).map((item) => item.url);
  if (!urls.length) return items;
  const cache = getDetailCache(urls);
  return items.map((item) => {
    const cached = cache.get(item.url);
    return cached ? { ...item, ...detailFields(cached.data) } : item;
  });
};

/**
 * Fetch detail pages for WikiCFP conferences that are still live and have no fresh
 * cache entry. Runs in the background; results are written straight to the store.
 */
export const runWikiCfpDetailEnrichment = async () => {
  if (enrichment.running) {
    // A harvest added new events mid-run; pick them up once this pass finishes.
    rerunRequested = true;
    return enrichment;
  }

  const store = await readStore();
  const now = Date.now();
  const urls = [
    ...new Set(
      store.items
        .filter((item) => isWikiCfpEventUrl(item.url) && getItemStatus(item, now) !== "expired")
        .map((item) => item.url),
    ),
  ];
  const cache = getDetailCache(urls);
  const stale = urls.filter((url) => {
    const entry = cache.get(url);
    return !entry || now - Date.parse(entry.fetchedAt) > DETAIL_MAX_AGE_DAYS * DAY_MS;
  });

  enrichment = { running: true, done: 0, pending: stale.length, failed: 0, lastRunAt: new Date().toISOString() };
  if (!stale.length) {
    enrichment.running = false;
    return enrichment;
  }
  console.log(`[harvest] fetching ${stale.length} WikiCFP event pages for deadlines (5 s apart)`);

  for (const url of stale) {
    try {
      const detail = parseWikiCfpDetail(await fetchText(url));
      setDetailCache(url, detail);
      updateItemsByUrl(url, detailFields(detail));
      enrichment.done += 1;
    } catch (error) {
      enrichment.failed += 1;
      console.error(`[harvest] WikiCFP detail failed for ${url}: ${error.message}`);
    }
    enrichment.pending -= 1;
  }

  enrichment.running = false;
  console.log(`[harvest] WikiCFP details done: ${enrichment.done} updated, ${enrichment.failed} failed`);
  if (rerunRequested) {
    rerunRequested = false;
    return runWikiCfpDetailEnrichment();
  }
  return enrichment;
};

export const getWikiCfpEnrichmentStatus = () => ({ ...enrichment });
