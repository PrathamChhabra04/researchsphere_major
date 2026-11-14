#!/usr/bin/env node
/**
 * Offline evaluation for local journal matching.
 *
 *   node scripts/evaluateMatching.js
 *   node scripts/evaluateMatching.js --split test
 *   node scripts/evaluateMatching.js --verbose --k 10
 *
 * Weak labels come from the harvested journal-finder rankings: for every probe
 * run and provider we know which journals Elsevier/Springer ranked in the top
 * 10 (and 40/20 overall). A run is scored by restricting the corpus to that
 * provider, querying with the run's topic, and comparing our top-k against the
 * finder's ranking.
 *
 * Metrics (mean over queries):
 *   NDCG@k   graded: finder rank 1-3 -> 3, 4-10 -> 2, 11-40 -> 1
 *   Recall@k share of the finder's top 10 that we returned in our top k
 *   MRR@k    1/position of the first finder top-3 journal
 *
 * Queries are split deterministically (hash of query) into train/test so weight
 * changes can be tuned on train and checked on held-out queries.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MATCH_CONFIG } from "../server/services/journalMatch/config.js";
import { journalKey } from "../server/services/journalMatch/corpus.js";
import { normalizeKey } from "../server/services/journalMatch/text.js";
import {
  searchJournalCorpus,
  warmupJournalMatcher,
} from "../server/services/journalMatcherService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    k: 10,
    split: "all",
    verbose: false,
    json: false,
    tune: false,
    weights: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--k" && args[index + 1]) {
      options.k = Math.max(1, Number.parseInt(args[index + 1], 10) || 10);
      index += 1;
    } else if (arg === "--split" && args[index + 1]) {
      options.split = ["all", "train", "test"].includes(args[index + 1])
        ? args[index + 1]
        : "all";
      index += 1;
    } else if (arg === "--weights" && args[index + 1]) {
      const [semantic, bm25, quality] = args[index + 1]
        .split(",")
        .map((value) => Number.parseFloat(value));
      if ([semantic, bm25, quality].every(Number.isFinite)) {
        options.weights = { semantic, bm25, quality };
      }
      index += 1;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--tune") {
      options.tune = true;
    }
  }

  return options;
};

const hashString = (value) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

/** Deterministic ~70/30 split by query, stable across runs. */
const splitForQuery = (query) => (hashString(query) % 10 < 7 ? "train" : "test");

const relevanceForRank = (rank) => {
  if (rank <= 3) return 3;
  if (rank <= 10) return 2;
  return 1;
};

const dcg = (relevances) =>
  relevances.reduce(
    (sum, relevance, index) =>
      sum + (Math.pow(2, relevance) - 1) / Math.log2(index + 2),
    0,
  );

const ndcgAtK = (returned, goldenByKey, k) => {
  const relevances = returned
    .slice(0, k)
    .map((journal) => goldenByKey.get(journal.id)?.relevance || 0);
  const ideal = [...goldenByKey.values()]
    .map((entry) => entry.relevance)
    .sort((left, right) => right - left)
    .slice(0, k);
  const idealDcg = dcg(ideal);
  return idealDcg > 0 ? dcg(relevances) / idealDcg : 0;
};

const recallAtK = (returned, goldenTop10, k) => {
  if (!goldenTop10.size) return 0;
  let hits = 0;
  for (const journal of returned.slice(0, k)) {
    if (goldenTop10.has(journal.id)) hits += 1;
  }
  return hits / goldenTop10.size;
};

const reciprocalRank = (returned, goldenTop3, k) => {
  if (!goldenTop3.size) return 0;
  const position = returned
    .slice(0, k)
    .findIndex((journal) => goldenTop3.has(journal.id));
  return position >= 0 ? 1 / (position + 1) : 0;
};

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));

/**
 * One evaluation case per (probe run, provider). Duplicate queries keep the
 * newest run only, so repeated seeds do not skew the average.
 */
