const dotenv = require("dotenv");
const { z } = require("zod");
const { DEFAULT_HASHTAGS, PROJECT_ROOT } = require("./constants");
const path = require("path");

dotenv.config();

const envSchema = z.object({
  CHROME_PATH: z.string().min(1),
  CHROME_PROFILE_DIR: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
  INSTAGRAM_USERNAME: z.string().optional().default(""),
  INSTAGRAM_PASSWORD: z.string().optional().default(""),
  INSTAGRAM_SESSIONID: z.string().optional().default(""),
  INSTAGRAM_COOKIE_JSON: z.string().optional().default(""),
  TWITTER_USERNAME: z.string().optional().default(""),
  TWITTER_PASSWORD: z.string().optional().default(""),
  TWITTER_AUTH_TOKEN: z.string().optional().default(""),
  TWITTER_COOKIE_JSON: z.string().optional().default(""),
  INSTAGRAM_HASHTAGS: z.string().default(DEFAULT_HASHTAGS.instagram.join(",")),
  TWITTER_HASHTAGS: z.string().default(DEFAULT_HASHTAGS.twitter.join(",")),
  SCRAPE_INTERVAL_HOURS: z.coerce.number().int().positive().default(4),
  LOG_LEVEL: z.string().default("info"),
});

const parsedEnv = envSchema.parse(process.env);

const CONFIG = {
  projectRoot: PROJECT_ROOT,
  chromePath: parsedEnv.CHROME_PATH,
  chromeProfileDir: parsedEnv.CHROME_PROFILE_DIR,
  telegramBotToken: parsedEnv.TELEGRAM_BOT_TOKEN,
  telegramChatId: parsedEnv.TELEGRAM_CHAT_ID,
  instagramUsername: parsedEnv.INSTAGRAM_USERNAME,
  instagramPassword: parsedEnv.INSTAGRAM_PASSWORD,
  instagramSessionId: parsedEnv.INSTAGRAM_SESSIONID,
  instagramCookieJson: parsedEnv.INSTAGRAM_COOKIE_JSON,
  twitterUsername: parsedEnv.TWITTER_USERNAME,
  twitterPassword: parsedEnv.TWITTER_PASSWORD,
  twitterAuthToken: parsedEnv.TWITTER_AUTH_TOKEN,
  twitterCookieJson: parsedEnv.TWITTER_COOKIE_JSON,
  instagramHashtags: parsedEnv.INSTAGRAM_HASHTAGS.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean),
  twitterHashtags: parsedEnv.TWITTER_HASHTAGS.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean),
  scrapeIntervalHours: parsedEnv.SCRAPE_INTERVAL_HOURS,
  logLevel: parsedEnv.LOG_LEVEL,
  cookiesDir: path.join(PROJECT_ROOT, "cookies"),
  dataDir: path.join(PROJECT_ROOT, "data"),
  logsDir: path.join(PROJECT_ROOT, "data", "logs"),
  eventsDir: path.join(PROJECT_ROOT, "data", "events"),
  seenIdsPath: path.join(PROJECT_ROOT, "data", "seen_ids.json"),
  errorsPath: path.join(PROJECT_ROOT, "data", "logs", "errors.json"),
  instagramCookiesPath: path.join(PROJECT_ROOT, "cookies", "instagram.json"),
  twitterCookiesPath: path.join(PROJECT_ROOT, "cookies", "twitter.json"),
};

const eventSchema = z.object({
  platform: z.enum(["instagram", "twitter"]),
  postId: z.string().min(1),
  title: z.string().min(1),
  date: z.string().min(1),
  location: z.string().optional().default(""),
  organizer: z.string().optional().default(""),
  description: z.string().min(1),
  imageUrl: z.string().optional().default(""),
  sourceUrl: z.string().url(),
});

module.exports = {
  CONFIG,
  eventSchema,
};
