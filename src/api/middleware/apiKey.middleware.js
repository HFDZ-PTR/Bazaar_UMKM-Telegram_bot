const { CONFIG } = require("../../config");
const { sendError } = require("../response");

function apiKeyMiddleware(req, res, next) {
  if (!CONFIG.apiKey) {
    return next();
  }

  const providedKey = req.get("x-api-key");
  if (providedKey && providedKey === CONFIG.apiKey) {
    return next();
  }

  return sendError(
    res,
    401,
    "Unauthorized",
    "Missing or invalid x-api-key header",
  );
}

module.exports = apiKeyMiddleware;
