const PQueueModule = require("p-queue");
const PQueue = PQueueModule.default || PQueueModule;
const {
  TELEGRAM_QUEUE_CONCURRENCY,
  TELEGRAM_QUEUE_INTERVAL_CAP,
  TELEGRAM_QUEUE_INTERVAL_MS,
} = require("../config/constants");

const queue = new PQueue({
  concurrency: TELEGRAM_QUEUE_CONCURRENCY,
  intervalCap: TELEGRAM_QUEUE_INTERVAL_CAP,
  interval: TELEGRAM_QUEUE_INTERVAL_MS,
  carryoverConcurrencyCount: true,
});

async function addJob(job) {
  return queue.add(job);
}

module.exports = {
  queue,
  addJob,
};
