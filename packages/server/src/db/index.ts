import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { logger } from "../logger.js";

export type Db = Database.Database;

let instance: Db | null = null;

/** Ordered, append-only migrations. Never edit a shipped entry — add a new one. */
const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "001_init",
    sql: `
      CREATE TABLE saved_searches (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        request      TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        last_run_at  TEXT,
        last_cheapest REAL
      );

      CREATE TABLE alerts (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        request         TEXT NOT NULL,
        target_price    REAL,
        drop_percent    REAL,
        currency        TEXT NOT NULL,
        active          INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT NOT NULL,
        last_checked_at TEXT,
        last_price      REAL,
        baseline_price  REAL,
        triggered_at    TEXT
      );

      CREATE TABLE price_history (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        origin         TEXT NOT NULL,
        destination    TEXT NOT NULL,
        departure_date TEXT NOT NULL,
        currency       TEXT NOT NULL,
        price          REAL NOT NULL,
        observed_at    TEXT NOT NULL
      );

      CREATE INDEX idx_price_history_route
        ON price_history (origin, destination, departure_date, observed_at);
    `,
  },
  {
    name: "002_alert_events",
    sql: `
      CREATE TABLE alert_events (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id      TEXT NOT NULL,
        price         REAL NOT NULL,
        previous_price REAL,
        currency      TEXT NOT NULL,
        message       TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        acknowledged  INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (alert_id) REFERENCES alerts (id) ON DELETE CASCADE
      );

      CREATE INDEX idx_alert_events_alert ON alert_events (alert_id, created_at DESC);
    `,
  },
];

function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);

  const applied = new Set(
    db.prepare<[], { name: string }>("SELECT name FROM _migrations").all().map((r) => r.name),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    // Each migration is atomic: schema change and its bookkeeping row commit together.
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
        migration.name,
        new Date().toISOString(),
      );
    })();
    logger.info(`applied migration ${migration.name}`);
  }
}

/**
 * Anchor relative database paths to the server package, not `process.cwd()`.
 * Otherwise `npm run dev`, `npm start` and `node dist/index.js` each create a
 * *different* database file, and saved searches appear to vanish.
 */
function resolveDbPath(configured: string): string {
  if (isAbsolute(configured)) return configured;
  // src/db/index.ts and dist/db/index.js are both two levels below the package root.
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return resolve(packageRoot, configured);
}

export function getDb(): Db {
  if (instance) return instance;

  const path = resolveDbPath(config.DATABASE_PATH);
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  // WAL keeps reads from blocking the background alert poller's writes.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  migrate(db);
  instance = db;
  logger.info(`database ready at ${path}`);
  return db;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
