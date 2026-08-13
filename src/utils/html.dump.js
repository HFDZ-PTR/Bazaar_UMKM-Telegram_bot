// src/utils/html.dump.js
const fs = require("fs").promises;
const path = require("path");
const { CONFIG } = require("../config");
const { ensureDirectory } = require("../services/storage.service");
const logger = require("./logger");

function sanitizeDumpName(value) {
  return (
    String(value || "debug")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "debug"
  );
}

async function dumpHtml(name, html) {
  if (String(process.env.DEBUG_HTML_DUMP || "").trim() !== "1") {
    return null;
  }

  const safeName = sanitizeDumpName(name);
  const filePath = path.join(CONFIG.dataDir, "debug", `${safeName}.html`);

  await ensureDirectory(filePath);
  await fs.writeFile(filePath, String(html || ""), "utf8");

  logger.info({ filePath, dumpName: safeName }, "html dump saved");
  return filePath;
}

module.exports = {
  dumpHtml,
};
