// src/config/constants.js
const path = require("path");


const PROJECT_ROOT = path.resolve(__dirname, "..", "..");


// Hashtag sekarang di-load dari .env (INSTAGRAM_HASHTAGS, TIKTOK_HASHTAGS)
// Lihat template di env_hashtag_template.env untuk contoh lengkap


const DEFAULT_HASHTAGS = {
  // Fallback minimal kalau .env tidak set
  instagram: ["bazarumkm", "bazarjakarta", "umkmjakarta"],
  tiktok: ["bazarumkm", "bazarjakarta", "umkmjakarta"],
};

const SCRAPER_DEFAULTS = {
  humanDelayMinMs: 1000,
  humanDelayMaxMs: 3000,
  scrollSteps: 8,
  scrollDelayMs: 1500,
  networkTimeoutMs: 45000,
};


const TELEGRAM_DEFAULTS = {
  queueIntervalMs: 3000,
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