const DAY_MS = 24 * 60 * 60 * 1000;

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

function toIsoDateString(date) {
  return date.toISOString().slice(0, 10);
}

function parseEventDateString(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractEventDateFromText(text) {
  const source = String(text || "");

  const idMatch = source.match(
    /(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/i,
  );
  if (idMatch) {
    const day = idMatch[1].padStart(2, "0");
    const month = MONTH_ID[idMatch[2].toLowerCase()];
    const year = idMatch[3];
    return `${year}-${month}-${day}`;
  }

  const dmyMatch = source.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  const isoMatch = source.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0];
  }

  return null;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function isExpiredEventDate(eventDate, retentionDays, now = new Date()) {
  const parsed = parseEventDateString(eventDate);
  if (!parsed) {
    return false;
  }

  return now.getTime() >= addDays(parsed, retentionDays).getTime();
}

module.exports = {
  DAY_MS,
  toIsoDateString,
  parseEventDateString,
  extractEventDateFromText,
  addDays,
  isExpiredEventDate,
};
