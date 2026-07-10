// src/parsers/instagram.parser.js
const { extractEventDateFromText } = require("../utils/date");

const LOCATION_PATTERNS = [
  /^\s*(?:📍|lokasi|tempat|venue|location)\s*[:\-]?\s*(.+)$/i,
  /\b(?:di|at)\s+((?:jakarta|jkt|bandung|surabaya|bsd|tangerang|bekasi|depok|bogor|bintaro|kemang|senayan|sudirman|kuningan|monas|pik|kelapa\s*gading|yogyakarta|jogja|semarang|medan)\b(?:[^\n,#@]{0,40})?)/i,
  /\b((?:mall|mal|plaza|gedung|hall|park|lapangan|parkir|taman|gbk|ice\s*bsd|jcc|jiexpo)\b(?:[^\n,#@]{0,40})?)/i,
];

const LOCATION_STOP_PATTERNS = [
  /\p{Extended_Pictographic}.*/u,
  /\s+(?:#|@).*/,
  /\s+(?:📅|⏰|🕒|🗓️|🗓|⌚).*/u,
  /\s{2,}.*/,
  /\s+[•\-–—]\s+.*$/,
];

function cleanLocationCandidate(value) {
  let candidate = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  for (const stopPattern of LOCATION_STOP_PATTERNS) {
    candidate = candidate.replace(stopPattern, "").trim();
  }

  candidate = candidate
    .replace(/^[\-:•\s]+/, "")
    .replace(/[|•·]+.*$/, "")
    .trim();

  return candidate;
}

function extractLocation(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const pattern of LOCATION_PATTERNS) {
      const match = line.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const candidate = cleanLocationCandidate(match[1]);
      if (candidate.length >= 3) {
        return candidate;
      }
    }
  }

  return "";
}

function extractEventDate(text) {
  return extractEventDateFromText(text);
}

function parseInstagramPost(href, caption, imgSrc) {
  const postId = href.split("/").filter(Boolean).pop() || href;
  const normalizedCaption = String(caption || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedCaption) {
    return null;
  }

  const parsedEventDate = extractEventDate(normalizedCaption);
  const title = normalizedCaption.slice(0, 100);
  const description = normalizedCaption;

  return {
    platform: "instagram",
    postId,
    title,
    date: parsedEventDate || new Date().toISOString().slice(0, 10),
    eventDate: parsedEventDate,
    location: extractLocation(normalizedCaption),
    organizer: "",
    description,
    imageUrl: imgSrc || "",
    sourceUrl: href.startsWith("/")
      ? `https://www.instagram.com${href}`
      : href,
  };
}

module.exports = {
  parseInstagramPost,
  extractLocation,
  extractEventDate,
};