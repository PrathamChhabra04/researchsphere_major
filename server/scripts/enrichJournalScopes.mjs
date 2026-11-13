#!/usr/bin/env node
/**
 * Enrich Springer journals with their real "Aims and scope" text.
 *
 * The Springer journal-finder cards only expose subject areas, so those
 * records reach the matcher with ~100 characters of scope. This script visits
 * each journal's public aims-and-scope page once, extracts the scope, and
 * writes server/data/journal-scope-enrichment.json. The corpus loader merges
 * that file automatically, so the index build needs no special flags.
 *
 * Usage (from the repo root or server/):
 *   node server/scripts/enrichJournalScopes.mjs
 *   node server/scripts/enrichJournalScopes.mjs --limit 10 --delay 1500
 *   node server/scripts/enrichJournalScopes.mjs --force
 *
 * Be polite: one page at a time, ~1.2 s apart.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

import { MATCH_CONFIG } from "../services/journalMatch/config.js";
import { loadJournalCorpus } from "../services/journalMatch/corpus.js";
import { cleanText } from "../services/journalMatch/text.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    limit: 0,
    delay: 700,
    timeout: 60000,
    force: false,
    headless: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--limit" && args[index + 1]) {
      parsed.limit = Number.parseInt(args[index + 1], 10) || 0;
      index += 1;
    } else if (arg === "--delay" && args[index + 1]) {
      parsed.delay = Math.max(0, Number.parseInt(args[index + 1], 10) || 0);
      index += 1;
    } else if (arg === "--timeout" && args[index + 1]) {
      parsed.timeout = Number.parseInt(args[index + 1], 10) || 90000;
      index += 1;
    } else if (arg === "--force") {
      parsed.force = true;
    } else if (arg === "--headed") {
      parsed.headless = false;
    }
  }

  return parsed;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readJson = async (filePath, fallback) => {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJson = async (filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
};

const springerJournalId = (sourceUrl) => {
  const match = /\/journal\/(\d+)/.exec(String(sourceUrl || ""));
  return match ? match[1] : null;
};

const extractAimsAndScope = (page) =>
  page.evaluate(() => {
    const main =
      document.querySelector("main")?.innerText ||
      document.querySelector('[role="main"]')?.innerText ||
      document.body.innerText ||
      "";

    const heading = "Aims and scope";
    const headingIndex = main.lastIndexOf(heading);
    if (headingIndex < 0) return null;

    const afterHeading = main.slice(headingIndex + heading.length);
    const endMarkers = ["Footer Navigation", "Journal updates", "Submit your manuscript"];
    let endIndex = afterHeading.length;
    for (const marker of endMarkers) {
      const index = afterHeading.indexOf(marker);
      if (index >= 0 && index < endIndex) endIndex = index;
    }

    return afterHeading.slice(0, endIndex).trim();
  });

const main = async () => {
  const options = parseArgs();
  const outputPath = MATCH_CONFIG.paths.scopeEnrichmentFile;
  const corpus = await loadJournalCorpus();

  const existing = await readJson(outputPath, {
    builtAt: null,
    entries: {},
  });
  const entries = existing.entries || {};

  const candidates = corpus.journals.filter(
    (journal) =>
      journal.provider === "springer" &&
      (journal.scope || "").length < 250 &&
      springerJournalId(journal.sourceUrl),
  );

  const queue = candidates.filter(
    (journal) => options.force || !entries[`springer:${springerJournalId(journal.sourceUrl)}`],
  );
  const limited = options.limit > 0 ? queue.slice(0, options.limit) : queue;

  console.log(
    `[enrich] ${candidates.length} Springer journals need scope; ${queue.length} missing, processing ${limited.length}.`,
  );

  if (!limited.length) {
    console.log("[enrich] Nothing to do.");
    return;
  }

  const browser = await chromium.launch({ headless: options.headless });
  let enriched = 0;
  let failed = 0;
  const startedAt = Date.now();

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    // Only the text matters, so skip heavy assets. This roughly halves the
    // per-journal load time on Springer's ad-heavy pages.
    await context.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "media" || type === "font") {
        return route.abort();
      }
      return route.continue();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(options.timeout);

    for (let index = 0; index < limited.length; index += 1) {
      const journal = limited[index];
      const journalId = springerJournalId(journal.sourceUrl);
      const key = `springer:${journalId}`;
      const url = `https://link.springer.com/journal/${journalId}/aims-and-scope`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.timeout });
        await page
          .locator("main")
          .first()
          .waitFor({ state: "attached", timeout: 15000 })
          .catch(() => {});
        await page.waitForTimeout(400);

        const rawScope = await extractAimsAndScope(page);
        const scope = cleanText(rawScope);

        if (!scope || scope.length < 80) {
          throw new Error(`no usable aims-and-scope section (${scope.length} chars)`);
        }

        entries[key] = {
          journalId,
          title: journal.title,
          sourceUrl: journal.sourceUrl,
          scope,
          fetchedAt: new Date().toISOString(),
        };
        enriched += 1;

        const elapsed = Date.now() - startedAt;
        const perItem = elapsed / (index + 1);
        const remaining = Math.round(((limited.length - index - 1) * perItem) / 1000);
        console.log(
          `[enrich] ${index + 1}/${limited.length} ${journal.title} (${scope.length} chars) ~${remaining}s left`,
        );
      } catch (error) {
        failed += 1;
        console.warn(`[enrich] ${journal.title}: ${error.message}`);
      }

      if (enriched > 0 && (index + 1) % 5 === 0) {
        await writeJson(outputPath, {
          builtAt: new Date().toISOString(),
          entries,
        });
      }

      if (index < limited.length - 1) {
        await sleep(options.delay);
      }
    }
  } finally {
    await browser.close();
    await writeJson(outputPath, {
      builtAt: new Date().toISOString(),
      entries,
    });
  }

  console.log(
    `[enrich] Done. enriched=${enriched} failed=${failed} total=${Object.keys(entries).length} -> ${path.relative(projectRoot, outputPath)}`,
  );
};

main().catch((error) => {
  console.error("[enrich] Failed:", error);
  process.exitCode = 1;
});
