import fs from "fs/promises";
import path from "path";
import { MATCH_CONFIG } from "./config.js";
import {
  cleanText,
  normalizeKey,
  normalizeWhitespace,
  unique,
} from "./text.js";

/**
 * Loads and merges the local journal-finder corpus.
 * This is the same data the Journals page has always used; only the
 * matching/scoring stage has changed.
 */

let corpusCache = null;

const toAbsoluteField = (value) => normalizeWhitespace(value);

const pickBetterNumber = (left, right) => {
  if (left == null) return right ?? null;
  if (right == null) return left ?? null;
  return Math.max(left, right);
};

const pickLowerNumber = (left, right) => {
  if (left == null) return right ?? null;
  if (right == null) return left ?? null;
  return Math.min(left, right);
};

export const journalKey = (journal) =>
  journal.issn
    ? `${journal.provider}:${journal.issn}`
    : `${journal.provider}:${normalizeKey(journal.title)}`;

export const toCorpusJournal = (item, topicSeed, sourceRun) => ({
  provider: item.provider,
  title: toAbsoluteField(item.title),
  sourceUrl: item.sourceUrl || null,
  submissionLink: item.submissionLink || null,
  guideForAuthors: item.guideForAuthors || null,
  acronym: item.acronym || null,
  issn: item.issn || null,
  publishingModel: item.publishingModel || null,
  openAccessType: item.openAccessType || null,
  impactFactor: item.impactFactor ?? null,
  citeScore: item.citeScore ?? null,
  decisionDays: item.decisionDays ?? null,
  acceptanceDays: item.acceptanceDays ?? null,
  subjectAreas: Array.isArray(item.subjectAreas) ? item.subjectAreas : [],
  articleTypes: Array.isArray(item.articleTypes) ? item.articleTypes : [],
  scope: toAbsoluteField(item.scope),
  editorInChief: item.editorInChief || null,
  goldOpenAccessFee: item.goldOpenAccessFee ?? null,
  goldOpenAccessCurrency: item.goldOpenAccessCurrency || null,
  coverImage: item.coverImage || null,
  hasAgreements: item.hasAgreements ?? null,
  topicSeeds: unique([topicSeed]),
  sourceRuns: unique([sourceRun]),
  rank: item.rank ?? null,
});

const mergeJournalRecords = (current, incoming, topicSeed) => ({
  ...current,
  title: current.title || incoming.title,
  sourceUrl: current.sourceUrl || incoming.sourceUrl,
  submissionLink: current.submissionLink || incoming.submissionLink,
  guideForAuthors: current.guideForAuthors || incoming.guideForAuthors,
  acronym: current.acronym || incoming.acronym || null,
  issn: current.issn || incoming.issn || null,
  publishingModel: current.publishingModel || incoming.publishingModel || null,
  openAccessType: current.openAccessType || incoming.openAccessType || null,
  impactFactor: pickBetterNumber(current.impactFactor, incoming.impactFactor),
  citeScore: pickBetterNumber(current.citeScore, incoming.citeScore),
  decisionDays: pickLowerNumber(current.decisionDays, incoming.decisionDays),
  acceptanceDays: pickLowerNumber(
    current.acceptanceDays,
    incoming.acceptanceDays,
  ),
  subjectAreas: unique([
    ...(current.subjectAreas || []),
    ...(incoming.subjectAreas || []),
  ]),
  articleTypes: unique([
    ...(current.articleTypes || []),
    ...(incoming.articleTypes || []),
  ]),
  scope:
    normalizeWhitespace(current.scope).length >=
    normalizeWhitespace(incoming.scope).length
      ? current.scope
      : incoming.scope,
  editorInChief: current.editorInChief || incoming.editorInChief || null,
  goldOpenAccessFee:
    current.goldOpenAccessFee ?? incoming.goldOpenAccessFee ?? null,
  goldOpenAccessCurrency:
    current.goldOpenAccessCurrency || incoming.goldOpenAccessCurrency || null,
  coverImage: current.coverImage || incoming.coverImage || null,
  hasAgreements: current.hasAgreements ?? incoming.hasAgreements ?? null,
  topicSeeds: unique([...(current.topicSeeds || []), topicSeed]),
  sourceRuns: unique([
    ...(current.sourceRuns || []),
    ...(incoming.sourceRuns || []),
  ]),
  rank: Math.min(
    current.rank || Number.MAX_SAFE_INTEGER,
    incoming.rank || Number.MAX_SAFE_INTEGER,
  ),
});

