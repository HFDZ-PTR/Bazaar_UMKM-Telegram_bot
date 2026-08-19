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

  // Jangan membuat index untuk kolom migrasi di sini sebelum kolomnya ada.
  // Kolom posted_at dan date_source ditambahkan oleh ensureColumns().
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
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(`Failed to initialize SQLite database at ${dbPath}:`, err);
  throw err;
}

/**
 * Tambahkan kolom baru ke tabel events hanya jika belum tersedia.
 *
 * CREATE TABLE IF NOT EXISTS tidak mengubah struktur tabel lama.
 * Karena itu kolom baru harus ditambahkan memakai ALTER TABLE.
 * Index untuk kolom baru dibuat setelah ALTER TABLE selesai.
 */
function ensureColumns() {
  try {
    let columns = db.prepare("PRAGMA table_info(events)").all();
    let columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("region")) {
      db.exec(`
        ALTER TABLE events
        ADD COLUMN region TEXT DEFAULT '';
      `);
    }

    if (!columnNames.has("content_fingerprint")) {
      db.exec(`
        ALTER TABLE events
        ADD COLUMN content_fingerprint TEXT DEFAULT '';
      `);
    }

    if (!columnNames.has("posted_at")) {
      db.exec(`
        ALTER TABLE events
        ADD COLUMN posted_at TEXT DEFAULT NULL;
      `);
    }

    if (!columnNames.has("date_source")) {
      db.exec(`
        ALTER TABLE events
        ADD COLUMN date_source TEXT DEFAULT NULL;
      `);
    }

    // Refresh informasi kolom setelah semua ALTER TABLE selesai.
    columns = db.prepare("PRAGMA table_info(events)").all();
    columnNames = new Set(columns.map((column) => column.name));

    // Index lama dan index kolom baru dibuat setelah semua kolom tersedia.
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_platform
      ON events(platform);

      CREATE INDEX IF NOT EXISTS idx_events_event_date
      ON events(event_date);

      CREATE INDEX IF NOT EXISTS idx_events_created_at
      ON events(created_at);

      CREATE INDEX IF NOT EXISTS idx_events_region
      ON events(region);

      CREATE INDEX IF NOT EXISTS idx_events_content_fingerprint
      ON events(content_fingerprint);

      CREATE INDEX IF NOT EXISTS idx_events_posted_at
      ON events(posted_at);
    `);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to run migrations on 'events' table:", err);
    throw err;
  }
}

ensureColumns();

module.exports = db;
