import { MATCH_CONFIG } from "./config.js";

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  times: "x",
  copy: "(c)",
  reg: "(R)",
  trade: "(TM)",
};

/** Decode HTML entities without pulling in a dependency. */
export const decodeHtmlEntities = (value) =>
  String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => {
      const decoded = NAMED_ENTITIES[name.toLowerCase()];
      return decoded == null ? match : decoded;
    });

/** Boilerplate that appears in publisher scope copy but says nothing about fit. */
const BOILERPLATE_PATTERNS = [
  /special issue proposal note/gi,
  /please (?:see|visit|check) (?:our|the) (?:guide for authors|support center)[^.]*\.?/gi,
  /if you require any further information or help[^.]*\.?/gi,
  /we invite you to convert your open source software[^.]*\.?/gi,
  /for more information contact us at:[^.]*\.?/gi,
  /authors are strongly encouraged to make their datasets publicly accessible[^.]*\.?/gi,
  /submissions? (?:should|must) be (?:submitted|made) (?:via|through)[^.]*\.?/gi,
  /https?:\/\/\S+/gi,
  /www\.\S+/gi,
];

/**
 * Clean publisher text: decode entities, drop boilerplate, normalize whitespace.
 * Kept deliberately conservative so scope meaning is not stripped.
 */
export const cleanText = (value) => {
  let text = decodeHtmlEntities(value);
  for (const pattern of BOILERPLATE_PATTERNS) {
    text = text.replace(pattern, " ");
  }
  return text
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const normalizeWhitespace = cleanText;

export const normalizeKey = (value) => normalizeWhitespace(value).toLowerCase();

export const STOP_WORDS = new Set([
  "a", "about", "above", "across", "after", "again", "against", "all", "also",
  "an", "and", "any", "are", "as", "at", "be", "because", "been", "before",
  "being", "below", "between", "both", "but", "by", "can", "could", "did", "do",
  "does", "doing", "during", "each", "few", "for", "from", "further", "had",
  "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
  "himself", "his", "how", "however", "i", "if", "in", "into", "is", "it",
  "its", "itself", "just", "may", "me", "might", "more", "most", "must", "my",
  "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or",
  "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
  "she", "should", "so", "some", "such", "than", "that", "the", "their",
  "theirs", "them", "themselves", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was", "we",
  "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "will", "with", "would", "you", "your", "yours", "yourself", "yourselves",
  "paper", "papers", "study", "studies", "research", "article", "articles", "journal",
  "authors", "submission", "submissions", "submit", "submitted", "published",
  "publishing", "publication", "publications", "review", "reviews", "reviewed",
  "editor", "editors", "editorial", "reader", "readers", "field", "fields",
  "including", "include", "includes", "related", "relevant", "topics", "topic",
  "areas", "area", "work", "works", "new", "novel", "provide", "provides",
  "based", "using", "use", "used", "well", "within", "without", "among",
  "etc", "eg", "ie", "via", "per", "one", "two", "three", "many", "much",
  "propose", "proposed", "proposes", "present", "presents", "design",
  "designed", "develop", "developed", "evaluate", "evaluated", "experiment",
  "experiments", "result", "results", "show", "shows", "shown", "demonstrate",
  "demonstrates", "approach", "approaches", "contribution", "contributions",
]);

const SHORT_ACRONYMS = new Set(["ai", "ml", "iot", "iiot", "vr", "ar", "5g", "6g", "llm", "qa"]);

export const tokenize = (value) =>
  normalizeKey(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        (token.length > 2 || SHORT_ACRONYMS.has(token)) &&
        !STOP_WORDS.has(token),
    );

export const unique = (items) => [...new Set(items.filter(Boolean))];

export const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const round = (value, decimals = 4) =>
  Number.parseFloat(Number(value).toFixed(decimals));

export const snippet = (value, maxLength = 260) => {
  const text = normalizeWhitespace(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
};

export const splitSentences = (value) => {
  const text = normalizeWhitespace(value);
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
};

/** Like splitSentences, but also breaks on bullet separators. */
const splitScopeSegments = (value) => {
  const text = normalizeWhitespace(value);
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])|\s*[•·▪]\s*/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

/** Split text into ~wordCount-word chunks with a small overlap. */
export const wordChunks = (value, wordCount, overlap) => {
  const words = normalizeWhitespace(value).split(" ").filter(Boolean);
  if (!words.length) return [];
  const size = Math.max(20, wordCount);
  const step = Math.max(1, size - Math.max(0, overlap));
  const chunks = [];
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + size);
    if (!slice.length) break;
    chunks.push(slice.join(" "));
    if (start + size >= words.length) break;
  }
  return chunks;
};

/**
 * Split an abstract into at most `maxChunks` sentence-balanced pieces.
 * Used to average multiple embeddings instead of truncating a long abstract.
 */
export const splitAbstract = (value, maxChunks = 3) => {
  const text = normalizeWhitespace(value);
  if (!text) return [];
  const words = text.split(" ").filter(Boolean);
  if (words.length <= 160) return [text];

  const target = Math.min(maxChunks, Math.max(1, Math.ceil(words.length / 140)));
  const perChunk = Math.ceil(words.length / target);
  const pieces = [];
  for (let index = 0; index < target; index += 1) {
    const slice = words.slice(index * perChunk, (index + 1) * perChunk);
    if (slice.length) pieces.push(slice.join(" "));
  }
  return pieces;
};

