#!/usr/bin/env node
/**
 * Collect ScienceDirect "Calls for special issues" (Computer Science).
 *
 * Run manually:
 *   node scripts/scrapeSpecialIssues.js
 *   node scripts/scrapeSpecialIssues.js --input server/data/raw/special-issues.html
 *   node scripts/scrapeSpecialIssues.js --input server/data/raw/special-issues.json
 *
 * Output:
 *   server/data/special-issues.json
 *
 * ScienceDirect applies anti-bot protection. When the live request is blocked
 * (403 / captcha) the script does not try to bypass it: it prints exact manual
 * save instructions and, if a saved capture is present, parses that instead.
 *
 * Accepted manual captures:
 *   - JSON: the response body of the calls-for-papers request, or any JSON
 *     containing an array of special-issue objects.
 *   - HTML: the page saved from a browser ("Webpage, HTML only").
 *
 * Only listing metadata is stored. Detail-page content is never copied.
 */

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const serverRoot = path.join(projectRoot, "server");
const dataDir = path.join(serverRoot, "data");
const rawDir = path.join(dataDir, "raw");
const defaultOutput = path.join(dataDir, "special-issues.json");

const BASE_BROWSE_URL =
  "https://www.sciencedirect.com/browse/calls-for-papers";
const DEFAULT_SUBJECT_SLUG = "computer-science";
const DEFAULT_SUBJECT_AREA = "Computer Science";
const JOURNAL_PROBE_DIR = path.join(dataDir, "journal-finder-probe");

// ScienceDirect's secondary subject areas for Computer Science. Used when the
// capture does not include the listing's own filter dropdown.
const DEFAULT_SECONDARY_SUBJECTS = [
  "Artificial Intelligence",
  "Computational Theory and Mathematics",
  "Computer Graphics and Computer-Aided Design",
  "Computer Networks and Communications",
  "Computer Science (General)",
  "Computer Science Applications",
  "Computer Vision and Pattern Recognition",
  "Hardware and Architecture",
  "Human-Computer Interaction",
  "Information Systems",
  "Signal Processing",
  "Software",
];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 30_000;

const MANUAL_CANDIDATES = [
  path.join(rawDir, "special-issues.json"),
  path.join(rawDir, "special-issues.html"),
  path.join(rawDir, "special-issues.htm"),
  path.join(projectRoot, "data", "raw", "special-issues.json"),
  path.join(projectRoot, "data", "raw", "special-issues.html"),
];

const TITLE_KEYS = [
  "title",
  "name",
  "articleTitle",
  "specialIssueTitle",
  "specialIssueName",
  "displayTitle",
];
const DEADLINE_KEYS = [
  "submissionDeadline",
  "submissionDeadlineDate",
  "submissionDeadlineText",
  "deadline",
  "deadlineDate",
  "closingDate",
  "abstractDeadline",
  "submissionCloseDate",
  "submissionsClose",
];
const EDITOR_KEYS = [
  "guestEditors",
  "guestEditorNames",
  "guestEditor",
  "editors",
  "editorNames",
];
const JOURNAL_NAME_KEYS = [
  "journalName",
  "journalTitle",
  "journal_title",
  "publicationName",
];
const JOURNAL_URL_KEYS = ["journalUrl", "journalLink", "journalURL"];
const URL_KEYS = [
  "url",
  "link",
  "href",
  "specialIssueUrl",
  "specialIssueLink",
  "articleUrl",
  "pageUrl",
];
const IMPACT_KEYS = [
  "impactFactor",
  "journalImpactFactor",
  "impact_factor",
  "impactFactorValue",
];
const CITE_SCORE_KEYS = ["citeScore", "journalCiteScore", "cite_score", "citescore"];
const SECONDARY_KEYS = [
  "secondarySubjectAreas",
  "secondarySubjects",
  "secondarySubjectArea",
  "subjectAreas",
  "subjects",
];

class BlockedError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "BlockedError";
    this.status = status;
  }
}

const normalizeWhitespace = (value) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (value) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const pad = (value) => String(value).padStart(2, "0");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    subject: DEFAULT_SUBJECT_SLUG,
    input: null,
    output: defaultOutput,
    maxPages: 25,
    delayMs: 1500,
    includePast: false,
    secondary: [],
    noSecondary: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index] ?? "";

    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--input" || arg === "-i") options.input = next();
    else if (arg === "--output" || arg === "-o") options.output = next();
    else if (arg === "--subject") options.subject = next();
    else if (arg === "--max-pages") options.maxPages = Number(next()) || 25;
    else if (arg === "--delay") options.delayMs = Number(next()) || 1500;
    else if (arg === "--include-past") options.includePast = true;
    else if (arg === "--no-secondary") options.noSecondary = true;
    else if (arg === "--secondary") {
      options.secondary = next()
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else {
      console.warn(`Ignoring unknown argument: ${arg}`);
    }
  }

  return options;
};

