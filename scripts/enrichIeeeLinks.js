#!/usr/bin/env node
/**
 * Enrich the imported IEEE journals with a working "View journal" link.
 *
 *   node scripts/enrichIeeeLinks.js            # use cached OpenAlex responses
 *   node scripts/enrichIeeeLinks.js --refresh  # ignore the cache and refetch
 *   node scripts/enrichIeeeLinks.js --dry-run  # report only, do not write
 *
 * For every journal in server/data/ieee-journals.json:
 *   1. Ask OpenAlex for the source record, trying the print ISSN and then the
 *      eISSN: https://api.openalex.org/sources/issn:<ISSN>?mailto=<mailto>
 *      Responses are cached in server/data/openalex-source-cache.json so
 *      re-runs do not hit the network again.
 *   2. Keep `homepage_url` as `journalUrl` only when it is an http(s) link on
 *      ieeexplore.ieee.org or ieee.org and is not the bare site root.
 *      Otherwise use an IEEE Xplore title-search URL and mark
 *      `linkSource: "search-fallback"`; real homepages get
 *      `linkSource: "openalex"`.
 *   3. Apply server/data/ieee-submission-overrides.json (ISSN -> submission
 *      link) without ever writing that file.
 *
 * Only the OpenAlex API is contacted. ieeexplore.ieee.org is never fetched or
 * scraped (it is bot-protected).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const JOURNALS_PATH = path.join(projectRoot, "server/data/ieee-journals.json");
const CACHE_PATH = path.join(
  projectRoot,
  "server/data/openalex-source-cache.json",
);
const OVERRIDES_PATH = path.join(
  projectRoot,
  "server/data/ieee-submission-overrides.json",
);

const OPENALEX_BASE_URL = "https://api.openalex.org";
const MAILTO = process.env.OPENALEX_MAILTO || "researchsphere@example.com";
const DELAY_MS =
  Number.parseInt(process.env.OPENALEX_DELAY_MS || "200", 10) || 200;
const USER_AGENT = `ResearchSphere journal links (${MAILTO})`;

const args = new Set(process.argv.slice(2));
const refresh = args.has("--refresh");
const dryRun = args.has("--dry-run");

const rel = (target) =>
  path.relative(projectRoot, target).split(path.sep).join("/");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// OpenAlex
// ---------------------------------------------------------------------------

const cache = readJson(CACHE_PATH, { version: 1, entries: {} });
if (!cache.entries || typeof cache.entries !== "object") {
  cache.entries = {};
}

const requestSource = async (issn) => {
  const url =
    `${OPENALEX_BASE_URL}/sources/issn:${encodeURIComponent(issn)}` +
    `?mailto=${encodeURIComponent(MAILTO)}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      });

      if (response.status === 200) {
        const body = await response.json();
        return {
          status: 200,
          fetchedAt: new Date().toISOString(),
          source: {
            id: body.id || null,
            displayName: body.display_name || null,
            homepageUrl: body.homepage_url ? String(body.homepage_url).trim() : null,
          },
        };
      }

      if (response.status === 404) {
        return { status: 404, fetchedAt: new Date().toISOString(), source: null };
      }

      // Rate limited or transient server error: retry once, then give up
      // without caching so the next run can try again.
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 0) {
          await sleep(2000);
          continue;
        }
      }

      return {
        status: response.status,
        fetchedAt: new Date().toISOString(),
        source: null,
        error: `HTTP ${response.status}`,
        transient: true,
      };
    } catch (error) {
      if (attempt === 0) {
        await sleep(1000);
        continue;
      }
      return {
        status: 0,
        fetchedAt: new Date().toISOString(),
        source: null,
        error: error.message,
        transient: true,
      };
    }
  }

  return {
    status: 0,
    fetchedAt: new Date().toISOString(),
    source: null,
    error: "request failed",
    transient: true,
  };
};

const getSource = async (issn) => {
  const cached = cache.entries[issn];
  if (!refresh && cached) return { ...cached, cached: true };

  const result = await requestSource(issn);
  if (!result.transient) cache.entries[issn] = result;
  return { ...result, cached: false };
};

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

const classifyHomepage = (value) => {
  if (!value) return "missing";

  let url;
  try {
    url = new URL(value);
  } catch {
    return "invalid";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return "invalid";

  const host = url.hostname.toLowerCase();
  if (!(host === "ieee.org" || host.endsWith(".ieee.org"))) return "non-ieee";

  // Reject only the generic site roots. Dedicated journal subdomains such as
  // thz.ieee.org are meaningful homepages even at "/".
  const genericHosts = new Set([
    "ieee.org",
    "www.ieee.org",
    "ieeexplore.ieee.org",
  ]);
  if (url.pathname === "/" && !url.search && genericHosts.has(host)) {
    return "non-specific";
  }

  return "ok";
};

const isIeeeHomepage = (value) => classifyHomepage(value) === "ok";

const searchFallbackUrl = (title) =>
  "https://ieeexplore.ieee.org/search/searchresult.jsp" +
  `?queryText=${encodeURIComponent(title)}`;

// ---------------------------------------------------------------------------
// Submission overrides (manual, never written here)
// ---------------------------------------------------------------------------

const readOverrides = () => {
  const parsed = readJson(OVERRIDES_PATH, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const overrides = {};
  for (const [key, value] of Object.entries(parsed)) {
    const issn = String(key).trim();
    const link = typeof value === "string" ? value.trim() : "";
    if (!issn || !link) continue;

    try {
      const url = new URL(link);
      if (url.protocol === "http:" || url.protocol === "https:") {
        overrides[issn] = link;
      }
    } catch {
      // Ignore malformed entries; the report calls them out.
    }
  }
  return overrides;
};

const overrideFor = (journal, overrides) => {
  for (const issn of [journal.issn, journal.eissn]) {
    if (issn && overrides[issn]) return { issn, link: overrides[issn] };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const issnCandidates = (journal) =>
  [...new Set([journal.issn, journal.eissn].filter(Boolean))];

const resolveJournal = async (journal) => {
  const tried = [];
  let foundSource = null;
  let rejectedHomepage = null;
  let rejectedIssn = null;
  let reason = "no-source";

  for (const issn of issnCandidates(journal)) {
    const result = await getSource(issn);
    tried.push({
      issn,
      status: result.status,
      error: result.error || null,
      cached: Boolean(result.cached),
    });
    if (!result.cached) await sleep(DELAY_MS);

    if (result.status === 200 && result.source) {
      foundSource = result.source;
      const homepage = result.source.homepageUrl;
      const kind = classifyHomepage(homepage);

      if (kind === "ok") {
        return {
          journalUrl: homepage,
          linkSource: "openalex",
          issn,
          source: foundSource,
          tried,
          rejectedHomepage,
          rejectedIssn,
          reason: "openalex",
        };
      }

      if (!rejectedHomepage) {
        rejectedHomepage = homepage;
        rejectedIssn = issn;
      }
      reason =
        kind === "missing"
          ? "no-homepage"
          : kind === "non-ieee"
            ? "non-ieee-homepage"
            : kind === "non-specific"
              ? "non-specific-homepage"
              : "invalid-homepage";
    }
  }

  return {
    journalUrl: searchFallbackUrl(journal.title),
    linkSource: "search-fallback",
    issn: null,
    source: foundSource,
    tried,
    rejectedHomepage,
    rejectedIssn,
    reason,
  };
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const countBy = (items, predicate) => items.filter(predicate).length;

const report = ({
  journals,
  results,
  overrides,
  overridesApplied,
  cacheHits,
  cacheMisses,
}) => {
  const lines = [];
  const push = (line = "") => lines.push(line);

  const openalex = journals.filter((journal) => journal.linkSource === "openalex");
  const fallback = journals.filter(
    (journal) => journal.linkSource === "search-fallback",
  );
  const manual = journals.filter((journal) => journal.linkSource === "manual");

  const reasonCount = (reason) =>
    countBy(results, (result) => result.resolved.reason === reason);

  push("IEEE journal link enrichment");
  push("============================");
  push(`Journals:                 ${journals.length}`);
  push(`OpenAlex homepage:        ${openalex.length}`);
  push(`Search fallback:          ${fallback.length}`);
  push(`  no homepage_url:        ${reasonCount("no-homepage")}`);
  push(`  non-IEEE homepage:      ${reasonCount("non-ieee-homepage")}`);
  push(`  non-specific homepage:  ${reasonCount("non-specific-homepage")}`);
  push(`  invalid homepage:       ${reasonCount("invalid-homepage")}`);
  push(`  no OpenAlex source:     ${reasonCount("no-source")}`);
  push(`Manual links preserved:   ${manual.length}`);
  push(
    `Submission overrides:     ${overridesApplied} applied (${Object.keys(overrides).length} in file)`,
  );
  push(`Cache:                    ${cacheHits} hits, ${cacheMisses} misses`);
  push("");

  const noSource = results.filter(
    (result) => result.resolved.reason === "no-source",
  );
  push("ISSNs with no OpenAlex source:");
  if (!noSource.length) {
    push("  none");
  } else {
    for (const { journal, resolved } of noSource) {
      const attempts = resolved.tried
        .map((attempt) =>
          attempt.error
            ? `${attempt.issn} ${attempt.error}`
            : `${attempt.issn} ${attempt.status}`,
        )
        .join(", ");
      push(`  ${journal.acronym || "?"}  ${journal.title}  [${attempts}]`);
    }
  }
  push("");

  const rejected = results.filter(
    (result) =>
      result.resolved.rejectedHomepage &&
      result.resolved.reason !== "openalex",
  );
  push("Homepage URLs rejected (non-IEEE or not journal-specific):");
  if (!rejected.length) {
    push("  none");
  } else {
    for (const { journal, resolved } of rejected) {
      push(
        `  ${journal.acronym || "?"}  ${journal.title}  ` +
          `[${resolved.rejectedIssn}] ${resolved.rejectedHomepage}  ` +
          `(${resolved.reason})`,
      );
    }
  }
  push("");

  push("Sample journalUrl values:");
  const sampleCount = Math.min(5, journals.length);
  const sampleIndexes = new Set();
  for (let index = 0; index < sampleCount; index += 1) {
    sampleIndexes.add(
      Math.floor((index * journals.length) / sampleCount),
    );
  }
  for (const index of [...sampleIndexes].sort((left, right) => left - right)) {
    const journal = journals[index];
    push(
      `  ${journal.acronym || "?"}  ${journal.journalUrl}  (${journal.linkSource})`,
    );
  }
  push("");

  push(`Output: ${rel(JOURNALS_PATH)}${dryRun ? " (dry run, not written)" : ""}`);

  console.log(lines.join("\n"));
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const data = readJson(JOURNALS_PATH, null);
  if (!data || !Array.isArray(data.journals)) {
    throw new Error(`Could not read ${rel(JOURNALS_PATH)}`);
  }

  const overrides = readOverrides();
  const results = [];
  let cacheHits = 0;
  let cacheMisses = 0;
  let overridesApplied = 0;
  let changed = false;

  for (const journal of data.journals) {
    const manualLink =
      journal.linkSource === "manual" && Boolean(journal.journalUrl);

    let resolved;
    if (manualLink) {
      resolved = {
        journalUrl: journal.journalUrl,
        linkSource: "manual",
        issn: null,
        source: null,
        tried: [],
        rejectedHomepage: null,
        rejectedIssn: null,
        reason: "manual",
      };
    } else {
      resolved = await resolveJournal(journal);
      for (const attempt of resolved.tried) {
        if (attempt.cached) cacheHits += 1;
        else cacheMisses += 1;
      }
    }

    const next = { ...journal };
    if (!manualLink) {
      next.journalUrl = resolved.journalUrl;
      next.linkSource = resolved.linkSource;
    }

    const override = overrideFor(journal, overrides);
    if (override) {
      next.submissionLink = override.link;
      overridesApplied += 1;
    }

    if (
      next.journalUrl !== journal.journalUrl ||
      next.linkSource !== journal.linkSource ||
      next.submissionLink !== journal.submissionLink
    ) {
      changed = true;
    }

    results.push({ journal: next, resolved });
  }

  const journals = results.map((result) => result.journal);
  const { journals: _existingJournals, ...meta } = data;
  const payload = changed
    ? {
        ...meta,
        linksEnrichedAt: new Date().toISOString(),
        journals,
      }
    : data;

  if (!dryRun) {
    fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    if (changed) {
      fs.writeFileSync(
        JOURNALS_PATH,
        `${JSON.stringify(payload, null, 2)}\n`,
        "utf8",
      );
    }
  }

  report({
    journals,
    results,
    overrides,
    overridesApplied,
    cacheHits,
    cacheMisses,
  });
};

main().catch((error) => {
  console.error(`[enrichIeeeLinks] ${error.message}`);
  process.exitCode = 1;
});
