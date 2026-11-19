#!/usr/bin/env node
/**
 * Import IEEE journals from the IEEE Title List PDF.
 *
 *   node scripts/importIeee.js                 # Transactions only (default)
 *   node scripts/importIeee.js --include-all   # every IEEE title in the PDF
 *   node scripts/importIeee.js --dry-run       # parse + report, write nothing
 *
 * Source PDF: server/data/raw/ieee-title-list.pdf
 * Output:     server/data/ieee-journals.json
 *
 * Text extraction uses `pdftotext -raw` from poppler (no bundled PDF library).
 * If pdftotext is unavailable, a previously extracted
 * server/data/raw/ieee-title-list.txt is used instead.
 *
 * The script is idempotent: entries are keyed by ISSN (else normalised title),
 * and fields a human may have filled in later (scope, links, fees) survive a
 * re-run.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const PDF_PATH = path.join(projectRoot, "server/data/raw/ieee-title-list.pdf");
const TEXT_CACHE_PATH = path.join(
  projectRoot,
  "server/data/raw/ieee-title-list.txt",
);
const OUTPUT_PATH = path.join(projectRoot, "server/data/ieee-journals.json");

const PROVIDER = "ieee";
const DATA_SOURCE = "IEEE Title List, data as of 1 January 2026";
const TRANSACTIONS_PATTERN = /^IEEE(\/ASME)? Transactions on\b/;

const args = new Set(process.argv.slice(2));
const includeAll = args.has("--include-all");
const dryRun = args.has("--dry-run");

const rel = (target) => path.relative(projectRoot, target).split(path.sep).join("/");

// ---------------------------------------------------------------------------
// PDF text extraction
// ---------------------------------------------------------------------------

const extractText = () => {
  try {
    const text = execFileSync("pdftotext", ["-raw", PDF_PATH, "-"], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!text.trim()) throw new Error("pdftotext returned no text");

    // Cache the extraction so the script still works without poppler installed.
    fs.mkdirSync(path.dirname(TEXT_CACHE_PATH), { recursive: true });
    fs.writeFileSync(TEXT_CACHE_PATH, text, "utf8");
    return { text, extractedWith: "pdftotext -raw" };
  } catch (error) {
    if (fs.existsSync(TEXT_CACHE_PATH)) {
      return {
        text: fs.readFileSync(TEXT_CACHE_PATH, "utf8"),
        extractedWith: `cached text (${rel(TEXT_CACHE_PATH)})`,
      };
    }
    throw new Error(
      `Could not extract ${rel(PDF_PATH)}.\n` +
        "Install poppler-utils (pdftotext) or save the extracted text to " +
        `${rel(TEXT_CACHE_PATH)} and re-run.\n` +
        `Original error: ${error.message}`,
    );
  }
};

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

const ACCESS_TYPES = [
  {
    label: "Full Open Access",
    openAccessType: "Open access",
    publishingModel: "FULL",
  },
  {
    label: "Hybrid Open Access",
    openAccessType: "Hybrid",
    publishingModel: "HYBRID",
  },
  {
    label: "Subscriber Based Access",
    openAccessType: "Subscription",
    publishingModel: "SUBSCRIPTION",
  },
];

const accessByLabel = new Map(ACCESS_TYPES.map((type) => [type.label, type]));

const ISSN_PATTERN = String.raw`(?:\d{4}-\d{3}[\dX]|N\/A)`;
const INDEX_PATTERN = String.raw`(?:SCIE|ESCI|SSCI|A&HCI|N\/A)`;
const NUMBER_PATTERN = String.raw`(?:N\/A|\d+(?:\.\d+)?)`;
const QUARTILE_PATTERN = String.raw`(?:Q[1-4]|N\/A)`;

// <acronym> <title> <access> <ISSN> <eISSN> <index> <JIF> <5Y> <quartile>
//   <JCI> <Eigenfactor> <AIS> <CiteScore>
const TAIL_PATTERNS = [
  ISSN_PATTERN,
  ISSN_PATTERN,
  INDEX_PATTERN,
  NUMBER_PATTERN,
  NUMBER_PATTERN,
  QUARTILE_PATTERN,
  NUMBER_PATTERN,
  NUMBER_PATTERN,
  NUMBER_PATTERN,
  NUMBER_PATTERN,
];

const ROW_PATTERN = new RegExp(
  String.raw`^(\S+)\s+(.+?)\s+(` +
    ACCESS_TYPES.map((type) => type.label).join("|") +
    String.raw`)\s+` +
    TAIL_PATTERNS.map((pattern) => `(${pattern})`).join(String.raw`\s+`) +
    String.raw`\s*$`,
);

const parseNumber = (value) => {
  const text = String(value ?? "").trim();
  if (!text || /^n\/?a$/i.test(text)) return null;
  const numeric = Number.parseFloat(text);
  return Number.isFinite(numeric) ? numeric : null;
};

/** "N/A" -> null; anything else is trimmed and kept. */
const parseTextValue = (value) => {
  const text = String(value ?? "").trim();
  return !text || /^n\/?a$/i.test(text) ? null : text;
};