const loadCases = async () => {
  const root = MATCH_CONFIG.paths.probeRoot;
  const entries = await fs.readdir(root, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const byKey = new Map();

  for (const dir of dirs) {
    const runDir = path.join(root, dir);
    let summary;
    let journals;
    try {
      [summary, journals] = await Promise.all([
        readJson(path.join(runDir, "summary.json")),
        readJson(path.join(runDir, "journals-merged.json")),
      ]);
    } catch {
      continue;
    }

    const query = String(summary.query || "").trim();
    if (!query || !Array.isArray(journals) || !journals.length) continue;

    const byProvider = new Map();
    for (const journal of journals) {
      if (!journal?.provider || !journal?.title) continue;
      if (!byProvider.has(journal.provider)) byProvider.set(journal.provider, []);
      byProvider.get(journal.provider).push(journal);
    }

    for (const [provider, items] of byProvider) {
      const deduped = new Map();
      for (const item of items) {
        const id = journalKey(item);
        if (!deduped.has(id)) deduped.set(id, item);
      }

      const ranked = [...deduped.entries()]
        .map(([id, item]) => ({ id, rank: Number(item.rank) || 999 }))
        .sort((left, right) => left.rank - right.rank)
        .slice(0, 10);

      if (ranked.length < 5) continue;

      const caseKey = `${provider}::${normalizeKey(query)}`;
      const timestamp = dir.match(/^(\d{4}-\d{2}-\d{2}T[^-]+)/)?.[1] || "";
      const existing = byKey.get(caseKey);
      if (existing && existing.timestamp > timestamp) continue;

      byKey.set(caseKey, {
        query,
        provider,
        timestamp,
        golden: ranked.map((entry) => ({
          id: entry.id,
          rank: entry.rank,
          relevance: relevanceForRank(entry.rank),
        })),
      });
    }
  }

  return [...byKey.values()];
};

const runCases = async (cases, options) => {
  const perQuery = [];

  for (const item of cases) {
    const result = await searchJournalCorpus({
      mode: "keyword",
      query: item.query,
      limit: options.k,
      provider: item.provider,
    });

    const goldenByKey = new Map(
      item.golden.map((entry) => [entry.id, entry]),
    );
    const goldenTop10 = new Set(
      item.golden.filter((entry) => entry.rank <= 10).map((entry) => entry.id),
    );
    const goldenTop3 = new Set(
      item.golden.filter((entry) => entry.rank <= 3).map((entry) => entry.id),
    );

    perQuery.push({
      query: item.query,
      provider: item.provider,
      ndcg: ndcgAtK(result.items, goldenByKey, options.k),
      recall: recallAtK(result.items, goldenTop10, options.k),
      mrr: reciprocalRank(result.items, goldenTop3, options.k),
      returned: result.items.map((journal) => journal.title),
      golden: item.golden.slice(0, 5).map((entry) => entry.id),
    });
  }

  return perQuery;
};

const summarize = (perQuery, k) => {
  const mean = (key) =>
    perQuery.length
      ? perQuery.reduce((sum, item) => sum + item[key], 0) / perQuery.length
      : 0;
  return {
    queries: perQuery.length,
    ndcg: mean("ndcg"),
    recall: mean("recall"),
    mrr: mean("mrr"),
  };
};

/**
 * Grid-search the blend weights on the train split. Weights are read from
 * MATCH_CONFIG at scoring time, so this needs no process restart.
 */
const WEIGHT_GRID = [
  { semantic: 0.5, bm25: 0.4, quality: 0.1 },
  { semantic: 0.55, bm25: 0.35, quality: 0.1 },
  { semantic: 0.6, bm25: 0.3, quality: 0.1 },
  { semantic: 0.65, bm25: 0.25, quality: 0.1 },
  { semantic: 0.7, bm25: 0.2, quality: 0.1 },
  { semantic: 0.75, bm25: 0.15, quality: 0.1 },
  { semantic: 0.8, bm25: 0.1, quality: 0.1 },
  { semantic: 0.6, bm25: 0.35, quality: 0.05 },
  { semantic: 0.6, bm25: 0.25, quality: 0.15 },
];

const tuneWeights = async (trainCases, options) => {
  const original = { ...MATCH_CONFIG.weights };
  const rows = [];

  try {
    for (const weights of WEIGHT_GRID) {
      MATCH_CONFIG.weights = weights;
      const perQuery = await runCases(trainCases, options);
      const summary = summarize(perQuery, options.k);
      rows.push({ weights, ...summary });
      console.log(
        `semantic=${weights.semantic} bm25=${weights.bm25} quality=${weights.quality} -> ndcg=${summary.ndcg.toFixed(4)} recall=${summary.recall.toFixed(4)} mrr=${summary.mrr.toFixed(4)}`,
      );
    }
  } finally {
    MATCH_CONFIG.weights = original;
  }

  return rows.sort((left, right) => right.ndcg - left.ndcg);
};

const main = async () => {
  const options = parseArgs();
  const status = await warmupJournalMatcher();
  if (!status.indexLoaded) {
    console.error("Index missing. Run: node scripts/buildJournalIndex.js");
    process.exitCode = 1;
    return;
  }

  const cases = await loadCases();

  if (options.weights) {
    MATCH_CONFIG.weights = options.weights;
  }

  if (options.tune) {
    const trainCases = cases.filter((item) => splitForQuery(item.query) === "train");
    console.log(
      `Tuning on ${trainCases.length} train cases (k=${options.k}); test split stays untouched.`,
    );
    const rows = await tuneWeights(trainCases, options);
    console.log(
      `\nBest: semantic=${rows[0].weights.semantic} bm25=${rows[0].weights.bm25} quality=${rows[0].weights.quality} ndcg=${rows[0].ndcg.toFixed(4)}`,
    );
    return;
  }

  const selected = cases.filter(
    (item) => options.split === "all" || splitForQuery(item.query) === options.split,
  );

  const startedAt = Date.now();
  const perQuery = await runCases(selected, options);
  const summary = summarize(perQuery, options.k);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          split: options.split,
          k: options.k,
          queries: perQuery.length,
          ndcg: summary.ndcg,
          recall: summary.recall,
          mrr: summary.mrr,
          perQuery,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `Cases: ${perQuery.length} | split: ${options.split} | k: ${options.k} | corpus: ${status.journals} journals`,
  );
  console.log(
    `NDCG@${options.k}: ${summary.ndcg.toFixed(4)} | Recall@${options.k}: ${summary.recall.toFixed(
      4,
    )} | MRR@${options.k}: ${summary.mrr.toFixed(4)} | ${(
      (Date.now() - startedAt) /
      1000
    ).toFixed(1)}s`,
  );

  if (options.verbose) {
    for (const item of perQuery.sort((left, right) => left.ndcg - right.ndcg)) {
      console.log(
        `\n[${item.provider}] "${item.query}" ndcg=${item.ndcg.toFixed(3)} recall=${item.recall.toFixed(2)} mrr=${item.mrr.toFixed(2)}`,
      );
      console.log(`  golden: ${item.golden.join(", ")}`);
      console.log(`  ours:   ${item.returned.slice(0, 5).join(" | ")}`);
    }
  }
};

main().catch((error) => {
  console.error("evaluateMatching failed:", error);
  process.exitCode = 1;
});
