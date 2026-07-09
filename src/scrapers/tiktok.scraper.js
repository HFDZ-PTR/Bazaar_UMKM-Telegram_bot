const { CONFIG } = require("../config");
const { MAX_POSTS_PER_SCRAPE } = require("../config/constants");
const {
  createPage,
  closePage,
  scrollPage,
  delay,
} = require("../services/browser.service");
const { dumpHtml } = require("../utils/html.dump");
const { retryOperation } = require("../utils/retry");
const dedupService = require("../services/dedup.service");
const logger = require("../utils/logger");
const { parseTikTokVideo } = require("../parsers/tiktok.parser");

const CONFIGURATION = {
  baseUrl: "https://www.tiktok.com/tag/",
  initialDelayMinMs: 3000,
  initialDelayMaxMs: 5000,
  scrollSteps: 4,
};

function randomInitialDelay() {
  return (
    Math.floor(
      Math.random() *
        (CONFIGURATION.initialDelayMaxMs - CONFIGURATION.initialDelayMinMs + 1),
    ) + CONFIGURATION.initialDelayMinMs
  );
}

async function isVerificationWall(page) {
  const currentUrl = page.url().toLowerCase();
  if (/captcha|verify|login|challenge/.test(currentUrl)) {
    return true;
  }

  const bodyText = await page
    .evaluate(() => document.body?.innerText || "")
    .catch(() => "");

  return /captcha|verify|security check|unusual activity|verify to continue/i.test(
    bodyText,
  );
}

async function scrapeHashtag(page, hashtag) {
  const url = `${CONFIGURATION.baseUrl}${encodeURIComponent(hashtag)}`;
  logger.info(`[SCAN] scraping tiktok hashtag #${hashtag}`);

  await retryOperation(() =>
    page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }),
  );

  await delay(randomInitialDelay());

  if (await isVerificationWall(page)) {
    logger.warn(
      { hashtag, url },
      "tiktok verification wall detected, skipping",
    );
    return [];
  }

  await page
    .waitForSelector('a[href*="/video/"]', { timeout: 15000 })
    .catch(() => {
      logger.warn({ hashtag }, "tiktok video grid did not appear in time");
    });

  if (await isVerificationWall(page)) {
    logger.warn(
      { hashtag, url },
      "tiktok verification wall detected after load",
    );
    return [];
  }

  await scrollPage(page, CONFIGURATION.scrollSteps);

  const rawCards = await page.evaluate(() => {
    const seen = new Set();
    const cards = [];

    const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") || anchor.href || "";
      if (!href || seen.has(href)) {
        continue;
      }

      seen.add(href);

      const container =
        anchor.closest("div[data-e2e], article, li, div") ||
        anchor.parentElement ||
        anchor;
      const captionCandidates = [
        anchor.getAttribute("aria-label"),
        anchor.getAttribute("title"),
        container?.querySelector?.('[data-e2e="video-desc"]')?.textContent,
        container?.querySelector?.('[data-e2e="browse-video-desc"]')
          ?.textContent,
        container?.querySelector?.("h3")?.textContent,
        container?.textContent,
      ]
        .map((value) => (value || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);

      const caption = captionCandidates[0] || "";
      const authorMatch = href.match(/@([^/]+)/);
      const thumbnailUrl =
        container?.querySelector?.("img")?.src ||
        anchor.querySelector?.("img")?.src ||
        "";

      cards.push({
        href,
        videoId: (href.match(/\/video\/(\d+)/) || [])[1] || "",
        caption,
        authorUsername: authorMatch ? authorMatch[1] : "",
        thumbnailUrl,
      });
    }

    return cards;
  });

  const freshCards = rawCards.filter(
    (card) => card.videoId && !dedupService.has("tiktok", card.videoId),
  );

  const cardsToProcess = freshCards.slice(0, MAX_POSTS_PER_SCRAPE);
  if (cardsToProcess.length === 0) {
    return [];
  }

  const html = await page.content();
  await dumpHtml("tiktok", html);

  const posts = [];
  for (const card of cardsToProcess) {
    const parsed = parseTikTokVideo(card);
    if (parsed) {
      posts.push(parsed);
    }
  }

  logger.info(
    `[DONE] parsed ${posts.length} TikTok posts from #${hashtag} out of ${cardsToProcess.length} fresh cards`,
  );

  return posts;
}

async function scrapeTikTok() {
  const page = await createPage("tiktok");
  const events = [];

  try {
    for (const hashtag of CONFIG.tiktokHashtags) {
      const remainingBudget = MAX_POSTS_PER_SCRAPE - events.length;
      if (remainingBudget <= 0) {
        break;
      }

      const posts = await scrapeHashtag(page, hashtag);
      events.push(...posts.slice(0, remainingBudget));

      if (events.length >= MAX_POSTS_PER_SCRAPE) {
        logger.info(
          `[DONE] reached MAX_POSTS_PER_SCRAPE (${MAX_POSTS_PER_SCRAPE}), stopping`,
        );
        break;
      }
    }

    logger.info(`[DONE] tiktok scrape done - ${events.length} total events`);
    return events.slice(0, MAX_POSTS_PER_SCRAPE).filter(Boolean);
  } finally {
    await closePage(page, "tiktok");
  }
}

module.exports = {
  CONFIG: CONFIGURATION,
  scrapeTikTok,
};
