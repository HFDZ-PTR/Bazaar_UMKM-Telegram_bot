// src/run-once.js
const logger = require("./utils/logger");
const botService = require("./services/bot.service");

async function start() {
  try {
    const result = await botService.runOnce();
    logger.info({ result }, "run once completed");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "run once failed");
    process.exit(1);
  }
}

start();