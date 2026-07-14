const fs = require("fs").promises;
const path = require("path");
const db = require("../src/services/database.service");
const { CONFIG } = require("../src/config");
const { createFingerprint } = require("../src/utils/fingerprint");
const { parseEventDateString, toIsoDateString } = require("../src/utils/date");

async function listJsonFiles(dir) {
  await fs.mkdir(dir, { recursive: true });

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...(await listJsonFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }

  return results;
}

function normalizeEventRecord(event) {
  const now = new Date().toISOString();
  const platform =
    typeof event.platform === "string" ? event.platform.trim().toLowerCase() : "";

  const rawEventDate =
    typeof event.eventDate === "string" ? event.eventDate : null;

  const parsedEventDate = parseEventDateString(rawEventDate);
  const normalizedEventDate = parsedEventDate
    ? toIsoDateString(parsedEventDate)
    : null;

  return {
    id: event.id || createFingerprint(platform, event.postId),
    platform,
    post_id: event.postId,
    title: event.title,
    date: event.date || normalizedEventDate || toIsoDateString(new Date()),
    event_date: normalizedEventDate,
    location: event.location || "",
    organizer: event.organizer || "",
    description: event.description,
    image_url: event.imageUrl || "",
    source_url: event.sourceUrl,
    source_hashtag: event.sourceHashtag || "",
    scraped_at: event.scrapedAt || now,
    created_at: event.createdAt || now,
  };
}

function normalizeEventsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    return [payload];
  }

  return [];
}

const insertEvent = db.prepare(`
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

const insertRotationState = db.prepare(`
  INSERT INTO hashtag_rotation_state (
    platform,
    queue_json,
    last_picked_json,
    updated_at
  ) VALUES (
    @platform,
    @queue_json,
    @last_picked_json,
    @updated_at
  )
  ON CONFLICT(platform) DO UPDATE SET
    queue_json = excluded.queue_json,
    last_picked_json = excluded.last_picked_json,
    updated_at = excluded.updated_at
`);

async function loadEventsFromFiles() {
  const files = await listJsonFiles(CONFIG.eventsDir);
  const allEvents = [];

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    const events = normalizeEventsPayload(parsed);

    for (const event of events) {
      if (!event?.platform || !event?.postId || !event?.title || !event?.description || !event?.sourceUrl) {
        continue;
      }

      allEvents.push(normalizeEventRecord(event));
    }
  }

  return allEvents;
}

async function migrateEvents() {
  const allEvents = await loadEventsFromFiles();
  let inserted = 0;

  const transaction = db.transaction((events) => {
    for (const event of events) {
      const result = insertEvent.run(event);
      inserted += result.changes;
    }
  });

  transaction(allEvents);
  return inserted;
}

async function migrateRotationState() {
  try {
    const raw = await fs.readFile(CONFIG.hashtagRotationStatePath, "utf8");
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    const now = new Date().toISOString();

    const rows = ["instagram", "tiktok"].map((platform) => {
      const state = parsed?.[platform] || {};

      return {
        platform,
        queue_json: JSON.stringify(Array.isArray(state.queue) ? state.queue : []),
        last_picked_json: JSON.stringify(
          Array.isArray(state.lastPicked) ? state.lastPicked : []
        ),
        updated_at: now,
      };
    });

    const transaction = db.transaction((items) => {
      for (const item of items) {
        insertRotationState.run(item);
      }
    });

    transaction(rows);
  } catch {
    return;
  }
}

async function main() {
  const insertedEvents = await migrateEvents();
  await migrateRotationState();

  const totalEvents = db.prepare("SELECT COUNT(*) AS count FROM events").get();

  console.log("Migrasi selesai");
  console.log("Inserted events:", insertedEvents);
  console.log("Total events in database:", totalEvents.count);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});