const printHelp = () => {
  console.log(`Collect ScienceDirect calls for special issues (Computer Science).

Usage:
  node scripts/scrapeSpecialIssues.js [options]

Options:
  -i, --input <file>     Parse a saved JSON or HTML capture instead of fetching.
  -o, --output <file>    Output file (default: server/data/special-issues.json).
      --subject <slug>   ScienceDirect subject slug (default: computer-science).
      --max-pages <n>    Maximum live listing pages (default: 25).
      --delay <ms>       Delay between live requests (default: 1500).
      --include-past     Keep calls whose deadline has already passed.
      --secondary <list> Comma-separated secondary-subject slugs to fetch.
      --no-secondary     Skip per-secondary-subject enrichment.
  -h, --help             Show this help.

Manual fallback:
  If the live site is blocked, save the page yourself and run:
    node scripts/scrapeSpecialIssues.js --input server/data/raw/special-issues.html
  A saved JSON response (special-issues.json) works too.
`);
};

const isoDate = (value) => {
  if (value == null || value === "") return null;

  if (typeof value === "object" && !(value instanceof Date)) {
    if (value.iso) return isoDate(value.iso);
    if (value.value) return isoDate(value.value);
    if (value.date) return isoDate(value.date);
    if (value.year) {
      const month = Number(value.month ?? value.monthNumber) || 1;
      const day = Number(value.day) || 1;
      return `${String(value.year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
    }
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(
      value.getUTCDate(),
    )}`;
  }

  if (typeof value === "number") {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return isoDate(new Date(millis));
  }

  let text = normalizeWhitespace(value);
  if (!text) return null;

  text = text.replace(
    /^(?:submission\s+deadline|abstract\s+deadline|deadline|closes?|closing\s+date|due(?:\s+date)?)\s*[:\-]?\s*/i,
    "",
  );

  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const dayMonthYear = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(\d{4})\b/,
  );
  if (dayMonthYear) {
    const parsed = Date.parse(
      `${dayMonthYear[2]} ${dayMonthYear[1]}, ${dayMonthYear[3]} UTC`,
    );
    if (!Number.isNaN(parsed)) return isoDate(new Date(parsed));
  }

  const monthDayYear = text.match(
    /\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/,
  );
  if (monthDayYear) {
    const parsed = Date.parse(
      `${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]} UTC`,
    );
    if (!Number.isNaN(parsed)) return isoDate(new Date(parsed));
  }

  // A month/year pair resolves to the last day of that month.
  const monthYear = text.match(/\b([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (monthYear) {
    const parsed = Date.parse(`${monthYear[1]} 1, ${monthYear[2]} UTC`);
    if (!Number.isNaN(parsed)) {
      const date = new Date(parsed);
      const end = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      );
      return isoDate(end);
    }
  }

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return isoDate(new Date(parsed));

  return null;
};

const toNumber = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const pick = (source, keys) => {
  if (!source || typeof source !== "object") return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value != null && value !== "") return value;
  }
  return undefined;
};

const asStringList = (value) => {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => asStringList(entry))
      .map(normalizeWhitespace)
      .filter(Boolean);
  }
  if (typeof value === "object") {
    const name =
      value.name ||
      value.displayName ||
      value.fullName ||
      value.title ||
      value.label ||
      value.value;
    return name ? asStringList(name) : [];
  }

  let text = normalizeWhitespace(value);
  text = text.replace(
    /^(?:guest\s+editors?|editors?|edited\s+by)\s*[:\-]?\s*/i,
    "",
  );
  if (!text) return [];

  // "A. One; B. Two" or "A. One and B. Two" reads better as separate names.
  const parts = text
    .split(/\s*(?:;|\||\u2022|\n)\s*/)
    .map(normalizeWhitespace)
    .filter(Boolean);
  return parts.length >= 2 ? parts : [text];
};

const absoluteUrl = (value, base = "https://www.sciencedirect.com") => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
};

const itemKey = (item) => {
  if (item.url) {
    try {
      const url = new URL(item.url);
      return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/+$/, "");
    } catch {
      return item.url.toLowerCase().replace(/\/+$/, "");
    }
  }
  return slugify(`${item.title}-${item.journalName ?? ""}`);
};

