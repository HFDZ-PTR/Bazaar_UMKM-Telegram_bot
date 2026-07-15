// src/config/index.js
const path = require("path");
const dotenv = require("dotenv");
const { z } = require("zod");
const {
  DEFAULT_HASHTAGS,
  PROJECT_ROOT,
  SCRAPER_DEFAULTS,
  TELEGRAM_DEFAULTS,
} = require("./constants");

dotenv.config();

function parseDurationToMinutes(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) {
    return 4 * 60;
  }

  const normalized = raw.replace(/\s+/g, "");
  const pattern = /(\d+)(h|m)/g;

  let totalMinutes = 0;
  let parsedLength = 0;
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    const amount = Number(match[1]);
    const unit = match[2];

    parsedLength += match[0].length;
    totalMinutes += unit === "h" ? amount * 60 : amount;
  }

  if (parsedLength !== normalized.length || totalMinutes <= 0) {
    throw new Error(
      'Invalid SCRAPE_INTERVAL format. Use values like "5m", "1h", or "1h25m".',
    );
  }

  return totalMinutes;
}

function parseTagList(value) {
  const tags = String(value || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean);

  return [...new Set(tags)];
}

function buildPath(...parts) {
  return path.join(PROJECT_ROOT, ...parts);
}

const envSchema = z.object({
  CHROME_PATH: z.string().min(1),
  CHROME_PROFILE_DIR: z.string().min(1),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().optional().default(""),

  PORT: z.coerce.number().int().positive().default(3000),
  API_KEY: z.string().optional().default(""),
  LOG_LEVEL: z.string().default("info"),

  RUN_BOT_WITH_API: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),

  INSTAGRAM_USERNAME: z.string().optional().default(""),
  INSTAGRAM_PASSWORD: z.string().optional().default(""),
  INSTAGRAM_SESSIONID: z.string().optional().default(""),
  INSTAGRAM_COOKIE_JSON: z.string().optional().default(""),

  INSTAGRAM_HASHTAGS: z.string().default(DEFAULT_HASHTAGS.instagram.join(",")),
  TIKTOK_HASHTAGS: z.string().default(DEFAULT_HASHTAGS.tiktok.join(",")),

  HASHTAG_SELECTION_MODE: z
    .enum(["all", "shuffle", "random"])
    .optional()
    .default("shuffle"),

  HASHTAGS_PER_CYCLE: z.coerce.number().int().positive().default(2),
  SCRAPE_INTERVAL: z.string().optional().default("4h"),
});

const env = envSchema.parse(process.env);

const scrapeIntervalMinutes = parseDurationToMinutes(env.SCRAPE_INTERVAL);

const CONFIG = {
  projectRoot: PROJECT_ROOT,

  chromePath: env.CHROME_PATH,
  chromeProfileDir: env.CHROME_PROFILE_DIR,

  telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  telegramChatId: env.TELEGRAM_CHAT_ID,

  port: env.PORT,
  apiKey: env.API_KEY,
  logLevel: env.LOG_LEVEL,
  runBotWithApi: env.RUN_BOT_WITH_API,

  instagramUsername: env.INSTAGRAM_USERNAME,
  instagramPassword: env.INSTAGRAM_PASSWORD,
  instagramSessionId: env.INSTAGRAM_SESSIONID,
  instagramCookieJson: env.INSTAGRAM_COOKIE_JSON,

  instagramHashtags: parseTagList(env.INSTAGRAM_HASHTAGS),
  tiktokHashtags: parseTagList(env.TIKTOK_HASHTAGS),
  hashtagSelectionMode: env.HASHTAG_SELECTION_MODE,
  hashtagsPerCycle: env.HASHTAGS_PER_CYCLE,

  scrapeIntervalMinutes,
  scrapeIntervalHours: scrapeIntervalMinutes / 60,
  scrapeIntervalLabel: env.SCRAPE_INTERVAL,

  cookiesDir: buildPath("cookies"),
  dataDir: buildPath("data"),
  logsDir: buildPath("data", "logs"),
  eventsDir: buildPath("data", "events"),

  seenIdsPath: buildPath("data", "seen_ids.json"),
  errorsPath: buildPath("data", "logs", "errors.json"),

  instagramCookiesPath: buildPath("cookies", "instagram.json"),
  tiktokCookiesPath: buildPath("cookies", "tiktok.json"),

  telegramTargetsPath: buildPath("data", "telegram_targets.json"),
  telegramUpdatesStatePath: buildPath("data", "telegram_updates_state.json"),
  hashtagRotationStatePath: buildPath("data", "hashtag_rotation_state.json"),

  humanDelayMinMs: SCRAPER_DEFAULTS.humanDelayMinMs,
  humanDelayMaxMs: SCRAPER_DEFAULTS.humanDelayMaxMs,
  scraperScrollSteps: SCRAPER_DEFAULTS.scrollSteps,
  scraperScrollDelayMs: SCRAPER_DEFAULTS.scrollDelayMs,
  scraperNetworkTimeoutMs: SCRAPER_DEFAULTS.networkTimeoutMs,
  maxPostsPerScrape: SCRAPER_DEFAULTS.maxPostsPerScrape,

  telegramQueueIntervalMs: TELEGRAM_DEFAULTS.queueIntervalMs,
  telegramQueueIntervalCap: TELEGRAM_DEFAULTS.queueIntervalCap,
  telegramQueueConcurrency: TELEGRAM_DEFAULTS.queueConcurrency,
  telegramRetryAttempts: TELEGRAM_DEFAULTS.retryAttempts,
  telegramRetryMinTimeoutMs: TELEGRAM_DEFAULTS.retryMinTimeoutMs,
};

const eventSchema = z.object({
  platform: z.enum(["instagram", "tiktok"]),
  postId: z.string().min(1),
  title: z.string().min(1),
  date: z.string().nullable().optional(),
  eventDate: z.string().nullable().optional(),
  location: z.string().optional().default(""),
  organizer: z.string().optional().default(""),
  description: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
  sourceUrl: z.string().url(),
  sourceHashtag: z.string().optional().default(""),
  id: z.string().optional(),
  scrapedAt: z.string().optional(),
  createdAt: z.string().optional(),
});

module.exports = {
  CONFIG,
  eventSchema,
};
