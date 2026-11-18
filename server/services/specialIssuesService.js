import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.resolve(__dirname, "..", "data", "special-issues.json");

const DEFAULT_SUBJECT_AREA = "Computer Science";
const CLOSING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

let cache = {
  mtimeMs: -1,
  payload: null,
};

const normalizeWhitespace = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const pad = (value) => String(value).padStart(2, "0");

const localDateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const coerceIsoDate = (value) => {
  const text = normalizeWhitespace(value);
  if (!text) return null;

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
};

const coerceNumber = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const asStringArray = (value) => {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeWhitespace).filter(Boolean))];
  }
  return [normalizeWhitespace(value)].filter(Boolean);
};

const daysBetweenTodayAnd = (deadlineIso) => {
  if (!deadlineIso) return null;

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const deadlineStart = Date.parse(`${deadlineIso}T00:00:00`);
  if (Number.isNaN(deadlineStart)) return null;

  return Math.round((deadlineStart - todayStart) / DAY_MS);
};

const normalizeItem = (raw, index) => {
  if (!raw || typeof raw !== "object") return null;

  const title = normalizeWhitespace(raw.title);
  const url = normalizeWhitespace(raw.url);
  if (!title || !url) return null;

  const submissionDeadline = coerceIsoDate(raw.submissionDeadline);
  const guestEditors = asStringArray(raw.guestEditors);
  const secondarySubjectAreas = asStringArray(raw.secondarySubjectAreas);

  return {
    id:
      normalizeWhitespace(raw.id) ||
      `special-issue-${index}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    guestEditors,
    journalName: normalizeWhitespace(raw.journalName) || null,
    journalUrl: normalizeWhitespace(raw.journalUrl) || null,
    impactFactor: coerceNumber(raw.impactFactor),
    citeScore: coerceNumber(raw.citeScore),
    submissionDeadline,
    url,
    subjectArea: normalizeWhitespace(raw.subjectArea) || DEFAULT_SUBJECT_AREA,
    secondarySubjectAreas,
  };
};

const readPayload = async () => {
  try {
    const stat = await fs.stat(dataFile);
    if (cache.payload && cache.mtimeMs === stat.mtimeMs) return cache.payload;

    const body = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(body);
    const rawItems = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.items)
        ? parsed.items
        : [];

    const items = rawItems
      .map((raw, index) => normalizeItem(raw, index))
      .filter(Boolean);

    const payload = {
      items,
      scrapedAt:
        !Array.isArray(parsed) && typeof parsed.scrapedAt === "string"
          ? parsed.scrapedAt
          : null,
      subjectArea:
        (!Array.isArray(parsed) && normalizeWhitespace(parsed.subjectArea)) ||
        DEFAULT_SUBJECT_AREA,
      subjectSlug:
        (!Array.isArray(parsed) && normalizeWhitespace(parsed.subjectSlug)) ||
        "computer-science",
      secondarySubjectAreas: Array.isArray(parsed)
        ? []
        : asStringArray(parsed.secondarySubjectAreas),
    };

    cache = { mtimeMs: stat.mtimeMs, payload };
    return payload;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Unable to read special-issues data:", error.message);
    }

    const payload = {
      items: [],
      scrapedAt: null,
      subjectArea: DEFAULT_SUBJECT_AREA,
      subjectSlug: "computer-science",
      secondarySubjectAreas: [],
    };
    cache = { mtimeMs: -1, payload };
    return payload;
  }
};

const withLiveStatus = (item) => {
  const daysUntilDeadline = daysBetweenTodayAnd(item.submissionDeadline);
  let status = "unknown";

  if (item.submissionDeadline) {
    if (daysUntilDeadline < 0) status = "expired";
    else if (daysUntilDeadline <= CLOSING_SOON_DAYS) status = "closing-soon";
    else status = "open";
  }

  return {
    ...item,
    deadlineAt: item.submissionDeadline
      ? `${item.submissionDeadline}T23:59:59`
      : null,
    daysUntilDeadline,
    status,
  };
};

const isUpcoming = (item) => {
  if (!item.submissionDeadline) return true;
  return item.submissionDeadline >= localDateKey(new Date());
};

const matchesQuery = (item, tokens) => {
  if (tokens.length === 0) return true;

  const haystack = [
    item.title,
    item.journalName || "",
    ...(item.guestEditors || []),
    ...(item.secondarySubjectAreas || []),
  ]
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
};

const compareByDeadline = (left, right) => {
  const leftDate = left.submissionDeadline || "9999-12-31";
  const rightDate = right.submissionDeadline || "9999-12-31";
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return left.title.localeCompare(right.title);
};

/**
 * Read the manually collected ScienceDirect special-issues dataset.
 *
 * Filtering happens here rather than in the page so every client sees the
 * same deadline handling: expired calls are removed, the nearest deadline is
 * first, and keyword matching covers title, editors and journal.
 */
export const searchSpecialIssues = async ({
  query = "",
  secondarySubject = "",
} = {}) => {
  const payload = await readPayload();

  const upcoming = payload.items
    .map(withLiveStatus)
    .filter((item) => isUpcoming(item));

  const tokens = normalizeWhitespace(query)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const secondaryFilter = normalizeWhitespace(secondarySubject).toLowerCase();

  const filtered = upcoming
    .filter((item) => matchesQuery(item, tokens))
    .filter((item) => {
      if (!secondaryFilter) return true;
      return item.secondarySubjectAreas.some(
        (subject) => subject.toLowerCase() === secondaryFilter,
      );
    })
    .sort(compareByDeadline);

  const secondarySubjectAreas = [
    ...new Set([
      ...(payload.secondarySubjectAreas || []),
      ...upcoming.flatMap((item) => item.secondarySubjectAreas || []),
    ]),
  ].sort((left, right) => left.localeCompare(right));

  return {
    items: filtered,
    meta: {
      total: upcoming.length,
      filtered: filtered.length,
      scrapedAt: payload.scrapedAt,
      subjectArea: payload.subjectArea,
      subjectSlug: payload.subjectSlug,
      secondarySubjectAreas,
      closingSoonDays: CLOSING_SOON_DAYS,
    },
  };
};

export default {
  searchSpecialIssues,
};