const looksLikeItem = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const title = pick(value, TITLE_KEYS);
  if (typeof title !== "string" || normalizeWhitespace(title).length < 4) {
    return false;
  }

  const hasDeadline = pick(value, DEADLINE_KEYS) != null;
  const hasJournal = pick(value, JOURNAL_NAME_KEYS) != null;
  const url = String(pick(value, URL_KEYS) ?? "");
  const urlPointsToCall =
    /special-issue/i.test(url) ||
    ["specialIssueUrl", "specialIssueLink", "articleUrl"].some(
      (key) => value[key] != null && value[key] !== "",
    );
  const hasEditors = pick(value, EDITOR_KEYS) != null;

  return hasDeadline || hasJournal || urlPointsToCall || hasEditors;
};

const collectJsonItems = (root) => {
  const found = [];
  const seen = new Set();
  const walk = (value, depth) => {
    if (value == null || depth > 14) return;

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (looksLikeItem(entry) && !seen.has(entry)) {
          seen.add(entry);
          found.push(entry);
        }
        walk(entry, depth + 1);
      }
      return;
    }

    if (typeof value === "object") {
      if (looksLikeItem(value) && !seen.has(value)) {
        seen.add(value);
        found.push(value);
      }
      for (const entry of Object.values(value)) walk(entry, depth + 1);
    }
  };

  walk(root, 0);
  return found;
};

const mapRawItem = (raw, defaults = {}) => {
  if (!raw || typeof raw !== "object") return null;

  const title = normalizeWhitespace(pick(raw, TITLE_KEYS));
  if (!title) return null;

  const journalObject =
    raw.journal && typeof raw.journal === "object" ? raw.journal : null;
  const metrics =
    raw.metrics && typeof raw.metrics === "object"
      ? raw.metrics
      : raw.journalMetrics && typeof raw.journalMetrics === "object"
        ? raw.journalMetrics
        : null;

  const journalName = normalizeWhitespace(
    pick(raw, JOURNAL_NAME_KEYS) ??
      journalObject?.name ??
      journalObject?.title ??
      "",
  );

  const journalUrl =
    absoluteUrl(
      pick(raw, JOURNAL_URL_KEYS) ??
        journalObject?.url ??
        journalObject?.link ??
        journalObject?.href,
    ) ?? null;

  let url =
    absoluteUrl(pick(raw, URL_KEYS) ?? raw.specialIssue?.url ?? raw.specialIssue?.link) ??
    null;

  if (!url) {
    const id = raw.id ?? raw.specialIssueId ?? raw.articleId;
    if (id != null && String(id).trim()) {
      url = `https://www.sciencedirect.com/special-issue/${encodeURIComponent(
        String(id).trim(),
      )}`;
    }
  }

  if (!url) return null;

  const guestEditors = asStringList(
    pick(raw, EDITOR_KEYS) ??
      raw.specialIssue?.guestEditors ??
      raw.specialIssue?.editors,
  );

  const submissionDeadline = isoDate(
    pick(raw, DEADLINE_KEYS) ??
      raw.specialIssue?.submissionDeadline ??
      raw.specialIssue?.deadline ??
      raw.dates?.submissionDeadline,
  );

  const secondaryValues = [
    pick(raw, SECONDARY_KEYS),
    raw.specialIssue?.secondarySubjectAreas,
  ]
    .flatMap((value) => asStringList(value))
    .map(normalizeWhitespace)
    .filter(Boolean);

  const subjectArea =
    normalizeWhitespace(
      raw.subjectArea ?? raw.primarySubjectArea ?? defaults.subjectArea ?? "",
    ) || DEFAULT_SUBJECT_AREA;

  const secondarySubjectAreas = [...new Set(secondaryValues)].filter(
    (subject) => subject.toLowerCase() !== subjectArea.toLowerCase(),
  );

  if (defaults.secondarySubject) {
    secondarySubjectAreas.push(defaults.secondarySubject);
  }

  const impactFactor =
    toNumber(pick(raw, IMPACT_KEYS) ?? metrics?.impactFactor) ??
    toNumber(raw.journalImpactFactor) ??
    null;
  const citeScore =
    toNumber(pick(raw, CITE_SCORE_KEYS) ?? metrics?.citeScore) ?? null;

  return {
    id: `sd-si-${crypto
      .createHash("sha1")
      .update(itemKey({ url, title, journalName }))
      .digest("hex")
      .slice(0, 12)}`,
    title,
    guestEditors,
    journalName: journalName || null,
    journalUrl: journalUrl || null,
    impactFactor,
    citeScore,
    submissionDeadline,
    url,
    subjectArea,
    secondarySubjectAreas: [...new Set(secondarySubjectAreas)],
  };
};

