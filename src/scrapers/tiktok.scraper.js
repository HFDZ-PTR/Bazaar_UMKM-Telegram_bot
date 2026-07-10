// src/scrapers/tiktok.scraper.js
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
  waitForCardsTimeoutMs: 15000,
};

const debugDumpState = new Set();

function randomInitialDelay() {
  return (
    Math.floor(
      Math.random() *
        (CONFIGURATION.initialDelayMaxMs - CONFIGURATION.initialDelayMinMs + 1),
    ) + CONFIGURATION.initialDelayMinMs
  );
}

function normalizeTikTokUrl(href) {
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://www.tiktok.com${href}`;
  return `https://www.tiktok.com/${href}`;
}

async function dumpHtmlOnce(page, hashtag, label) {
  const key = `${hashtag}:${label}`;
  if (debugDumpState.has(key)) {
    return;
  }

  debugDumpState.add(key);

  try {
    const html = await page.content();
    await dumpHtml(`tiktok-${hashtag}-${label}`, html);
  } catch (error) {
    logger.warn(
      { hashtag, label, error: error?.message },
      "failed to dump debug html",
    );
  }
}

async function getPageSignals(page) {
  return page
    .evaluate(() => {
      const bodyText = document.body?.innerText || "";

      return {
        hasErrorText: /something went wrong/i.test(bodyText),
        hasVerifyText:
          /captcha|verify|security check|unusual activity|verify to continue/i.test(
            bodyText,
          ),
        challengeItemCount: document.querySelectorAll(
          'div[data-e2e="challenge-item"]',
        ).length,
        videoLinkCount: document.querySelectorAll('a[href*="/video/"]').length,
      };
    })
    .catch(() => ({
      hasErrorText: false,
      hasVerifyText: false,
      challengeItemCount: 0,
      videoLinkCount: 0,
    }));
}

async function isVerificationWall(page) {
  const currentUrl = page.url().toLowerCase();
  if (/captcha|verify|login|challenge/.test(currentUrl)) {
    return true;
  }

  const signals = await getPageSignals(page);
  return signals.hasVerifyText;
}

async function waitForHashtagResults(page) {
  try {
    await page.waitForSelector('div[data-e2e="challenge-item"]', {
      timeout: CONFIGURATION.waitForCardsTimeoutMs,
    });
    return "cards";
  } catch (_) {}

  const signals = await getPageSignals(page);

  if (signals.challengeItemCount > 0) {
    return "cards";
  }

  if (signals.hasErrorText) {
    return "error";
  }

  if (signals.hasVerifyText) {
    return "verify";
  }

  return "timeout";
}

async function scrapeHashtag(page, hashtag) {
  const url = `${CONFIGURATION.baseUrl}${encodeURIComponent(hashtag)}`;
  logger.info({ hashtag, url }, `[SCAN] scraping tiktok hashtag #${hashtag}`);

  await retryOperation(() =>
    page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }),
  );

  await delay(randomInitialDelay());

  if (await isVerificationWall(page)) {
    await dumpHtmlOnce(page, hashtag, "verify");

    logger.warn(
      { hashtag, url },
      "tiktok verification wall detected before results load",
    );
    return [];
  }

  const readyState = await waitForHashtagResults(page);

  if (readyState === "verify") {
    await dumpHtmlOnce(page, hashtag, "verify");

    logger.warn(
      { hashtag, url },
      "tiktok verification wall detected while waiting for results",
    );
    return [];
  }

  if (readyState === "error") {
    await dumpHtmlOnce(page, hashtag, "failed-load");

    logger.warn(
      { hashtag, url, readyState },
      'tiktok hashtag page returned "something went wrong"',
    );
    return [];
  }

  if (readyState !== "cards") {
    await dumpHtmlOnce(page, hashtag, "timeout");

    logger.warn(
      { hashtag, url, readyState },
      "tiktok hashtag page did not load challenge items in time",
    );
    return [];
  }

  await scrollPage(page, CONFIGURATION.scrollSteps);

  if (await isVerificationWall(page)) {
    await dumpHtmlOnce(page, hashtag, "verify-after-scroll");

    logger.warn(
      { hashtag, url },
      "tiktok verification wall detected after scroll",
    );
    return [];
  }

  const signalsAfterScroll = await getPageSignals(page);

  if (signalsAfterScroll.challengeItemCount === 0) {
    await dumpHtmlOnce(page, hashtag, "no-cards");

    logger.warn(
      { hashtag, url, signalsAfterScroll },
      "no challenge items found after successful load state",
    );
    return [];
  }

  const rawCards = await page.evaluate(() => {
    const seen = new Set();
    const rows = [];

    for (const item of document.querySelectorAll(
      'div[data-e2e="challenge-item"]',
    )) {
      const anchor = item.querySelector('a[href*="/video/"]');
      if (!anchor) continue;

      const href = anchor.getAttribute("href") || anchor.href || "";
      const videoId = (href.match(/\/video\/(\d+)/) || [])[1] || "";
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);

      const username =
        item
          .querySelector('[data-e2e="challenge-item-username"]')
          ?.textContent?.replace(/\s+/g, " ")
          .trim() || "";

      const descEl = item.querySelector('[data-e2e="challenge-item-desc"]');

      const caption =
        descEl?.getAttribute("aria-label") ||
        descEl?.textContent?.replace(/\s+/g, " ").trim() ||
        anchor.getAttribute("title") ||
        anchor.getAttribute("aria-label") ||
        "";

      const thumbnailUrl =
        item.querySelector("img")?.getAttribute("src") ||
        item.querySelector("img")?.src ||
        "";

      rows.push({
        href,
        videoId,
        authorUsername: username,
        caption,
        thumbnailUrl,
      });
    }

    return rows;
  });

  const freshCards = rawCards
    .map((card) => ({
      ...card,
      href: normalizeTikTokUrl(card.href),
    }))
    .filter(
      (card) => card.videoId && !dedupService.has("tiktok", card.videoId),
    );

  const cardsToProcess = freshCards.slice(0, MAX_POSTS_PER_SCRAPE);

  if (cardsToProcess.length === 0) {
    await dumpHtmlOnce(page, hashtag, "no-fresh-cards");

    logger.warn(
      {
        hashtag,
        url,
        rawCount: rawCards.length,
        freshCount: freshCards.length,
      },
      "no fresh TikTok cards found",
    );
    return [];
  }

  const posts = [];
  for (const card of cardsToProcess) {
    try {
      const parsed = parseTikTokVideo(card);
      if (parsed) {
        posts.push(parsed);
      }
    } catch (error) {
      logger.warn(
        {
          hashtag,
          videoId: card.videoId,
          href: card.href,
          error: error?.message,
        },
        "failed to parse TikTok video card",
      );
    }
  }

  logger.info(
    {
      hashtag,
      extractedCards: rawCards.length,
      freshCards: cardsToProcess.length,
      parsed: posts.length,
    },
    `[DONE] parsed ${posts.length} TikTok posts from #${hashtag}`,
  );

  return posts;
}

async function scrapeTikTok() {
  const page = await createPage("tiktok");
  const events = [];

  try {
    const hashtags = Array.isArray(CONFIG.tiktokHashtags)
      ? CONFIG.tiktokHashtags
      : [];

    for (const hashtag of hashtags) {
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
