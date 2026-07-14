// src/services/dedup.service.js
const db = require("./database.service");
const { createFingerprint } = require("../utils/fingerprint");

class DedupService {
  constructor() {
    this.ready = true;
  }

  async init() {
    this.ready = true;
  }

  async isNew(platform, postId) {
    if (!this.ready) {
      await this.init();
    }

    const fingerprint = createFingerprint(platform, postId);

    const row = db.prepare(`
      SELECT 1
      FROM events
      WHERE id = ? OR (platform = ? AND post_id = ?)
      LIMIT 1
    `).get(fingerprint, platform, postId);

    return !row;
  }

  async syncFromEvents() {
    this.ready = true;
  }

  has(platform, postId) {
    const fingerprint = createFingerprint(platform, postId);
    const row = db.prepare(`
      SELECT 1
      FROM events
      WHERE id = ? OR (platform = ? AND post_id = ?)
      LIMIT 1
    `).get(fingerprint, platform, postId);

    return Boolean(row);
  }

  createFingerprint(platform, postId) {
    return createFingerprint(platform, postId);
  }
}

module.exports = new DedupService();