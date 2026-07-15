// src/services/bot.service.js
const logger = require("../utils/logger");
const { CONFIG } = require("../config");
const { runAllScrapers } = require("../scrapers");
const { closeBrowser } = require("./browser.service");
const { cleanupExpiredEvents } = require("./cleanup.service");
const { syncTelegramTargetsFromUpdates } = require("./telegram.service");
const { selectCycleHashtags } = require("./hashtag-rotation.service");

const intervalMs = CONFIG.scrapeIntervalMinutes * 60 * 1000;

const state = {
  startedAt: null,
  lastScrapeAt: null,
  lastCleanupAt: null,
  lastRunAt: null,
  lastTelegramSyncAt: null,
  lastError: null,
  lastTelegramSyncError: null,
  cycleCount: 0,
  isRunning: false,
  isStopping: false,
  nextRunAt: null,
  lastSelectedHashtags: null,
  lastCycleSummary: null,
};

let timer = null;
let currentRunPromise = null;

function clearScheduledTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNextRun() {
  if (state.isStopping) {
    state.nextRunAt = null;
    return;
  }

  clearScheduledTimer();

  const nextRunDate = new Date(Date.now() + intervalMs);
  state.nextRunAt = nextRunDate.toISOString();

  timer = setTimeout(() => {
    void executeCycle();
  }, intervalMs);
}

async function syncTelegramTargetsSafely() {
  try {
    const registeredTargets = await syncTelegramTargetsFromUpdates();

    state.lastTelegramSyncAt = new Date().toISOString();
    state.lastTelegramSyncError = null;

    if (registeredTargets.length > 0) {
      logger.info(
        {
          registeredCount: registeredTargets.length,
          targets: registeredTargets.map((target) => ({
            id: target.id,
            type: target.type,
            title: target.title,
            username: target.username,
            source: target.source,
          })),
        },
        "telegram targets synced before scrape cycle",
      );
    }

    return {
      ok: true,
      registeredCount: registeredTargets.length,
      targets: registeredTargets,
    };
  } catch (error) {
    state.lastTelegramSyncError = error.message;

    logger.error(
      {
        err: error,
      },
      "failed to sync telegram targets",
    );

    return {
      ok: false,
      error: error.message,
      registeredCount: 0,
      targets: [],
    };
  }
}

async function executeCycle() {
  if (state.isRunning) {
    logger.warn("bot cycle skipped because previous cycle is still running");
    return { skipped: true };
  }

  state.isRunning = true;
  state.lastRunAt = new Date().toISOString();

  try {
    logger.info(
      {
        cycleNumber: state.cycleCount + 1,
        intervalMinutes: CONFIG.scrapeIntervalMinutes,
      },
      "bot cycle started",
    );

    const telegramSyncResult = await syncTelegramTargetsSafely();

    let cleanupResult = null;

    try {
      cleanupResult = await cleanupExpiredEvents();
      state.lastCleanupAt = new Date().toISOString();

      logger.info(
        {
          cleanupResult,
        },
        "expired event cleanup completed",
      );
    } catch (error) {
      state.lastError = error.message;

      logger.error(
        {
          err: error,
        },
        "cleanup failed",
      );
    }

    const selectedHashtags = await selectCycleHashtags();
    state.lastSelectedHashtags = selectedHashtags;

    logger.info(
      {
        selectedHashtags,
      },
      "selected hashtags for scrape cycle",
    );

    await runAllScrapers(selectedHashtags);

    state.lastScrapeAt = new Date().toISOString();
    state.lastError = null;
    state.cycleCount += 1;

    const result = {
      ok: true,
      cleanupResult,
      telegramSyncResult,
      lastScrapeAt: state.lastScrapeAt,
      selectedHashtags,
      cycleCount: state.cycleCount,
    };

    state.lastCycleSummary = result;

    logger.info(
      {
        cycleCount: state.cycleCount,
        lastScrapeAt: state.lastScrapeAt,
      },
      "bot cycle completed",
    );

    return result;
  } catch (error) {
    state.lastError = error.message;
    state.lastCycleSummary = {
      ok: false,
      error: error.message,
      at: new Date().toISOString(),
    };

    logger.error(
      {
        err: error,
      },
      "bot cycle failed",
    );

    throw error;
  } finally {
    state.isRunning = false;

    await closeBrowser().catch((error) => {
      logger.warn(
        {
          err: error,
        },
        "failed to close browser after cycle",
      );
    });

    if (!state.isStopping) {
      scheduleNextRun();
    } else {
      state.nextRunAt = null;
    }
  }
}

function runCycle() {
  if (!currentRunPromise) {
    currentRunPromise = executeCycle().finally(() => {
      currentRunPromise = null;
    });
  }

  return currentRunPromise;
}

async function start() {
  if (!state.startedAt) {
    state.startedAt = new Date().toISOString();
  }

  state.isStopping = false;
  state.lastError = null;

  logger.info(
    {
      intervalMinutes: CONFIG.scrapeIntervalMinutes,
      intervalHours: CONFIG.scrapeIntervalHours,
      runBotWithApi: CONFIG.runBotWithApi,
    },
    "bot service starting",
  );

  await runCycle().catch(() => {});
  return getStatus();
}

async function stop() {
  state.isStopping = true;

  logger.info("bot service stopping");

  clearScheduledTimer();

  if (currentRunPromise) {
    try {
      await currentRunPromise;
    } catch {
      // ignore cycle error during shutdown
    }
  }

  await closeBrowser().catch((error) => {
    logger.warn(
      {
        err: error,
      },
      "failed to close browser during shutdown",
    );
  });

  state.isRunning = false;
  state.nextRunAt = null;

  logger.info("bot service stopped");

  return getStatus();
}

async function runOnce() {
  if (state.isRunning) {
    logger.warn("runOnce skipped because cycle is already running");
    return { skipped: true };
  }

  return runCycle();
}

function getStatus() {
  return {
    startedAt: state.startedAt,
    lastScrapeAt: state.lastScrapeAt,
    lastCleanupAt: state.lastCleanupAt,
    lastRunAt: state.lastRunAt,
    lastTelegramSyncAt: state.lastTelegramSyncAt,
    lastError: state.lastError,
    lastTelegramSyncError: state.lastTelegramSyncError,
    cycleCount: state.cycleCount,
    isRunning: state.isRunning,
    isStopping: state.isStopping,
    nextRunAt: state.nextRunAt,
    intervalHours: CONFIG.scrapeIntervalHours,
    intervalMinutes: CONFIG.scrapeIntervalMinutes,
    intervalLabel: CONFIG.scrapeIntervalLabel,
    lastSelectedHashtags: state.lastSelectedHashtags,
    lastCycleSummary: state.lastCycleSummary,
  };
}

module.exports = {
  start,
  stop,
  runOnce,
  getStatus,
};
