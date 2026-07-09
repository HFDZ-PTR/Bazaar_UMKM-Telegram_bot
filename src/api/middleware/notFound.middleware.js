const { sendError } = require("../response");

function notFoundMiddleware(req, res) {
  return sendError(res, 404, "Not found");
}

module.exports = notFoundMiddleware;
