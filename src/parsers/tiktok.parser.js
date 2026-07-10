// src/parsers/tiktok.parser.js
const { eventSchema } = require("../config");
const { extractLocation, extractEventDate } = require("./instagram.parser");

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVideoId(href) {
  const match = String(href || "").match(/\/video\/(\d+)/);
  return match ? match[1] : "";
}

function extractOrganizer(text, authorUsername) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const organizerLine = line.match(
      /^(?:organizer|organiser|penyelenggara|hosted by|by)\s*[:\-]\s*(.+)$/i,
    );
    if (organizerLine?.[1]) {
      return normalizeText(organizerLine[1]);
    }

    const byHandle = line.match(/\bby\s+@([a-z0-9._]+)/i);
    if (byHandle?.[1]) {
      return `@${byHandle[1]}`;
    }
  }

  return authorUsername ? `@${authorUsername}` : "";
}

function buildSourceUrl(href) {
  if (!href) {
    return "";
  }

  return href.startsWith("http")
    ? href
    : new URL(href, "https://www.tiktok.com").toString();
}

function buildTitle(caption, authorUsername) {
  const cleaned = normalizeText(caption);
  if (!cleaned) {
    return authorUsername
      ? `TikTok post by @${authorUsername}`
      : "TikTok event post";
  }

  return cleaned.slice(0, 120);
}

function parseTikTokVideo(card) {
  const href = String(card?.href || "").trim();
  const videoId = String(card?.videoId || extractVideoId(href) || "").trim();
  const caption = normalizeText(card?.caption || card?.description || "");
  const authorUsername = normalizeText(card?.authorUsername || "");
  const title = buildTitle(caption, authorUsername);
  const eventDate = extractEventDate(caption);
  const now = new Date().toISOString();

  if (!videoId || (!caption && !title)) {
    return null;
  }

  const event = {
    platform: "tiktok",
    postId: videoId,
    title,
    date: eventDate || null,
    eventDate: eventDate || null,
    location: extractLocation(caption) || "",
    organizer: extractOrganizer(caption, authorUsername),
    description: caption || title,
    imageUrl: String(card?.thumbnailUrl || "").trim(),
    sourceUrl: buildSourceUrl(href),
    scrapedAt: now,
    createdAt: now,
  };

  const result = eventSchema.safeParse(event);
  return result.success ? result.data : null;
}

module.exports = {
  parseTikTokVideo,
  extractVideoId,
  extractOrganizer,
};