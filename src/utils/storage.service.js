const fs = require("fs").promises;
const path = require("path");
const { CONFIG } = require("../config");

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
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

async function appendEvent(event) {
  const dateKey = event.date || new Date().toISOString().slice(0, 10);
  const filePath = path.join(CONFIG.eventsDir, `${dateKey}.json`);
  const existingEvents = await readJSON(filePath, []);
  existingEvents.push(event);
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
  appendEvent,
  appendError,
};