const mergeItems = (items) => {
  const merged = new Map();

  for (const item of items) {
    if (!item) continue;
    const key = itemKey(item);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...item,
        guestEditors: [...new Set(item.guestEditors ?? [])],
        secondarySubjectAreas: [...new Set(item.secondarySubjectAreas ?? [])],
      });
      continue;
    }

    existing.title = existing.title || item.title;
    existing.guestEditors = [
      ...new Set([...(existing.guestEditors ?? []), ...(item.guestEditors ?? [])]),
    ];
    existing.journalName = existing.journalName || item.journalName;
    existing.journalUrl = existing.journalUrl || item.journalUrl;
    existing.impactFactor = existing.impactFactor ?? item.impactFactor;
    existing.citeScore = existing.citeScore ?? item.citeScore;
    existing.submissionDeadline =
      existing.submissionDeadline || item.submissionDeadline;
    existing.subjectArea = existing.subjectArea || item.subjectArea;
    existing.secondarySubjectAreas = [
      ...new Set([
        ...(existing.secondarySubjectAreas ?? []),
        ...(item.secondarySubjectAreas ?? []),
      ]),
    ];
  }

  return [...merged.values()];
};

const loadCheerio = () => {
  try {
    const requireFromServer = createRequire(path.join(serverRoot, "package.json"));
    return requireFromServer("cheerio");
  } catch (error) {
    throw new Error(
      `HTML parsing needs cheerio from the server workspace. Run "npm run setup" first. (${error.message})`,
    );
  }
};

const decodeHtmlEntities = (value) =>
  String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const splitEditorNames = (value) => {
  const text = normalizeWhitespace(value).replace(
    /^(?:guest\s+editors?|editors?|edited\s+by)\s*[:\-]?\s*/i,
    "",
  );
  if (!text) return [];

  return text
    .split(/\s*(?:;|\||\u2022)\s*|\s+and\s+|,\s*/i)
    .map((part) => normalizeWhitespace(part).replace(/\.$/, "").trim())
    .filter((part) => part.length >= 2 && !/^and$/i.test(part));
};

const parseListingCard = ($, element) => {
  const card = $(element);
  const titleLink = card.find("a.js-publication-title").first();
  const title = decodeHtmlEntities(
    normalizeWhitespace(
      titleLink.find(".anchor-text").first().text() || titleLink.text(),
    ),
  );
  const url = absoluteUrl(titleLink.attr("href"));
  if (!title || title.length < 4 || !url) return null;

  const journalLink = card.find('a[href*="/journal/"]').first();
  const journalName = decodeHtmlEntities(
    normalizeWhitespace(journalLink.text()),
  );
  const journalUrl = absoluteUrl(journalLink.attr("href"));

  const guestEditors = splitEditorNames(
    decodeHtmlEntities(card.find("div.u-text-italic").first().text()),
  );

  let impactFactor = null;
  let citeScore = null;
  card.find("p.publication-text i").each((_, node) => {
    const text = normalizeWhitespace($(node).text());
    if (/impact\s+factor/i.test(text)) impactFactor = toNumber(text);
    else if (/cite\s*score/i.test(text)) citeScore = toNumber(text);
  });

  let deadlineText = null;
  card.find("div.text-s").each((_, node) => {
    if (deadlineText) return;
    const text = normalizeWhitespace($(node).text());
    if (/deadline/i.test(text)) deadlineText = text;
  });

  // A few legacy cards have no deadline block but repeat it in the title.
  if (!deadlineText) {
    const dueMatch = title.match(
      /(?:submission\s+due|deadline)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i,
    );
    if (dueMatch) deadlineText = dueMatch[1];
  }

  return mapRawItem({
    title,
    url,
    journalName,
    journalUrl,
    guestEditors,
    submissionDeadline: deadlineText,
    impactFactor,
    citeScore,
  });
};

