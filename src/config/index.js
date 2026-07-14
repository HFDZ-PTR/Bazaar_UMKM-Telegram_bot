// src/config/index.js
const path = require("path");
const dotenv = require("dotenv");
const { z } = require("zod");
const { DEFAULT_HASHTAGS, PROJECT_ROOT } = require("./constants");

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
  let matchedLength = 0;
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    const amount = Number(match[1]);
    const unit = match[2];

    matchedLength += match[0].length;
    totalMinutes += unit === "h" ? amount * 60 : amount;
  }

  if (matchedLength !== normalized.length || totalMinutes <= 0) {
    throw new Error(
      'Invalid SCRAPE_INTERVAL format. Use values like "5m", "1h", or "1h25m".',
    );
  }

  return totalMinutes;
}

function parseTagList(value) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase().replace(/^#/, ""))
        .filter(Boolean),
    ),
  ];
}

const envSchema = z.object({
  CHROME_PATH: z.string().min(1),
  CHROME_PROFILE_DIR: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().optional().default(""),
  PORT: z.coerce.number().int().positive().default(3000),
  API_KEY: z.string().optional().default(""),
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
  LOG_LEVEL: z.string().default("info"),
});

const parsedEnv = envSchema.parse(process.env);
const scrapeIntervalMinutes = parseDurationToMinutes(parsedEnv.SCRAPE_INTERVAL);

const instagramHashtags = parseTagList(parsedEnv.INSTAGRAM_HASHTAGS);
const tiktokHashtags = parseTagList(parsedEnv.TIKTOK_HASHTAGS);

const CONFIG = {
  projectRoot: PROJECT_ROOT,
  chromePath: parsedEnv.CHROME_PATH,
  chromeProfileDir: parsedEnv.CHROME_PROFILE_DIR,
  telegramBotToken: parsedEnv.TELEGRAM_BOT_TOKEN,
  telegramChatId: parsedEnv.TELEGRAM_CHAT_ID,
  port: parsedEnv.PORT,
  apiKey: parsedEnv.API_KEY,
  runBotWithApi: parsedEnv.RUN_BOT_WITH_API,
  instagramUsername: parsedEnv.INSTAGRAM_USERNAME,
  instagramPassword: parsedEnv.INSTAGRAM_PASSWORD,
  instagramSessionId: parsedEnv.INSTAGRAM_SESSIONID,
  instagramCookieJson: parsedEnv.INSTAGRAM_COOKIE_JSON,
  instagramHashtags,
  tiktokHashtags,
  hashtagSelectionMode: parsedEnv.HASHTAG_SELECTION_MODE,
  hashtagsPerCycle: parsedEnv.HASHTAGS_PER_CYCLE,
  scrapeIntervalMinutes,
  scrapeIntervalHours: scrapeIntervalMinutes / 60,
  scrapeIntervalLabel: parsedEnv.SCRAPE_INTERVAL,
  logLevel: parsedEnv.LOG_LEVEL,
  cookiesDir: path.join(PROJECT_ROOT, "cookies"),
  dataDir: path.join(PROJECT_ROOT, "data"),
  logsDir: path.join(PROJECT_ROOT, "data", "logs"),
  eventsDir: path.join(PROJECT_ROOT, "data", "events"),
  seenIdsPath: path.join(PROJECT_ROOT, "data", "seen_ids.json"),
  errorsPath: path.join(PROJECT_ROOT, "data", "logs", "errors.json"),
  instagramCookiesPath: path.join(PROJECT_ROOT, "cookies", "instagram.json"),
  tiktokCookiesPath: path.join(PROJECT_ROOT, "cookies", "tiktok.json"),
  telegramTargetsPath: path.join(PROJECT_ROOT, "data", "telegram_targets.json"),
  telegramUpdatesStatePath: path.join(
    PROJECT_ROOT,
    "data",
    "telegram_updates_state.json",
  ),
  hashtagRotationStatePath: path.join(
    PROJECT_ROOT,
    "data",
    "hashtag_rotation_state.json",
  ),
};

const eventSchema = z.object({
  platform: z.enum(["instagram", "tiktok"]),
  postId: z.string().min(1),
  title: z.string().min(1),
  date: z.string().nullable().optional(),
  location: z.string().optional().default(""),
  organizer: z.string().optional().default(""),
  description: z.string().min(1),
  imageUrl: z.string().optional().default(""),
  sourceUrl: z.string().url(),
  eventDate: z.string().nullable().optional(),
  sourceHashtag: z.string().optional().default(""),
  id: z.string().optional(),
  scrapedAt: z.string().optional(),
  createdAt: z.string().optional(),
});

module.exports = {
  CONFIG,
  eventSchema,
};
