import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_PATH = process.env.HARVEST_DB_PATH || path.join(DATA_DIR, "harvest.db");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "harvest-cache.json");

const DAY_MS = 24 * 60 * 60 * 1000;
// Listings a source stops publishing are kept this long (covers temporary source outages).
const UNSEEN_RETENTION_DAYS = Number(process.env.HARVEST_UNSEEN_RETENTION_DAYS) || 21;
// Expired listings stay queryable (includeExpired=true) for this long, then are deleted.
const EXPIRED_RETENTION_DAYS = Number(process.env.HARVEST_EXPIRED_RETENTION_DAYS) || 30;

let db = null;
let cachedStore = null;

const openDb = () => {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id            TEXT PRIMARY KEY,
      source_id     TEXT NOT NULL,
      kind          TEXT NOT NULL,
      subtype       TEXT,
      title         TEXT NOT NULL,
      url           TEXT,
      deadline_at   TEXT,
      starts_at     TEXT,
      ends_at       TEXT,
      posted_at     TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at  TEXT NOT NULL,
      data          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_kind ON items (kind, subtype);
    CREATE INDEX IF NOT EXISTS idx_items_source ON items (source_id);
    CREATE INDEX IF NOT EXISTS idx_items_deadline ON items (deadline_at);
    CREATE TABLE IF NOT EXISTS source_reports (
      source_id TEXT PRIMARY KEY,
      data      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  migrateLegacyJson();
  return db;
};

const getMeta = (key) => db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
const setMeta = db_ => (key, value) =>
  db_.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value === null || value === undefined ? null : String(value));

export const getStorePath = () => DB_PATH;

// Stable identity shared by dedupe and the database: the same listing always maps to the same row.
// Conferences are keyed by title alone because aggregators list one event under several URLs.
export const computeItemKey = (item) => {
  const kind = (item.kind || "").toLowerCase();
  const title = (item.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const url = kind === "conference" ? "" : (item.url || "").toLowerCase().trim();
  return `${kind}|${title}|${url}`;
};

export const computeItemId = (item) =>
  crypto.createHash("sha1").update(computeItemKey(item)).digest("hex").slice(0, 20);

export const readStore = async () => {
  if (cachedStore) return cachedStore;
  openDb();

  const items = db
    .prepare("SELECT data, first_seen_at, last_seen_at FROM items")
    .all()
    .map((row) => ({
      ...JSON.parse(row.data),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    }));
  const sourceReports = db
    .prepare("SELECT data FROM source_reports")
    .all()
    .map((row) => JSON.parse(row.data));

  cachedStore = {
    updatedAt: getMeta("updatedAt"),
    durationMs: Number(getMeta("durationMs")) || null,
    items,
    sourceReports,
  };
  return cachedStore;
};

/**
 * Upsert a harvest run. Items keep their original firstSeenAt; listings that are no
 * longer published, expired long ago, or belong to removed sources are pruned.
 */
export const writeStore = async ({
  updatedAt,
  durationMs,
  sourceReports = [],
  items = [],
  activeSourceIds = null,
}) => {
  openDb();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const upsertItem = db.prepare(`
    INSERT INTO items (id, source_id, kind, subtype, title, url, deadline_at, starts_at, ends_at,
                       posted_at, first_seen_at, last_seen_at, data)
    VALUES (@id, @sourceId, @kind, @subtype, @title, @url, @deadlineAt, @startsAt, @endsAt,
            @postedAt, @firstSeenAt, @lastSeenAt, @data)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id, kind = excluded.kind, subtype = excluded.subtype,
      title = excluded.title, url = excluded.url, deadline_at = excluded.deadline_at,
      starts_at = excluded.starts_at, ends_at = excluded.ends_at, posted_at = excluded.posted_at,
      last_seen_at = MAX(items.last_seen_at, excluded.last_seen_at), data = excluded.data
  `);
  const upsertReport = db.prepare(
    "INSERT INTO source_reports (source_id, data) VALUES (?, ?) ON CONFLICT(source_id) DO UPDATE SET data = excluded.data",
  );

  let pruned = 0;
  db.transaction(() => {
    for (const item of items) {
      const { firstSeenAt, lastSeenAt, ...rest } = item;
      upsertItem.run({
        id: item.id,
        sourceId: item.sourceId,
        kind: item.kind,
        subtype: item.subtype ?? null,
        title: item.title,
        url: item.url ?? null,
        deadlineAt: item.deadlineAt ?? null,
        startsAt: item.startsAt ?? null,
        endsAt: item.endsAt ?? null,
        postedAt: item.postedAt ?? null,
        firstSeenAt: firstSeenAt || lastSeenAt || nowIso,
        lastSeenAt: lastSeenAt || nowIso,
        data: JSON.stringify(rest),
      });
    }

    db.prepare("DELETE FROM source_reports").run();
    for (const report of sourceReports) upsertReport.run(report.sourceId, JSON.stringify(report));

    const unseenCutoff = new Date(now - UNSEEN_RETENTION_DAYS * DAY_MS).toISOString();
    const expiredCutoff = new Date(now - EXPIRED_RETENTION_DAYS * DAY_MS).toISOString();
    pruned += db.prepare("DELETE FROM items WHERE last_seen_at < ?").run(unseenCutoff).changes;
    // Conferences live until the event ends; everything else until its deadline.
    pruned += db
      .prepare(
        `DELETE FROM items WHERE (ends_at IS NOT NULL AND ends_at < @cutoff)
           OR (ends_at IS NULL AND deadline_at IS NOT NULL AND deadline_at < @cutoff)`,
      )
      .run({ cutoff: expiredCutoff }).changes;
    if (Array.isArray(activeSourceIds) && activeSourceIds.length) {
      const placeholders = activeSourceIds.map(() => "?").join(",");
      pruned += db
        .prepare(`DELETE FROM items WHERE source_id NOT IN (${placeholders})`)
        .run(...activeSourceIds).changes;
    }

    const set = setMeta(db);
    set("updatedAt", updatedAt);
    set("durationMs", durationMs);
    set("lastPruned", pruned);
  })();

  cachedStore = null;
  const store = await readStore();
  return { ...store, pruned };
};

// One-time import of the old JSON cache so existing data (and firstSeenAt history) survives.
function migrateLegacyJson() {
  const hasItems = db.prepare("SELECT 1 FROM items LIMIT 1").get();
  if (hasItems || !fs.existsSync(LEGACY_JSON_PATH)) return;
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON_PATH, "utf-8"));
    const items = (legacy.items || []).filter((item) => item.sourceId && item.title);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO items (id, source_id, kind, subtype, title, url, first_seen_at, last_seen_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    db.transaction(() => {
      for (const item of items) {
        const seen = item.lastSeenAt || item.fetchedAt || new Date().toISOString();
        insert.run(computeItemId(item), item.sourceId, item.kind, item.subtype ?? null, item.title,
          item.url ?? null, item.fetchedAt || seen, seen, JSON.stringify(item));
      }
      // Leave updatedAt empty so the scheduler re-harvests and fills in the date fields.
    })();
    fs.renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
    console.log(`[harvest] migrated ${items.length} items from harvest-cache.json into SQLite`);
  } catch (error) {
    console.error("[harvest] legacy JSON migration failed:", error.message);
  }
}
