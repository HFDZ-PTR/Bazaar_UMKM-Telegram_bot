// src/services/cleanup.service.js (alternatif: pure SQL, tanpa loop JS)
const db = require("./database.service");
const logger = require("../utils/logger");

const RETENTION_DAYS = 7;

/**
 * Hapus event yang sudah expired dalam satu query.
 * COALESCE(event_date, date, created_at) memastikan SEMUA baris punya
 * reference date yang valid, termasuk baris dengan event_date = NULL.
 */
async function cleanupExpiredEvents() {
  const stmt = db.prepare(`
    DELETE FROM events
    WHERE date(COALESCE(event_date, date, created_at))
      < date('now', '-${RETENTION_DAYS} days')
  `);

  const info = stmt.run();

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