// src/api/middleware/error.middleware.js
const logger = require("../../utils/logger");
const { sendError } = require("../response");

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  logger.error({ err: error, path: req.originalUrl }, "api request failed");

  const statusCode = error.status || 500;
  const message =
    statusCode === 500 ? "Internal server error" : error.message;

  return sendError(res, statusCode, message);
}

module.exports = errorMiddleware;