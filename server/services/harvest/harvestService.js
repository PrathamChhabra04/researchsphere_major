import { readStore, writeStore, getStorePath, computeItemId, computeItemKey } from "./store.js";
import { SOURCE_REGISTRY, runSourceHarvester } from "./sources.js";
import { enrichItemDates, getItemStatus } from "./dates.js";
import {
  applyCachedWikiCfpDetails,
  getWikiCfpEnrichmentStatus,
  runWikiCfpDetailEnrichment,
} from "./wikicfpDetails.js";
import {
  buildHarvestFacets,
  getConferencePublisherIds,
  getConferencePublisherLabels,
} from "./facets.js";

// Scraped navigation text that occasionally slips through as a "title".
const JUNK_TITLE_PATTERN = /^(skip to (main )?content|home|read more|click here|login|menu|apply( now)?)$/i;

const REFRESH_INTERVAL_HOURS = Number(process.env.HARVEST_INTERVAL_HOURS) || 6;
const REFRESH_TTL_MS = 1000 * 60 * 60 * REFRESH_INTERVAL_HOURS;
const MAX_RESULTS_DEFAULT = 50;
const MAX_RESULTS_HARD_LIMIT = 500;
const HARVEST_CONCURRENCY = 6;

let refreshPromise = null;
let schedulerTimer = null;
let nextScheduledRefreshAt = null;

const nowIso = () => new Date().toISOString();

const normalizeKey = computeItemKey;

const isIndiaRelevantItem = (item) => {
  const corpus = [
    item.title,
    item.summary,
    item.location,
    item.organization,
    ...(item.tags || []),
  ]
    .join(" ")
    .toLowerCase();

  return [
    "india",
    "indian",
    "delhi",
    "mumbai",
    "bengaluru",
    "bangalore",
    "hyderabad",
    "chennai",
    "pune",
    "kolkata",
    "iit",
    "iisc",
    "iiit",
    "ugc",
    "inr",
  ].some((term) => new RegExp(`\\b${term}\\b`).test(corpus));
};

const scoreItem = (item, query = "") => {
  let score = 0;
  const normalizedQuery = (query || "").toLowerCase().trim();
  const title = (item.title || "").toLowerCase();
  const summary = (item.summary || "").toLowerCase();

  if (!normalizedQuery) score += 5;
  if (normalizedQuery && title.includes(normalizedQuery)) score += 30;
  if (normalizedQuery && summary.includes(normalizedQuery)) score += 10;
  if (item.kind === "journal") score += 5;
  if (item.kind === "conference") score += 4;
  if (item.kind === "opportunity") score += 3;
  if (isIndiaRelevantItem(item)) score += 25;
  if ((item.sourceId || "").startsWith("noticebard-")) score += 8;

  const fetchedAt = Date.parse(item.fetchedAt || "");
  if (!Number.isNaN(fetchedAt)) {
    const ageHours = (Date.now() - fetchedAt) / (1000 * 60 * 60);
    score += Math.max(0, 20 - ageHours * 0.2);
  }

  const eventDate = Date.parse(item.eventDate || "");
  if (!Number.isNaN(eventDate)) {
    const ageDays = (Date.now() - eventDate) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 15 - ageDays * 0.05);
  }

  return Number(score.toFixed(2));
};

const dedupeItems = (items) => {
  const map = new Map();

  for (const item of items) {
    const key = normalizeKey(item);
    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    const existing = map.get(key);
    const existingScore = scoreItem(existing);
    const incomingScore = scoreItem(item);
    if (incomingScore >= existingScore) {
      map.set(key, { ...existing, ...item });
    }
  }

  return [...map.values()];
};

const hasFreshData = (store) => {
  if (!store?.updatedAt) return false;
  const updated = Date.parse(store.updatedAt);
  if (Number.isNaN(updated)) return false;
  return (
    Date.now() - updated < REFRESH_TTL_MS &&
    Array.isArray(store.items) &&
    store.items.length > 0
  );
};

