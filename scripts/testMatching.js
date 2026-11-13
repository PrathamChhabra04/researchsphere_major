#!/usr/bin/env node
/**
 * Sanity test for local journal matching.
 *
 *   node scripts/testMatching.js
 *
 * Prints the top 5 journals for 10 sample queries. Requires the index to have
 * been built once with: node scripts/buildJournalIndex.js
 */

import { searchJournalCorpus, warmupJournalMatcher } from "../server/services/journalMatcherService.js";

const SAMPLE_QUERIES = [
  { label: "Multi-topic keywords", mode: "keyword", query: "machine learning + blockchain" },
  { label: "Single topic", mode: "keyword", query: "wireless sensor networks" },
  { label: "Two topics via 'and'", mode: "keyword", query: "federated learning and edge computing" },
  { label: "Comma separated", mode: "keyword", query: "natural language processing, computer vision" },
  { label: "Three topics", mode: "keyword", query: "cybersecurity, internet of things, and cloud computing" },
  { label: "Out-of-CS topic", mode: "keyword", query: "quantum computing" },
  { label: "Software engineering", mode: "keyword", query: "software engineering + requirements engineering" },
  { label: "Health data mining", mode: "keyword", query: "bioinformatics and healthcare data mining" },
  {
    label: "Sample abstract",
    mode: "abstract",
    query:
      "We propose a federated learning framework for edge-cloud environments that reduces communication cost while preserving model accuracy for distributed computer vision workloads. Experiments on heterogeneous devices show improved convergence and lower latency under non-IID data.",
  },
  {
    label: "Sample abstract 2",
    mode: "abstract",
    query:
      "This paper studies blockchain-based secure data sharing for Internet of Things networks. We design a lightweight consensus protocol and evaluate its throughput, energy consumption, and resilience against adversarial nodes in large-scale deployments.",
  },
];

const strip = (value, maxLength = 170) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
};

const main = async () => {
  const status = await warmupJournalMatcher();
  console.log(
    `Corpus: ${status.journals} journals | Index: ${status.indexLoaded ? `${status.chunks} chunks` : "NOT BUILT"} | Model: Xenova/all-MiniLM-L6-v2`,
  );
  if (!status.indexLoaded) {
    console.warn(
      "\nWARNING: server/data/journal-match-index.json is missing. Run node scripts/buildJournalIndex.js first; this test will only exercise BM25 fallback.\n",
    );
  }

  for (const sample of SAMPLE_QUERIES) {
    const startedAt = Date.now();
    const result = await searchJournalCorpus({
      mode: sample.mode,
      query: sample.query,
      limit: 5,
      provider: "all",
    });
    const elapsed = Date.now() - startedAt;

    console.log(`\n=== ${sample.label} [${sample.mode}] ===`);
    console.log(`Query: ${sample.query}`);
    console.log(
      `Results: ${result.items.length} | semantic: ${result.semanticAvailable ? "on" : "off"} | ${elapsed} ms`,
    );

    result.items.forEach((journal, index) => {
      const subjects = (journal.matchedSubjectAreas || []).join(", ");
      console.log(
        `${index + 1}. ${journal.title} (${journal.provider}, score ${journal.score.toFixed(3)})`,
      );
      if (subjects) console.log(`   subjects: ${subjects}`);
      if (journal.whyMatched) console.log(`   why: ${strip(journal.whyMatched)}`);
      if (journal.warnings?.length) {
        console.log(`   WARNING: ${strip(journal.warnings[0], 140)}`);
      }
    });

    if (!result.items.length) {
      console.error(`   !! No results for "${sample.query}"`);
      process.exitCode = 1;
    }
  }
};

main().catch((error) => {
  console.error("testMatching failed:", error);
  process.exitCode = 1;
});
