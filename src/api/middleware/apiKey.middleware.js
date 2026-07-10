// src/api/middleware/apiKey.middleware.js
const crypto = require("crypto");
const { CONFIG } = require("../../config");
const { sendError } = require("../response");

function timingSafeEqual(a, b) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

function apiKeyMiddleware(req, res, next) {
  if (!CONFIG.apiKey) {
    return next();
  }

  const providedKey = req.get("x-api-key");
  if (providedKey && timingSafeEqual(providedKey, CONFIG.apiKey)) {
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