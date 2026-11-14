import { MATCH_CONFIG } from "./journalMatch/config.js";
import { expandAcronyms } from "./journalMatch/acronyms.js";
import { loadJournalCorpus } from "./journalMatch/corpus.js";
import { embedTexts } from "./journalMatch/embedding.js";
import { loadJournalIndex } from "./journalMatch/indexStore.js";
import {
  clamp,
  extractExcludedTopics,
  normalizeKey,
  normalizeWhitespace,
  round,
  snippet,
  splitAbstract,
  splitSentences,
  tokenize,
  unique,
} from "./journalMatch/text.js";

/**
 * Journal matching service.
 *
 * Pipeline (all local, no network at request time):
 *   1. Acronym expansion + query parsing (topics split on commas/+ /and).
 *   2. Semantic similarity against a pre-built MiniLM chunk index, mean of
 *      the best 3 chunk similarities per topic.
 *   3. BM25 (MiniSearch) over title / subjectAreas (x3) / scope.
 *   4. Quality prior (impact factor, CiteScore, editorial speed).
 *   Final = 0.6 semantic + 0.3 bm25 + 0.1 quality, then excluded-topic penalty.
 */

const { semantic, bm25, quality } = MATCH_CONFIG;

let apiBm25Cache = null;
let embeddingFailureLogged = false;
const excludedFallbackCache = new Map();

const clampDecisionDays = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= quality.maxReasonableDecisionDays
    ? value
    : null;

/* ------------------------------------------------------------------ */
/* Query parsing                                                       */
/* ------------------------------------------------------------------ */

/** "machine learning + blockchain" -> ["machine learning", "blockchain"] */
export const splitTopics = (query) => {
  const raw = normalizeWhitespace(query);
  if (!raw) return [];

  const parts = raw.split(/\s*(?:,|;|\n|\+|\/|\band\b|\&)\s*/i);
  const topics = unique(
    parts
      .map((part) => normalizeWhitespace(part))
      .filter((part) => part.length >= 2 && tokenize(part).length > 0),
  );

  return topics.slice(0, semantic.maxTopics);
};

const topAbstractTerms = (abstract, maxTerms = bm25.abstractTerms) => {
  const counts = new Map();
  for (const token of tokenize(abstract)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxTerms)
    .map(([token]) => token);
};

/* ------------------------------------------------------------------ */
/* BM25                                                                */
/* ------------------------------------------------------------------ */

const buildBm25Index = async (journals) => {
  try {
    const { default: MiniSearch } = await import("minisearch");
    const index = new MiniSearch({
      fields: ["title", "subjectAreas", "scope"],
      storeFields: ["title"],
      searchOptions: {
        boost: { ...bm25.boost },
        fuzzy: bm25.fuzzy,
        prefix: bm25.prefix,
        combineWith: "OR",
      },
    });
    index.addAll(
      journals.map((journal) => ({
        id: journal.id,
        title: journal.title,
        subjectAreas: (journal.subjectAreas || []).join(" "),
        scope: journal.scope,
      })),
    );
    return index;
  } catch (error) {
    console.warn(`[journal-match] MiniSearch unavailable: ${error.message}`);
    return null;
  }
};

const getBm25Index = async (corpus) => {
  if (apiBm25Cache && apiBm25Cache.size === corpus.journals.length) {
    return apiBm25Cache;
  }
  const index = await buildBm25Index(corpus.journals);
  apiBm25Cache = index ? { index, size: corpus.journals.length } : null;
  return apiBm25Cache;
};

const runBm25Query = (bm25Cache, query, allowedIds) => {
  if (!bm25Cache || !query) return new Map();
  let results = [];
  try {
    results = bm25Cache.index.search(query, {
      boost: { ...bm25.boost },
      fuzzy: bm25.fuzzy,
      prefix: bm25.prefix,
      combineWith: "OR",
    });
  } catch {
    return new Map();
  }

  const scores = new Map();
  for (const result of results) {
    if (allowedIds && !allowedIds.has(result.id)) continue;
    scores.set(result.id, result.score || 0);
  }
  return scores;
};

