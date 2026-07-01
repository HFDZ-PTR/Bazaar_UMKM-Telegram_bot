function escapeMarkdown(text = "") {
  return String(text)
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

function formatEventMessage(event) {
  const lines = [
    `*${escapeMarkdown(event.title)}*`,
    `Platform: ${escapeMarkdown(event.platform)}`,
    `Date: ${escapeMarkdown(event.date)}`,
  ];

  if (event.location) {
    lines.push(`Location: ${escapeMarkdown(event.location)}`);
  }

  if (event.organizer) {
    lines.push(`Organizer: ${escapeMarkdown(event.organizer)}`);
  }

  if (event.description) {
    lines.push(`\n${escapeMarkdown(event.description)}`);
  }

  if (event.sourceUrl) {
    lines.push(`\nSource: ${escapeMarkdown(event.sourceUrl)}`);
  }

  return lines.join("\n");
}

module.exports = {
  escapeMarkdown,
  formatEventMessage,
};