const EXCLUSION_PATTERNS = [
  /will not be considered/i,
  /not be considered/i,
  /cannot be considered/i,
  /\bexcluded\b/i,
  /\bout of scope\b/i,
  /\bmoratorium\b/i,
  /\b(?:do|does|did) not accept\b/i,
  /\bwill not (?:publish|review|consider)\b/i,
  /\b(?:is|are) not (?:within|in) (?:the )?(?:journal'?s? )?scope\b/i,
];

const EXCLUSION_KEYWORDS = new Set([
  "considered", "consider", "consideration", "excluded", "exclude", "exclusion",
  "scope", "scopes", "moratorium", "accept", "accepts", "accepted", "publish",
  "published", "publishing", "publishes", "review", "reviewed", "submit",
  "submitted", "submission", "submissions", "journal", "journals", "manuscript",
  "manuscripts", "article", "articles", "paper", "papers", "special", "issue",
  "issues", "proposal", "proposals", "note", "will", "not", "unless", "without",
  "other", "such", "author", "authors", "application", "applications",
  "technique", "techniques", "method", "methods", "research", "study", "studies",
  "work", "works", "focus", "based", "using", "use", "used", "include",
  "includes", "including", "provide", "provides", "area", "areas", "field",
  "fields", "subject", "subjects", "deal", "deals", "following", "related",
  "specific", "particular", "general", "intended", "primarily", "significant",
  "principal", "component", "components", "quality", "high", "highest",
  "leading", "cutting", "edge", "help", "secure", "maintain", "receive",
  "practical", "advice", "examples", "example", "listed", "complete",
  "discussion", "discussing", "commenting", "interest", "shortly", "recently",
]);

const ACRONYM_PATTERN = /\b[A-Z][A-Z0-9]{1,5}\b/g;

const findClauseStart = (segment, cueIndex) => {
  const before = segment.slice(0, cueIndex);
  const boundaryPattern = /(?:[.!?]\s+|;\s+|:\s+)/g;
  let start = 0;
  let match;
  while ((match = boundaryPattern.exec(before)) !== null) {
    if (cueIndex - (match.index + match[0].length) <= 320) {
      start = match.index + match[0].length;
    }
  }
  return start;
};

const findClauseEnd = (segment, cueEnd) => {
  const after = segment.slice(cueEnd);
  const boundary = after.search(/[.!?](?:\s|$)|;\s+|:\s+/);
  if (boundary === -1) return segment.length;
  return cueEnd + boundary + 1;
};

const CUE_LABEL_PATTERN = /(?:not accept|excluded|out of scope)[^:]{0,80}:/i;

/**
 * Collect clauses that describe topics the journal rejects.
 * Only the clause around the exclusion cue is used for keywords, so marketing
 * copy elsewhere in a run-on sentence cannot poison the match.
 */
export const extractExcludedTopics = (
  scope,
  { title = "", subjectAreas = [] } = {},
) => {
  const excluded = [];
  const seen = new Set();
  const titleTokens = new Set(
    tokenize([title, ...(subjectAreas || [])].join(" ")),
  );

  for (const segment of splitScopeSegments(scope)) {
    const cue = EXCLUSION_PATTERNS.map((pattern) => pattern.exec(segment))
      .filter(Boolean)
      .sort((left, right) => left.index - right.index)[0];
    if (!cue) continue;
    if (segment.length < 25) continue;

    let start = findClauseStart(segment, cue.index);
    let endSearchFrom = cue.index + cue[0].length;

    // "does not accept submissions on the following topics: X, Y" -> keep X, Y.
    const cueWindow = segment.slice(cue.index, cue.index + 120);
    const label = CUE_LABEL_PATTERN.exec(cueWindow);
    if (label) {
      start = Math.max(start, cue.index + label.index + label[0].length);
      endSearchFrom = Math.max(endSearchFrom, start);
    }

    const end = findClauseEnd(segment, endSearchFrom);
    let clause = normalizeWhitespace(segment.slice(start, end)) || segment;

    const collectTerms = (text) => {
      const acronyms = (text.match(ACRONYM_PATTERN) || [])
        .map((acronym) => acronym.toLowerCase())
        .filter((acronym) => acronym.length >= 2 && !STOP_WORDS.has(acronym));
      return unique([
        ...acronyms,
        ...tokenize(text).filter((token) => !EXCLUSION_KEYWORDS.has(token)),
      ])
        .filter((token) => token.length > 3 || acronyms.includes(token))
        .filter((token) => !titleTokens.has(token))
        .slice(0, 12);
    };

    let terms = collectTerms(clause);

    // Short fragments (e.g. "would not be considered.") need more context.
    if (terms.length < 2) {
      const expandedStart = Math.max(0, cue.index - 220);
      const expanded = normalizeWhitespace(
        segment.slice(expandedStart, Math.min(segment.length, cue.index + 220)),
      );
      if (expanded.length > clause.length) {
        const expandedTerms = collectTerms(expanded);
        if (expandedTerms.length > terms.length) {
          clause = expanded;
          terms = expandedTerms;
        }
      }
    }

    if (!terms.length) continue;

    const key = clause.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    excluded.push({ sentence: snippet(clause, 320), terms });
  }

  return excluded;
};
