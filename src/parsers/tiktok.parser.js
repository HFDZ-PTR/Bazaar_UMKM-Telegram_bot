// src/parsers/tiktok.parser.js — versi wajib caption + fallback posted date
const { eventSchema } = require("../config");
const {
  extractLocation,
  extractEventDate,
  MIN_CAPTION_LENGTH,
} = require("./instagram.parser");
const { extractRegion } = require("../utils/region");

function toWellFormedText(value = "") {
  const text = String(value ?? "");

  if (typeof text.toWellFormed === "function") {
    return text.toWellFormed();
  }

  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "�",
  );
}

function stripWeirdUnicode(value = "") {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeInlineText(value = "") {
  return stripWeirdUnicode(
    toWellFormedText(value).replace(/\r/g, "").replace(/\s+/g, " ").trim(),
  );
}

function normalizeMultilineText(value = "") {
  return stripWeirdUnicode(
    toWellFormedText(value)
      .replace(/\r/g, "")
      .replace(/\t/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractVideoId(href = "") {
  const match = String(href).match(/\/video\/(\d+)/);
  return match ? match[1] : "";
}

function extractOrganizer(text = "", authorUsername = "") {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => normalizeInlineText(line))
    .filter(Boolean);

  for (const line of lines) {
    const labeledOrganizer = line.match(
      /^(?:organizer|organiser|penyelenggara|hosted by|by)\s*[:\-]\s*(.+)$/i,
    );
    if (labeledOrganizer?.[1]) {
      return normalizeInlineText(labeledOrganizer[1]);
    }

    const handleMatch = line.match(/\bby\s+@([a-z0-9._]+)/i);
    if (handleMatch?.[1]) {
      return `@${handleMatch[1]}`;
    }
  }

  return authorUsername ? `@${authorUsername.replace(/^@/, "")}` : "";
}

function buildSourceUrl(href = "") {
  if (!href) {
    return "";
  }

  return href.startsWith("http")
    ? href
    : new URL(href, "https://www.tiktok.com").toString();
}

function cleanTikTokDescription(text = "") {
  const raw = normalizeMultilineText(text);
  if (!raw) {
    return "";
  }

  const compact = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([.!?])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(#)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d{1,2}\.\d{2})/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();

  const lines = compact
    .split("\n")
    .map((line) => normalizeInlineText(line))
    .filter(Boolean);

  const cleaned = [];
  const seen = new Set();

  for (const line of lines) {
    if (
      /^TikTok post by\s+/i.test(line) ||
      /^Source\s*:/i.test(line) ||
      /^Platform\s*:/i.test(line) ||
      /^Date\s*:/i.test(line) ||
      /^https?:\/\//i.test(line)
    ) {
      continue;
    }

    const key = line.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    cleaned.push(line);
  }

  return cleaned.join("\n").trim();
}

/**
 * @param {object} card - hasil scrape TikTok, WAJIB punya caption.
 *                         Card tanpa caption menghasilkan null (ditolak).
 *                         card.postedAt (opsional, ISO YYYY-MM-DD) dipakai
 *                         sebagai FALLBACK saat caption tidak punya tanggal
 *                         event eksplisit.
 */
function parseTikTokVideo(card) {
  const href = String(card?.href || "").trim();
  const videoId = String(card?.videoId || extractVideoId(href)).trim();

  if (!videoId) {
    return null;
  }

  const caption = normalizeMultilineText(
    card?.caption || card?.description || "",
  );

  const authorUsername = normalizeInlineText(card?.authorUsername || "");

  const description = cleanTikTokDescription(caption);

  // Caption/description wajib ada dan cukup panjang.
  // Kalau tidak, video ini TIDAK disimpan dan TIDAK dikirim ke Telegram.
  if (!description || description.length < MIN_CAPTION_LENGTH) {
    return null;
  }

  const captionEventDate = extractEventDate(caption);
  const now = new Date().toISOString();
  const location = extractLocation(caption);
  const region = extractRegion(location, caption, card?.sourceHashtag);

  const postedAt = card?.postedAt || null;

  // Fallback: kalau caption tidak punya tanggal eksplisit,
  // pakai tanggal upload asli sebagai referensi tanggal (BUKAN tanggal
  // acara). Kolom eventDate tetap null supaya tidak masuk web calendar
  // secara keliru.
  const finalDate = captionEventDate || postedAt || null;
  const dateSource = captionEventDate
    ? "caption"
    : postedAt
      ? "posted_at"
      : null;

  const event = {
    platform: "tiktok",
    postId: videoId,
    title: authorUsername
      ? `TikTok post by @${authorUsername.replace(/^@/, "")}`
      : "TikTok post",

    date: finalDate,
    eventDate: captionEventDate || null,
    postedAt,
    dateSource,

    location,
    region,
    organizer: extractOrganizer(caption, authorUsername),
    description,
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
