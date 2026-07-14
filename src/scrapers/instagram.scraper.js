// src/scrapers/instagram.scraper.js
const { CONFIG } = require("../config");
const { MAX_POSTS_PER_SCRAPE } = require("../config/constants");
const {
  createPage,
  closePage,
  scrollPage,
  delay,
  ensureAuthenticated,
} = require("../services/browser.service");
const { dumpHtml } = require("../utils/html.dump");
const { parseInstagramPost } = require("../parsers/instagram.parser");
const { retryOperation } = require("../utils/retry");
const dedupService = require("../services/dedup.service");
const logger = require("../utils/logger");

const CONFIGURATION = {
  baseUrl: "https://www.instagram.com/explore/tags/",
  postBaseUrl: "https://www.instagram.com",
  minCaptionLength: 30,
  maxDetailFetchesPerHashtag: 3,
};

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPostUrl(href) {
  return href.startsWith("http") ? href : `${CONFIGURATION.postBaseUrl}${href}`;
}

function extractPostId(href) {
  return href.split("/").filter(Boolean).pop() || href;
}

async function extractPostCaption(page) {
  const ogDescription = await page
    .$eval(
      'meta[property="og:description"]',
      (element) => element.getAttribute("content") || "",
    )
    .catch(() => "");

  const normalizedOgDescription = normalizeText(ogDescription);
  if (normalizedOgDescription) {
    const quotedMatch = normalizedOgDescription.match(/["“]([^"”]+)["”]/);
    if (quotedMatch?.[1]) {
      return normalizeText(quotedMatch[1]);
    }

    const colonIndex = normalizedOgDescription.indexOf(":");
    if (colonIndex >= 0) {
      const afterColon = normalizeText(
        normalizedOgDescription.slice(colonIndex + 1),
      );
      const cleaned = afterColon
        .replace(/^['"“”]+/, "")
        .replace(/['"“”]+$/, "")
        .replace(/\s+on Instagram.*$/i, "");

      if (cleaned) {
        return normalizeText(cleaned);
      }
    }

    return normalizedOgDescription;
  }

  const visibleCaption = await page
    .evaluate(() => {
      const selectors = [
        'article div[dir="auto"]',
        "article span",
        "article",
        "main article",
      ];

      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          const text = (node.textContent || "").replace(/\s+/g, " ").trim();
          if (text) {
            return text;
          }
        }
      }

      return "";
    })
    .catch(() => "");

  return normalizeText(visibleCaption);
}

async function fetchCaptionFromDetailPage(page, href) {
  const postUrl = buildPostUrl(href);

  return retryOperation(
    async () => {
      await delay(Math.floor(Math.random() * 250) + 150);
      await page.goto(postUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      if (page.url().includes("instagram.com/accounts/login")) {
        throw new Error("redirected to Instagram login");
      }

      await page.waitForSelector("article", { timeout: 8000 }).catch(() => {});
      return extractPostCaption(page);
    },
    { retries: 1, minTimeout: 1500 },
  );
}

async function scrapeHashtag(
  page,
  hashtag,
  remainingBudget = MAX_POSTS_PER_SCRAPE,
) {
  const url = `${CONFIGURATION.baseUrl}${encodeURIComponent(hashtag)}/`;
  logger.info(`[SCAN] scraping hashtag #${hashtag}`);

  await retryOperation(() =>
    page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }),
  );
  await ensureAuthenticated(page, "instagram");

  if (page.url().includes("instagram.com/accounts/login")) {
    logger.warn("[WARN] redirected to login - retrying after auth");
    await retryOperation(() =>
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }),
    );
  }

  await delay(Math.floor(Math.random() * 800) + 300);
  await scrollPage(page, 3);

  await page
    .waitForSelector('a[href*="/p/"]', { timeout: 15000 })
    .catch(() =>
      logger.warn(`[WARN] no posts found for #${hashtag} within timeout`),
    );

  const hashtagHtml = await page.content();
  await dumpHtml("instagram", hashtagHtml);

  const rawPosts = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    document.querySelectorAll('a[href*="/p/"]').forEach((link) => {
      const href = link.getAttribute("href") || "";
      if (!href || seen.has(href)) return;
      seen.add(href);

      const img = link.querySelector("img");
      results.push({
        href,
        imgSrc: img ? img.getAttribute("src") || "" : "",
        altText: img ? img.getAttribute("alt") || "" : "",
      });
    });

    return results;
  });

  const freshPosts = rawPosts.filter(({ href }) => {
    const postId = extractPostId(href);
    return !dedupService.has("instagram", postId);
  });

  const visitLimit = Math.max(0, Math.min(remainingBudget, freshPosts.length));
  const postsToProcess = freshPosts.slice(0, visitLimit);

  logger.info(
    `[SCAN] found ${rawPosts.length} post links for #${hashtag}; fresh ${freshPosts.length}; processing ${postsToProcess.length}`,
  );

  if (postsToProcess.length === 0) {
    return [];
  }

  const posts = [];
  let detailFetchCount = 0;

  for (const { href, imgSrc, altText } of postsToProcess) {
    const normalizedAlt = normalizeText(altText);

    if (normalizedAlt.length >= CONFIGURATION.minCaptionLength) {
      const post = parseInstagramPost(href, normalizedAlt, imgSrc);
      if (post) {
        posts.push(post);
      }
      continue;
    }

    if (detailFetchCount >= CONFIGURATION.maxDetailFetchesPerHashtag) {
      logger.info(
        `[SKIP] detail fetch limit reached for #${hashtag}, skipping ${href}`,
      );
      continue;
    }

    detailFetchCount += 1;

    try {
      const caption = await fetchCaptionFromDetailPage(page, href);
      const post = parseInstagramPost(href, caption, imgSrc);
      if (post) {
        posts.push(post);
      }
    } catch (error) {
      logger.warn(
        { err: error.message, href },
        "[WARN] failed to load Instagram post detail",
      );
    }
  }

  const withLocation = posts.filter((p) => p.location).length;
  const withDate = posts.filter(
    (p) => p.date !== new Date().toISOString().slice(0, 10),
  ).length;

  logger.info(
    `[DONE] parsed ${posts.length} posts | ${withLocation} with location | ${withDate} with event date | detail fetches ${detailFetchCount}`,
  );

  return posts.filter(Boolean);
}

async function scrapeInstagram(selectedHashtags = CONFIG.instagramHashtags) {
  const page = await createPage("instagram");
  const events = [];
  const hashtags = Array.isArray(selectedHashtags)
    ? selectedHashtags.filter(Boolean)
    : CONFIG.instagramHashtags;

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
      "[DONE] instagram scrape done",
    );
    return events.slice(0, MAX_POSTS_PER_SCRAPE).filter(Boolean);
  } finally {
    await closePage(page, "instagram");
  }
}

module.exports = {
  CONFIG: CONFIGURATION,
  scrapeInstagram,
};