export const refreshHarvestData = async ({ force = false } = {}) => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const existing = await readStore();
    if (!force && hasFreshData(existing)) {
      return {
        refreshed: false,
        ...existing,
      };
    }

    const startedAt = Date.now();
    const results = new Array(SOURCE_REGISTRY.length);

    const runHarvestTask = async (index) => {
      const source = SOURCE_REGISTRY[index];
      const harvestedItems = await runSourceHarvester(source);
      return {
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
        status: "ok",
        count: harvestedItems.length,
        durationMs: 0,
        harvestedItems,
      };
    };

    const workerCount = Math.max(
      1,
      Math.min(HARVEST_CONCURRENCY, SOURCE_REGISTRY.length),
    );
    let nextIndex = 0;

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const currentIndex = nextIndex;
          nextIndex += 1;

          if (currentIndex >= SOURCE_REGISTRY.length) {
            break;
          }

          results[currentIndex] = await Promise.resolve(
            runHarvestTask(currentIndex),
          )
            .then((value) => ({ status: "fulfilled", value }))
            .catch((reason) => ({ status: "rejected", reason }));
        }
      }),
    );

    const normalizedItems = [];
    const sourceReports = [];
    const fetchedAt = nowIso();
    const existingItems = Array.isArray(existing?.items) ? existing.items : [];

    results.forEach((result, index) => {
      const source = SOURCE_REGISTRY[index];

      if (result.status === "fulfilled") {
        const report = {
          sourceId: source.id,
          sourceName: source.name,
          sourceUrl: source.url,
          status: "ok",
          count: result.value.harvestedItems.length,
          fetchedAt,
        };
        sourceReports.push(report);

        applyCachedWikiCfpDetails(result.value.harvestedItems).forEach((item) => {
          const title = (item.title || "").trim();
          if (title.length < 4 || JUNK_TITLE_PATTERN.test(title)) return;
          normalizedItems.push(
            enrichItemDates({
              domain: "computer-science",
              fetchedAt,
              lastSeenAt: fetchedAt,
              sourceType: "website",
              ...item,
              id: computeItemId(item),
            }),
          );
        });
        return;
      }

      const fallbackItems = existingItems.filter(
        (cachedItem) => cachedItem.sourceId === source.id,
      );
      fallbackItems.forEach((cachedItem) => {
        normalizedItems.push(cachedItem);
      });

      sourceReports.push({
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
        status: "error",
        count: 0,
        fallbackCount: fallbackItems.length,
        error: result.reason?.message || "Unknown harvesting error",
        fetchedAt,
      });
    });

    const deduped = dedupeItems(normalizedItems);
    const updatedStore = await writeStore({
      updatedAt: fetchedAt,
      durationMs: Date.now() - startedAt,
      sourceReports,
      items: deduped,
      activeSourceIds: SOURCE_REGISTRY.map((source) => source.id),
    });

    // Deadlines live on WikiCFP event pages; fetch any missing ones in the background.
    startWikiCfpEnrichment();

    return {
      refreshed: true,
      ...updatedStore,
    };
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

export const getHarvestStatus = async () => {
  const store = await readStore();
  return {
    updatedAt: store.updatedAt,
    storePath: getStorePath(),
    itemCount: store.items.length,
    sourceReports: store.sourceReports,
    refreshing: Boolean(refreshPromise),
    wikicfpDetails: getWikiCfpEnrichmentStatus(),
    // Live (non-expired) listings per section, used for the home page counters.
    liveCounts: store.items.reduce((counts, item) => {
      if (getItemStatus(item) === "expired") return counts;
      const key = item.kind === "opportunity" ? item.subtype : item.kind;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
    countsByStatus: store.items.reduce((counts, item) => {
      if (item.kind === "journal") return counts;
      const key = `${item.kind}:${getItemStatus(item)}`;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
    nextScheduledRefreshAt,
    refreshIntervalHours: REFRESH_INTERVAL_HOURS,
    sourcesConfigured: SOURCE_REGISTRY.length,
    sources: SOURCE_REGISTRY.map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.kind,
      url: source.url,
    })),
  };
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const normalizeSearchText = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/\bdeeplearning\b/g, "deep learning")
    .replace(/\bmachinelearning\b/g, "machine learning")
    .replace(/\bcomputervision\b/g, "computer vision")
    .replace(/\bcyber\s*security\b/g, "cybersecurity")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const QUERY_STOPWORDS = new Set([
  "in",
  "for",
  "the",
  "a",
  "an",
  "of",
  "on",
  "and",
  "or",
  "to",
  "show",
  "find",
  "search",
  "me",
  "about",
]);

const canonicalizeToken = (token) => {
  if (!token) return token;
  if (token.startsWith("machin")) return "machine";
  if (token.startsWith("learn")) return "learning";
  if (token === "ml") return "machine";
  if (token === "ai") return "artificial";
  if (token === "datasci") return "data";
  if (token === "block" || token === "chain") return "blockchain";
  if (token.startsWith("blockchain")) return "blockchain";
  return token;
};

const buildQueryTokens = (query = "") => {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];

  const baseTokens = normalized
    .split(" ")
    .filter(
      (token) =>
        token && !QUERY_STOPWORDS.has(token) && !/^20\d{2}$/.test(token),
    )
    .map(canonicalizeToken);

  const expandedTokens = new Set(baseTokens);
  if (baseTokens.includes("artificial")) expandedTokens.add("intelligence");
  if (baseTokens.includes("machine")) expandedTokens.add("learning");
  if (baseTokens.includes("data")) expandedTokens.add("science");
  if (baseTokens.includes("blockchain")) {
    expandedTokens.add("crypto");
    expandedTokens.add("ledger");
  }

  return [...expandedTokens];
};

