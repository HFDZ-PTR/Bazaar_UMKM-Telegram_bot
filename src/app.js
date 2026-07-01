const logger = require("./utils/logger");
const { CONFIG } = require("./config");
const { runAllScrapers } = require("./scrapers");
const { closeBrowser } = require("./services/browser.service");

async function runCycle() {
  try {
    await runAllScrapers();
  } finally {
    await closeBrowser();
  }
}

async function start() {
  logger.info(
    { intervalHours: CONFIG.scrapeIntervalHours },
    "starting umkm-bazaar-bot",
  );

  await runCycle();
}

start().catch(async (error) => {
  logger.error({ error }, "application startup failed");
  await closeBrowser();
  process.exit(1);
});
