// src/bot.js
const logger = require("./utils/logger");
const botService = require("./services/bot.service");

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, "shutting down bot worker");

  try {
    await botService.stop();
  } catch (error) {
    logger.error({ err: error, signal }, "bot shutdown failed");
  }
}

function registerShutdown(signal) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

async function start() {
  logger.info("starting bot worker");

  registerShutdown("SIGINT");
  registerShutdown("SIGTERM");

  await botService.start();
}

start().catch((error) => {
  logger.error({ err: error }, "bot worker failed to start");
  process.exit(1);
});
