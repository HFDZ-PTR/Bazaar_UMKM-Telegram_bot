// src/api/middleware/apiKey.middleware.js
const crypto = require("crypto");
const { CONFIG } = require("../../config");
const { sendError } = require("../response");

function isSameApiKey(providedKey, expectedKey) {
  if (typeof providedKey !== "string" || typeof expectedKey !== "string") {
    return false;
  }

  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

function apiKeyMiddleware(req, res, next) {
  if (!CONFIG.apiKey) {
    next();
    return;
  }

  const apiKey = req.get("x-api-key");
  if (isSameApiKey(apiKey, CONFIG.apiKey)) {
    next();
    return;
  }

  sendError(res, 401, "Unauthorized", "Missing or invalid x-api-key header");
}

module.exports = apiKeyMiddleware;