/**
 * Titles carry footnote glyphs, "NEW for 2025!" tags and a stray replacement
 * character where the PDF lost a dagger. Clean them off and keep the flags.
 */
const cleanTitle = (rawTitle) => {
  let title = String(rawTitle)
    .replace(/[\uFFFD\u00A0]/g, " ")
    .replace(/[*\u2020\u2021\u00A7]/g, " ")
    .replace(/\s*--\s*/g, "\u2014")
    .replace(/\s+/g, " ")
    .trim();

  const isNew = /\bNEW for \d{4}!/i.test(title);
  title = title.replace(/\s*\bNEW for \d{4}!\s*/i, " ").trim();

  const comingSoon = /\bComing in \d{4}!/i.test(title);
  title = title.replace(/\s*\bComing in \d{4}!\s*/i, " ").trim();

  return { title, isNew, comingSoon };
};

const parseRows = (text) => {
  const lines = text.split(/\r?\n/);
  const rows = [];
  const parseFailures = [];

  for (const line of lines) {
    if (!ACCESS_TYPES.some((type) => line.includes(type.label))) continue;

    const match = ROW_PATTERN.exec(line);
    if (!match) {
      parseFailures.push(line.trim());
      continue;
    }

    const [
      ,
      acronym,
      rawTitle,
      accessLabel,
      issn,
      eissn,
      index,
      jif,
      fiveYear,
      quartile,
      jci,
      eigenfactor,
      ais,
      citeScore,
    ] = match;
    const { title, isNew, comingSoon } = cleanTitle(rawTitle);
    const access = accessByLabel.get(accessLabel);

    rows.push({
      acronym: acronym.trim(),
      title,
      isNew,
      comingSoon,
      openAccessType: access.openAccessType,
      publishingModel: access.publishingModel,
      issn: parseTextValue(issn),
      eissn: parseTextValue(eissn),
      index: parseTextValue(index),
      impactFactor: parseNumber(jif),
      fiveYearImpactFactor: parseNumber(fiveYear),
      quartile: parseTextValue(quartile),
      jci: parseNumber(jci),
      eigenfactor: parseNumber(eigenfactor),
      articleInfluenceScore: parseNumber(ais),
      citeScore: parseNumber(citeScore),
    });
  }

  return { rows, parseFailures };
};

// ---------------------------------------------------------------------------
// Subject areas + generated scope
// ---------------------------------------------------------------------------

/**
 * Title keywords -> subject areas. Matches are collected in the order below,
 * de-duplicated and capped so cards stay readable. Unmatched titles fall back
 * to "Engineering".
 */
