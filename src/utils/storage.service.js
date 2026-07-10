// src/utils/storage.service.js
const fs = require("fs").promises;
const path = require("path");
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

async function appendEvent(event) {
  const normalizedEvent = normalizeEventRecord(event);
  const dateKey = normalizedEvent.eventDate || toIsoDateString(new Date());
  const platformDir = getPlatformEventsDir(normalizedEvent.platform);
  const filePath = path.join(platformDir, `${dateKey}.json`);

  const existingEvents = await readJSON(filePath, []);
  existingEvents.push(normalizedEvent);

  await writeJSON(filePath, existingEvents);
  return filePath;
}

async function appendError(errorEntry) {
  const errors = await readJSON(CONFIG.errorsPath, []);
  errors.push({
    ...errorEntry,
    timestamp: new Date().toISOString(),
  });
  await writeJSON(CONFIG.errorsPath, errors);
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