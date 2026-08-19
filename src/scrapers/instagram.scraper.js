// src/scrapers/instagram.scraper.js — versi wajib caption + fallback posted date
const { CONFIG } = require("../config");
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
const { parseInstagramPostedAt, toIsoDate } = require("../utils/posted-date");

const INSTAGRAM = {
  hashtagBaseUrl: "https://www.instagram.com/explore/tags/",
  postBaseUrl: "https://www.instagram.com",
  // Alt text TIDAK dianggap caption asli. Nilai ini hanya dipakai untuk
  // decision awal apakah post ini "kemungkinan" punya caption, tapi caption
  // FINAL selalu diambil dari halaman detail post.
  maxDetailFetchesPerHashtag: 20,
  detailFetchDelayMs: 1200,
};

function normalizeText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function buildPostUrl(href = "") {
  return href.startsWith("http") ? href : `${INSTAGRAM.postBaseUrl}${href}`;
}

function extractPostId(href = "") {
  return String(href).split("/").filter(Boolean).pop() || String(href);
}

async function extractPostCaption(page) {
  const ogDescription = await page
    .$eval(
      'meta[property="og:description"]',
      (element) => element.getAttribute("content") || "",
    )
    .catch(() => "");

  const normalizedOg = normalizeText(ogDescription);
  if (normalizedOg) {
    const quoted = normalizedOg.match(/["“]([^"”]+)["”]/);
    if (quoted?.[1]) {
      return normalizeText(quoted[1]);
    }

    const colonIndex = normalizedOg.indexOf(":");
    if (colonIndex >= 0) {
      const afterColon = normalizeText(normalizedOg.slice(colonIndex + 1))
        .replace(/^['"“”]+/, "")
        .replace(/['"“”]+$/, "")
        .replace(/\s+on Instagram.*$/i, "");

      if (afterColon) {
        return normalizeText(afterColon);
      }
    }

    return normalizedOg;
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

async function extractPostImageFromDetailPage(page) {
  return page
    .$eval(
      'meta[property="og:image"]',
      (element) => element.getAttribute("content") || "",
    )
    .catch(() => "");
}

async function extractPostedAtFromDetailPage(page) {
  return page
    .$eval("time[datetime]", (el) => el.getAttribute("datetime") || "")
    .catch(() => "");
}

async function fetchDetailFromPage(page, href) {
  const url = buildPostUrl(href);

  return retryOperation(
    async () => {
      await delay(Math.floor(Math.random() * 250) + 150);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      if (page.url().includes("instagram.com/accounts/login")) {
        throw new Error("redirected to Instagram login");
      }

      await page.waitForSelector("article", { timeout: 8000 }).catch(() => {});

      const [caption, imageUrl, postedAtRaw] = await Promise.all([
        extractPostCaption(page),
        extractPostImageFromDetailPage(page),
        extractPostedAtFromDetailPage(page),
      ]);

      return { caption, imageUrl, postedAtRaw };
    },
    {
      retries: 1,
      minTimeout: 1500,
    },
  );
}

async function collectRawPosts(page) {
  return page.evaluate(() => {
    const seen = new Set();
    const posts = [];

    function pickBestImageUrl(img) {
      if (!img) return "";

      const src = img.getAttribute("src") || "";
      const isPlaceholder =
        !src || src.startsWith("data:image") || src.length < 20;

      if (!isPlaceholder) {
        return src;
      }

      const dataSrc = img.getAttribute("data-src") || "";
      if (dataSrc && !dataSrc.startsWith("data:image")) {
        return dataSrc;
      }

      const srcset =
        img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
      if (srcset) {
        const candidates = srcset
          .split(",")
          .map((entry) => entry.trim().split(" ")[0])
          .filter(Boolean);
        if (candidates.length > 0) {
          return candidates[candidates.length - 1];
        }
      }

      return "";
    }

    for (const link of document.querySelectorAll('a[href*="/p/"]')) {
      const href = link.getAttribute("href") || "";
      if (!href || seen.has(href)) {
        continue;
      }

      seen.add(href);

      const img = link.querySelector("img");
      posts.push({
        href,
        imgSrc: pickBestImageUrl(img),
        altText: img?.getAttribute("alt") || "",
      });
    }

    return posts;
  });
}

async function dumpHtmlState(page, hashtag, state) {
  try {
    return await dumpHtml(
      `instagram-${hashtag}-${state}`,
      await page.content(),
    );
  } catch (error) {
    logger.warn(
      { hashtag, state, err: error },
      "failed to dump instagram html",
    );
    return null;
  }
}

async function scrapeHashtag(
  page,
  hashtag,
  remainingBudget = CONFIG.maxPostsPerScrape,
) {
  const url = `${INSTAGRAM.hashtagBaseUrl}${encodeURIComponent(hashtag)}/`;

  logger.info({ platform: "instagram", hashtag, url }, "scraping hashtag");

  try {
    await retryOperation(() =>
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }),
    );

    await dumpHtmlState(page, hashtag, "after-goto");

    await ensureAuthenticated(page, "instagram");

    if (page.url().includes("instagram.com/accounts/login")) {
      logger.warn(
        { hashtag, url },
        "redirected to login, retrying hashtag page",
      );

      await retryOperation(() =>
        page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }),
      );

      await dumpHtmlState(page, hashtag, "after-login-retry");
    }

    await delay(Math.floor(Math.random() * 800) + 300);
    await scrollPage(page, 3);

    await page
      .waitForSelector('a[href*="/p/"]', { timeout: 15000 })
      .catch(() => {
        logger.warn(
          { hashtag, url },
          "no instagram posts found within timeout",
        );
      });

    await dumpHtmlState(page, hashtag, "after-scroll");

    const rawPostsAll = await collectRawPosts(page);

    // Batasi berdasarkan MAX_POSTS_PER_SCRAPE dari .env.
    const rawPosts = rawPostsAll.slice(0, Math.max(0, remainingBudget));

    const freshPosts = rawPosts.filter((post) => {
      return !dedupService.has("instagram", extractPostId(post.href));
    });

    const postsToProcess = freshPosts;

    logger.info(
      {
        platform: "instagram",
        hashtag,
        totalFound: rawPosts.length,
        freshFound: freshPosts.length,
        processing: postsToProcess.length,
      },
      "instagram posts collected",
    );

    if (postsToProcess.length === 0) {
      await dumpHtmlState(page, hashtag, "no-fresh-posts");
      return [];
    }

    const parsedPosts = [];
    let detailFetchCount = 0;
    let droppedNoCaptionCount = 0;

    for (const post of postsToProcess) {
      // Caption FINAL selalu diambil dari halaman detail post.
      // Alt text TIDAK dipakai sebagai caption karena hanya deskripsi gambar,
      // bukan caption asli yang ditulis pengunggah.
      if (detailFetchCount >= INSTAGRAM.maxDetailFetchesPerHashtag) {
        droppedNoCaptionCount += 1;

        logger.debug(
          {
            hashtag,
            href: post.href,
          },
          "skipped instagram post: detail fetch budget exhausted",
        );

        continue;
      }

      detailFetchCount += 1;

      await delay(INSTAGRAM.detailFetchDelayMs);

      try {
        const detail = await fetchDetailFromPage(page, post.href);
        const finalCaption = normalizeText(detail.caption);

        if (!finalCaption) {
          droppedNoCaptionCount += 1;

          logger.debug(
            {
              hashtag,
              href: post.href,
            },
            "skipped instagram post: no caption found on detail page",
          );

          continue;
        }

        const finalImageUrl = post.imgSrc || detail.imageUrl || "";

        const postedAtDate = parseInstagramPostedAt(detail.postedAtRaw);
        const postedAt = toIsoDate(postedAtDate);

        const parsed = parseInstagramPost(
          post.href,
          finalCaption,
          finalImageUrl,
          hashtag,
          postedAt,
        );

        if (parsed) {
          parsedPosts.push(parsed);
        } else {
          droppedNoCaptionCount += 1;

          logger.debug(
            {
              hashtag,
              href: post.href,
            },
            "skipped instagram post: caption too short or invalid",
          );
        }
      } catch (error) {
        droppedNoCaptionCount += 1;

        logger.warn(
          {
            hashtag,
            href: post.href,
            err: error,
          },
          "failed to load instagram post detail, skipping post",
        );
      }
    }

    logger.info(
      {
        platform: "instagram",
        hashtag,
        parsed: parsedPosts.length,
        withLocation: parsedPosts.filter((item) => item.location).length,
        withEventDate: parsedPosts.filter((item) => item.eventDate).length,
        withPostedAtFallback: parsedPosts.filter(
          (item) => item.dateSource === "posted_at",
        ).length,
        detailFetches: detailFetchCount,
        droppedNoCaptionCount,
      },
      "instagram hashtag parsed",
    );

    return parsedPosts;
  } catch (error) {
    await dumpHtmlState(page, hashtag, "error");
    throw error;
  }
}

async function scrapeInstagram(selectedHashtags = CONFIG.instagramHashtags) {
  const page = await createPage("instagram");
  const hashtags = Array.isArray(selectedHashtags)
    ? selectedHashtags.filter(Boolean)
    : CONFIG.instagramHashtags;
  const events = [];

  try {
    for (const hashtag of hashtags) {
      const remainingBudget = CONFIG.maxPostsPerScrape - events.length;
      if (remainingBudget <= 0) {
        break;
      }

      const posts = await scrapeHashtag(page, hashtag, remainingBudget);

      events.push(
        ...posts.map((post) => ({
          ...post,
          sourceHashtag: hashtag,
        })),
      );

      if (events.length >= CONFIG.maxPostsPerScrape) {
        logger.info(
          { limit: CONFIG.maxPostsPerScrape },
          "instagram scrape limit reached",
        );
        break;
      }
    }

    logger.info(
      {
        hashtags,
        totalEvents: events.length,
      },
      "instagram scrape finished",
    );

    return events.slice(0, CONFIG.maxPostsPerScrape);
  } finally {
    await closePage(page, "instagram");
  }
}

module.exports = {
  scrapeInstagram,
};
