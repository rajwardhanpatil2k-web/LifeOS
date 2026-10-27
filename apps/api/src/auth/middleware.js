const { Session, User } = require("../models");
const { hashToken, SESSION_TTL_MS } = require("./tokens");
const { runWithUser } = require("./context");

const SLIDE_EVERY_MS = 60 * 60 * 1000;
const GENERIC = "Sign in required.";

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function isPublic(req) {
  const path = req.path || "";
  if (!path.startsWith("/api/")) return true;
  if (path === "/api/auth/login") return true;
  return false;
}

async function loadSession(token) {
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token) });
  if (!session) return null;
  if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }
  const idle = Date.now() - new Date(session.lastUsedAt || 0).getTime();
  if (idle > SLIDE_EVERY_MS) {
    session.lastUsedAt = new Date();
    session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await session.save();
  }
  return session;
}

function requireAuth(req, res, next) {
  if (isPublic(req)) return next();
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: GENERIC });
  loadSession(token)
    .then(async (session) => {
      if (!session) return res.status(401).json({ error: GENERIC });
      const user = await User.findById(session.userId);
      if (!user) return res.status(401).json({ error: GENERIC });
      req.authUser = user;
      req.sessionId = session._id;
      return runWithUser(user, () => next());
    })
    .catch(next);
}

module.exports = { requireAuth, bearerToken, isPublic, loadSession, GENERIC };
