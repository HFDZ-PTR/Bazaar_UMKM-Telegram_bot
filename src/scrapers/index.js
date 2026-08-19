// src/scrapers/index.js — dengan validasi description wajib ada
const logger = require("../utils/logger");
const { eventSchema } = require("../config");
const { appendError, appendEvent } = require("../services/storage.service");
const dedupService = require("../services/dedup.service");
const telegramService = require("../services/telegram.service");
const { scrapeInstagram } = require("./instagram.scraper");
const { scrapeTikTok } = require("./tiktok.scraper");

// Lapisan validasi kedua. Parser sudah menolak caption kosong,
// tapi ini jaga-jaga kalau ada event yang lolos dari parser
// (misal event dibuat manual lewat jalur lain di masa depan).
const MIN_DESCRIPTION_LENGTH = 20;

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

  // Validasi wajib: description harus ada dan cukup panjang.
  if (
    !item.description ||
    item.description.trim().length < MIN_DESCRIPTION_LENGTH
  ) {
    logger.debug(
      {
        platform: item.platform,
        postId: item.postId,
        sourceHashtag: item.sourceHashtag || "",
        descriptionLength: item.description?.trim().length || 0,
      },
      "skipped event: missing or too-short description",
    );

    return false;
  }

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

  const result = await appendEvent(item);

  // appendEvent juga mengecek duplicate content.
  // Jangan mengirim Telegram jika event tidak benar-benar diinsert.
  if (!result?.inserted) {
    logger.debug(
      {
        platform: item.platform,
        postId: item.postId,
        sourceHashtag: item.sourceHashtag || "",
        skippedReason: result?.skippedReason || "duplicate",
        existingId: result?.id || "",
      },
      "skipped event during storage",
    );

    return false;
  }

  logger.info(
    {
      platform: item.platform,
      postId: item.postId,
      sourceHashtag: item.sourceHashtag || "",
      eventDate: item.eventDate || item.date || "",
      location: item.location || "",
      eventId: result.id,
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
