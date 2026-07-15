// src/utils/retry.js
const PRetryModule = require("p-retry");
const { CONFIG } = require("../config");

const pRetry = PRetryModule.default || PRetryModule;

function retryOperation(operation, options = {}) {
  return pRetry(operation, {
    retries: options.retries ?? CONFIG.telegramRetryAttempts - 1,
    factor: options.factor ?? 2,
    minTimeout: options.minTimeout ?? CONFIG.telegramRetryMinTimeoutMs,
    onFailedAttempt:
      typeof options.onFailedAttempt === "function"
        ? options.onFailedAttempt
        : () => {},
  });
}

module.exports = {
  retryOperation,
};