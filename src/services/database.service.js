// src/services/database.service.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { CONFIG } = require("../config");

const dbPath = path.join(CONFIG.dataDir, "app.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let db;

try {
  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    title TEXT NOT NULL,
    date TEXT,
    event_date TEXT,
    location TEXT DEFAULT '',
    region TEXT DEFAULT '',
    content_fingerprint TEXT DEFAULT '',
    organizer TEXT DEFAULT '',
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    source_url TEXT NOT NULL,
    source_hashtag TEXT DEFAULT '',
    scraped_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(platform, post_id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_platform
  ON events(platform);

  CREATE INDEX IF NOT EXISTS idx_events_event_date
  ON events(event_date);

  CREATE INDEX IF NOT EXISTS idx_events_created_at
  ON events(created_at);

  CREATE TABLE IF NOT EXISTS hashtag_rotation_state (
    platform TEXT PRIMARY KEY,
    queue_json TEXT NOT NULL,
    last_picked_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scrape_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT,
    context_json TEXT,
    timestamp TEXT NOT NULL
  );
`);
  // ensure indexes for newly created columns if any
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_events_platform ON events(platform);`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_region ON events(region);`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_events_content_fingerprint ON events(content_fingerprint);`,
  );
} catch (err) {
  // Fail fast with a helpful message so calling code can decide what to do.
  // Avoid crashing silently.
  // eslint-disable-next-line no-console
  console.error(`Failed to initialize SQLite database at ${dbPath}:`, err);
  throw err;
}

// --- Migrasi: tambah kolom "region" atau "content_fingerprint" kalau belum ada ---
// CREATE TABLE IF NOT EXISTS tidak akan menambah kolom baru ke tabel yang
// sudah ada sebelumnya, jadi perlu ALTER TABLE manual dengan pengecekan dulu
// supaya tidak error "duplicate column name" saat app restart.
function ensureColumns() {
  try {
    const columns = db.prepare("PRAGMA table_info(events)").all();
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("region")) {
      db.exec(`ALTER TABLE events ADD COLUMN region TEXT DEFAULT '';`);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_events_region ON events(region);`,
      );
    }

    if (!columnNames.has("content_fingerprint")) {
      db.exec(
        `ALTER TABLE events ADD COLUMN content_fingerprint TEXT DEFAULT '';`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_events_content_fingerprint ON events(content_fingerprint);`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to run migrations on 'events' table:", err);
    throw err;
  }
}

ensureColumns();

module.exports = db;
