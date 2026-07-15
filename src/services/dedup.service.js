// src/services/dedup.service.js
const db = require("./database.service");
const { createFingerprint } = require("../utils/fingerprint");

const findEventStmt = db.prepare(`
  SELECT 1
  FROM events
  WHERE id = ? OR (platform = ? AND post_id = ?)
  LIMIT 1
`);

class DedupService {
  async init() {
    return;
  }

  async isNew(platform, postId) {
    return !this.has(platform, postId);
  }

  async syncFromEvents() {
    return;
  }

  has(platform, postId) {
    const fingerprint = createFingerprint(platform, postId);
    const row = findEventStmt.get(fingerprint, platform, postId);
    return Boolean(row);
  }

  createFingerprint(platform, postId) {
    return createFingerprint(platform, postId);
  }
}

module.exports = new DedupService();