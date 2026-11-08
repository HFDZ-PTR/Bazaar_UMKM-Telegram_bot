// src/scrapers/tiktok.scraper.js
const { CONFIG } = require("../config");
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
const { parseTikTokPostedAt, toIsoDate } = require("../utils/posted-date");

const TIKTOK = {
  hashtagBaseUrl: "https://www.tiktok.com/tag/",
  initialDelayMinMs: 3000,
  initialDelayMaxMs: 5000,
  scrollSteps: 4,
  waitForCardsTimeoutMs: 15000,
  maxDetailFetchesPerHashtag: 20,
  detailFetchDelayMs: 1500,
};

const dumpedStates = new Set();

function randomInitialDelay() {
  return (
    Math.floor(
      Math.random() * (TIKTOK.initialDelayMaxMs - TIKTOK.initialDelayMinMs + 1),
    ) + TIKTOK.initialDelayMinMs
  );
}

function normalizeTikTokUrl(href = "") {
  if (!href) {
    return "";
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  if (href.startsWith("//")) {
    return `https:${href}`;
  }

  if (href.startsWith("/")) {
    return `https://www.tiktok.com${href}`;
  }

  return `https://www.tiktok.com/${href}`;
}

function normalizeText(value = "") {
  return String(value).replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

async function dumpHtmlOnce(page, hashtag, state) {
  const key = `${hashtag}:${state}`;
  if (dumpedStates.has(key)) {
    return null;
  }

  dumpedStates.add(key);

  try {
    return await dumpHtml(`tiktok-${hashtag}-${state}`, await page.content());
  } catch (error) {
    logger.warn({ hashtag, state, err: error }, "failed to dump debug html");
    return null;
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
      timeout: TIKTOK.waitForCardsTimeoutMs,
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

async function fetchCaptionFromDetailPage(page, href) {
  const url = normalizeTikTokUrl(href);

  return retryOperation(
    async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await delay(2000);

      const detail = await page.evaluate(() => {
        function clean(value) {
          return String(value || "")
            .replace(/\r/g, "")
            .replace(/\s+/g, " ")
            .trim();
        }

        const ogDescription =
          document
            .querySelector('meta[property="og:description"]')
            ?.getAttribute("content") || "";

        const metaDescription =
          document
            .querySelector('meta[name="description"]')
            ?.getAttribute("content") || "";

        const captionSelectors = [
          '[data-e2e="browse-video-desc"]',
          '[data-e2e="video-desc"]',
          'div[data-e2e="browse-video-desc"]',
          'div[data-e2e="video-desc"]',
          "h1[data-e2e]",
        ];

        let caption = "";
        for (const selector of captionSelectors) {
          const text = clean(
            document.querySelector(selector)?.textContent || "",
          );
          if (text) {
            caption = text;
            break;
          }
        }

        if (!caption) {
          caption = clean(ogDescription) || clean(metaDescription) || "";
        }

        function findPostedDateText() {
          const pattern =
            /^·\s*(\d{1,2}-\d{1,2}|\d{4}-\d{1,2}-\d{1,2}|\d+\s*(?:h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks|mo|month|months|y|yr|year|years)\s*ago)$/i;

          const spans = Array.from(document.querySelectorAll("span"));

          for (const span of spans) {
            const text = (span.textContent || "").replace(/\s+/g, " ").trim();

            if (pattern.test(text)) {
              return text;
            }
          }

          return "";
        }

        return {
          caption,
          postedAtRaw: findPostedDateText(),
        };
      });

      return {
        caption: normalizeText(detail.caption),
        postedAtRaw: detail.postedAtRaw || "",
      };
    },
    { retries: 1, minTimeout: 1200 },
  );
}

async function collectRawCards(page) {
  return page.evaluate(() => {
    const rows = [];
    const seen = new Set();

    function normalizeCardText(value) {
      return String(value || "")
        .replace(/\r/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getStateCaptionMap() {
      const map = new Map();

      for (const script of document.querySelectorAll("script")) {
        const text = script.textContent || "";
        if (!text || !text.includes('"desc"') || !text.includes('"id"')) {
          continue;
        }

        const idMatches = [...text.matchAll(/"id":"(\d+)"/g)];
        const descMatches = [...text.matchAll(/"desc":"(.*?)"/g)];
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
      const values = [];

      function push(value) {
        const text = normalizeCardText(value);
        if (text) {
          values.push(text);
        }
      }

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
        if (!text || text.length < 2) {
          continue;
        }

        if (/^\d+[.,]?\d*\s*[KMB]?$/i.test(text)) {
          continue;
        }

        if (
          /^(like|likes|reply|replies|view|views|followers?|following)$/i.test(
            text,
          )
        ) {
          continue;
        }

        values.push(text);
      }

      const unique = [];
      const seenTexts = new Set();

      for (const value of values) {
        const key = value.toLowerCase();
        if (seenTexts.has(key)) {
          continue;
        }

        seenTexts.add(key);
        unique.push(value);
      }

      return unique.join(" ").trim();
    }

    function findPostedDateTextInItem(item) {
      const pattern =
        /^·\s*(\d{1,2}-\d{1,2}|\d{4}-\d{1,2}-\d{1,2}|\d+\s*(?:h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks|mo|month|months|y|yr|year|years)\s*ago)$/i;

      for (const node of item.querySelectorAll("span")) {
        const text = normalizeCardText(node.textContent);
        if (pattern.test(text)) {
          return text;
        }
      }

      return "";
    }

    const stateCaptionMap = getStateCaptionMap();

    for (const item of document.querySelectorAll(
      'div[data-e2e="challenge-item"]',
    )) {
      const anchor = item.querySelector('a[href*="/video/"]');
      if (!anchor) {
        continue;
      }

      const href = anchor.getAttribute("href") || anchor.href || "";
      const videoId = (href.match(/\/video\/(\d+)/) || [])[1] || "";

      if (!videoId || seen.has(videoId)) {
        continue;
      }

      seen.add(videoId);

      const authorUsername =
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

      const postedAtRaw = findPostedDateTextInItem(item);

      rows.push({
        href,
        videoId,
        authorUsername,
        caption,
        thumbnailUrl,
        postedAtRaw,
      });
    }

    return rows;
  });
}

async function scrapeHashtag(page, hashtag, _remainingBudget) {
  const PER_HASHTAG_LIMIT = CONFIG.maxPostsPerScrape;
  const url = `${TIKTOK.hashtagBaseUrl}${encodeURIComponent(hashtag)}`;

  logger.info({ platform: "tiktok", hashtag, url }, "scraping hashtag");

  try {
    await retryOperation(() =>
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }),
    );

    await dumpHtmlOnce(page, hashtag, "after-goto");

    await delay(randomInitialDelay());

    if (await isVerificationWall(page)) {
      await dumpHtmlOnce(page, hashtag, "verify");
      logger.warn({ hashtag, url }, "tiktok verification wall detected");
      return [];
    }

    const state = await waitForHashtagResults(page);

    if (state === "verify") {
      await dumpHtmlOnce(page, hashtag, "verify");
      logger.warn(
        { hashtag, url },
        "tiktok verification wall detected while waiting",
      );
      return [];
    }

    if (state === "error") {
      await dumpHtmlOnce(page, hashtag, "failed-load");
      logger.warn({ hashtag, url }, "tiktok hashtag page returned error state");
      return [];
    }

    if (state !== "cards") {
      await dumpHtmlOnce(page, hashtag, "timeout");
      logger.warn({ hashtag, url, state }, "tiktok hashtag page timed out");
      return [];
    }

    await scrollPage(page, TIKTOK.scrollSteps);
    await dumpHtmlOnce(page, hashtag, "after-scroll");

    if (await isVerificationWall(page)) {
      await dumpHtmlOnce(page, hashtag, "verify-after-scroll");
      logger.warn(
        { hashtag, url },
        "tiktok verification wall detected after scroll",
      );
      return [];
    }

    const signals = await getPageSignals(page);
    if (signals.challengeItemCount === 0) {
      await dumpHtmlOnce(page, hashtag, "no-cards");
      logger.warn(
        { hashtag, url, signals },
        "no tiktok cards found after scroll",
      );
      return [];
    }

    const rawCardsAll = await collectRawCards(page);

    const rawCards = rawCardsAll.slice(0, PER_HASHTAG_LIMIT);

    const freshCards = rawCards
      .map((card) => ({
        ...card,
        href: normalizeTikTokUrl(card.href),
      }))
      .filter(
        (card) => card.videoId && !dedupService.has("tiktok", card.videoId),
      );

    const cardsToProcess = freshCards;

    logger.info(
      {
        platform: "tiktok",
        hashtag,
        totalFound: rawCards.length,
        freshFound: freshCards.length,
        processing: cardsToProcess.length,
        perHashtagLimit: PER_HASHTAG_LIMIT,
      },
      "tiktok cards collected",
    );

    if (cardsToProcess.length === 0) {
      await dumpHtmlOnce(page, hashtag, "no-fresh-cards");
      return [];
    }

    const posts = [];
    let detailFetchCount = 0;
    let droppedNoCaptionCount = 0;

    for (const card of cardsToProcess) {
      try {
        const enrichedCard = { ...card };
        const initialCaption = normalizeText(enrichedCard.caption);
        let postedAtRaw = enrichedCard.postedAtRaw || "";

        if (
          (!initialCaption || !postedAtRaw) &&
          detailFetchCount < TIKTOK.maxDetailFetchesPerHashtag
        ) {
          detailFetchCount += 1;

          await delay(TIKTOK.detailFetchDelayMs);

          const detail = await fetchCaptionFromDetailPage(
            page,
            enrichedCard.href,
          );

          if (detail.caption) {
            enrichedCard.caption = detail.caption;
          }

          if (!postedAtRaw && detail.postedAtRaw) {
            postedAtRaw = detail.postedAtRaw;
          }
        }

        if (!normalizeText(enrichedCard.caption)) {
          droppedNoCaptionCount += 1;

          logger.debug(
            {
              hashtag,
              videoId: card.videoId,
              href: card.href,
            },
            "skipped tiktok video: no caption found",
          );

          continue;
        }

        const postedAtDate = parseTikTokPostedAt(postedAtRaw);
        const postedAt = toIsoDate(postedAtDate);

        const parsed = parseTikTokVideo({
          ...enrichedCard,
          postedAt,
          sourceHashtag: hashtag,
        });

        if (parsed) {
          posts.push(parsed);
        } else {
          droppedNoCaptionCount += 1;

          logger.debug(
            {
              hashtag,
              videoId: card.videoId,
              href: card.href,
            },
            "skipped tiktok video: caption too short or invalid",
          );
        }
      } catch (error) {
        droppedNoCaptionCount += 1;

        logger.warn(
          {
            hashtag,
            videoId: card.videoId,
            href: card.href,
            err: error,
          },
          "failed to parse tiktok card",
        );
      }
    }

    logger.info(
      {
        platform: "tiktok",
        hashtag,
        parsed: posts.length,
        withEventDate: posts.filter((item) => item.eventDate).length,
        withPostedAtFallback: posts.filter(
          (item) => item.dateSource === "posted_at",
        ).length,
        detailFetches: detailFetchCount,
        droppedNoCaptionCount,
      },
      "tiktok hashtag parsed",
    );

    return posts;
  } catch (error) {
    await dumpHtmlOnce(page, hashtag, "error");
    throw error;
  }
}

async function scrapeTikTok(selectedHashtags = CONFIG.tiktokHashtags) {
  const page = await createPage("tiktok");
  const hashtags = Array.isArray(selectedHashtags)
    ? selectedHashtags.filter(Boolean)
    : CONFIG.tiktokHashtags;
  const events = [];

  try {
    for (const hashtag of hashtags) {
      const posts = await scrapeHashtag(page, hashtag, null);

      events.push(
        ...posts.map((post) => ({
          ...post,
          sourceHashtag: hashtag,
        })),
      );
    }

    logger.info(
      {
        hashtags,
        totalEvents: events.length,
        perHashtagLimit: CONFIG.maxPostsPerScrape,
      },
      "tiktok scrape finished",
    );

    return events;
  } finally {
    await closePage(page, "tiktok");
  }
}

module.exports = {
  scrapeTikTok,
};