const extractLinkedCards = ($) => {
  const cards = [];
  const seenUrls = new Set();

  $('a[href*="/special-issue/"]').each((_, element) => {
    const link = $(element);
    const url = absoluteUrl(link.attr("href"));
    if (!url || seenUrls.has(url)) return;

    let card = link.closest("li, article");
    if (!card.length) {
      card = link.parent();
      for (
        let depth = 0;
        depth < 6 && !card.find('a[href*="/journal/"]').length;
        depth += 1
      ) {
        card = card.parent();
        if (!card.length) break;
      }
    }
    if (!card.length) return;

    const title = decodeHtmlEntities(
      normalizeWhitespace(
        link.find(".anchor-text").first().text() || link.text(),
      ),
    );
    if (!title || title.length < 4) return;

    const cardText = normalizeWhitespace(card.text());
    const journalLink = card.find('a[href*="/journal/"]').first();

    const deadlineMatch = cardText.match(
      /(?:submission|abstract|paper)\s+deadline\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i,
    );
    const editorsMatch = cardText.match(
      /(?:guest\s+editors?|editors?)\s*[:\-]?\s*(.+?)(?=\s+(?:submission|deadline|impact\s+factor|cite\s*score)\b|$)/i,
    );
    const impactMatch = cardText.match(
      /impact\s+factor\s*[:\-]?\s*([\d.]+)/i,
    );
    const citeScoreMatch = cardText.match(
      /cite\s*score\s*[:\-]?\s*([\d.]+)/i,
    );

    seenUrls.add(url);
    cards.push(
      mapRawItem({
        title,
        url,
        journalName: decodeHtmlEntities(normalizeWhitespace(journalLink.text())),
        journalUrl: absoluteUrl(journalLink.attr("href")),
        guestEditors: editorsMatch ? splitEditorNames(editorsMatch[1]) : [],
        submissionDeadline: deadlineMatch ? deadlineMatch[1] : null,
        impactFactor: impactMatch ? impactMatch[1] : null,
        citeScore: citeScoreMatch ? citeScoreMatch[1] : null,
      }),
    );
  });

  return cards.filter(Boolean);
};

const extractFromHtml = (html) => {
  const cheerio = loadCheerio();
  const $ = cheerio.load(html);

  // 1. Embedded JSON (server-rendered state) is the most reliable source.
  const jsonCandidates = [];
  $("script").each((_, element) => {
    const type = ($(element).attr("type") || "").toLowerCase();
    const text = $(element).html() || "";
    if (!text || text.length < 20) return;

    if (type.includes("json")) {
      try {
        jsonCandidates.push(JSON.parse(text));
        return;
      } catch {
        // fall through to assignment parsing
      }
    }

    if (/__(?:INITIAL|PRELOADED|NEXT)_STATE__|initialState|preloadedState/i.test(text)) {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          jsonCandidates.push(JSON.parse(text.slice(start, end + 1)));
        } catch {
          // Ignore fragments that are not valid JSON.
        }
      }
    }
  });

  for (const candidate of jsonCandidates) {
    const mapped = collectJsonItems(candidate)
      .map((raw) => mapRawItem(raw))
      .filter(Boolean);
    if (mapped.length > 0) return mapped;
  }

  // 2. ScienceDirect renders each call as an <li class="publication"> card.
  const cards = [];
  $("li.publication, li.js-publication").each((_, element) => {
    const item = parseListingCard($, element);
    if (item) cards.push(item);
  });
  if (cards.length > 0) return cards;

  // 3. Last resort: walk up from links to special-issue pages.
  return extractLinkedCards($);
};

const discoverSecondarySubjects = (html, subjectSlug = DEFAULT_SUBJECT_SLUG) => {
  const cheerio = loadCheerio();
  const $ = cheerio.load(html);
  const found = new Map();

  // The Computer Science listing exposes secondary subjects as a <select>.
  $("#secondary_subject_area-native option").each((_, option) => {
    const slug = normalizeWhitespace($(option).attr("value"));
    const label = normalizeWhitespace($(option).text());
    if (!slug || !label || /^all\s+secondary/i.test(label)) return;

    found.set(slug, {
      slug,
      label,
      url: `${BASE_BROWSE_URL}?subject=${encodeURIComponent(
        subjectSlug,
      )}&secondarySubjectArea=${encodeURIComponent(slug)}`,
    });
  });

  if (found.size > 0) return [...found.values()];

  // Older markup may render the filters as links instead of a select.
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || !/secondary/i.test(href)) return;

    const label = normalizeWhitespace($(element).text());
    if (!label || label.length < 2) return;

    try {
      const url = new URL(href, "https://www.sciencedirect.com");
      const slug =
        url.searchParams.get("secondarySubjectArea") ||
        url.searchParams.get("secondarySubject") ||
        url.searchParams.get("secondary");
      if (!slug) return;
      found.set(slug, { slug, label, url: url.toString() });
    } catch {
      // Ignore malformed links.
    }
  });

  return [...found.values()];
};

const normalizeJournalKey = (value) =>
  normalizeWhitespace(value)
    .replace(/&amp;/gi, " and ")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const journalSlugFromUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/journal\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]).toLowerCase() : null;
  } catch {
    return null;
  }
};

