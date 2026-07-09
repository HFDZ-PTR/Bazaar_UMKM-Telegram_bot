const fs = require("fs").promises;
const path = require("path");
const { CONFIG } = require("../config");
const { createFingerprint } = require("./fingerprint");
const { toIsoDateString, parseEventDateString } = require("./date");

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function listEventFiles() {
  await fs.mkdir(CONFIG.eventsDir, { recursive: true });

  const entries = await fs.readdir(CONFIG.eventsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(CONFIG.eventsDir, entry.name));
}

async function ensureFile(filePath, defaultValue) {
  await ensureDirectory(filePath);
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
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
  const eventDate =
    typeof event.eventDate === "string" ? event.eventDate : null;
  const parsedEventDate = parseEventDateString(eventDate);
  const normalizedEventDate = parsedEventDate
    ? toIsoDateString(parsedEventDate)
    : null;

  return {
    ...event,
    id: event.id || createFingerprint(event.platform, event.postId),
    eventDate: normalizedEventDate,
    date: event.date || normalizedEventDate || toIsoDateString(new Date()),
    scrapedAt: event.scrapedAt || now,
    createdAt: event.createdAt || now,
  };
}

async function appendEvent(event) {
  const normalizedEvent = normalizeEventRecord(event);
  const dateKey = normalizedEvent.eventDate || toIsoDateString(new Date());
  const filePath = path.join(CONFIG.eventsDir, `${dateKey}.json`);
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
