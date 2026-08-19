// src/formatters/event.formatter.js — label pesan dalam Bahasa Indonesia
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

function normalizeText(value = "") {
  return sanitizeTelegramText(value)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeMarkdown(value = "") {
  return sanitizeTelegramText(value)
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

function truncateText(value = "", maxLength = 280) {
  const text = normalizeText(value);
  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function removeRepeatedTitle(description = "", title = "") {
  const body = normalizeText(description);
  const heading = normalizeText(title);

  if (!body || !heading) {
    return body;
  }

  const normalizedBody = body
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const normalizedHeading = heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  if (!normalizedHeading) {
    return body;
  }

  if (normalizedBody.startsWith(normalizedHeading)) {
    return body.slice(heading.length).trim();
  }

  return body;
}

function addLine(lines, value) {
  if (value && String(value).trim()) {
    lines.push(value);
  }
}

function addSpacer(lines) {
  if (lines.length > 0 && lines[lines.length - 1] !== "") {
    lines.push("");
  }
}

function formatTanggal(value = "") {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return text;
  }

  const [, tahun, bulan, hari] = match;
  return `${hari}-${bulan}-${tahun}`;
}

function formatPostedAtLine(event) {
  if (!event.postedAt) {
    return "";
  }

  return `Diposting: ${escapeMarkdown(formatTanggal(event.postedAt))}`;
}

/**
 * PENTING: baris "Tanggal" WAJIB hanya memakai event.eventDate (tanggal asli
 * dari caption), bukan event.date. Kolom "date" di database adalah fallback
 * INTERNAL untuk kebutuhan cleanup/retention (lihat cleanup.service.js) dan
 * TIDAK merepresentasikan tanggal acara sungguhan — kalau ditampilkan ke user
 * seolah-olah itu tanggal acara, hasilnya menyesatkan (contoh: video TikTok
 * tanpa caption jadi terlihat punya tanggal padahal itu cuma tanggal scrape).
 */
function formatTanggalLine(event) {
  if (event.eventDate) {
    return `Tanggal acara: ${escapeMarkdown(formatTanggal(event.eventDate))}`;
  }

  return "Tanggal acara: Tidak disebutkan di caption";
}

function buildTikTokMessage(event, options = {}) {
  const description = options.truncateDescription
    ? truncateText(event.description, options.maxDescriptionLength || 220)
    : normalizeText(event.description);

  const lines = [];

  addLine(
    lines,
    `Postingan TikTok oleh ${escapeMarkdown(event.organizer || "tidak diketahui")}`,
  );
  addLine(lines, `Platform: ${escapeMarkdown(event.platform || "")}`);
  addLine(lines, formatTanggalLine(event));
  addLine(lines, formatPostedAtLine(event));

  if (event.location) {
    addLine(lines, `Lokasi: ${escapeMarkdown(event.location)}`);
  }

  if (description) {
    addSpacer(lines);
    addLine(lines, escapeMarkdown(description));
  }

  if (event.sourceUrl) {
    addSpacer(lines);
    addLine(lines, `Sumber: ${escapeMarkdown(event.sourceUrl)}`);
  }

  return lines.join("\n");
}

function buildDefaultMessage(event, options = {}) {
  const rawDescription = options.truncateDescription
    ? truncateText(event.description, options.maxDescriptionLength || 220)
    : normalizeText(event.description);

  const description = removeRepeatedTitle(rawDescription, event.title);
  const lines = [];

  addLine(lines, `*${escapeMarkdown(event.title || "")}*`);
  addLine(lines, `Platform: ${escapeMarkdown(event.platform || "")}`);
  addLine(lines, formatTanggalLine(event));
  addLine(lines, formatPostedAtLine(event));

  if (event.location) {
    addLine(lines, `Lokasi: ${escapeMarkdown(event.location)}`);
  }

  if (event.organizer) {
    addLine(lines, `Penyelenggara: ${escapeMarkdown(event.organizer)}`);
  }

  if (description) {
    addSpacer(lines);
    addLine(lines, escapeMarkdown(description));
  }

  if (event.sourceUrl) {
    addSpacer(lines);
    addLine(lines, `Sumber: ${escapeMarkdown(event.sourceUrl)}`);
  }

  return lines.join("\n");
}

function formatEventMessage(event) {
  return String(event.platform || "").toLowerCase() === "tiktok"
    ? buildTikTokMessage(event)
    : buildDefaultMessage(event);
}

function formatPhotoCaption(event, maxDescriptionLength = 220) {
  return String(event.platform || "").toLowerCase() === "tiktok"
    ? buildTikTokMessage(event, {
        truncateDescription: true,
        maxDescriptionLength,
      })
    : buildDefaultMessage(event, {
        truncateDescription: true,
        maxDescriptionLength,
      });
}

module.exports = {
  escapeMarkdown,
  formatEventMessage,
  formatPhotoCaption,
  formatTanggal,
  sanitizeTelegramText,
  toWellFormedText,
};
