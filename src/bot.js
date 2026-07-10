// src/bot.js
const logger = require("./utils/logger");
const botService = require("./services/bot.service");

async function start() {
  logger.info("starting bot worker");

  process.once("SIGINT", () => {
    void botService.stop().finally(() => process.exit(0));
  });

  process.once("SIGTERM", () => {
    void botService.stop().finally(() => process.exit(0));
  });

  await botService.start();
}

start().catch((error) => {
  logger.error({ err: error }, "bot worker failed to start");
  process.exit(1);
});