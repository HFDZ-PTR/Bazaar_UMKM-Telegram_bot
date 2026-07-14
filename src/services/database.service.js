// src/services/database.service.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { CONFIG } = require("../config");

const DB_PATH = path.join(CONFIG.dataDir, "app.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

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
    organizer TEXT DEFAULT '',
    description TEXT NOT NULL,
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

module.exports = db;