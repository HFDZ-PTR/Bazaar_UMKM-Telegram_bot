const crypto = require("crypto");

function createFingerprint(platform, postId) {
  return crypto
    .createHash("sha256")
    .update(`${platform}:${postId}`)
    .digest("hex");
}

module.exports = {
  createFingerprint,
};
