// src/utils/date.js
const DAY_MS = 24 * 60 * 60 * 1000;

// Nama bulan lengkap + singkatan umum yang dipakai UMKM di caption Instagram/TikTok
const MONTH_ID = {
  januari: "01",
  jan: "01",
  februari: "02",
  feb: "02",
  maret: "03",
  mar: "03",
  april: "04",
  apr: "04",
  mei: "05",
  juni: "06",
  jun: "06",
  juli: "07",
  jul: "07",
  agustus: "08",
  agu: "08",
  ags: "08",
  aug: "08",
  september: "09",
  sep: "09",
  sept: "09",
  oktober: "10",
  okt: "10",
  oct: "10",
  november: "11",
  nov: "11",
  desember: "12",
  des: "12",
  dec: "12",
};

// Diurutkan panjang-ke-pendek supaya "september" tidak kepotong jadi "sep" duluan
const MONTH_ALT = Object.keys(MONTH_ID)
  .sort((a, b) => b.length - a.length)
  .join("|");

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

function normalizeYear(rawYear) {
  if (rawYear.length === 4) return rawYear;
  const twoDigit = Number(rawYear);
  const century = twoDigit <= 69 ? 2000 : 1900;
  return String(century + twoDigit);
}

function buildIsoDate(year, month, day) {
  const y = normalizeYear(String(year));
  const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const [yy, mm, dd] = iso.split("-");
  return isValidYmd(yy, mm, dd) ? iso : null;
}

function monthNameToNumber(name) {
  return MONTH_ID[String(name).toLowerCase()] || null;
}

function parseEventDateString(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const text = value.trim();

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const iso = buildIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
    return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
  }

  const slashMatch = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (slashMatch) {
    const iso = buildIsoDate(slashMatch[3], slashMatch[2], slashMatch[1]);
    return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
  }

  const indoMatch = text.match(
    new RegExp(`^(\\d{1,2})\\s+(${MONTH_ALT})\\.?\\s+(\\d{4})$`, "i"),
  );
  if (indoMatch) {
    const iso = buildIsoDate(
      indoMatch[3],
      monthNameToNumber(indoMatch[2]),
      indoMatch[1],
    );
    return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
  }

  return null;
}

/**
 * Format: "31 Januari - 5 Februari 2023" (range lintas bulan, tahun di akhir)
 */
const RANGE_CROSS_MONTH_EXPLICIT_PATTERN = new RegExp(
  `(\\d{1,2})\\s+(${MONTH_ALT})\\.?\\s*[-–—]\\s*(\\d{1,2})\\s+(${MONTH_ALT})\\.?\\s+(\\d{4})`,
  "i",
);

/**
 * Format: "18 Februari – 25 Maret 2026" atau "13 Des 2025 – 4 Jan 2026"
 */
const RANGE_CROSS_PATTERN = new RegExp(
  `(\\d{1,2})\\s*(?:(${MONTH_ALT})\\.?\\s*(\\d{4})?)?\\s*(?:[-–—]|s\\.?d\\.?|sampai(?:\\s+dengan)?)\\s*(\\d{1,2})\\s+(${MONTH_ALT})\\.?\\s+(\\d{4})`,
  "i",
);

/**
 * Format: "3-5 Juli 2026" (range dalam bulan sama)
 */
const RANGE_SAME_MONTH_PATTERN = new RegExp(
  `(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s+(${MONTH_ALT})\\.?\\s+(\\d{4})`,
  "i",
);

const SINGLE_INDO_DATE_PATTERN = new RegExp(
  `(\\d{1,2})\\s+(${MONTH_ALT})\\.?\\s+(\\d{4})`,
  "i",
);

const DMY_PATTERN = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;
const ISO_PATTERN = /(\d{4})-(\d{2})-(\d{2})/;

function extractEventDateFromText(text = "") {
  const source = String(text).replace(/\s+/g, " ").trim();
  if (!source) {
    return null;
  }

  // 1. "31 Januari - 5 Februari 2023" (range lintas bulan, tahun di akhir)
  const crossMonthExplicit = source.match(RANGE_CROSS_MONTH_EXPLICIT_PATTERN);
  if (crossMonthExplicit) {
    const [, startDay, startMonthName, , endMonthName, year] =
      crossMonthExplicit;
    const month = monthNameToNumber(startMonthName);
    const iso = buildIsoDate(year, month, startDay);
    if (iso) return iso;
  }

  // 2. "18 Februari – 25 Maret 2026" atau "13 Des 2025 – 4 Jan 2026"
  const crossRange = source.match(RANGE_CROSS_PATTERN);
  if (crossRange) {
    const [, startDay, startMonthName, startYear, , endMonthName, endYear] =
      crossRange;
    const month = startMonthName
      ? monthNameToNumber(startMonthName)
      : monthNameToNumber(endMonthName);
    const year = startYear || endYear;
    const iso = buildIsoDate(year, month, startDay);
    if (iso) return iso;
  }

  // 3. "3-5 Juli 2026" (range dalam bulan sama)
  const sameMonthRange = source.match(RANGE_SAME_MONTH_PATTERN);
  if (sameMonthRange) {
    return buildIsoDate(
      sameMonthRange[4],
      monthNameToNumber(sameMonthRange[3]),
      sameMonthRange[1],
    );
  }

  // 4. "31 Januari 2023" (single date)
  const indoSingle = source.match(SINGLE_INDO_DATE_PATTERN);
  if (indoSingle) {
    return buildIsoDate(
      indoSingle[3],
      monthNameToNumber(indoSingle[2]),
      indoSingle[1],
    );
  }

  // 5. "31/01/2023" (DMY format)
  const dmyMatch = source.match(DMY_PATTERN);
  if (dmyMatch) {
    return buildIsoDate(dmyMatch[3], dmyMatch[2], dmyMatch[1]);
  }

  // 6. "2023-01-31" (ISO format)
  const isoMatch = source.match(ISO_PATTERN);
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
