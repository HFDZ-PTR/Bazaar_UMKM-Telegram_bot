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
const { parseTwitterHtml } = require("../parsers/twitter.parser");
const { retryOperation } = require("../utils/retry");
const logger = require("../utils/logger");

const CONFIGURATION = {
  baseUrl: "https://x.com/search?q=",
};

async function scrapeHashtag(page, hashtag) {
  const query = encodeURIComponent(`#${hashtag} lang:id`);
  const url = `${CONFIGURATION.baseUrl}${query}&src=typed_query&f=live`;
  await retryOperation(async () =>
    page.goto(url, { waitUntil: "networkidle2", timeout: 45000 }),
  );
  await ensureAuthenticated(page, "twitter");
  if (
    page.url().includes("x.com/i/flow/login") ||
    page.url().includes("twitter.com/i/flow/login")
  ) {
    await retryOperation(async () =>
      page.goto(url, { waitUntil: "networkidle2", timeout: 45000 }),
    );
  }
  await delay(Math.floor(Math.random() * 2000 + 1000));
  await scrollPage(page);

  await page.waitForSelector("article", { timeout: 30000 }).catch(() => {
    logger.warn("tweets did not load within timeout");
  });

  const posts = await page.evaluate(() => {
    const results = [];
    const articles = document.querySelectorAll("article");
    articles.forEach((article) => {
      const link = article.querySelector("a[href*='/status/']");
      if (!link) {
        return;
      }

      const href = link.getAttribute("href") || "";
      const statusId = href.split("/").filter(Boolean).pop();
      const text = article.textContent || "";
      const title = text.slice(0, 100).trim() || "X event";
      const img = article.querySelector("img");
      const imageUrl = img ? img.getAttribute("src") : "";

      results.push({
        platform: "twitter",
        postId: statusId || href,
        title,
        date: new Date().toISOString().slice(0, 10),
        location: "",
        organizer: "",
        description: text.slice(0, 200).trim(),
        imageUrl,
        sourceUrl: href.startsWith("/") ? `https://x.com${href}` : href,
      });
    });
    return results;
  });

  const html = await page.content();
  await dumpHtml("twitter", html);
  return posts;
}

async function scrapeTwitter() {
  const page = await createPage("twitter");
  const events = [];

  try {
    for (const hashtag of CONFIG.twitterHashtags) {
      const parsedPosts = await scrapeHashtag(page, hashtag);
      events.push(...parsedPosts);
      if (events.length >= MAX_POSTS_PER_SCRAPE) {
        break;
      }
    }

    return events.slice(0, MAX_POSTS_PER_SCRAPE);
  } finally {
    await closePage(page, "twitter");
  }
}

module.exports = {
  CONFIG: CONFIGURATION,
  scrapeTwitter,
};
