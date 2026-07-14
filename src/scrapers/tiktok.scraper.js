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
  maxDetailFetchesPerHashtag: 3,
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

function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

async function fetchTikTokCaptionFromDetailPage(page, href) {
  const url = normalizeTikTokUrl(href);

  return retryOperation(
    async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await delay(2000);

      const result = await page.evaluate(() => {
        function normalizeDetailText(value) {
          return String(value || "")
            .replace(/\r/g, "")
            .replace(/\s+/g, " ")
            .trim();
        }

        const currentUrl = location.href;
        const title = document.title || "";
        const ogDescription =
          document
            .querySelector('meta[property="og:description"]')
            ?.getAttribute("content") || "";
        const descriptionMeta =
          document
            .querySelector('meta[name="description"]')
            ?.getAttribute("content") || "";

        const selectors = [
          '[data-e2e="browse-video-desc"]',
          '[data-e2e="video-desc"]',
          'div[data-e2e="browse-video-desc"]',
          'div[data-e2e="video-desc"]',
          "h1[data-e2e]",
        ];

        const hits = selectors.map((selector) => ({
          selector,
          text: normalizeDetailText(
            document.querySelector(selector)?.textContent || "",
          ),
        }));

        const bodyText = normalizeDetailText(
          document.body?.innerText || "",
        ).slice(0, 500);

        return {
          currentUrl,
          title: normalizeDetailText(title),
          ogDescription: normalizeDetailText(ogDescription),
          descriptionMeta: normalizeDetailText(descriptionMeta),
          hits,
          bodyText,
        };
      });

      logger.info(
        {
          href: url,
          detailPage: result,
        },
        "tiktok detail page debug",
      );

      const selectorHit = result.hits.find((item) => item.text);
      const caption =
        selectorHit?.text ||
        result.ogDescription ||
        result.descriptionMeta ||
        "";

      return normalizeText(caption);
    },
    { retries: 1, minTimeout: 1200 },
  );
}

async function scrapeHashtag(
  page,
  hashtag,
  remainingBudget = MAX_POSTS_PER_SCRAPE,
) {
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

    function normalizeCardText(value) {
      return String(value || "")
        .replace(/\r/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getStateCaptionMap() {
      const map = new Map();
      const scripts = Array.from(document.querySelectorAll("script"));

      for (const script of scripts) {
        const text = script.textContent || "";
        if (!text) continue;
        if (!text.includes('"desc"') || !text.includes('"id"')) continue;

        const idMatches = [...text.matchAll(/"id":"(\d+)"/g)];
        const descMatches = [...text.matchAll(/"desc":"(.*?)"/g)];

        if (!idMatches.length || !descMatches.length) {
          continue;
        }

        const pairCount = Math.min(idMatches.length, descMatches.length);

        for (let i = 0; i < pairCount; i += 1) {
          const videoId = idMatches[i]?.[1];
          const rawDesc = descMatches[i]?.[1] || "";

          const decoded = normalizeCardText(
            rawDesc
              .replace(/\\"/g, '"')
              .replace(/\\n/g, " ")
              .replace(/\\\\/g, "\\")
              .replace(/\\u002F/g, "/"),
          );

          if (videoId && decoded && !map.has(videoId)) {
            map.set(videoId, decoded);
          }
        }
      }

      return map;
    }

    function collectCaptionParts(item, anchor, descEl, stateCaption) {
      const candidates = [];

      const push = (value) => {
        const text = normalizeCardText(value);
        if (text) {
          candidates.push(text);
        }
      };

      push(descEl?.getAttribute("aria-label"));
      push(descEl?.textContent);
      push(anchor?.getAttribute("title"));
      push(anchor?.getAttribute("aria-label"));
      push(stateCaption);

      for (const node of item.querySelectorAll('[data-e2e="new-desc-span"]')) {
        push(node.textContent);
      }

      for (const node of item.querySelectorAll("span")) {
        const text = normalizeCardText(node.textContent);
        if (!text) continue;
        if (text.length < 2) continue;
        if (/^\d+[.,]?\d*\s*[KMB]?$/i.test(text)) continue;
        if (
          /^(like|likes|reply|replies|view|views|followers?|following)$/i.test(
            text,
          )
        ) {
          continue;
        }
        candidates.push(text);
      }

      const unique = [];
      const seenTexts = new Set();

      for (const value of candidates) {
        const key = value.toLowerCase();
        if (seenTexts.has(key)) continue;
        seenTexts.add(key);
        unique.push(value);
      }

      return unique.join(" ").trim();
    }

    const stateCaptionMap = getStateCaptionMap();

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
      const stateCaption = stateCaptionMap.get(videoId) || "";
      const caption = collectCaptionParts(item, anchor, descEl, stateCaption);

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

  logger.info(
    {
      hashtag,
      sampleCards: freshCards.slice(0, 3).map((card) => ({
        videoId: card.videoId,
        authorUsername: card.authorUsername,
        caption: card.caption?.slice(0, 120) || "",
      })),
    },
    "sample TikTok cards before parse",
  );

  const cardsToProcess = freshCards.slice(0, Math.max(0, remainingBudget));

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
  let detailFetchCount = 0;

  for (const card of cardsToProcess) {
    try {
      let enrichedCard = { ...card };

      if (
        !normalizeText(enrichedCard.caption) &&
        detailFetchCount < CONFIGURATION.maxDetailFetchesPerHashtag
      ) {
        detailFetchCount += 1;

        const detailCaption = await fetchTikTokCaptionFromDetailPage(
          page,
          enrichedCard.href,
        );

        if (detailCaption) {
          enrichedCard.caption = detailCaption;
        }
      }

      const parsed = parseTikTokVideo(enrichedCard);
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
      detailFetches: detailFetchCount,
    },
    `[DONE] parsed ${posts.length} TikTok posts from #${hashtag}`,
  );

  return posts;
}

async function scrapeTikTok(selectedHashtags = CONFIG.tiktokHashtags) {
  const page = await createPage("tiktok");
  const events = [];
  const hashtags = Array.isArray(selectedHashtags)
    ? selectedHashtags.filter(Boolean)
    : [];

  try {
    for (const hashtag of hashtags) {
      const remainingBudget = MAX_POSTS_PER_SCRAPE - events.length;
      if (remainingBudget <= 0) {
        break;
      }

      const posts = await scrapeHashtag(page, hashtag, remainingBudget);
      const taggedPosts = posts.map((post) => ({
        ...post,
        sourceHashtag: hashtag,
      }));

      events.push(...taggedPosts);

      if (events.length >= MAX_POSTS_PER_SCRAPE) {
        logger.info(
          `[DONE] reached MAX_POSTS_PER_SCRAPE (${MAX_POSTS_PER_SCRAPE}), stopping`,
        );
        break;
      }
    }

    logger.info(
      { hashtags, totalEvents: events.length },
      "[DONE] tiktok scrape done",
    );
    return events.slice(0, MAX_POSTS_PER_SCRAPE).filter(Boolean);
  } finally {
    await closePage(page, "tiktok");
  }
}

module.exports = {
  CONFIG: CONFIGURATION,
  scrapeTikTok,
};
