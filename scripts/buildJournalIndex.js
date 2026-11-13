#!/usr/bin/env node
/**
 * One-time journal index builder.
 *
 *   node scripts/buildJournalIndex.js
 *
 * Reads the local journal-finder corpus, cleans text, splits each journal into
 * an identity chunk (title + subject areas + article types) and ~180-word scope
 * chunks, embeds everything with Xenova/all-MiniLM-L6-v2 (mean pooling,
 * normalized), and writes a single index file:
 *
 *   server/data/journal-match-index.json
 *
 * The model is downloaded once into server/data/journal-match-model-cache.
 * The API never downloads anything at request time.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { INDEX_VERSION, MATCH_CONFIG } from "../server/services/journalMatch/config.js";
import { loadJournalCorpus } from "../server/services/journalMatch/corpus.js";
import { embedTexts } from "../server/services/journalMatch/embedding.js";
import {
  cleanText,
  extractExcludedTopics,
  wordChunks,
} from "../server/services/journalMatch/text.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const BATCH_SIZE = 32;
const { words, overlap } = MATCH_CONFIG.chunks;

const formatDuration = (ms) => `${(ms / 1000).toFixed(1)}s`;

const main = async () => {
  const startedAt = Date.now();

  console.log("[buildJournalIndex] Loading journal corpus...");
  const corpus = await loadJournalCorpus();
  console.log(
    `[buildJournalIndex] ${corpus.journals.length} journals from ${corpus.totalRuns} corpus runs`,
  );

  const chunkRecords = [];
  const journalRecords = [];
  const texts = [];

  for (const journal of corpus.journals) {
    const profileText = cleanText(
      [
        journal.title,
        (journal.subjectAreas || []).join(". "),
        (journal.articleTypes || []).join(". "),
      ]
        .filter(Boolean)
        .join(". "),
    );

    const journalChunks = [];
    if (profileText) {
      journalChunks.push({ kind: "profile", text: profileText });
    }

    const scopeChunks = wordChunks(journal.scope, words, overlap);
    for (const scopeChunk of scopeChunks) {
      journalChunks.push({ kind: "scope", text: scopeChunk });
    }

    const chunkStart = chunkRecords.length;
    for (const chunk of journalChunks) {
      chunkRecords.push({
        journalId: journal.id,
        kind: chunk.kind,
        text: chunk.text,
      });
      texts.push(chunk.text);
    }

    journalRecords.push({
      id: journal.id,
      provider: journal.provider,
      title: journal.title,
      issn: journal.issn || null,
      subjectAreas: journal.subjectAreas || [],
      articleTypes: journal.articleTypes || [],
      excludedTopics: extractExcludedTopics(journal.scope, {
        title: journal.title,
        subjectAreas: journal.subjectAreas,
      }),
      chunkStart,
      chunkCount: journalChunks.length,
    });
  }

  console.log(
    `[buildJournalIndex] Prepared ${chunkRecords.length} chunks (~${(
      texts.reduce((sum, text) => sum + text.length, 0) / 1024
    ).toFixed(0)} KB text). Embedding with ${MATCH_CONFIG.semantic.modelId}...`,
  );

  const dims = MATCH_CONFIG.semantic.dimensions;
  const allVectors = new Float32Array(chunkRecords.length * dims);
  let embedded = 0;

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    let vectors;
    try {
      // allowRemote: the one-time build may download the model. The API never does.
      vectors = await embedTexts(batch, { allowRemote: true, batchSize: batch.length });
    } catch (error) {
      console.error(
        "\n[buildJournalIndex] Model download/load failed. Check your network connection and retry.",
      );
      throw error;
    }

    vectors.forEach((vector, position) => {
      allVectors.set(vector, (start + position) * dims);
    });

    embedded += vectors.length;
    const percent = ((embedded / texts.length) * 100).toFixed(1);
    console.log(
      `[buildJournalIndex] Embedded ${embedded}/${texts.length} chunks (${percent}%)`,
    );
  }

  const output = {
    version: INDEX_VERSION,
    model: MATCH_CONFIG.semantic.modelId,
    dims,
    builtAt: new Date().toISOString(),
    chunking: { words, overlap },
    totals: {
      journals: journalRecords.length,
      chunks: chunkRecords.length,
      journalsWithExcludedTopics: journalRecords.filter(
        (journal) => journal.excludedTopics.length > 0,
      ).length,
    },
    journals: journalRecords,
    journalChunks: Object.fromEntries(
      journalRecords.map((journal) => [
        journal.id,
        { start: journal.chunkStart, count: journal.chunkCount },
      ]),
    ),
    chunks: chunkRecords,
    vectors: Buffer.from(
      allVectors.buffer,
      allVectors.byteOffset,
      allVectors.byteLength,
    ).toString("base64"),
  };

  const outputPath = MATCH_CONFIG.paths.indexFile;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output));

  const stats = await fs.stat(outputPath);
  console.log(
    `[buildJournalIndex] Wrote ${path.relative(projectRoot, outputPath)} (${(
      stats.size /
      1024 /
      1024
    ).toFixed(2)} MB) in ${formatDuration(Date.now() - startedAt)}`,
  );
  console.log(
    `[buildJournalIndex] ${output.totals.journals} journals, ${output.totals.chunks} chunks, ${output.totals.journalsWithExcludedTopics} with excluded-topic rules.`,
  );
};

main().catch((error) => {
  console.error("[buildJournalIndex] Failed:", error);
  process.exitCode = 1;
});