const normalizeScoreMap = (scores) => {
  const max = Math.max(0, ...scores.values());
  if (max <= 0) return scores;
  const normalized = new Map();
  for (const [id, score] of scores) normalized.set(id, score / max);
  return normalized;
};

/**
 * BM25 scoring. In keyword mode each topic is scored separately and combined
 * with a geometric mean, so journals covering every topic beat single-topic
 * matches (same intent as the semantic combination).
 */
const searchBm25 = ({ bm25Cache, query, topics, mode, allowedIds }) => {
  if (!bm25Cache) return new Map();

  if (mode === "abstract" || topics.length <= 1) {
    return normalizeScoreMap(runBm25Query(bm25Cache, query, allowedIds));
  }

  const perTopic = topics.map((topic) =>
    normalizeScoreMap(runBm25Query(bm25Cache, topic, allowedIds)),
  );

  const allIds = new Set();
  for (const scores of perTopic) {
    for (const id of scores.keys()) allIds.add(id);
  }

  const combined = new Map();
  for (const id of allIds) {
    const values = perTopic.map((scores) =>
      Math.max(scores.get(id) || 0, bm25.topicFloor),
    );
    const logSum = values.reduce((sum, value) => sum + Math.log(value), 0);
    combined.set(id, Math.exp(logSum / values.length));
  }

  return normalizeScoreMap(combined);
};

/* ------------------------------------------------------------------ */
/* Vector math                                                         */
/* ------------------------------------------------------------------ */

const dot = (vectors, offset, query, dims) => {
  let total = 0;
  for (let index = 0; index < dims; index += 1) {
    total += vectors[offset + index] * query[index];
  }
  return total;
};

const normalizeVector = (vector) => {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (!norm) return vector;
  return vector.map((value) => value / norm);
};

const averageVectors = (vectors) => {
  if (!vectors.length) return [];
  const dims = vectors[0].length;
  const total = new Array(dims).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < dims; index += 1) total[index] += vector[index];
  }
  return normalizeVector(total.map((value) => value / vectors.length));
};

const geometricMean = (values, floor) => {
  if (!values.length) return 0;
  const safe = values.map((value) => Math.max(value, floor));
  const logSum = safe.reduce((sum, value) => sum + Math.log(value), 0);
  return Math.exp(logSum / safe.length);
};

/**
 * Pool a topic's chunk similarities. "max" is the classic maxP choice;
 * "meanTopK" averages the best k chunks so journals with very long scopes
 * cannot outrank focused ones just by having more passages to match.
 */
const poolChunkScores = (topScores) => {
  if (!topScores.length) return 0;
  if (MATCH_CONFIG.semantic.chunkPooling !== "meanTopK") return topScores[0];
  const k = Math.min(MATCH_CONFIG.semantic.chunkPoolK, topScores.length);
  let sum = 0;
  for (let index = 0; index < k; index += 1) sum += topScores[index];
  return sum / k;
};

/* ------------------------------------------------------------------ */
/* Semantic scoring                                                    */
/* ------------------------------------------------------------------ */

const buildJournalRanges = (index) => {
  const ranges = new Map();
  for (const journal of index.journals.values()) {
    if (journal.chunkCount > 0) {
      ranges.set(journal.id, {
        start: journal.chunkStart,
        count: journal.chunkCount,
      });
    }
  }
  return ranges;
};

/**
 * Returns Map<journalId, { score, bestChunkIndex, topicScores }> or null when
 * the index/model is unavailable.
 */
