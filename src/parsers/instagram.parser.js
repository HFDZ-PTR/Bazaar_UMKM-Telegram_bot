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

function normalizeInlineText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultilineText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLocationCandidate(value) {
  let candidate = normalizeInlineText(value);

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

function extractOrganizer(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(
      /^(?:organizer|organiser|penyelenggara|hosted by|diselenggarakan oleh|oleh)\s*[:\-]\s*(.+)$/i,
    );
    if (match?.[1]) {
      return normalizeInlineText(match[1]);
    }
  }

  return "";
}

function extractEventDate(text) {
  return extractEventDateFromText(text);
}

function buildTitle(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeInlineText(line))
    .filter(Boolean);

  for (const line of lines) {
    if (
      /^#/.test(line) ||
      /^(?:📍|lokasi|tempat|venue|location|📅|date|tanggal|jam|waktu)\b/i.test(line)
    ) {
      continue;
    }

    if (line.length >= 8) {
      return line.slice(0, 120);
    }
  }

  return normalizeInlineText(text).slice(0, 120);
}

function buildDescription(text) {
  return normalizeMultilineText(text);
}

function parseInstagramPost(href, caption, imgSrc) {
  const postId = href.split("/").filter(Boolean).pop() || href;
  const normalizedCaption = normalizeMultilineText(caption);

  if (!normalizedCaption) {
    return null;
  }

  const parsedEventDate = extractEventDate(normalizedCaption);
  const title = buildTitle(normalizedCaption);
  const description = buildDescription(normalizedCaption);

  return {
    platform: "instagram",
    postId,
    title,
    date: parsedEventDate || new Date().toISOString().slice(0, 10),
    eventDate: parsedEventDate,
    location: extractLocation(normalizedCaption),
    organizer: extractOrganizer(normalizedCaption),
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