// src/services/dedup.service.js
const db = require("./database.service");
const logger = require("../utils/logger");
const { createFingerprint } = require("../utils/fingerprint");

const findEventByIdentityStmt = db.prepare(`
  SELECT 1
  FROM events
  WHERE platform = ? AND post_id = ?
  LIMIT 1
`);

const findEventByContentFingerprintStmt = db.prepare(`
  SELECT id
  FROM events
  WHERE content_fingerprint = ?
  LIMIT 1
`);

class DedupService {
  async init() {
    return;
  }

  hasIdentity(platform, postId) {
    try {
      const row = findEventByIdentityStmt.get(platform, postId);
      return Boolean(row);
    } catch (err) {
      logger.error(
        {
          err,
          platform,
          postId,
        },
        "failed to check identity duplicate",
      );

      throw err;
    }
  }

  hasContent(contentFingerprint) {
    if (!contentFingerprint) {
      return false;
    }

    try {
      const row = findEventByContentFingerprintStmt.get(contentFingerprint);

      return Boolean(row);
    } catch (err) {
      logger.error(
        {
          err,
          contentFingerprint,
        },
        "failed to check content duplicate",
      );

      throw err;
    }
  }

  async isNew(platform, postId) {
    return !this.hasIdentity(platform, postId);
  }

  has(platform, postId) {
    return this.hasIdentity(platform, postId);
  }

  createFingerprint(platform, postId) {
    return createFingerprint(platform, postId);
  }

  async checkDuplicate(platform, postId, contentFingerprint) {
    if (this.hasIdentity(platform, postId)) {
      return {
        isDuplicate: true,
        reason: "identity",
      };
    }

    if (this.hasContent(contentFingerprint)) {
      return {
        isDuplicate: true,
        reason: "content",
      };
    }

    return {
      isDuplicate: false,
      reason: null,
    };
  }
}

module.exports = new DedupService();
