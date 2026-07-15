// src/utils/logger.js
const pino = require("pino");
const { CONFIG } = require("../config");

const isTerminal = process.stdout.isTTY;

let transport;

if (isTerminal) {
  try {
    transport = pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
        messageFormat: "{msg}",
        levelFirst: false,
        singleLine: false,
      },
    });
  } catch (error) {
    transport = undefined;
    process.stderr.write(
      `[WARN] pino-pretty unavailable, falling back to plain pino output: ${error.message}\n`,
    );
  }
}

const logger = pino(
  {
    level: CONFIG.logLevel,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport,
);

module.exports = logger;
