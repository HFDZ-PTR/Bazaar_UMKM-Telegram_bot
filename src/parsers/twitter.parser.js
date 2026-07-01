const cheerio = require("cheerio");

function pickText($, selectors) {
  for (const selector of selectors) {
    const value = $(selector).first().text().replace(/\s+/g, " ").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function parseTwitterHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const posts = [];

  $("article").each((_, article) => {
    const link = $(article).find('a[href*="/status/"]').first().attr("href");
    if (!link) {
      return;
    }

    const statusId = link.split("/").filter(Boolean).pop();
    const title =
      pickText($, ['meta[property="og:title"]']) ||
      $(article).find("div[lang]").first().text().replace(/\s+/g, " ").trim() ||
      "X event";
    const description =
      $(article).find("div[lang]").first().text().replace(/\s+/g, " ").trim() ||
      title;
    const imageUrl = $(article).find("img").first().attr("src") || "";

    posts.push({
      platform: "twitter",
      postId: statusId || link,
      title,
      date: new Date().toISOString().slice(0, 10),
      location: "",
      organizer: "",
      description,
      imageUrl,
      sourceUrl: new URL(link, sourceUrl).toString(),
    });
  });

  return posts;
}

module.exports = {
  parseTwitterHtml,
};
