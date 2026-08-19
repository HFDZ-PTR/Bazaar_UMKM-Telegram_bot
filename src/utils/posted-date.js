// src/utils/posted-date.js
//
// Parser tanggal upload (posted date) dari halaman Instagram dan TikTok.
// Dipakai sebagai FALLBACK saat caption tidak punya tanggal event eksplisit.

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Instagram: <time datetime="2026-02-12T01:31:44.000Z">
 * Attribute datetime sudah absolute ISO, tinggal di-parse langsung.
 */
function parseInstagramPostedAt(datetimeAttr) {
  if (!datetimeAttr) {
    return null;
  }

  const date = new Date(datetimeAttr);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * TikTok: teks setelah "·" pada info postingan, contoh:
 *   "2-6"        -> bulan-tanggal, tanpa tahun (asumsikan tahun berjalan)
 *   "2024-10-2"  -> tahun-bulan-tanggal absolute
 *   "2d ago"     -> relatif dari waktu scraping
 *   "3h ago"     -> relatif dari waktu scraping
 */
function parseTikTokPostedAt(rawText, referenceDate = new Date()) {
  const text = String(rawText || "")
    .replace(/^·\s*/, "")
    .trim();

  if (!text) {
    return null;
  }

  // Format absolute: YYYY-M-D
  const absoluteMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (absoluteMatch) {
    const [, year, month, day] = absoluteMatch;
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Format relatif: "Nd ago", "Nh ago", "Nw ago", "Nmo ago", "Ny ago"
  const relativeMatch = text.match(
    /^(\d+)\s*(h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks|mo|month|months|y|yr|year|years)\s*ago$/i,
  );

  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const date = new Date(referenceDate.getTime());

    if (/^h/.test(unit)) {
      date.setUTCHours(date.getUTCHours() - amount);
    } else if (/^d/.test(unit)) {
      date.setUTCDate(date.getUTCDate() - amount);
    } else if (/^w/.test(unit)) {
      date.setUTCDate(date.getUTCDate() - amount * 7);
    } else if (/^mo/.test(unit)) {
      date.setUTCMonth(date.getUTCMonth() - amount);
    } else if (/^y/.test(unit)) {
      date.setUTCFullYear(date.getUTCFullYear() - amount);
    }

    return date;
  }

  // Format month-day tanpa tahun: "M-D"
  // TikTok memakai format ini untuk post di tahun berjalan (< 12 bulan).
  const monthDayMatch = text.match(/^(\d{1,2})-(\d{1,2})$/);
  if (monthDayMatch) {
    const [, month, day] = monthDayMatch;
    const year = referenceDate.getUTCFullYear();

    let date = new Date(Date.UTC(year, Number(month) - 1, Number(day)));

    // Kalau hasilnya di masa depan dibanding waktu scraping,
    // berarti post itu sebenarnya dari tahun lalu (TikTok tidak
    // menampilkan tahun untuk post dalam 12 bulan terakhir).
    if (date.getTime() > referenceDate.getTime()) {
      date = new Date(Date.UTC(year - 1, Number(month) - 1, Number(day)));
    }

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

module.exports = {
  toIsoDate,
  parseInstagramPostedAt,
  parseTikTokPostedAt,
};
