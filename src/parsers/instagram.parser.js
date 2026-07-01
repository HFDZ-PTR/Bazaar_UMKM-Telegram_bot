const cheerio = require("cheerio");

// --- Location keywords (Indonesian + common venues) ---
const LOCATION_PATTERNS = [
  /^\s*(?:📍|lokasi|tempat|venue|location)\s*[:\-]?\s*(.+)$/i,
  /^\s*(?:di|at)\s*[:\-]?\s*(.+)$/i,
  /\b((?:jakarta|jkt|bandung|surabaya|bsd|tangerang|bekasi|depok|bogor|bintaro|kemang|senayan|sudirman|kuningan|monas|pik|kelapa\s*gading|yogyakarta|jogja|semarang|medan)\b(?:[^\n,#@]{0,40}))\b/i,
  /\b((?:mall|mal|plaza|gedung|hall|park|lapangan|parkir|taman|gbk|ice\s*bsd|jcc|jiexpo)\b(?:[^\n,#@]{0,40}))\b/i,
];

const LOCATION_STOP_PATTERNS = [
  /\p{Extended_Pictographic}.*/u,
  /\s+(?:#|@).*/,
  /\s+(?:📅|⏰|🕒|🗓️|🗓|⌚).*/u,
  /\s{2,}.*/,
  /\s+[•\-–—]\s+.*$/,
];

const MONTH_ID = {
  januari: "01",
  februari: "02",
  maret: "03",
  april: "04",
  mei: "05",
  juni: "06",
  juli: "07",
  agustus: "08",
  september: "09",
  oktober: "10",
  november: "11",
  desember: "12",
};

function extractLocation(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const pattern of LOCATION_PATTERNS) {
      const match = line.match(pattern);
      if (!match) {
        continue;
      }

      let candidate = match[1].replace(/\s+/g, " ").trim();
      for (const stopPattern of LOCATION_STOP_PATTERNS) {
        candidate = candidate.replace(stopPattern, "").trim();
      }

      candidate = candidate.replace(/^[\-:•\s]+/, "").trim();
      if (candidate.length >= 3) {
        return candidate;
      }
    }
  }

  return "";
}

function extractEventDate(text) {
  const idMatch = text.match(
    /(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/i,
  );
  if (idMatch) {
    const day = idMatch[1].padStart(2, "0");
    const month = MONTH_ID[idMatch[2].toLowerCase()];
    const year = idMatch[3];
    return `${year}-${month}-${day}`;
  }

  const dmyMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0];
  }

  return new Date().toISOString().slice(0, 10);
}

function parseInstagramPost(href, caption, imgSrc) {
  const postId = href.split("/").filter(Boolean).pop() || href;
  const normalizedCaption = (caption || "").replace(/\s+/g, " ").trim();

  if (!normalizedCaption) {
    return null;
  }

  const title = normalizedCaption.slice(0, 100);
  const description = normalizedCaption;

  return {
    platform: "instagram",
    postId,
    title,
    date: extractEventDate(normalizedCaption),
    location: extractLocation(normalizedCaption),
    organizer: "",
    description,
    imageUrl: imgSrc || "",
    sourceUrl: href.startsWith("/") ? `https://www.instagram.com${href}` : href,
  };
}

module.exports = {
  parseInstagramPost,
  extractLocation,
  extractEventDate,
};