const timeOf = (value) => (value ? Date.parse(value) : Number.NaN);
const ascendingNullsLast = (a, b) => {
  if (Number.isNaN(a) && Number.isNaN(b)) return 0;
  if (Number.isNaN(a)) return 1;
  if (Number.isNaN(b)) return -1;
  return a - b;
};

const SORTERS = {
  relevance: (a, b) => b.score - a.score,
  // Soonest open deadline first; listings without a known deadline go last.
  deadline: (a, b) =>
    ascendingNullsLast(timeOf(a.deadlineAt), timeOf(b.deadlineAt)) || b.score - a.score,
  // Upcoming events in date order.
  start: (a, b) =>
    ascendingNullsLast(timeOf(a.startsAt), timeOf(b.startsAt)) || b.score - a.score,
  newest: (a, b) =>
    (timeOf(b.postedAt || b.firstSeenAt) || 0) - (timeOf(a.postedAt || a.firstSeenAt) || 0),
};

const toSearchResult = (item, normalizedQuery, now) => {
  const deadlineTime = timeOf(item.deadlineAt);
  return {
    ...item,
    // The UI renders `deadline`; prefer the parsed ISO date over raw scraped text.
    deadline: item.deadlineAt || item.deadline || null,
    daysUntilDeadline: Number.isNaN(deadlineTime)
      ? null
      : Math.ceil((deadlineTime - now) / (24 * 60 * 60 * 1000)),
    publishers: getConferencePublisherLabels(item),
    score: scoreItem(item, normalizedQuery),
  };
};

const extractYear = (item) => {
  const structured = item?.startsAt || item?.postedAt;
  if (structured) return new Date(structured).getUTCFullYear();
  const eventDate = item?.eventDate || "";
  const title = item?.title || "";
  const summary = item?.summary || "";

  const parsedEvent = Date.parse(eventDate);
  if (!Number.isNaN(parsedEvent)) {
    return new Date(parsedEvent).getFullYear();
  }

  const combined = `${eventDate} ${title} ${summary}`;
  const yearMatch = combined.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;

  const year = Number.parseInt(yearMatch[1], 10);
  return Number.isNaN(year) ? null : year;
};