const addSubjects = (map, key, subjects) => {
  if (!key) return;
  const existing = map.get(key) ?? new Set();
  for (const subject of subjects) existing.add(subject);
  map.set(key, existing);
};

const loadJournalSubjectIndex = async () => {
  const index = { byTitle: new Map(), bySlug: new Map() };
  const files = [];

  const walk = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.name === "journals-merged.json") files.push(fullPath);
    }
  };
  await walk(JOURNAL_PROBE_DIR);

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      continue;
    }

    const journals = Array.isArray(data)
      ? data
      : data.journals || data.items || [];

    for (const journal of journals) {
      const subjects = asStringList(journal.subjectAreas).filter(Boolean);
      if (subjects.length === 0) continue;

      addSubjects(
        index.byTitle,
        normalizeJournalKey(journal.title || journal.name),
        subjects,
      );
      addSubjects(
        index.bySlug,
        journalSlugFromUrl(journal.sourceUrl || journal.url),
        subjects,
      );
    }
  }

  return index;
};

// ScienceDirect does not print per-item secondary subjects on the listing, so
// reuse the subject areas already stored for each journal in the journal corpus.
const enrichSecondarySubjects = async (items, allowedLabels) => {
  const missing = items.filter(
    (item) => (item.secondarySubjectAreas ?? []).length === 0,
  );
  if (missing.length === 0) return items;

  const index = await loadJournalSubjectIndex();
  if (index.byTitle.size === 0 && index.bySlug.size === 0) {
    console.log("  No journal corpus found for secondary-subject enrichment.");
    return items;
  }

  const allowed = new Map(
    [...allowedLabels].map((label) => [label.toLowerCase(), label]),
  );

  let matched = 0;
  for (const item of missing) {
    const candidates = new Set(
      index.byTitle.get(normalizeJournalKey(item.journalName)) ?? [],
    );

    const slug = journalSlugFromUrl(item.journalUrl);
    if (slug) {
      for (const subject of index.bySlug.get(slug) ?? []) {
        candidates.add(subject);
      }
    }

    const labels = [...candidates]
      .map((subject) => allowed.get(normalizeWhitespace(subject).toLowerCase()))
      .filter(Boolean);

    if (labels.length > 0) {
      item.secondarySubjectAreas = [...new Set(labels)].sort((left, right) =>
        left.localeCompare(right),
      );
      matched += 1;
    }
  }

  console.log(
    `  Secondary subjects matched from the journal corpus: ${matched} of ${missing.length} item(s).`,
  );
  return items;
};

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: BASE_BROWSE_URL,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.text();

  if ([400, 401, 403, 429, 503].includes(response.status)) {
    throw new BlockedError(
      `ScienceDirect returned HTTP ${response.status} (anti-bot protection).`,
      response.status,
    );
  }

  if (!response.ok) {
    const error = new Error(`Request failed: HTTP ${response.status} for ${url}`);
    error.status = response.status;
    throw error;
  }

  if (/captcha|are you a robot|unusual traffic/i.test(body.slice(0, 5000))) {
    throw new BlockedError(
      "ScienceDirect returned a captcha/challenge page instead of the listing.",
      response.status,
    );
  }

  return {
    body,
    contentType: response.headers.get("content-type") || "",
  };
};

const parsePayload = (body, contentType = "", subjectSlug = DEFAULT_SUBJECT_SLUG) => {
  const trimmed = body.trim();
  if (contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return {
        items: collectJsonItems(JSON.parse(trimmed))
          .map((raw) => mapRawItem(raw))
          .filter(Boolean),
        secondary: [],
        rawJson: JSON.parse(trimmed),
      };
    } catch {
      // Not valid JSON; fall through to HTML parsing.
    }
  }

  return {
    items: extractFromHtml(body),
    secondary: discoverSecondarySubjects(body, subjectSlug),
    rawJson: null,
  };
};

const buildListingUrl = (subject, page = 1) => {
  const url = new URL(BASE_BROWSE_URL);
  url.searchParams.set("subject", subject);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.toString();
};

