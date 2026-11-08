// src/utils/fingerprint.js
const crypto = require("crypto");

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

function extractTitleCore(title = "") {
  return normalizeForFingerprint(title)
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createContentFingerprint({
  title = "",
  eventDate = "",
  location = "",
}) {
  const titleCore = extractTitleCore(title);
  const normalizedLocation = normalizeForFingerprint(location);
  const normalizedDate = String(eventDate || "").trim();

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