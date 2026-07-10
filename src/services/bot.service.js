// src/services/bot.service.js
const logger = require("../utils/logger");
const { CONFIG } = require("../config");
const { closeBrowser } = require("./browser.service");
const { cleanupExpiredEvents } = require("./cleanup.service");
const { runAllScrapers } = require("../scrapers");
const { syncTelegramTargetsFromUpdates } = require("./telegram.service");

const INTERVAL_MS = CONFIG.scrapeIntervalMinutes * 60 * 1000;

const state = {
  startedAt: null,
  lastScrapeAt: null,
  lastCleanupAt: null,
  lastRunAt: null,
  lastError: null,
  cycleCount: 0,
  isRunning: false,
  isStopping: false,
  nextRunAt: null,
};

let timer = null;
let currentRunPromise = null;

function scheduleNextRun() {
  if (state.isStopping) {
    return;
  }

  if (timer) {
    clearTimeout(timer);
  }

  state.nextRunAt = new Date(Date.now() + INTERVAL_MS).toISOString();
  timer = setTimeout(() => {
    void executeCycle();
  }, INTERVAL_MS);
}

async function executeCycle() {
  if (state.isRunning) {
    return { skipped: true };
  }

  state.isRunning = true;
  state.lastRunAt = new Date().toISOString();

  try {
    try {
      await syncTelegramTargetsFromUpdates();
    } catch (error) {
      logger.error({ err: error }, "telegram update sync failed");
    }

    let cleanupResult;

    try {
      cleanupResult = await cleanupExpiredEvents();
      state.lastCleanupAt = new Date().toISOString();
    } catch (error) {
      state.lastError = error.message;
      logger.error({ err: error }, "cleanup cycle failed");
    }

    await runAllScrapers();
    state.lastScrapeAt = new Date().toISOString();
    state.lastError = null;
    state.cycleCount += 1;

    return {
      ok: true,
      cleanupResult,
      lastScrapeAt: state.lastScrapeAt,
    };
  } catch (error) {
    state.lastError = error.message;
    logger.error({ err: error }, "bot cycle failed");
    throw error;
  } finally {
    state.isRunning = false;

    await closeBrowser().catch(() => {});

    if (!state.isStopping) {
      scheduleNextRun();
    }
  }
}

async function start() {
  if (state.startedAt && !state.isStopping) {
    return getStatus();
  }

  state.startedAt = state.startedAt || new Date().toISOString();
  state.isStopping = false;
  state.lastError = null;

  if (!currentRunPromise) {
    currentRunPromise = executeCycle().finally(() => {
      currentRunPromise = null;
    });
  }

  await currentRunPromise.catch(() => {});
  return getStatus();
}

async function stop() {
  state.isStopping = true;

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  if (currentRunPromise) {
    try {
      await currentRunPromise;
    } catch {
      // Shutdown should continue even if the cycle failed.
    }
  }

  await closeBrowser().catch(() => {});

  state.isRunning = false;
  state.nextRunAt = null;

  return getStatus();
}

async function runOnce() {
  if (state.isRunning) {
    return { skipped: true };
  }

  currentRunPromise = executeCycle().finally(() => {
    currentRunPromise = null;
  });

  return currentRunPromise;
}

function getStatus() {
  return {
    startedAt: state.startedAt,
    lastScrapeAt: state.lastScrapeAt,
    lastCleanupAt: state.lastCleanupAt,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    cycleCount: state.cycleCount,
    isRunning: state.isRunning,
    isStopping: state.isStopping,
    nextRunAt: state.nextRunAt,
    intervalHours: CONFIG.scrapeIntervalHours,
    intervalMinutes: CONFIG.scrapeIntervalMinutes,
    intervalLabel: CONFIG.scrapeIntervalLabel,
  };
}

module.exports = {
  start,
  stop,
  runOnce,
  getStatus,
};