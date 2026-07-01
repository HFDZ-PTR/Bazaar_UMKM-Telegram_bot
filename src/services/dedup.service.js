const { CONFIG } = require("../config");
const { createFingerprint } = require("../utils/fingerprint");
const { readJSON, writeJSON } = require("../utils/storage.service");

class DedupService {
  constructor() {
    this.seen = new Set();
    this.ready = false;
  }

  async init() {
    const stored = await readJSON(CONFIG.seenIdsPath, []);
    this.seen = new Set(Array.isArray(stored) ? stored : []);
    this.ready = true;
  }

  async isNew(platform, postId) {
    if (!this.ready) {
      await this.init();
    }

    const fingerprint = createFingerprint(platform, postId);
    if (this.seen.has(fingerprint)) {
      return false;
    }

    this.seen.add(fingerprint);
    await writeJSON(CONFIG.seenIdsPath, Array.from(this.seen));
    return true;
  }

  has(platform, postId) {
    const fingerprint = createFingerprint(platform, postId);
    return this.seen.has(fingerprint);
  }

  createFingerprint(platform, postId) {
    return createFingerprint(platform, postId);
  }
}

module.exports = new DedupService();
