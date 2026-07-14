// src/scrapers/index.js
const logger = require("../utils/logger");
const { appendError, appendEvent } = require("../utils/storage.service");
const dedupService = require("../services/dedup.service");
const telegramService = require("../services/telegram.service");
const { eventSchema } = require("../config");
const { scrapeInstagram } = require("./instagram.scraper");
const { scrapeTikTok } = require("./tiktok.scraper");

async function processEvent(event) {
  const result = eventSchema.safeParse(event);
  if (!result.success) {
    logger.warn(
      {
        issues: result.error.issues.map((issue) => issue.message),
        postId: event?.postId,
      },
      `[WARN] skipped invalid event`,
    );
    return false;
  }

  const validatedEvent = result.data;
  const isNew = await dedupService.isNew(
    validatedEvent.platform,
    validatedEvent.postId,
  );

  if (!isNew) {
    logger.debug(
      {
        platform: validatedEvent.platform,
        postId: validatedEvent.postId,
        sourceHashtag: validatedEvent.sourceHashtag,
      },
      `[SCAN] dup - skipping ${validatedEvent.postId}`,
    );
    return false;
  }

  const filePath = await appendEvent(validatedEvent);
  logger.info(
    {
      platform: validatedEvent.platform,
      postId: validatedEvent.postId,
      sourceHashtag: validatedEvent.sourceHashtag,
      eventDate: validatedEvent.eventDate || validatedEvent.date,
      location: validatedEvent.location || "",
      filePath,
    },
    `[OK] saved event`,
  );

  await telegramService.sendEvent(validatedEvent);
  return true;
}

async function runScraper(scraperName, scraper, hashtags = []) {
  logger.info(
    { scraperName, hashtags },
    `[SCAN] running scraper: ${scraperName}`,
  );

  try {
    const events = await scraper(hashtags);
    let savedCount = 0;

    for (const event of events) {
      const wasSaved = await processEvent(event);
      if (wasSaved) {
        savedCount++;
      }
    }

    logger.info(
      { scraperName, hashtags, savedCount, totalEvents: events.length },
      `[DONE] ${scraperName} finished`,
    );
  } catch (error) {
    logger.error(
      { err: error.message, scraperName, hashtags },
      `[FAIL] scraper crashed`,
    );
    await appendError({
      scraperName,
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

module.exports = { runAllScrapers };