const listCorpusRuns = async () => {
  const entries = await fs
    .readdir(MATCH_CONFIG.paths.probeRoot, { withFileTypes: true })
    .catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
};

const readRunSummary = async (runName) => {
  const summaryPath = path.join(MATCH_CONFIG.paths.probeRoot, runName, "summary.json");
  const mergedPath = path.join(
    MATCH_CONFIG.paths.probeRoot,
    runName,
    "journals-merged.json",
  );
  const [summaryText, mergedText] = await Promise.all([
    fs.readFile(summaryPath, "utf8"),
    fs.readFile(mergedPath, "utf8"),
  ]);

  return {
    runName,
    summary: JSON.parse(summaryText),
    journals: JSON.parse(mergedText),
  };
};

const readScopeEnrichment = async () => {
  try {
    const raw = await fs.readFile(MATCH_CONFIG.paths.scopeEnrichmentFile, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.entries && typeof parsed.entries === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const springerJournalId = (sourceUrl) => {
  const match = /\/journal\/(\d+)/.exec(String(sourceUrl || ""));
  return match ? match[1] : null;
};

/**
 * Merge offline scraped scope/ISSN data (server/data/journal-scope-enrichment.json).
 * Only replaces the scope when the enrichment is actually longer.
 */
const applyScopeEnrichment = (journal, enrichment) => {
  if (!enrichment?.entries) return journal;

  const journalId = journal.provider === "springer"
    ? springerJournalId(journal.sourceUrl)
    : null;
  if (!journalId) return journal;

  const entry = enrichment.entries[`${journal.provider}:${journalId}`];
  if (!entry) return journal;

  const currentScope = normalizeWhitespace(journal.scope);
  const enrichedScope = normalizeWhitespace(entry.scope);

  return {
    ...journal,
    scope: enrichedScope.length > currentScope.length ? enrichedScope : journal.scope,
    issn: journal.issn || entry.issn || null,
  };
};

const sanitizeDays = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= 365
    ? Math.round(value)
    : null;

const loadAndPrepareCorpus = async () => {
  if (corpusCache) return corpusCache;

  const [runs, enrichment] = await Promise.all([
    listCorpusRuns(),
    readScopeEnrichment(),
  ]);
  const loadedRuns = await Promise.allSettled(runs.map(readRunSummary));
  const byKey = new Map();
  const topics = new Set();

  for (const loaded of loadedRuns) {
    if (loaded.status !== "fulfilled") continue;
    const { runName, summary, journals } = loaded.value;
    const topicSeed = normalizeWhitespace(summary.query || "").toLowerCase();
    if (topicSeed) topics.add(topicSeed);

    for (const item of journals) {
      const normalized = applyScopeEnrichment(
        toCorpusJournal(item, topicSeed, runName),
        enrichment,
      );
      const key = journalKey(normalized);

      if (byKey.has(key)) {
        byKey.set(key, mergeJournalRecords(byKey.get(key), normalized, topicSeed));
      } else {
        byKey.set(key, normalized);
      }
    }
  }

  const journals = [...byKey.values()]
    .map((journal) => ({
      ...journal,
      id: journalKey(journal),
      scope: cleanText(journal.scope),
      decisionDays: sanitizeDays(journal.decisionDays),
      acceptanceDays: sanitizeDays(journal.acceptanceDays),
    }))
    .sort((left, right) => left.title.localeCompare(right.title));

  corpusCache = {
    journals,
    byId: new Map(journals.map((journal) => [journal.id, journal])),
    topics: [...topics].sort(),
    totalRuns: loadedRuns.filter((run) => run.status === "fulfilled").length,
  };

  return corpusCache;
};

export const loadJournalCorpus = async () => {
  const corpus = await loadAndPrepareCorpus();
  return {
    journals: corpus.journals,
    byId: corpus.byId,
    topics: corpus.topics,
    totalRuns: corpus.totalRuns,
  };
};
