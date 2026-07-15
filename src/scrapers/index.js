// src/scrapers/index.js
const logger = require("../utils/logger");
const { eventSchema } = require("../config");
const { appendError, appendEvent } = require("../utils/storage.service");
const dedupService = require("../services/dedup.service");
const telegramService = require("../services/telegram.service");
const { scrapeInstagram } = require("./instagram.scraper");
const { scrapeTikTok } = require("./tiktok.scraper");

async function processEvent(event) {
  const parsed = eventSchema.safeParse(event);

  if (!parsed.success) {
    logger.warn(
      {
        postId: event?.postId || "",
        platform: event?.platform || "",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
      "skipped invalid event",
    );
    return false;
  }

  const item = parsed.data;
  const isNew = await dedupService.isNew(item.platform, item.postId);

  if (!isNew) {
    logger.debug(
      {
        platform: item.platform,
        postId: item.postId,
        sourceHashtag: item.sourceHashtag || "",
      },
      "skipped duplicate event",
    );
    return false;
  }

  const filePath = await appendEvent(item);

  logger.info(
    {
      platform: item.platform,
      postId: item.postId,
      sourceHashtag: item.sourceHashtag || "",
      eventDate: item.eventDate || item.date || "",
      location: item.location || "",
      filePath,
    },
    "event saved",
  );

  await telegramService.sendEvent(item);
  return true;
}

async function runScraper(name, scraper, hashtags) {
  logger.info({ scraper: name, hashtags }, "scraper started");

  try {
    const events = await scraper(hashtags);
    let savedCount = 0;

    for (const event of events) {
      if (await processEvent(event)) {
        savedCount += 1;
      }
    }

    logger.info(
      {
        scraper: name,
        hashtags,
        totalEvents: events.length,
        savedCount,
      },
      "scraper finished",
    );
  } catch (error) {
    logger.error(
      {
        scraper: name,
        hashtags,
        err: error,
      },
      "scraper failed",
    );

    await appendError({
      scraperName: name,
      hashtags,
      message: error.message,
      stack: error.stack,
    });
  }
}

async function runAllScrapers(selectedHashtags = {}) {
  await dedupService.init();

  await runScraper(
    "instagram",
    scrapeInstagram,
    Array.isArray(selectedHashtags.instagram)
      ? selectedHashtags.instagram
      : undefined,
  );

  await runScraper(
    "tiktok",
    scrapeTikTok,
    Array.isArray(selectedHashtags.tiktok)
      ? selectedHashtags.tiktok
      : undefined,
  );
}

module.exports = {
  runAllScrapers,
};