const collectLive = async (options) => {
  const firstUrl = buildListingUrl(options.subject, 1);
  console.log(`Fetching ${firstUrl}`);

  const first = await fetchText(firstUrl);
  const firstParsed = parsePayload(first.body, first.contentType, options.subject);
  const allItems = [...firstParsed.items];
  let lastPageSignature = new Set(firstParsed.items.map(itemKey));

  console.log(
    `Page 1: ${firstParsed.items.length} item(s), ${firstParsed.secondary.length} secondary-subject filter(s).`,
  );

  for (let page = 2; page <= options.maxPages; page += 1) {
    await sleep(options.delayMs);
    const url = buildListingUrl(options.subject, page);
    console.log(`Fetching page ${page}`);

    let parsed;
    try {
      const response = await fetchText(url);
      parsed = parsePayload(response.body, response.contentType, options.subject);
    } catch (error) {
      // ScienceDirect returns 400 once the page parameter goes past the last
      // page; 404 is also a normal end-of-list signal.
      if (
        error.status === 404 ||
        (error instanceof BlockedError && error.status === 400)
      ) {
        console.log(`Page ${page} is past the end of the listing.`);
        break;
      }
      throw error;
    }

    const fresh = parsed.items.filter((item) => !lastPageSignature.has(itemKey(item)));
    console.log(`Page ${page}: ${parsed.items.length} item(s), ${fresh.length} new.`);
    if (fresh.length === 0) break;

    allItems.push(...parsed.items);
    lastPageSignature = new Set(
      allItems.map(itemKey),
    );
  }

  // Secondary-subject filters: fetch each filter once and merge by URL. The
  // listing data often omits these labels, so this is how they are collected.
  let secondaryTargets = firstParsed.secondary;
  if (options.secondary.length > 0) {
    secondaryTargets = options.secondary.map((slug) => {
      const known = firstParsed.secondary.find((entry) => entry.slug === slug);
      return {
        slug,
        label: known?.label ?? slug.replace(/-/g, " "),
        url: `${firstUrl}&secondarySubjectArea=${encodeURIComponent(slug)}`,
      };
    });
  }

  if (!options.noSecondary && secondaryTargets.length > 0) {
    for (const target of secondaryTargets) {
      await sleep(options.delayMs);
      console.log(`Fetching secondary subject: ${target.label}`);
      try {
        const response = await fetchText(target.url);
        const parsed = parsePayload(response.body, response.contentType);
        for (const raw of parsed.items) {
          const mapped = mapRawItem(raw, { secondarySubject: target.label });
          if (mapped) allItems.push(mapped);
        }
        console.log(`  ${parsed.items.length} item(s) merged.`);
      } catch (error) {
        console.warn(`  Skipped (${error.message}).`);
      }
    }
  }

  return {
    items: mergeItems(allItems),
    secondary: firstParsed.secondary,
  };
};

const findManualCapture = async (explicitPath) => {
  if (explicitPath) {
    try {
      const stat = await fs.stat(explicitPath);
      if (stat.isFile()) return explicitPath;
    } catch {
      throw new Error(`Input file not found: ${explicitPath}`);
    }
  }

  for (const candidate of MANUAL_CANDIDATES) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // Keep looking.
    }
  }

  return null;
};

const readSecondaryTargets = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        const label = normalizeWhitespace(entry);
        return label ? { slug: slugify(label), label, url: "" } : null;
      }

      if (entry && typeof entry === "object") {
        const label = normalizeWhitespace(
          entry.label ?? entry.name ?? entry.value,
        );
        const slug =
          normalizeWhitespace(entry.slug ?? entry.value) || slugify(label);
        return label && slug ? { slug, label, url: entry.url ?? "" } : null;
      }

      return null;
    })
    .filter(Boolean);
};

const parseManualFile = async (filePath) => {
  const body = await fs.readFile(filePath, "utf8");
  const extension = path.extname(filePath).toLowerCase();
  console.log(`Parsing saved capture: ${filePath}`);

  if (extension === ".json") {
    let parsedJson;
    try {
      parsedJson = JSON.parse(body);
    } catch (error) {
      throw new Error(`Saved JSON capture is not valid JSON: ${error.message}`);
    }

    const items = collectJsonItems(parsedJson)
      .map((raw) => mapRawItem(raw))
      .filter(Boolean);

    return {
      items: mergeItems(items),
      secondary: readSecondaryTargets(parsedJson.secondarySubjectAreas),
    };
  }

  const parsed = parsePayload(
    body,
    extension === ".html" || extension === ".htm" ? "text/html" : "",
  );
  return {
    items: mergeItems(parsed.items),
    secondary: parsed.secondary,
  };
};