export const searchHarvestData = async (filters = {}) => {
  const {
    query = "",
    kind,
    subtype,
    sourceId,
    publisher,
    location,
    year,
    fromYear,
    includePast,
    includeExpired,
    status,
    sort,
    limit,
    page,
  } = filters;

  const cache = await getCachedStoreAndRevalidate();
  const requestedLimit = Math.min(
    parsePositiveInt(limit, MAX_RESULTS_DEFAULT),
    MAX_RESULTS_HARD_LIMIT,
  );
  const currentPage = parsePositiveInt(page, 1);
  const offset = (currentPage - 1) * requestedLimit;
  const normalizedQuery = normalizeSearchText(query);
  const normalizedLocation = (location || "").toLowerCase().trim();
  const queryTokens = buildQueryTokens(normalizedQuery);
  const requestedYear = parsePositiveInt(year, null);
  const minimumYear = parsePositiveInt(fromYear, null);
  const showExpired =
    String(includeExpired || includePast || "false").toLowerCase() === "true";
  const allowedStatuses = status
    ? new Set(String(status).split(",").map((value) => value.trim()))
    : null;
  const now = Date.now();
  const publisherFilter = String(publisher || "").toLowerCase().trim();

  const matchesBaseFilters = (item) => {
    if (!showExpired && item.status === "expired") return false;
    if (allowedStatuses && !allowedStatuses.has(item.status)) return false;
    if (kind && item.kind !== kind) return false;
    if (subtype && item.subtype !== subtype) return false;
    if (sourceId && item.sourceId !== sourceId) return false;

    if (requestedYear) {
      const itemYear = extractYear(item);
      if (!itemYear || itemYear !== requestedYear) return false;
    }

    if (minimumYear) {
      const itemYear = extractYear(item);
      if (itemYear && itemYear < minimumYear) return false;
    }

    if (normalizedLocation) {
      const itemLocation = (item.location || "").toLowerCase();
      if (!itemLocation.includes(normalizedLocation)) return false;
    }

    if (!normalizedQuery) return true;
    const haystack = [
      item.title,
      item.summary,
      item.organization,
      item.location,
      ...getConferencePublisherLabels(item),
      ...(item.tags || []),
    ].join(" ");

    const normalizedHaystack = normalizeSearchText(haystack);
    if (normalizedHaystack.includes(normalizedQuery)) return true;

    if (!queryTokens.length) return false;
    const matchedTokenCount = queryTokens.filter((token) =>
      normalizedHaystack.includes(token),
    ).length;

    if (matchedTokenCount === 0) return false;
    if (queryTokens.length <= 2) return matchedTokenCount >= 1;
    return matchedTokenCount >= 2;
  };

  const matched = cache.items
    .map((item) => ({ ...item, status: getItemStatus(item, now) }))
    .filter(matchesBaseFilters);

  // Facets are derived from the current query so counts match visible results.
  const facets = buildHarvestFacets(matched);

  const filtered = matched
    .filter(
      (item) =>
        !publisherFilter ||
        getConferencePublisherIds(item).includes(publisherFilter),
    )
    .map((item) => toSearchResult(item, normalizedQuery, now))
    .sort(SORTERS[sort] || SORTERS.relevance);

  const paged = filtered.slice(offset, offset + requestedLimit);

  return {
    total: filtered.length,
    page: currentPage,
    limit: requestedLimit,
    results: paged,
    facets,
    updatedAt: cache.updatedAt,
  };
};


function startWikiCfpEnrichment() {
  runWikiCfpDetailEnrichment().catch((error) =>
    console.error("[harvest] WikiCFP detail enrichment failed:", error.message),
  );
}

const runBackgroundRefresh = (reason) => {
  if (refreshPromise) return;
  console.log(`[harvest] background refresh started (${reason})`);
  refreshHarvestData({ force: false })
    .then((result) => {
      if (!result.refreshed) return;
      const failed = (result.sourceReports || []).filter(
        (report) => report.status === "error",
      ).length;
      console.log(
        `[harvest] refresh done: ${result.items.length} items, ${failed} source errors, ${result.durationMs}ms`,
      );
    })
    .catch((error) => {
      console.error("[harvest] background refresh failed:", error.message);
    })
    // Startup with a fresh cache still needs any missing WikiCFP deadlines.
    .finally(startWikiCfpEnrichment);
};

// Serve whatever is cached immediately; only block when there is nothing to show yet.
const getCachedStoreAndRevalidate = async () => {
  const store = await readStore();
  if (!Array.isArray(store?.items) || store.items.length === 0) {
    return refreshHarvestData({ force: false });
  }
  if (!hasFreshData(store)) {
    runBackgroundRefresh("stale cache on search");
  }
  return store;
};

export const startHarvestScheduler = () => {
  if (schedulerTimer) return;
  runBackgroundRefresh("startup");
  nextScheduledRefreshAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  schedulerTimer = setInterval(() => {
    nextScheduledRefreshAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
    runBackgroundRefresh("schedule");
  }, REFRESH_TTL_MS);
  schedulerTimer.unref?.();
  console.log(
    `[harvest] scheduler running every ${REFRESH_INTERVAL_HOURS}h (next: ${nextScheduledRefreshAt})`,
  );
};
