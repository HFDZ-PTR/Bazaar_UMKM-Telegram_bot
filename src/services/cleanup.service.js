// src/services/cleanup.service.js
const fs = require("fs").promises;
const logger = require("../utils/logger");
const storage = require("../utils/storage.service");
const dedupService = require("./dedup.service");
const { isExpiredEventDate } = require("../utils/date");

const EVENT_RETENTION_DAYS = 7;

async function cleanupExpiredEvents() {
  const files = await storage.listEventFiles();
  const retainedEvents = [];

  let filesScanned = 0;
  let eventsRemoved = 0;
  let filesDeleted = 0;

  for (const filePath of files) {
    filesScanned += 1;

    const events = await storage.readJSON(filePath, []);
    const remainingEvents = [];

    for (const event of events) {
      const eventDate =
        typeof event.eventDate === "string" ? event.eventDate : null;
      if (isExpiredEventDate(eventDate, EVENT_RETENTION_DAYS)) {
        eventsRemoved += 1;
        continue;
      }

      remainingEvents.push(event);
      retainedEvents.push(event);
    }

    if (remainingEvents.length === 0) {
      await fs.unlink(filePath).catch(() => {});
      filesDeleted += 1;
      continue;
    }

    if (remainingEvents.length !== events.length) {
      await storage.writeJSON(filePath, remainingEvents);
    }
  }

  await dedupService.syncFromEvents(retainedEvents);

  const result = {
    filesScanned,
    eventsRemoved,
    filesDeleted,
  };

  logger.info(result, "event cleanup completed");
  return result;
}

module.exports = {
  cleanupExpiredEvents,
};