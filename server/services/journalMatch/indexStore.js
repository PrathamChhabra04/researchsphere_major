import fs from "fs/promises";
import { MATCH_CONFIG, INDEX_VERSION } from "./config.js";

/**
 * Loads the pre-built journal embedding index from disk (once per process).
 * Everything needed at query time is local: vectors, chunk -> journal map,
 * and per-journal excluded topics.
 */

let indexPromise = null;
let loadErrorLogged = false;

const decodeVectors = (encoded, expectedCount, dims) => {
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.byteLength !== expectedCount * dims * 4) {
    throw new Error(
      `Journal index vector size mismatch: ${buffer.byteLength} bytes for ${expectedCount} x ${dims}`,
    );
  }
  const copy = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return new Float32Array(copy);
};

const readIndex = async () => {
  const raw = await fs.readFile(MATCH_CONFIG.paths.indexFile, "utf8");
  const parsed = JSON.parse(raw);

  if (parsed.version !== INDEX_VERSION) {
    throw new Error(
      `Journal index version ${parsed.version} does not match expected ${INDEX_VERSION}. Rebuild with: node scripts/buildJournalIndex.js`,
    );
  }
  if (parsed.model !== MATCH_CONFIG.semantic.modelId) {
    throw new Error(
      `Journal index was built with ${parsed.model}; expected ${MATCH_CONFIG.semantic.modelId}`,
    );
  }

  const dims = parsed.dims || MATCH_CONFIG.semantic.dimensions;
  const chunks = Array.isArray(parsed.chunks) ? parsed.chunks : [];
  const vectors = decodeVectors(parsed.vectors, chunks.length, dims);
  const journals = new Map(
    (parsed.journals || []).map((journal) => [journal.id, journal]),
  );

  return {
    version: parsed.version,
    model: parsed.model,
    dims,
    builtAt: parsed.builtAt || null,
    chunks,
    vectors,
    journals,
    excludedTopicsByJournal: new Map(
      (parsed.journals || []).map((journal) => [
        journal.id,
        Array.isArray(journal.excludedTopics) ? journal.excludedTopics : [],
      ]),
    ),
    journalChunks: parsed.journalChunks || {},
  };
};

/** Returns the loaded index, or null when it has not been built. */
export const loadJournalIndex = async () => {
  if (!indexPromise) {
    indexPromise = readIndex().catch((error) => {
      if (!loadErrorLogged) {
        loadErrorLogged = true;
        console.warn(
          `[journal-match] Embedding index unavailable (${error.message}). Falling back to BM25 scoring. Build it with: node scripts/buildJournalIndex.js`,
        );
      }
      return null;
    });
  }
  return indexPromise;
};

export const resetJournalIndexCacheForTests = () => {
  indexPromise = null;
  loadErrorLogged = false;
};
