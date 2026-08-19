// src/parsers/instagram.parser.js — versi wajib caption + fallback posted date
const { extractEventDateFromText } = require("../utils/date");
const { extractRegion } = require("../utils/region");

const LOCATION_LABEL_PATTERN =
  /(?:📍|🏢|🏟️|🕌|lokasi|tempat|venue|location)\s*[:\-]?\s*([^\n]+)/iu;

const LOCATION_CITY_PATTERN =
  /\b(?:di|at)\s+((?:jakarta|jkt|bandung|surabaya|bsd|tangerang|bekasi|depok|bogor|bintaro|kemang|senayan|sudirman|kuningan|monas|pik|kelapa\s*gading|yogyakarta|jogja|semarang|medan)\b[^\n#@]{0,40})/iu;

const LOCATION_VENUE_PATTERN =
  /\b((?:mall|mal|plaza|gedung|hall|park|lapangan|parkir|taman|gbk|ice\s*bsd|jcc|jiexpo)\b[^\n#@]{0,40})/iu;

const LOCATION_STOP_PATTERNS = [
  /\p{Extended_Pictographic}[\s\S]*/u,
  /(?:#|@)[\s\S]*/,
  /\b(?:tanggal|jam|waktu|pukul|pendaftaran|pelaksanaan)\b[\s\S]*/i,
  /\s{2,}[\s\S]*/,
  /\s+[•\-–—]\s+[\s\S]*/,
];

// Caption minimal harus punya panjang ini supaya dianggap informatif,
// bukan sekadar noise seperti "bazar" atau "info" saja.
const MIN_CAPTION_LENGTH = 20;

function normalizeInlineText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value = "") {
  return String(value)
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLocationCandidate(value = "") {
  let candidate = normalizeInlineText(value);

  for (const pattern of LOCATION_STOP_PATTERNS) {
    candidate = candidate.replace(pattern, "").trim();
  }

  return candidate
    .replace(/^[\-:•\s]+/, "")
    .replace(/[|•·]+[\s\S]*$/, "")
    .trim();
}

function isPlausibleLocation(candidate) {
  if (candidate.length < 3) return false;
  if (!/[A-Z]/.test(candidate) && candidate.length > 25) return false;
  return true;
}

function extractLocation(text = "") {
  const normalized = String(text).replace(/\r/g, "");

  const labelMatch = normalized.match(LOCATION_LABEL_PATTERN);
  if (labelMatch?.[1]) {
    const candidate = cleanLocationCandidate(labelMatch[1]);
    if (isPlausibleLocation(candidate)) {
      return candidate;
    }
  }

  const cityMatch = normalized.match(LOCATION_CITY_PATTERN);
  if (cityMatch?.[1]) {
    const candidate = cleanLocationCandidate(cityMatch[1]);
    if (isPlausibleLocation(candidate)) {
      return candidate;
    }
  }

  const venueMatch = normalized.match(LOCATION_VENUE_PATTERN);
  if (venueMatch?.[1]) {
    const candidate = cleanLocationCandidate(venueMatch[1]);
    if (isPlausibleLocation(candidate)) {
      return candidate;
    }
  }

  return "";
}

function extractOrganizer(text = "") {
  const lines = String(text)
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

function extractEventDate(text = "") {
  return extractEventDateFromText(text);
}

function buildTitle(text = "") {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => normalizeInlineText(line))
    .filter(Boolean);

  for (const line of lines) {
    if (
      /^#/.test(line) ||
      /^(?:📍|lokasi|tempat|venue|location|📅|date|tanggal|jam|waktu)\b/i.test(
        line,
      )
    ) {
      continue;
    }
    if (line.length >= 8) {
      return line.slice(0, 120);
    }
  }
  return normalizeInlineText(text).slice(0, 120);
}

/**
 * @param {string} href - path/URL post Instagram
 * @param {string} caption - caption asli dari halaman detail post.
 *                           WAJIB berisi teks, kalau kosong post ditolak.
 * @param {string} imgSrc - URL gambar thumbnail
 * @param {string} hashtag - hashtag sumber penemuan post ini (untuk logging saja,
 *                            TIDAK dipakai lagi sebagai fallback description).
 * @param {string|null} postedAt - tanggal upload asli (ISO YYYY-MM-DD),
 *                                 dipakai sebagai FALLBACK kalau caption
 *                                 tidak punya tanggal event eksplisit.
 */
function parseInstagramPost(
  href,
  caption,
  imgSrc = "",
  hashtag = "",
  postedAt = null,
) {
  const normalizedCaption = normalizeMultilineText(caption);

  const postId =
    String(href || "")
      .split("/")
      .filter(Boolean)
      .pop() || String(href || "");

  if (!postId) {
    return null;
  }

  // Caption wajib ada dan cukup panjang. Post tanpa caption informatif
  // TIDAK disimpan sama sekali, TIDAK dikirim ke Telegram.
  if (!normalizedCaption || normalizedCaption.length < MIN_CAPTION_LENGTH) {
    return null;
  }

  const sourceUrl = String(href || "").startsWith("/")
    ? `https://www.instagram.com${href}`
    : String(href || "");

  const captionEventDate = extractEventDate(normalizedCaption);
  const description = normalizedCaption;
  const title = buildTitle(normalizedCaption);
  const location = extractLocation(normalizedCaption);
  const region = extractRegion(location, normalizedCaption);

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

  return {
    platform: "instagram",
    postId,
    title,
    date: finalDate,
    eventDate: captionEventDate || null,
    postedAt: postedAt || null,
    dateSource,
    location,
    region,
    organizer: extractOrganizer(normalizedCaption),
    description,
    imageUrl: imgSrc || "",
    sourceUrl,
  };
}

module.exports = {
  parseInstagramPost,
  extractLocation,
  extractEventDate,
  MIN_CAPTION_LENGTH,
};
