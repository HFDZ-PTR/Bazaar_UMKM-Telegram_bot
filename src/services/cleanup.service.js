// src/services/cleanup.service.js
const db = require("./database.service");
const logger = require("../utils/logger");
const { isExpiredEventDate } = require("../utils/date");

async function cleanupExpiredEvents() {
  const rows = db.prepare(`
    SELECT id, event_date
    FROM events
  `).all();

  let eventsRemoved = 0;

  const deleteStmt = db.prepare(`
    DELETE FROM events
    WHERE id = ?
  `);

  for (const row of rows) {
    const eventDate =
      typeof row.event_date === "string" ? row.event_date : null;

    if (isExpiredEventDate(eventDate, 7)) {
      deleteStmt.run(row.id);
      eventsRemoved += 1;
    }
  }

  const result = {
    filesScanned: 0,
    filesDeleted: 0,
    eventsRemoved,
  };

  logger.info(result, "event cleanup completed");
  return result;
}

module.exports = {
  cleanupExpiredEvents,
};