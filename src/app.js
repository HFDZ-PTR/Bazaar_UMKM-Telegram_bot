// src/app.js
const logger = require("./utils/logger");
const { CONFIG } = require("./config");
const app = require("./api/server");
const botService = require("./services/bot.service");

let server;

async function shutdown(signal) {
  logger.info({ signal }, "shutting down application");

  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }

  await botService.stop();
}

async function start() {
  logger.info(
    {
      port: CONFIG.port,
      runBotWithApi: CONFIG.runBotWithApi,
      scrapeIntervalHours: CONFIG.scrapeIntervalHours,
    },
    "starting umkm-bazaar-bot api",
  );

  server = await app.start();

  if (CONFIG.runBotWithApi) {
    void botService.start().catch((error) => {
      logger.error(
        { err: error },
        "bot worker failed during combined startup",
      );
    });
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT").finally(() => process.exit(0));
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM").finally(() => process.exit(0));
  });
}

start().catch((error) => {
  logger.error({ error }, "application startup failed");
  process.exit(1);
});