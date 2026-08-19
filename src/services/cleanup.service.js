// src/services/cleanup.service.js
const db = require("./database.service");
const logger = require("../utils/logger");

const EVENT_RETENTION_DAYS = 7;
const UNKNOWN_EVENT_RETENTION_DAYS = 7;

async function cleanupExpiredEvents() {
  const stmt = db.prepare(`
    DELETE FROM events
    WHERE
      (
        event_date IS NOT NULL
        AND date(event_date) < date('now', ?)
      )
      OR
      (
        event_date IS NULL
        AND date(COALESCE(posted_at, created_at))
          < date('now', ?)
      )
  `);

  const info = stmt.run(
    `-${EVENT_RETENTION_DAYS} days`,
    `-${UNKNOWN_EVENT_RETENTION_DAYS} days`,
  );

  const result = {
    filesScanned: 0,
    filesDeleted: 0,
    eventsRemoved: info.changes,
  };

  logger.info(result, "event cleanup completed");
  return result;
}

module.exports = {
  cleanupExpiredEvents,
};