const SUBJECT_RULES = [
  {
    area: "Machine Learning",
    pattern:
      /\b(artificial intelligence|machine learning|robot learning|neural networks? and learning systems|cognitive and developmental systems|computational intelligence|evolutionary computation|pattern analysis and machine intelligence|fuzzy systems|cybernetics|big data|knowledge and data engineering)\b/i,
  },
  {
    area: "Computer Vision",
    pattern:
      /\b(image processing|visualization and computer graphics|computational imaging|medical imaging|biometrics|video technology|multimedia)\b/i,
  },
  {
    area: "Signal Processing",
    pattern:
      /\b(signal processing|signal and information processing|audio, speech|speech and language|ultrasonics|terahertz|instrumentation and measurement|signal and power integrity)\b/i,
  },
  {
    area: "Wireless Communications",
    pattern:
      /\b(wireless|vehicular technology|mobile computing|green communications|communications|broadcasting|molecular, biological, and multi-scale)\b/i,
  },
  {
    area: "Computer Networks",
    pattern:
      /\b(networking|network and service management|network science and engineering|control of network systems)\b/i,
  },
  {
    area: "Cybersecurity",
    pattern: /\b(privacy|security|forensics|dependable and secure computing)\b/i,
  },
  {
    area: "Software Engineering",
    pattern: /\bsoftware engineering\b/i,
  },
  {
    area: "Computer Systems",
    pattern:
      /\b(computers|cloud computing|services computing|emerging topics in computing|sustainable computing|parallel and distributed systems)\b/i,
  },
  {
    area: "Information Theory",
    pattern: /\binformation theory\b/i,
  },
  {
    area: "Control Systems",
    pattern:
      /\b(automatic control|control systems technology|control of network systems|systems, man, and cybernetics)\b/i,
  },
  {
    area: "Robotics",
    pattern:
      /\b(robot(?:ic)?s?|mechatronics|human-machine systems|automation science and engineering)\b/i,
  },
  {
    area: "Human-Computer Interaction",
    pattern: /\b(affective computing|haptics|human-machine systems|games)\b/i,
  },
  {
    area: "Plasma Science",
    pattern: /\bplasma science\b/i,
  },
  {
    area: "Power Systems",
    pattern:
      /\b(power systems|power delivery|power electronics|energy conversion|smart grid|sustainable energy|energy markets|industry applications|transportation electrification|applied superconductivity|dielectrics and electrical insulation)\b/i,
  },
  {
    area: "Circuits and Systems",
    pattern:
      /\b(circuits and systems|computer-aided design|semiconductor manufacturing|electron devices|device and materials reliability|materials for electron devices|quantum engineering|very large scale integration)\b/i,
  },
  {
    area: "Biomedical Engineering",
    pattern:
      /\b(biomedical|nano\s?bioscience|bionics|radiation and plasma medical sciences|neural systems and rehabilitation|computational biology and bioinformatics|translational engineering in health)\b/i,
  },
  {
    area: "Nuclear Science",
    pattern: /\bnuclear science\b/i,
  },
  {
    area: "Aerospace and Electronic Systems",
    pattern:
      /\b(aerospace|radar systems|antennas and propagation|electromagnetic compatibility|microwave theory|magnetics|geoscience and remote sensing)\b/i,
  },
  {
    area: "Industrial Systems",
    pattern: /\b(industrial electronics|industrial informatics|industrial cyber-physical)\b/i,
  },
  {
    area: "Intelligent Transportation Systems",
    pattern: /\b(intelligent transportation|intelligent vehicles)\b/i,
  },
  {
    area: "Nanotechnology",
    pattern: /\b(nanotechnology|nanoelectronics)\b/i,
  },
  {
    area: "Reliability Engineering",
    pattern: /\breliability\b/i,
  },
  {
    area: "Engineering Management",
    pattern:
      /\b(engineering management|technology and society|professional communication|education|learning technologies)\b/i,
  },
];

const MAX_SUBJECT_AREAS = 4;
const FALLBACK_SUBJECT_AREA = "Engineering";

const deriveSubjectAreas = (title) => {
  const areas = SUBJECT_RULES.filter((rule) => rule.pattern.test(title)).map(
    (rule) => rule.area,
  );
  const unique = [...new Set(areas)].slice(0, MAX_SUBJECT_AREAS);
  return unique.length ? unique : [FALLBACK_SUBJECT_AREA];
};

const formatList = (items) => {
  if (items.length <= 1) return items[0] || FALLBACK_SUBJECT_AREA;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
};

const buildScope = (title, subjectAreas) =>
  `${title} covers research in ${formatList(subjectAreas)}.`;

// ---------------------------------------------------------------------------
// Entry construction + idempotent merge
// ---------------------------------------------------------------------------

