// src/api/response.js
function sendSuccess(res, data, meta = {}) {
  return res.status(200).json({
    success: true,
    data,
    meta,
    error: null,
  });
}

function sendError(res, statusCode, message, details = null) {
  return res.status(statusCode).json({
    success: false,
    data: null,
    meta: {},
    error: {
      message,
      details,
    },
  });
}

module.exports = {
  sendSuccess,
  sendError,
};