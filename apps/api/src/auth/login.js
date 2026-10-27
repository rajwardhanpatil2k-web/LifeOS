const { AuthAccount, Session, User } = require("../models");
const { verifyPassword } = require("./password");
const { randomToken, hashToken, SESSION_TTL_MS } = require("./tokens");
const { createLoginLimiter } = require("./rateLimit");
const { runWithUser } = require("./context");

const limiter = createLoginLimiter();
const BAD_LOGIN = "Incorrect username or password.";

function deviceLabel(req) {
  return String(req.get("user-agent") || "unknown").slice(0, 120);
}

async function createSession(userId, label) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await Session.create({
    userId,
    tokenHash: hashToken(token),
    deviceLabel: label,
    lastUsedAt: new Date(),
    expiresAt,
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

function registerAuthRoutes(app) {
  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const ip = req.ip || "unknown";
      if (limiter.tooMany(ip)) {
        return res.status(429).json({ error: "Too many attempts. Wait a minute and try again." });
      }
      const username = String(req.body?.username || "").trim().toLowerCase();
      const password = req.body?.password == null ? "" : String(req.body.password);
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
      }
      const account = await AuthAccount.findOne({ username });
      const ok = await verifyPassword(password, account?.passwordSalt, account?.passwordHash);
      if (!account || !ok) {
        limiter.recordFailure(ip);
        return res.status(401).json({ error: BAD_LOGIN });
      }
      const session = await createSession(account.userId, deviceLabel(req));
      return res.json({ token: session.token, expiresAt: session.expiresAt, username: account.username });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/api/auth/logout", async (req, res, next) => {
    try {
      if (!req.sessionId) return res.status(401).json({ error: "Sign in required." });
      await Session.deleteOne({ _id: req.sessionId });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });
}

async function ensureAuthAccount() {
  const existing = await AuthAccount.findOne();
  if (existing) return existing;
  const username = String(process.env.LIFEOS_LOGIN_USER || "").trim().toLowerCase();
  const password = process.env.LIFEOS_LOGIN_PASSWORD;
  if (!username || !password || String(password).length < 8) {
    console.warn(
      "No login account yet. Set LIFEOS_LOGIN_USER and LIFEOS_LOGIN_PASSWORD (8+ characters), then restart. API routes stay locked until then."
    );
    return null;
  }
  const user = await User.findOne({ name: "Raj" });
  if (!user) {
    console.warn("Login account not created: the user record is missing. Seed the routine first.");
    return null;
  }
  const { hashPassword } = require("./password");
  const hashed = await hashPassword(password);
  return AuthAccount.create({
    userId: user._id,
    username,
    passwordSalt: hashed.salt,
    passwordHash: hashed.hash,
  });
}

module.exports = {
  registerAuthRoutes,
  ensureAuthAccount,
  createSession,
  limiter,
  BAD_LOGIN,
  runWithUser,
};