const computeSemanticScores = async ({ mode, query, topics, index }) => {
  if (!index) return null;

  let queryVectors;
  try {
    if (mode === "abstract") {
      const pieces = splitAbstract(query, semantic.abstractChunks);
      const embeddings = await embedTexts(pieces);
      const averaged = averageVectors(embeddings);
      queryVectors = [{ label: null, vector: averaged }];
    } else {
      const embeddings = await embedTexts(topics);
      queryVectors = topics.map((topic, position) => ({
        label: topic,
        vector: normalizeVector(embeddings[position]),
      }));
    }
  } catch (error) {
    if (!embeddingFailureLogged) {
      embeddingFailureLogged = true;
      console.warn(
        `[journal-match] Query embedding unavailable (${error.message}). Falling back to BM25 scoring.`,
      );
    }
    return null;
  }

  if (!queryVectors.length || !queryVectors[0].vector?.length) return null;

  const ranges = buildJournalRanges(index);
  const dims = index.dims;
  const scores = new Map();

  for (const journal of index.journals.values()) {
    const range = ranges.get(journal.id);
    if (!range) continue;

    const topicScores = [];
    let bestScore = 0;
    let bestChunkIndex = -1;

    for (const queryVector of queryVectors) {
      let maxScore = 0;
      let maxChunk = -1;
      const topScores = [];
      const poolSize =
        MATCH_CONFIG.semantic.chunkPooling === "meanTopK"
          ? Math.max(1, MATCH_CONFIG.semantic.chunkPoolK)
          : 1;

      for (let chunk = 0; chunk < range.count; chunk += 1) {
        const chunkIndex = range.start + chunk;
        const similarity = clamp(
          dot(index.vectors, chunkIndex * dims, queryVector.vector, dims),
          0,
          1,
        );

        if (similarity > maxScore) {
          maxScore = similarity;
          maxChunk = chunkIndex;
        }

        if (topScores.length < poolSize) {
          let position = topScores.length;
          while (position > 0 && topScores[position - 1] < similarity) position -= 1;
          topScores.splice(position, 0, similarity);
        } else if (similarity > topScores[topScores.length - 1]) {
          let position = topScores.length - 1;
          while (position > 0 && topScores[position - 1] < similarity) position -= 1;
          topScores.splice(position, 0, similarity);
          topScores.pop();
        }
      }

      const pooled = poolChunkScores(topScores);
      topicScores.push(pooled);
      if (maxScore > bestScore) {
        bestScore = maxScore;
        bestChunkIndex = maxChunk;
      }
    }

    const score =
      mode === "abstract"
        ? topicScores[0] || 0
        : geometricMean(topicScores, semantic.topicFloor);

    scores.set(journal.id, { score, bestChunkIndex, topicScores });
  }

  return scores;
};

/* ------------------------------------------------------------------ */
/* Scoring helpers                                                     */
/* ------------------------------------------------------------------ */

const qualityScore = (journal) => {
  const components = [];
  const add = (value, cap, weight) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
    components.push({ value: clamp(value / cap), weight });
  };

  add(journal.impactFactor, quality.impactFactorCap, quality.weights.impactFactor);
  add(journal.citeScore, quality.citeScoreCap, quality.weights.citeScore);

  const decisionDays = clampDecisionDays(journal.decisionDays);
  if (decisionDays != null) {
    const speed = clamp(
      (quality.slowDays - decisionDays) / (quality.slowDays - quality.fastDays),
      0,
      1,
    );
    components.push({ value: speed, weight: quality.weights.speed });
  }

  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return components.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
};

const getExcludedTopics = (index, journal) => {
  if (index?.excludedTopicsByJournal?.has(journal.id)) {
    return index.excludedTopicsByJournal.get(journal.id);
  }
  if (excludedFallbackCache.has(journal.id)) {
    return excludedFallbackCache.get(journal.id);
  }
  const extracted = extractExcludedTopics(journal.scope, {
    title: journal.title,
    subjectAreas: journal.subjectAreas,
  });
  excludedFallbackCache.set(journal.id, extracted);
  return extracted;
};

const findExcludedMatches = ({ topics, journal, index }) => {
  const excluded = getExcludedTopics(index, journal);
  if (!excluded.length) return [];

  const topicTokenSets = topics.map((topic) => ({
    topic,
    phrase: normalizeKey(topic),
    tokens: new Set(tokenize(topic)),
  }));
  const matches = [];

  for (const entry of excluded) {
    const termSet = new Set(entry.terms || []);

    // Exact phrase in the exclusion clause is the strongest signal.
    const phraseHit = topicTokenSets.some(
      (topic) =>
        topic.phrase.length > 4 && normalizeKey(entry.sentence).includes(topic.phrase),
    );

    if (phraseHit) {
      matches.push(entry.sentence);
      continue;
    }

    // Otherwise require real multi-term overlap: one shared generic word is
    // not enough to penalise a journal.
    const termHit = topicTokenSets.some((topic) => {
      const tokens = [...topic.tokens];
      if (!tokens.length) return false;
      const overlap = tokens.filter((token) => termSet.has(token));
      if (tokens.length === 1) {
        return overlap.length === 1 && tokens[0].length >= 5;
      }
      return overlap.length >= 2;
    });

    if (termHit) matches.push(entry.sentence);
  }

  return unique(matches).slice(0, 2);
};

