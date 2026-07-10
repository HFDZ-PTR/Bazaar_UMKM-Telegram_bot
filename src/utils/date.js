// src/utils/date.js
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

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidYmd(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }

  if (m < 1 || m > 12 || d < 1) {
    return false;
  }

  const daysInMonth = [
    31,
    isLeapYear(y) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return d <= daysInMonth[m - 1];
}

function buildIsoDate(year, month, day) {
  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  if (!isValidYmd(yyyy, mm, dd)) {
    return null;
  }

  return `${yyyy}-${mm}-${dd}`;
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
    const iso = buildIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
    return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const iso = buildIsoDate(slashMatch[3], slashMatch[2], slashMatch[1]);
    return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
  }

  const idMatch = trimmed.match(
    /^(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})$/i,
  );
  if (idMatch) {
    const month = MONTH_ID[idMatch[2].toLowerCase()];
    const iso = buildIsoDate(idMatch[3], month, idMatch[1]);
    return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
  }

  return null;
}

function extractEventDateFromText(text) {
  const source = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) {
    return null;
  }

  const rangeSameMonthMatch = source.match(
    /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/i,
  );
  if (rangeSameMonthMatch) {
    const month = MONTH_ID[rangeSameMonthMatch[3].toLowerCase()];
    return buildIsoDate(rangeSameMonthMatch[4], month, rangeSameMonthMatch[1]);
  }

  const singleIdMatch = source.match(
    /(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/i,
  );
  if (singleIdMatch) {
    const month = MONTH_ID[singleIdMatch[2].toLowerCase()];
    return buildIsoDate(singleIdMatch[3], month, singleIdMatch[1]);
  }

  const dmyMatch = source.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    return buildIsoDate(dmyMatch[3], dmyMatch[2], dmyMatch[1]);
  }

  const isoMatch = source.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return buildIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
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
  MONTH_ID,
  toIsoDateString,
  parseEventDateString,
  extractEventDateFromText,
  addDays,
  isExpiredEventDate,
};