// src/utils/storage.service.js
const fs = require("fs").promises;
const path = require("path");
const db = require("../services/database.service");
const { CONFIG } = require("../config");
const { createFingerprint } = require("./fingerprint");
const { toIsoDateString, parseEventDateString } = require("./date");

const ALLOWED_EVENT_PLATFORMS = new Set(["tiktok", "instagram"]);

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function getPlatformEventsDir(platform) {
  const normalizedPlatform =
    typeof platform === "string" ? platform.trim().toLowerCase() : "";

  if (!ALLOWED_EVENT_PLATFORMS.has(normalizedPlatform)) {
    throw new Error(`Unsupported event platform: ${platform}`);
  }

  return path.join(CONFIG.eventsDir, normalizedPlatform);
}

async function listEventFiles(dir = CONFIG.eventsDir) {
  await fs.mkdir(dir, { recursive: true });

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return listEventFiles(fullPath);
      }

      if (entry.isFile() && entry.name.endsWith(".json")) {
        return [fullPath];
      }

      return [];
    }),
  );

  return results.flat();
}

async function ensureFile(filePath, defaultValue) {
  await ensureDirectory(filePath);

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(
      filePath,
      JSON.stringify(defaultValue, null, 2),
      "utf8",
    );
  }
}

async function readJSON(filePath, defaultValue) {
  await ensureFile(filePath, defaultValue);

  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) {
    return defaultValue;
  }

  return JSON.parse(raw);
}

async function writeJSON(filePath, data) {
  await ensureDirectory(filePath);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeEventRecord(event) {
  const now = new Date().toISOString();
  const normalizedPlatform =
    typeof event.platform === "string"
      ? event.platform.trim().toLowerCase()
      : "";

  const eventDate =
    typeof event.eventDate === "string" ? event.eventDate : null;
  const parsedEventDate = parseEventDateString(eventDate);
  const normalizedEventDate = parsedEventDate
    ? toIsoDateString(parsedEventDate)
    : null;

  return {
    ...event,
    platform: normalizedPlatform,
    id: event.id || createFingerprint(normalizedPlatform, event.postId),
    eventDate: normalizedEventDate,
    date: event.date || normalizedEventDate || toIsoDateString(new Date()),
    scrapedAt: event.scrapedAt || now,
    createdAt: event.createdAt || now,
  };
}

const insertEventStmt = db.prepare(`
  INSERT OR IGNORE INTO events (
    id,
    platform,
    post_id,
    title,
    date,
    event_date,
    location,
    organizer,
    description,
    image_url,
    source_url,
    source_hashtag,
    scraped_at,
    created_at
  ) VALUES (
    @id,
    @platform,
    @post_id,
    @title,
    @date,
    @event_date,
    @location,
    @organizer,
    @description,
    @image_url,
    @source_url,
    @source_hashtag,
    @scraped_at,
    @created_at
  )
`);

async function appendEvent(event) {
  const normalizedEvent = normalizeEventRecord(event);

  const result = insertEventStmt.run({
    id: normalizedEvent.id,
    platform: normalizedEvent.platform,
    post_id: normalizedEvent.postId,
    title: normalizedEvent.title,
    date: normalizedEvent.date || null,
    event_date: normalizedEvent.eventDate || null,
    location: normalizedEvent.location || "",
    organizer: normalizedEvent.organizer || "",
    description: normalizedEvent.description,
    image_url: normalizedEvent.imageUrl || "",
    source_url: normalizedEvent.sourceUrl,
    source_hashtag: normalizedEvent.sourceHashtag || "",
    scraped_at: normalizedEvent.scrapedAt,
    created_at: normalizedEvent.createdAt,
  });

  return {
    inserted: result.changes > 0,
    id: normalizedEvent.id,
  };
}

const insertErrorStmt = db.prepare(`
  INSERT INTO scrape_errors (
    message,
    context_json,
    timestamp
  ) VALUES (
    @message,
    @context_json,
    @timestamp
  )
`);

async function appendError(errorEntry) {
  const payload = {
    message: errorEntry?.message || "Unknown error",
    context_json: JSON.stringify(errorEntry || {}),
    timestamp: new Date().toISOString(),
  };

  insertErrorStmt.run(payload);
}

module.exports = {
  ensureDirectory,
  ensureFile,
  readJSON,
  writeJSON,
  listEventFiles,
  normalizeEventRecord,
  appendEvent,
  appendError,
};