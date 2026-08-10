// src/config/constants.js
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const DEFAULT_HASHTAGS = {
  instagram: [
    "bazaarumkm",
    "bazarumkm",
    "umkmjakarta",
    "bazarjakarta",
    "callingtenant",
    "infobazaar",
  ],
  tiktok: [
    "bazaarumkm",
    "bazarumkm",
    "umkmjakarta",
    "bazarjakarta",
    "callingtenant",
    "infobazaar",
  ],
};

const SCRAPER_DEFAULTS = {
  humanDelayMinMs: 1000,
  humanDelayMaxMs: 3000,
  scrollSteps: 8,
  scrollDelayMs: 1500,
  networkTimeoutMs: 45000,
};

const TELEGRAM_DEFAULTS = {
  queueIntervalMs: 1100,
  queueIntervalCap: 1,
  queueConcurrency: 1,
  retryAttempts: 3,
  retryMinTimeoutMs: 2000,
};

module.exports = {
  PROJECT_ROOT,
  DEFAULT_HASHTAGS,
  SCRAPER_DEFAULTS,
  TELEGRAM_DEFAULTS,
};
