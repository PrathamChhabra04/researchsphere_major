import fs from "fs";
import { MATCH_CONFIG } from "./config.js";

/**
 * Local embedding helper (no API calls).
 *
 * The model is downloaded once by `scripts/buildJournalIndex.js` into
 * server/data/journal-match-model-cache. At request time remote model
 * fetching is disabled, so the API never touches the network for matching.
 */

const extractorCache = new Map();

const modelIsCached = () => {
  try {
    return fs.existsSync(MATCH_CONFIG.paths.modelCacheDir);
  } catch {
    return false;
  }
};

const getExtractor = async ({ allowRemote = false } = {}) => {
  const cacheKey = allowRemote ? "remote" : "local";
  if (!extractorCache.has(cacheKey)) {
    const promise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.cacheDir = MATCH_CONFIG.paths.modelCacheDir;
      env.allowLocalModels = true;
      env.allowRemoteModels = allowRemote;
      return pipeline(
        "feature-extraction",
        MATCH_CONFIG.semantic.modelId,
        { dtype: MATCH_CONFIG.semantic.dtype },
      );
    })().catch((error) => {
      extractorCache.delete(cacheKey);
      throw error;
    });
    extractorCache.set(cacheKey, promise);
  }
  return extractorCache.get(cacheKey);
};

/**
 * Embed texts with mean pooling + L2 normalization.
 * Returns an array of plain number arrays (384 dims).
 */
export const embedTexts = async (
  texts,
  { allowRemote = false, batchSize = MATCH_CONFIG.semantic.batchSize } = {},
) => {
  const inputs = (Array.isArray(texts) ? texts : [texts])
    .map((text) => String(text ?? "").trim())
    .filter(Boolean);
  if (!inputs.length) return [];

  const extractor = await getExtractor({ allowRemote });
  const vectors = [];
  for (let start = 0; start < inputs.length; start += batchSize) {
    const batch = inputs.slice(start, start + batchSize);
    const output = await extractor(batch, {
      pooling: "mean",
      normalize: true,
    });
    vectors.push(...output.tolist());
  }
  return vectors;
};

/** True when the model files appear to be present locally. */
export const isEmbeddingModelAvailable = () => {
  if (!modelIsCached()) return false;
  try {
    return fs.readdirSync(MATCH_CONFIG.paths.modelCacheDir).length > 0;
  } catch {
    return false;
  }
};