const filterPastDeadlines = (items, includePast) => {
  if (includePast) return items;

  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}`;

  return items.filter(
    (item) => !item.submissionDeadline || item.submissionDeadline >= today,
  );
};

const sortByDeadline = (items) => {
  return [...items].sort((left, right) => {
    const leftDate = left.submissionDeadline || "9999-12-31";
    const rightDate = right.submissionDeadline || "9999-12-31";
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return left.title.localeCompare(right.title);
  });
};

const writeOutput = async (filePath, items, options, secondarySubjectAreas) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const payload = {
    source: "sciencedirect",
    subjectArea: DEFAULT_SUBJECT_AREA,
    subjectSlug: options.subject,
    scrapedAt: new Date().toISOString(),
    secondarySubjectAreas,
    count: items.length,
    items,
  };

  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
};

const printBlockedHelp = (error, capturePath) => {
  console.error("");
  console.error("ScienceDirect blocked the live request.");
  console.error(`Reason: ${error.message}`);
  console.error("");
  console.error(
    "This script does not attempt to bypass anti-bot protection. Save the",
  );
  console.error("listing manually, then parse your saved copy.");
  console.error("");
  console.error("How to save it (Chrome, Edge, or Firefox):");
  console.error(
    "  1. Open https://www.sciencedirect.com/browse/calls-for-papers?subject=computer-science",
  );
  console.error("  2. Wait until the list of special issues is visible.");
  console.error("  3. Open DevTools (F12) -> Network, reload the page, and filter");
  console.error('     requests for "calls-for-papers".');
  console.error(
    '  4. Right-click the response containing the list -> "Save response".',
  );
  console.error(`     Save it as: ${path.join(rawDir, "special-issues.json")}`);
  console.error(
    "     If no JSON response is visible, use Ctrl+S -> \"Webpage, HTML only\"",
  );
  console.error(
    `     and save it as: ${path.join(rawDir, "special-issues.html")}`,
  );
  console.error("");
  console.error("  5. Parse the saved file:");
  console.error(
    "     node scripts/scrapeSpecialIssues.js --input server/data/raw/special-issues.html",
  );
  console.error(
    "     (or --input server/data/raw/special-issues.json for a JSON response)",
  );
  console.error("");
  if (capturePath) {
    console.error(`Found an existing capture at ${capturePath}; using it instead.`);
  } else {
    console.error("No saved capture was found, so nothing was written.");
  }
  console.error("");
};

const main = async () => {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  let items = [];
  let secondaryTargets = [];

  if (options.input) {
    const filePath = await findManualCapture(options.input);
    const parsed = await parseManualFile(filePath);
    items = parsed.items;
    secondaryTargets = parsed.secondary;
  } else {
    try {
      const result = await collectLive(options);
      items = result.items;
      secondaryTargets = result.secondary;
    } catch (error) {
      if (!(error instanceof BlockedError)) throw error;

      const capturePath = await findManualCapture(null);
      printBlockedHelp(error, capturePath);
      if (!capturePath) {
        process.exitCode = 2;
        return;
      }
      const parsed = await parseManualFile(capturePath);
      items = parsed.items;
      secondaryTargets = parsed.secondary;
    }
  }

  const beforeFilter = items.length;
  items = sortByDeadline(filterPastDeadlines(items, options.includePast));
  const removed = beforeFilter - items.length;

  const allowedLabels =
    secondaryTargets.length > 0
      ? secondaryTargets.map((target) => target.label)
      : DEFAULT_SECONDARY_SUBJECTS;
  items = await enrichSecondarySubjects(items, new Set(allowedLabels));

  const secondarySubjectAreas = [
    ...new Set(items.flatMap((item) => item.secondarySubjectAreas ?? [])),
  ].sort((left, right) => left.localeCompare(right));

  if (items.length === 0) {
    console.warn("");
    console.warn("No special issues were found in the source.");
    console.warn(
      "Check that the saved capture contains the rendered listing, not only the page shell.",
    );
    process.exitCode = 3;
    return;
  }

  const payload = await writeOutput(
    options.output,
    items,
    options,
    secondarySubjectAreas,
  );
  const withDeadline = items.filter((item) => item.submissionDeadline).length;
  const withSecondary = items.filter(
    (item) => item.secondarySubjectAreas.length > 0,
  ).length;

  console.log("");
  console.log(`Wrote ${payload.count} special issue(s) to ${options.output}`);
  console.log(
    `  ${withDeadline} with a submission deadline, ${payload.count - withDeadline} without.`,
  );
  console.log(
    `  ${withSecondary} with secondary subject areas (${secondarySubjectAreas.length} distinct).`,
  );
  if (removed > 0) console.log(`  Removed ${removed} past-deadline item(s).`);
  console.log(`  scrapedAt: ${payload.scrapedAt}`);
};

main().catch((error) => {
  console.error("");
  console.error(`Scrape failed: ${error.message}`);
  console.error("");
  process.exitCode = 1;
});
