// src/parsers/instagram.parser.js — versi perbaikan (fokus: extractLocation & alur judul)
const { extractEventDateFromText } = require("../utils/date");

// Prioritas 1: label eksplisit lokasi. TIDAK di-anchor ke awal baris (^) lagi,
// karena banyak caption menaruh emoji lokasi di tengah kalimat tanpa baris baru.
const LOCATION_LABEL_PATTERN =
  /(?:📍|🏢|🏟️|🕌|lokasi|tempat|venue|location)\s*[:\-]?\s*([^\n]+)/iu;

// Prioritas 2 (fallback): kota/wilayah dikenal setelah "di"/"at"
const LOCATION_CITY_PATTERN =
  /\b(?:di|at)\s+((?:jakarta|jkt|bandung|surabaya|bsd|tangerang|bekasi|depok|bogor|bintaro|kemang|senayan|sudirman|kuningan|monas|pik|kelapa\s*gading|yogyakarta|jogja|semarang|medan)\b[^\n#@]{0,40})/iu;

// Prioritas 3 (fallback terakhir): nama venue umum
const LOCATION_VENUE_PATTERN =
  /\b((?:mall|mal|plaza|gedung|hall|park|lapangan|parkir|taman|gbk|ice\s*bsd|jcc|jiexpo)\b[^\n#@]{0,40})/iu;

// Titik henti: berhenti begitu ketemu emoji lain, tag, atau pemisah — TIDAK mensyaratkan
// whitespace di depannya, karena banyak caption menempelkan emoji langsung tanpa spasi
// (contoh: "Poins Mall–Ground🗓️06 Desember").
const LOCATION_STOP_PATTERNS = [
  /\p{Extended_Pictographic}[\s\S]*/u,
  /(?:#|@)[\s\S]*/,
  /\b(?:tanggal|jam|waktu|pukul|pendaftaran|pelaksanaan)\b[\s\S]*/i,
  /\s{2,}[\s\S]*/,
  /\s+[•\-–—]\s+[\s\S]*/,
];

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
  // Minimal 3 karakter dan bukan cuma tanda baca/emoji sisa
  if (candidate.length < 3) return false;
  // Tolak kandidat yang didominasi huruf kecil di awal tanpa kapital sama sekali
  // (indikasi hasil potongan tengah kalimat, bukan nama tempat)
  if (!/[A-Z]/.test(candidate) && candidate.length > 25) return false;
  return true;
}

function extractLocation(text = "") {
  const normalized = String(text).replace(/\r/g, "");

  // Prioritas 1: cari label lokasi di SELURUH teks, bukan per baris.
  const labelMatch = normalized.match(LOCATION_LABEL_PATTERN);
  if (labelMatch?.[1]) {
    const candidate = cleanLocationCandidate(labelMatch[1]);
    if (isPlausibleLocation(candidate)) {
      return candidate;
    }
  }

  // Prioritas 2: kota dikenal
  const cityMatch = normalized.match(LOCATION_CITY_PATTERN);
  if (cityMatch?.[1]) {
    const candidate = cleanLocationCandidate(cityMatch[1]);
    if (isPlausibleLocation(candidate)) {
      return candidate;
    }
  }

  // Prioritas 3: venue umum
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

function parseInstagramPost(href, caption, imgSrc = "") {
  const normalizedCaption = normalizeMultilineText(caption);
  if (!normalizedCaption) {
    return null;
  }

  const postId =
    String(href || "").split("/").filter(Boolean).pop() || String(href || "");
  const sourceUrl = String(href || "").startsWith("/")
    ? `https://www.instagram.com${href}`
    : String(href || "");
  const eventDate = extractEventDate(normalizedCaption);

  return {
    platform: "instagram",
    postId,
    title: buildTitle(normalizedCaption),
    date: eventDate || new Date().toISOString().slice(0, 10),
    eventDate,
    location: extractLocation(normalizedCaption),
    organizer: extractOrganizer(normalizedCaption),
    description: normalizedCaption,
    imageUrl: imgSrc || "",
    sourceUrl,
  };
}

module.exports = {
  parseInstagramPost,
  extractLocation,
  extractEventDate,
};