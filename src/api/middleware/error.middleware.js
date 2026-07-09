const logger = require("../../utils/logger");
const { sendError } = require("../response");

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  logger.error({ err: error, path: req.originalUrl }, "api request failed");
  return sendError(
    res,
    error.status || 500,
    error.message || "Internal server error",
  );
}

module.exports = errorMiddleware;