const toJournal = (row) => {
  const subjectAreas = deriveSubjectAreas(row.title);

  return {
    provider: PROVIDER,
    title: row.title,
    acronym: row.acronym || null,
    issn: row.issn || row.eissn || null,
    eissn: row.eissn || null,
    openAccessType: row.openAccessType,
    publishingModel: row.publishingModel,
    impactFactor: row.impactFactor,
    impactFactorYear: row.impactFactor == null ? null : 2024,
    fiveYearImpactFactor: row.fiveYearImpactFactor,
    quartile: row.quartile,
    citeScore: row.citeScore,
    index: row.index,
    jci: row.jci,
    eigenfactor: row.eigenfactor,
    articleInfluenceScore: row.articleInfluenceScore,
    subjectAreas,
    scope: buildScope(row.title, subjectAreas),
    scopeSource: "generated",
    sourceUrl: null,
    journalUrl: null,
    submissionLink: null,
    guideForAuthors: null,
    decisionDays: null,
    acceptanceDays: null,
    goldOpenAccessFee: null,
    goldOpenAccessCurrency: null,
    articleTypes: [],
    coverImage: null,
    isNew: row.isNew,
    comingSoon: row.comingSoon,
    dataSource: DATA_SOURCE,
    importedAt: null,
  };
};

const normaliseTitleKey = (title) =>
  String(title || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const entryKey = (journal) =>
  journal.issn
    ? `issn:${journal.issn}`
    : `title:${normaliseTitleKey(journal.title)}`;

/** Fields a human may add later; keep them across re-imports. */
const PRESERVED_FIELDS = [
  "sourceUrl",
  "journalUrl",
  "submissionLink",
  "guideForAuthors",
  "decisionDays",
  "acceptanceDays",
  "goldOpenAccessFee",
  "goldOpenAccessCurrency",
  "coverImage",
  "editorInChief",
  "articleTypes",
  "hasAgreements",
];

const isMeaningful = (value) => {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
};

const applyManualOverrides = (incoming, existing) => {
  if (!existing) return incoming;
  const merged = { ...incoming };

  for (const field of PRESERVED_FIELDS) {
    if (isMeaningful(existing[field])) merged[field] = existing[field];
  }

  // A real aims/scope replaces the generated one and is never overwritten.
  if (
    existing.scopeSource &&
    existing.scopeSource !== "generated" &&
    isMeaningful(existing.scope)
  ) {
    merged.scope = existing.scope;
    merged.scopeSource = existing.scopeSource;
  }

  return merged;
};

/** Stable serialisation so key order cannot fake a change. */
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
};

const withoutTimestamp = (entry) => ({ ...entry, importedAt: null });

const readExisting = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
    return Array.isArray(parsed?.journals) ? parsed : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const countMissing = (journals, field) =>
  journals.filter((journal) => journal[field] == null).length;

