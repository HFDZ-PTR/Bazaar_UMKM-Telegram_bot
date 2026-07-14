// src/formatters/event.formatter.js
function toWellFormedText(value = "") {
  const text = String(value ?? "");

  if (typeof text.toWellFormed === "function") {
    return text.toWellFormed();
  }

  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "�",
  );
}

function sanitizeTelegramText(value = "") {
  return toWellFormedText(value)
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .trim();
}

function escapeMarkdown(text = "") {
  return sanitizeTelegramText(text)
    .replace(/\\/g, "\\\\")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}

function normalizeText(text = "") {
  return sanitizeTelegramText(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(text = "", maxLength = 280) {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function stripDuplicatedPrefix(description = "", title = "") {
  const cleanDescription = normalizeText(description);
  const cleanTitle = normalizeText(title);

  if (!cleanDescription || !cleanTitle) {
    return cleanDescription;
  }

  const normalizedDescription = cleanDescription
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  const normalizedTitle = cleanTitle
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  if (!normalizedTitle) {
    return cleanDescription;
  }

  if (normalizedDescription.startsWith(normalizedTitle)) {
    return cleanDescription.slice(cleanTitle.length).trim();
  }

  return cleanDescription;
}

function pushLine(lines, value) {
  if (value && String(value).trim()) {
    lines.push(value);
  }
}

function pushBlankLine(lines) {
  if (lines.length > 0 && lines[lines.length - 1] !== "") {
    lines.push("");
  }
}

function formatTikTokLines(event, options = {}) {
  const organizer = normalizeText(event.organizer || "");
  const eventDate = event.eventDate || event.date || "";
  const description = options.truncateDescription
    ? truncateText(event.description || "", options.maxDescriptionLength || 220)
    : normalizeText(event.description || "");

  const lines = [];
  pushLine(lines, `TikTok post by ${escapeMarkdown(organizer || "unknown")}`);
  pushLine(lines, `Platform: ${escapeMarkdown(event.platform || "")}`);

  if (eventDate) {
    pushLine(lines, `Date: ${escapeMarkdown(eventDate)}`);
  }

  if (event.location) {
    pushLine(lines, `Location: ${escapeMarkdown(event.location)}`);
  }

  if (description) {
    pushBlankLine(lines);
    pushLine(lines, escapeMarkdown(description));
  }

  if (event.sourceUrl) {
    pushBlankLine(lines);
    pushLine(lines, `Source: ${escapeMarkdown(event.sourceUrl)}`);
  }

  return lines;
}

function formatDefaultLines(event, options = {}) {
  const eventDate = event.eventDate || event.date || "";
  const rawDescription = options.truncateDescription
    ? truncateText(event.description || "", options.maxDescriptionLength || 220)
    : normalizeText(event.description || "");

  const description = stripDuplicatedPrefix(rawDescription, event.title || "");
  const lines = [];

  pushLine(lines, `*${escapeMarkdown(event.title || "")}*`);
  pushLine(lines, `Platform: ${escapeMarkdown(event.platform || "")}`);

  if (eventDate) {
    pushLine(lines, `Date: ${escapeMarkdown(eventDate)}`);
  }

  if (event.location) {
    pushLine(lines, `Location: ${escapeMarkdown(event.location)}`);
  }

  if (event.organizer) {
    pushLine(lines, `Organizer: ${escapeMarkdown(event.organizer)}`);
  }

  if (description) {
    pushBlankLine(lines);
    pushLine(lines, escapeMarkdown(description));
  }

  if (event.sourceUrl) {
    pushBlankLine(lines);
    pushLine(lines, `Source: ${escapeMarkdown(event.sourceUrl)}`);
  }

  return lines;
}

function formatEventMessage(event) {
  const platform = String(event.platform || "").toLowerCase();

  if (platform === "tiktok") {
    return formatTikTokLines(event).join("\n");
  }

  return formatDefaultLines(event).join("\n");
}

function formatPhotoCaption(event, maxDescriptionLength = 220) {
  const platform = String(event.platform || "").toLowerCase();

  if (platform === "tiktok") {
    return formatTikTokLines(event, {
      truncateDescription: true,
      maxDescriptionLength,
    }).join("\n");
  }

  return formatDefaultLines(event, {
    truncateDescription: true,
    maxDescriptionLength,
  }).join("\n");
}

module.exports = {
  escapeMarkdown,
  formatEventMessage,
  formatPhotoCaption,
  sanitizeTelegramText,
  toWellFormedText,
};
