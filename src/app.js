// src/app.js
const logger = require("./utils/logger");
const { CONFIG } = require("./config");
const app = require("./api/server");
const botService = require("./services/bot.service");

let server = null;
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, "shutting down application");

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }

    await botService.stop();
  } catch (error) {
    logger.error({ err: error, signal }, "shutdown failed");
  }
}

function registerShutdown(signal) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

async function start() {
  logger.info(
    {
      port: CONFIG.port,
      runBotWithApi: CONFIG.runBotWithApi,
      scrapeIntervalHours: CONFIG.scrapeIntervalHours,
    },
    "starting api server",
  );

  server = await app.start();

  if (CONFIG.runBotWithApi) {
    void botService.start().catch((error) => {
      logger.error({ err: error }, "bot worker failed during combined startup");
    });
  }

  registerShutdown("SIGINT");
  registerShutdown("SIGTERM");
}

start().catch((error) => {
  logger.error({ err: error }, "application startup failed");
  process.exit(1);
});