const crypto = require("crypto");

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

module.exports = { SESSION_TTL_MS, randomToken, hashToken };
