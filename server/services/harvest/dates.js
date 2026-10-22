// Turns the many date formats our sources use into ISO timestamps so items can be
// sorted by deadline and expired listings can be hidden or pruned automatically.

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSING_SOON_DAYS = 14;

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const MONTH_NAME = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const toIso = (year, month, day) => {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString();
};

const monthIndex = (token) => MONTHS[token.toLowerCase().slice(0, token.toLowerCase().startsWith("sept") ? 4 : 3)];

// Year-less dates ("08 Nov") are resolved relative to `reference`: deadlines roll
// forward to the next occurrence, posted dates roll backward to the last one.
const resolveYearless = (month, day, reference, direction) => {
  const ref = new Date(reference);
  let year = ref.getUTCFullYear();
  let iso = toIso(year, month, day);
  if (!iso) return null;
  const diff = Date.parse(iso) - ref.getTime();
  if (direction === "future" && diff < -60 * DAY_MS) iso = toIso(year + 1, month, day);
  if (direction === "past" && diff > 2 * DAY_MS) iso = toIso(year - 1, month, day);
  return iso;
};

/**
 * Parse a single date expression. Returns an ISO string or null.
 * direction: "future" for deadlines/events, "past" for posted dates (only used when no year is given).
 */
export const parseDate = (value, { reference = Date.now(), direction = "future" } = {}) => {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").replace(/(\d)(st|nd|rd|th)\b/gi, "$1").trim();
  if (!text) return null;

  let match = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return toIso(+match[1], +match[2] - 1, +match[3]);

  match = text.match(new RegExp(`\\b${MONTH_NAME}\\.? (\\d{1,2}),? (\\d{4})\\b`, "i"));
  if (match) return toIso(+match[3], monthIndex(match[1]), +match[2]);

  match = text.match(new RegExp(`\\b(\\d{1,2}) ${MONTH_NAME}\\.?,? (\\d{4})\\b`, "i"));
  if (match) return toIso(+match[3], monthIndex(match[2]), +match[1]);

  match = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (match) return toIso(+match[3], +match[2] - 1, +match[1]); // day-first, as used by Indian/EU sources

  // RFC-822 / ISO timestamps from feeds and APIs.
  if (/\d{4}/.test(text) && /[:T]/.test(text)) {
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }

  match = text.match(new RegExp(`\\b(\\d{1,2}) ${MONTH_NAME}\\b`, "i"));
  if (match) return resolveYearless(monthIndex(match[2]), +match[1], reference, direction);

  match = text.match(new RegExp(`\\b${MONTH_NAME} (\\d{1,2})\\b`, "i"));
  if (match) return resolveYearless(monthIndex(match[1]), +match[2], reference, direction);

  return null;
};

/** "Dec 14, 2026 - Dec 17, 2026", "2026-10-23 ~ 2026-10-25", "May 22-July 5, 2027" */
export const parseDateRange = (value, options) => {
  if (!value) return { start: null, end: null };
  const text = String(value);
  const parts = text.split(/\s+(?:-|–|~|to)\s+|(?<=\d)\s*[-–~]\s*(?=[A-Za-z]{3}|\d{4})/i);
  if (parts.length >= 2) {
    const start = parseDate(parts[0], options);
    const end = parseDate(parts[1], options);
    if (start && end) return { start, end };
    // "May 22 - July 5, 2027": borrow the year from the end of the range.
    const yearMatch = parts[1].match(/\b(\d{4})\b/);
    if (end && yearMatch && !/\d{4}/.test(parts[0])) {
      return { start: parseDate(`${parts[0]} ${yearMatch[1]}`, options), end };
    }
    return { start: start || end, end: end || start };
  }
  const single = parseDate(text, options);
  return { start: single, end: single };
};

const DEADLINE_PATTERNS = [
  /(?:application |submission |paper |abstract |proposal |closing )?deadline\s*(?:is|:|-|–)?\s*([^.;|\n]{3,40})/i,
  /\b(?:apply|submit|register)(?: online)? (?:by|before|until|till)\s*:?\s*([^.;|\n\]]{3,40})/i,
  /\b(?:closing date|closes(?: on)?|last date(?: to apply| for submission)?|due(?: date)?)\s*:?\s*([^.;|\n]{3,40})/i,
  /\bapplications? (?:close|due)\s*(?:on|by)?\s*:?\s*([^.;|\n]{3,40})/i,
];

/** Find a deadline mentioned in free text such as "Apply by Sep 25" or "Deadline: January 15, 2027". */
export const extractDeadline = (text, options) => {
  if (!text) return null;
  for (const pattern of DEADLINE_PATTERNS) {
    const match = String(text).match(pattern);
    if (!match) continue;
    const iso = parseDate(match[1], { ...options, direction: "future" });
    if (iso) return iso;
  }
  return null;
};

/**
 * Add normalised date fields to a harvested item:
 *   deadlineAt – when applications/submissions close
 *   startsAt / endsAt – event dates (conferences)
 *   postedAt – when the listing was published
 */
export const enrichItemDates = (item, reference = Date.now()) => {
  const options = { reference };
  const text = `${item.title || ""} ${item.summary || ""}`;
  const enriched = { ...item };

  if (item.kind === "conference") {
    // Call4Paper rows read "... 2026-10-23 ~ 2026-10-25 2026-09-10 [Passed]": event range then deadline.
    const c4p = text.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})/);
    if (c4p) {
      enriched.startsAt = parseDate(c4p[1]);
      enriched.endsAt = parseDate(c4p[2]);
      enriched.deadlineAt = parseDate(c4p[3]);
    } else {
      const range = parseDateRange(item.eventDate, options);
      enriched.startsAt = range.start;
      enriched.endsAt = range.end;
    }
  } else if (item.eventDate) {
    // For feeds, eventDate holds the publication timestamp.
    enriched.postedAt = parseDate(item.eventDate, { reference, direction: "past" });
  }

  if (!enriched.deadlineAt) {
    // A year-less "Apply by Sep 25" belongs to the year the post was published, not today.
    const deadlineReference = enriched.postedAt ? Date.parse(enriched.postedAt) : reference;
    enriched.deadlineAt =
      parseDate(item.deadline, { reference: deadlineReference, direction: "future" }) ||
      extractDeadline(text, { reference: deadlineReference });
  }

  enriched.startsAt ??= null;
  enriched.endsAt ??= null;
  enriched.postedAt ??= null;
  enriched.deadlineAt ??= null;
  return enriched;
};

/**
 * open | closing-soon | submissions-closed | upcoming | expired | unknown
 * Computed at read time so it never goes stale. A conference whose CFP has closed is
 * still upcoming ("submissions-closed") until the event itself is over.
 */
export const getItemStatus = (item, now = Date.now()) => {
  const closesAt = item.deadlineAt ? Date.parse(item.deadlineAt) + DAY_MS : null; // deadline day is inclusive
  const eventOver = item.endsAt ? Date.parse(item.endsAt) + DAY_MS < now : false;

  if (item.endsAt && eventOver) return "expired";
  if (closesAt !== null && closesAt < now) {
    return item.endsAt ? "submissions-closed" : "expired";
  }
  if (closesAt === null && eventOver) return "expired";
  if (closesAt !== null && closesAt - now <= CLOSING_SOON_DAYS * DAY_MS) return "closing-soon";
  if (closesAt !== null) return "open";
  if (item.startsAt && Date.parse(item.startsAt) > now) return "upcoming";
  return "unknown";
};

export const isExpired = (item, now) => getItemStatus(item, now) === "expired";