const findMatchedSubjectAreas = (journal, queryTokens) => {
  if (!queryTokens.length) return [];
  const querySet = new Set(queryTokens);
  return (journal.subjectAreas || [])
    .map((subject) => {
      const subjectTokens = tokenize(subject);
      const overlap = subjectTokens.filter((token) => querySet.has(token)).length;
      return { subject, overlap };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap)
    .map((item) => item.subject)
    .slice(0, 3);
};

const scoreSentence = (text, queryTokens) => {
  if (!text) return { sentence: "", overlap: 0 };
  const querySet = new Set(queryTokens);
  let best = "";
  let bestOverlap = 0;

  for (const sentence of splitSentences(text)) {
    let overlap = 0;
    for (const token of tokenize(sentence)) {
      if (querySet.has(token)) overlap += 1;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = sentence;
    }
  }

  return { sentence: bestOverlap > 0 ? best : "", overlap: bestOverlap };
};

const buildWhyMatched = ({
  journal,
  mode,
  topics,
  queryTokens,
  semanticEntry,
  index,
}) => {
  const chunkText =
    semanticEntry?.bestChunkIndex >= 0
      ? index?.chunks?.[semanticEntry.bestChunkIndex]?.text || ""
      : "";

  const chunkMatch = scoreSentence(chunkText, queryTokens);
  const scopeMatch = scoreSentence(journal.scope, queryTokens);
  const matchedSentence =
    scopeMatch.overlap > chunkMatch.overlap
      ? scopeMatch.sentence
      : chunkMatch.sentence || scopeMatch.sentence;

  const topicLabel =
    mode === "abstract"
      ? queryTokens.slice(0, 5).join(", ")
      : topics.slice(0, 4).join(", ");

  if (matchedSentence) {
    return snippet(
      topicLabel ? `Matches ${topicLabel}: ${matchedSentence}` : matchedSentence,
      280,
    );
  }

  return snippet(
    topicLabel ? `Matches ${topicLabel}. ${journal.scope}` : journal.scope,
    280,
  );
};

const buildReasons = (journal, matchedSubjectAreas, excludedWarnings) => {
  const reasons = [];
  if (matchedSubjectAreas.length) {
    reasons.push(`Subject areas: ${matchedSubjectAreas.join(", ")}`);
  }
  if (journal.decisionDays != null && clampDecisionDays(journal.decisionDays) != null) {
    reasons.push(`First decision: ${journal.decisionDays} days`);
  }
  if (excludedWarnings.length) {
    reasons.push("Check scope exclusions before submitting");
  }
  return unique(reasons).slice(0, 3);
};

/* ------------------------------------------------------------------ */
/* Main scoring                                                        */
/* ------------------------------------------------------------------ */

const scoreJournal = ({
  journal,
  mode,
  topics,
  displayTopics,
  queryTokens,
  bm25Scores,
  semanticScores,
  index,
}) => {
  const semanticEntry = semanticScores?.get(journal.id) || null;
  const semanticScore = semanticEntry?.score ?? 0;
  const bm25Score = bm25Scores.get(journal.id) ?? 0;
  const qualityValue = qualityScore(journal);

  const activeWeights = semanticScores
    ? MATCH_CONFIG.weights
    : MATCH_CONFIG.fallbackWeights;
  const blended =
    activeWeights.semantic * semanticScore +
    activeWeights.bm25 * bm25Score +
    activeWeights.quality * qualityValue;

  if (blended < MATCH_CONFIG.minimumScore) return null;

  const excludedWarnings = findExcludedMatches({
    topics,
    journal,
    index,
  }).map(
    (sentence) =>
      `Journal states: "${sentence}" — confirm your topic is in scope.`,
  );

  const finalScore = excludedWarnings.length
    ? blended * MATCH_CONFIG.excludedTopicPenalty
    : blended;

  const matchedSubjectAreas = findMatchedSubjectAreas(journal, queryTokens);
  const whyMatched = buildWhyMatched({
    journal,
    mode,
    topics: displayTopics,
    queryTokens,
    semanticEntry,
    index,
  });

  return {
    ...journal,
    score: round(clamp(finalScore)),
    matchPercent: Math.round(clamp(finalScore) * 100),
    semanticScore: round(semanticScore),
    bm25Score: round(bm25Score),
    qualityScore: round(qualityValue),
    scopeSnippet: snippet(journal.scope),
    matchReasons: buildReasons(journal, matchedSubjectAreas, excludedWarnings),
    matchedSubjectAreas,
    matchedTopics: displayTopics,
    whyMatched,
    warnings: excludedWarnings,
  };
};

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Load the local index + corpus without loading the embedding model. */
export const warmupJournalMatcher = async () => {
  const [corpus, index] = await Promise.all([
    loadJournalCorpus().catch(() => null),
    loadJournalIndex(),
  ]);
  if (corpus) {
    await getBm25Index(corpus);
  }
  return {
    corpusLoaded: Boolean(corpus),
    indexLoaded: Boolean(index),
    journals: corpus?.journals?.length || 0,
    chunks: index?.chunks?.length || 0,
  };
};

export const getJournalMatcherStatus = async () => {
  const [corpus, index] = await Promise.all([
    loadJournalCorpus().catch(() => null),
    loadJournalIndex(),
  ]);
  return {
    journals: corpus?.journals?.length || 0,
    topics: corpus?.topics?.length || 0,
    totalRuns: corpus?.totalRuns || 0,
    indexAvailable: Boolean(index),
    indexBuiltAt: index?.builtAt || null,
    indexChunks: index?.chunks?.length || 0,
    model: MATCH_CONFIG.semantic.modelId,
  };
};

export const searchJournalCorpus = async ({
  mode = "keyword",
  query = "",
  limit = 20,
  provider = "all",
}) => {
  const normalizedQuery = normalizeWhitespace(query);
  if (!normalizedQuery) {
    return {
      items: [],
      topics: [],
      totalCorpus: 0,
      mode,
    };
  }

  const corpus = await loadJournalCorpus();
  const normalizedMode = mode === "abstract" ? "abstract" : "keyword";
  const displayTopics =
    normalizedMode === "abstract"
      ? topAbstractTerms(normalizedQuery)
      : splitTopics(normalizedQuery);
  const topics =
    normalizedMode === "abstract" || !MATCH_CONFIG.acronyms.enabled
      ? displayTopics
      : displayTopics.map(expandAcronyms);

  const filtered =
    provider === "all"
      ? corpus.journals
      : corpus.journals.filter((journal) => journal.provider === provider);

  const allowedIds = new Set(filtered.map((journal) => journal.id));
  const bm25Cache = await getBm25Index(corpus);
  const bm25Query =
    normalizedMode === "abstract"
      ? topAbstractTerms(normalizedQuery, bm25.abstractTerms).join(" ")
      : topics.join(" ");
  const bm25Scores = searchBm25({
    bm25Cache,
    query: bm25Query,
    topics,
    mode: normalizedMode,
    allowedIds,
  });

  const index = await loadJournalIndex();
  const semanticScores = await computeSemanticScores({
    mode: normalizedMode,
    query: normalizedQuery,
    topics,
    index,
  });

  const queryTokens = unique([
    ...tokenize(normalizedQuery),
    ...topics.flatMap((topic) => tokenize(topic)),
  ]).slice(0, 40);

  const items = filtered
    .map((journal) =>
      scoreJournal({
        journal,
        mode: normalizedMode,
        topics,
        displayTopics,
        queryTokens,
        bm25Scores,
        semanticScores,
        index,
      }),
    )
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (right.impactFactor || 0) - (left.impactFactor || 0);
    })
    .slice(0, Math.max(1, limit));

  return {
    items,
    topics: corpus.topics,
    totalCorpus: corpus.journals.length,
    mode: normalizedMode,
    semanticAvailable: Boolean(semanticScores),
    indexBuiltAt: index?.builtAt || null,
  };
};

// Backwards-compatible re-export (previously part of this module).
export { loadJournalCorpus };
