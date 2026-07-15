// src/services/queue.service.js
const PQueueModule = require("p-queue");
const { CONFIG } = require("../config");

const PQueue = PQueueModule.default || PQueueModule;

const queue = new PQueue({
  concurrency: CONFIG.telegramQueueConcurrency,
  intervalCap: CONFIG.telegramQueueIntervalCap,
  interval: CONFIG.telegramQueueIntervalMs,
  carryoverConcurrencyCount: true,
});

function addJob(job) {
  return queue.add(job);
}

module.exports = {
  queue,
  addJob,
};
