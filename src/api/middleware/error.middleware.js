// src/api/middleware/error.middleware.js
const logger = require("../../utils/logger");
const { sendError } = require("../response");

function getStatusCode(error) {
  const code = Number(error?.status || error?.statusCode);
  return Number.isInteger(code) && code >= 400 && code < 600 ? code : 500;
}

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  logger.error(
    {
      err: error,
      method: req.method,
      path: req.originalUrl,
    },
    "api request failed",
  );

  const statusCode = getStatusCode(error);
  const message =
    statusCode >= 500 ? "Internal server error" : error.message || "Request failed";

  sendError(res, statusCode, message);
}

module.exports = errorMiddleware;