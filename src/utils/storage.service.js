// src/utils/storage.service.js
const fs = require("fs").promises;
const path = require("path");
const db = require("../services/database.service");
const { createFingerprint } = require("./fingerprint");
const { toIsoDateString, parseEventDateString } = require("./date");

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function normalizeEventRecord(event) {
  const now = new Date().toISOString();
  const platform =
    typeof event.platform === "string"
      ? event.platform.trim().toLowerCase()
      : "";

  const parsedEventDate = parseEventDateString(event.eventDate);
  const eventDate = parsedEventDate ? toIsoDateString(parsedEventDate) : null;

  return {
    ...event,
    platform,
    id: event.id || createFingerprint(platform, event.postId),
    eventDate,
    date: event.date || eventDate || toIsoDateString(new Date()),
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
  const record = normalizeEventRecord(event);

  const result = insertEventStmt.run({
    id: record.id,
    platform: record.platform,
    post_id: record.postId,
    title: record.title,
    date: record.date || null,
    event_date: record.eventDate || null,
    location: record.location || "",
    organizer: record.organizer || "",
    description: record.description || "",
    image_url: record.imageUrl || "",
    source_url: record.sourceUrl,
    source_hashtag: record.sourceHashtag || "",
    scraped_at: record.scrapedAt,
    created_at: record.createdAt,
  });

  return {
    inserted: result.changes > 0,
    id: record.id,
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
  insertErrorStmt.run({
    message: errorEntry?.message || "Unknown error",
    context_json: JSON.stringify(errorEntry || {}),
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  ensureDirectory,
  normalizeEventRecord,
  appendEvent,
  appendError,
};
