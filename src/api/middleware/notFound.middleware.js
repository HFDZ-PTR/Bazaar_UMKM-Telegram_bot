// src/api/middleware/notFound.middleware.js
const { sendError } = require("../response");

function notFoundMiddleware(req, res) {
  sendError(res, 404, "Not found");
}

module.exports = notFoundMiddleware;