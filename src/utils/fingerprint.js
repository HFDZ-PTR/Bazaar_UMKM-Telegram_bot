// src/utils/fingerprint.js
const crypto = require("crypto");

// ID fingerprint untuk event (dipakai di kolom id)
function createFingerprint(platform, postId) {
  return crypto
    .createHash("sha256")
    .update(`${platform}:${postId}`)
    .digest("hex");
}

function normalizeForFingerprint(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ambil "inti" title dengan buang angka/tanggal yang mungkin beda-beda
 * antar post yang sebenarnya event yang sama.
 */
function extractTitleCore(title = "") {
  return normalizeForFingerprint(title)
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fingerprint konten: title-core + eventDate + location.
 * Dipakai untuk deteksi event yang sama diposting ulang dengan post_id berbeda.
 */
function createContentFingerprint({
  title = "",
  eventDate = "",
  location = "",
}) {
  const titleCore = extractTitleCore(title);
  const normalizedLocation = normalizeForFingerprint(location);
  const normalizedDate = String(eventDate || "").trim();

  // Kalau title-core terlalu pendek, jangan bikin fingerprint konten
  if (titleCore.length < 15) {
    return null;
  }

  const raw = `${titleCore}|${normalizedDate}|${normalizedLocation}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = {
  createFingerprint,
  normalizeForFingerprint,
  extractTitleCore,
  createContentFingerprint,
};