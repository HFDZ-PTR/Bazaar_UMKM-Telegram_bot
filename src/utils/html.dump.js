const fs = require("fs").promises;
const path = require("path");
const { ensureDirectory } = require("./storage.service");
const { CONFIG } = require("../config");

async function dumpHtml(platform, html) {
  if (process.env.DEBUG_HTML_DUMP !== "1") {
    return null;
  }

  const debugDir = path.join(CONFIG.dataDir, "debug");
  const filePath = path.join(debugDir, `${platform}-latest.html`);
  await ensureDirectory(filePath);
  await fs.writeFile(filePath, html, "utf8");
  return filePath;
}

module.exports = {
  dumpHtml,
};
