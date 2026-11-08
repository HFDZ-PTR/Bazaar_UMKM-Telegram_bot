// src/services/storage.service.js
const fs = require("fs").promises;
const path = require("path");
const db = require("./database.service");
const {
  createFingerprint,
  createContentFingerprint,
} = require("../utils/fingerprint");
const { toIsoDateString, parseEventDateString } = require("../utils/date");
const { extractRegion, UNKNOWN_REGION } = require("../utils/region");
const dedupService = require("./dedup.service");

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

  const parsedPostedAt = parseEventDateString(event.postedAt);
  const postedAt = parsedPostedAt
    ? toIsoDateString(parsedPostedAt)
    : event.postedAt || null;

  const region =
    event.region && event.region.trim()
      ? event.region.trim()
      : extractRegion(event.location, event.description) || UNKNOWN_REGION;

  const contentFingerprint = createContentFingerprint({
    title: event.title,
    eventDate,
    location: event.location,
  });

  const dateSource =
    event.dateSource || (eventDate ? "caption" : postedAt ? "posted_at" : null);

  return {
    ...event,
    platform,
    id: event.id || createFingerprint(platform, event.postId),
    eventDate,
    postedAt,
    dateSource,
    region,
    contentFingerprint,
    date: event.date || eventDate || postedAt || null,
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
    posted_at,
    date_source,
    location,
    region,
    content_fingerprint,
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
    @posted_at,
    @date_source,
    @location,
    @region,
    @content_fingerprint,
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

  const dupCheck = await dedupService.checkDuplicate(
    record.platform,
    record.postId,
    record.contentFingerprint,
  );

  if (dupCheck.isDuplicate) {
    let existingId = record.id;

    if (dupCheck.reason === "content" && record.contentFingerprint) {
      const findByContentFingerprintStmt = db.prepare(`
        SELECT id FROM events WHERE content_fingerprint = ? LIMIT 1
      `);
      const existingByContent = findByContentFingerprintStmt.get(
        record.contentFingerprint,
      );
      if (existingByContent) {
        existingId = existingByContent.id;
      }
    } else if (dupCheck.reason === "identity") {
      const findByIdentityStmt = db.prepare(`
        SELECT id FROM events WHERE platform = ? AND post_id = ? LIMIT 1
      `);
      const existingByIdentity = findByIdentityStmt.get(
        record.platform,
        record.postId,
      );
      if (existingByIdentity) {
        existingId = existingByIdentity.id;
      }
    }

    return {
      inserted: false,
      id: existingId,
      skippedReason: `duplicate_${dupCheck.reason}`,
    };
  }

  const result = insertEventStmt.run({
    id: record.id,
    platform: record.platform,
    post_id: record.postId,
    title: record.title,
    date: record.date || null,
    event_date: record.eventDate || null,
    posted_at: record.postedAt || null,
    date_source: record.dateSource || null,
    location: record.location || "",
    region: record.region || UNKNOWN_REGION,
    content_fingerprint: record.contentFingerprint,
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
