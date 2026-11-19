import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Central configuration for local journal matching.
 * Tune scoring here; nothing else hard-codes these numbers.
 */
export const MATCH_CONFIG = {
  /** Final score blend. Must sum to 1. */
  weights: {
    semantic: 0.6,
    bm25: 0.3,
    quality: 0.1,
  },

  /** Fallback blend when the embedding index/model is unavailable. */
  fallbackWeights: {
    semantic: 0,
    bm25: 0.9,
    quality: 0.1,
  },

  semantic: {
    modelId: "Xenova/all-MiniLM-L6-v2",
    dtype: "q8",
    dimensions: 384,
    /** Batch size for the one-time index build. */
    batchSize: 24,
    /** Abstract mode: split the abstract into at most this many pieces. */
    abstractChunks: 3,
    /** Keyword mode: keep at most this many topics. */
    maxTopics: 8,
    /** Keyword mode: floor used inside the per-topic geometric mean. */
    topicFloor: 0.01,
    /**
     * How a topic's chunk similarities are pooled per journal.
     * "max" lets long scopes win by having more chunks; "meanTopK" averages
     * the best k chunks instead. Override for offline tuning with
     * JOURNAL_MATCH_POOLING=max|meanTopK and JOURNAL_MATCH_POOL_K=<n>.
     */
    chunkPooling: process.env.JOURNAL_MATCH_POOLING || "meanTopK",
    chunkPoolK:
      Number.parseInt(process.env.JOURNAL_MATCH_POOL_K || "", 10) || 3,
  },

  chunks: {
    /** Scope chunk size/overlap, in words. */
    words: 180,
    overlap: 30,
  },

  bm25: {
    /** Field boosts. subjectAreas x3 as required. */
    boost: {
      title: 2,
      subjectAreas: 3,
      scope: 1,
    },
    fuzzy: 0.2,
    prefix: true,
    /** Abstract mode: cap the BM25 query to this many distinctive terms. */
    abstractTerms: 40,
    /** Keyword mode: floor used when combining per-topic BM25 scores. */
    topicFloor: 0.01,
  },

  quality: {
    weights: {
      impactFactor: 0.5,
      citeScore: 0.3,
      speed: 0.2,
    },
    impactFactorCap: 15,
    citeScoreCap: 30,
    /** decisionDays below fastDays scores 1.0, above slowDays scores 0. */
    fastDays: 30,
    slowDays: 120,
    /** Values above this are treated as missing (bad harvest data). */
    maxReasonableDecisionDays: 365,
  },

  /** Multiplier applied when a query topic hits a journal's excluded topics. */
  excludedTopicPenalty: 0.4,

  /**
   * Expand unambiguous CS acronyms (NLP, IoT, HCI, ...) before embedding/BM25.
   * Disable for offline A/B checks with JOURNAL_MATCH_ACRONYMS=off.
   */
  acronyms: {
    enabled: process.env.JOURNAL_MATCH_ACRONYMS !== "off",
  },

  /** Results below this blended score are dropped. */
  minimumScore: 0.08,

  /** Paths (resolved from server/services/journalMatch/). */
  paths: {
    probeRoot: path.resolve(__dirname, "../../data/journal-finder-probe"),
    indexFile: path.resolve(__dirname, "../../data/journal-match-index.json"),
    modelCacheDir: path.resolve(__dirname, "../../data/journal-match-model-cache"),
    scopeEnrichmentFile: path.resolve(
      __dirname,
      "../../data/journal-scope-enrichment.json",
    ),
    /** Imported IEEE Title List entries (scripts/importIeee.js). */
    ieeeJournalsFile: path.resolve(__dirname, "../../data/ieee-journals.json"),
  },
};

export const INDEX_VERSION = 1;