const report = ({
  extractedWith,
  rows,
  parseFailures,
  imported,
  skipped,
  duplicateAcronyms,
  duplicateKeys,
}) => {
  const lines = [];
  const push = (line = "") => lines.push(line);

  push("IEEE Title List import");
  push("=====================");
  push(`PDF:      ${rel(PDF_PATH)}`);
  push(`Text:     ${extractedWith}`);
  push(`Mode:     ${includeAll ? "all IEEE titles (--include-all)" : "IEEE Transactions only"}`);
  push("");
  push(`Rows parsed:              ${rows.length}`);
  push(`Imported:                 ${imported.length}`);
  push(`Skipped (non-Transactions): ${skipped}`);
  push(`Parse failures:           ${parseFailures.length}`);
  if (parseFailures.length) {
    for (const failure of parseFailures.slice(0, 5)) push(`  ! ${failure}`);
    if (parseFailures.length > 5) push(`  ... ${parseFailures.length - 5} more`);
  }
  push("");

  push("Duplicate acronyms (kept, keyed by title/ISSN):");
  if (duplicateAcronyms.length === 0) {
    push("  none");
  } else {
    for (const duplicate of duplicateAcronyms) {
      push(`  ${duplicate.acronym}:`);
      for (const title of duplicate.titles) push(`    - ${title}`);
    }
  }
  push("");

  push("Duplicate keys (ISSN or normalised title):");
  if (duplicateKeys.length === 0) {
    push("  none");
  } else {
    for (const duplicate of duplicateKeys) {
      push(`  ${duplicate.key}: ${duplicate.titles.join(" | ")}`);
    }
  }
  push("");

  push("Missing fields in imported entries:");
  for (const field of [
    "issn",
    "impactFactor",
    "fiveYearImpactFactor",
    "quartile",
    "citeScore",
    "index",
  ]) {
    const missing = countMissing(imported, field);
    push(`  ${field.padEnd(22)} ${missing}/${imported.length}`);
  }
  push("");

  push("Flags:");
  push(`  NEW for 2025:   ${imported.filter((journal) => journal.isNew).length}`);
  push(`  Coming in 2026: ${imported.filter((journal) => journal.comingSoon).length}`);
  push(
    `  Fallback subject area (${FALLBACK_SUBJECT_AREA}): ${imported.filter(
      (journal) => journal.subjectAreas.length === 1 && journal.subjectAreas[0] === FALLBACK_SUBJECT_AREA,
    ).length}`,
  );
  push("");

  push(`Output: ${rel(OUTPUT_PATH)}${dryRun ? " (dry run, not written)" : ""}`);

  console.log(lines.join("\n"));
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = () => {
  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`Source PDF not found: ${rel(PDF_PATH)}`);
  }

  const { text, extractedWith } = extractText();
  const { rows, parseFailures } = parseRows(text);

  const selected = includeAll
    ? rows
    : rows.filter((row) => TRANSACTIONS_PATTERN.test(row.title));
  const skipped = rows.length - selected.length;

  const existing = readExisting();
  const existingByKey = new Map(
    (existing?.journals || []).map((journal) => [entryKey(journal), journal]),
  );

  // Duplicate detection across the parsed rows (before de-duplication).
  const acronymGroups = new Map();
  for (const row of selected) {
    const group = acronymGroups.get(row.acronym) || [];
    group.push(row.title);
    acronymGroups.set(row.acronym, group);
  }
  const duplicateAcronyms = [...acronymGroups.entries()]
    .filter(([, titles]) => titles.length > 1)
    .map(([acronym, titles]) => ({ acronym, titles }));

  const keyGroups = new Map();
  for (const row of selected) {
    const key = row.issn || `title:${normaliseTitleKey(row.title)}`;
    const group = keyGroups.get(key) || [];
    group.push(row.title);
    keyGroups.set(key, group);
  }
  const duplicateKeys = [...keyGroups.entries()]
    .filter(([, titles]) => titles.length > 1)
    .map(([key, titles]) => ({ key, titles }));

  // Build entries, one per unique key. A duplicate key is a data error: keep
  // the first and let the report surface it instead of silently overwriting.
  const byKey = new Map();
  for (const row of selected) {
    const incoming = applyManualOverrides(
      toJournal(row),
      existingByKey.get(entryKey(row)),
    );
    const key = entryKey(incoming);
    if (byKey.has(key)) continue;
    byKey.set(key, incoming);
  }

  const journals = [...byKey.values()]
    .map((entry) => {
      const previous = existingByKey.get(entryKey(entry));
      if (
        previous &&
        canonicalJson(withoutTimestamp(previous)) === canonicalJson(entry)
      ) {
        return { ...entry, importedAt: previous.importedAt || new Date().toISOString() };
      }
      return { ...entry, importedAt: new Date().toISOString() };
    })
    .sort((left, right) => left.title.localeCompare(right.title));

  const journalsUnchanged =
    existing && canonicalJson(existing.journals) === canonicalJson(journals);
  const importedAt = journalsUnchanged
    ? existing.importedAt || new Date().toISOString()
    : new Date().toISOString();

  const payload = {
    provider: PROVIDER,
    dataSource: DATA_SOURCE,
    sourceFile: rel(PDF_PATH),
    importedAt,
    count: journals.length,
    journals,
  };

  if (!dryRun) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  report({
    extractedWith,
    rows,
    parseFailures,
    imported: journals,
    skipped,
    duplicateAcronyms,
    duplicateKeys,
  });
};

try {
  main();
} catch (error) {
  console.error(`[importIeee] ${error.message}`);
  process.exitCode = 1;
}
