// src/utils/retry.js
const pRetryModule = require("p-retry");
const pRetry = pRetryModule.default || pRetryModule;
const {
  TELEGRAM_RETRY_ATTEMPTS,
  TELEGRAM_RETRY_MIN_TIMEOUT_MS,
} = require("../config/constants");

async function retryOperation(operation, options = {}) {
  return pRetry(operation, {
    retries: options.retries ?? TELEGRAM_RETRY_ATTEMPTS - 1,
    factor: options.factor ?? 2,
    minTimeout: options.minTimeout ?? TELEGRAM_RETRY_MIN_TIMEOUT_MS,
    onFailedAttempt:
      typeof options.onFailedAttempt === "function"
        ? options.onFailedAttempt
        : () => {},
  });
}

module.exports = {
  retryOperation,
};