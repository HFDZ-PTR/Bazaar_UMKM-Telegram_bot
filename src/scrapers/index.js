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
        issues: result.error.issues.map((i) => i.message),
        postId: event?.postId,
      },
      `[WARN] skipped invalid event`,
    );
    return;
  }

  const validatedEvent = result.data;
  const isNew = await dedupService.isNew(
    validatedEvent.platform,
    validatedEvent.postId,
  );

  if (!isNew) {
    logger.debug(`[SCAN] dup - skipping ${validatedEvent.postId}`);
    return;
  }

  const filePath = await appendEvent(validatedEvent);
  logger.info(
    `[OK] saved [${validatedEvent.platform}] ${validatedEvent.postId.slice(0, 12)}` +
      ` | date ${validatedEvent.eventDate || validatedEvent.date}` +
      ` | location ${validatedEvent.location || "(no location)"}` +
      ` -> ${filePath.split(/[\\/]/).slice(-2).join("/")}`,
  );

  await telegramService.sendEvent(validatedEvent);
}

async function runScraper(scraperName, scraper) {
  logger.info(`[SCAN] running scraper: ${scraperName}`);
  try {
    const events = await scraper();
    let saved = 0;
    for (const event of events) {
      await processEvent(event);
      saved++;
    }
    logger.info(`[DONE] ${scraperName} finished - processed ${saved} events`);
  } catch (error) {
    logger.error({ err: error.message, scraperName }, `[FAIL] scraper crashed`);
    await appendError({
      scraperName,
      message: error.message,
      stack: error.stack,
    });
  }
}

async function runAllScrapers() {
  await dedupService.init();
  await runScraper("instagram", scrapeInstagram);
  await runScraper("tiktok", scrapeTikTok);
}

module.exports = { runAllScrapers };
