const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { hashPassword, verifyPassword } = require("./auth/password");
const { randomToken, hashToken } = require("./auth/tokens");
const { createLoginLimiter } = require("./auth/rateLimit");
const { requireAuth } = require("./auth/middleware");
const { registerAuthRoutes } = require("./auth/login");
const { AuthAccount, Session, User } = require("./models");

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

test("password hash verifies and rejects a wrong password", async () => {
  const hashed = await hashPassword("correct-horse");
  assert.equal(await verifyPassword("correct-horse", hashed.salt, hashed.hash), true);
  assert.equal(await verifyPassword("wrong-horse", hashed.salt, hashed.hash), false);
  assert.equal(await verifyPassword("correct-horse", "", ""), false);
  assert.notEqual(hashed.hash, "correct-horse");
});

test("session token is stored only as a hash", () => {
  const token = randomToken();
  assert.equal(token.length > 20, true);
  assert.notEqual(hashToken(token), token);
  assert.equal(hashToken(token), hashToken(token));
});

test("login limiter allows five failures then blocks", () => {
  let now = 1_000_000;
  const limiter = createLoginLimiter({ now: () => now });
  for (let i = 0; i < 5; i += 1) limiter.recordFailure("10.0.0.8");
  assert.equal(limiter.tooMany("10.0.0.8"), true);
  assert.equal(limiter.tooMany("10.0.0.9"), false);
  now += 61_000;
  assert.equal(limiter.tooMany("10.0.0.8"), false);
});

describe("auth http", { concurrency: 1 }, () => {
test("api routes reject a missing token and health stays open", async () => {
  const app = express();
  app.use(requireAuth);
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/me", (_req, res) => res.json({ ok: true }));
  const server = await listen(app);
  const port = server.address().port;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const locked = await fetch(`http://127.0.0.1:${port}/api/me`);
    const body = await locked.json();
    assert.equal(health.status, 200);
    assert.equal(locked.status, 401);
    assert.equal(body.error, "Sign in required.");
    assert.equal(JSON.stringify(body).includes("token"), false);
  } finally {
    await close(server);
  }
});

test("login returns a token and a later call with it succeeds", async () => {
  const hashed = await hashPassword("demo-pass-1");
  const user = { _id: "user-1", name: "Raj" };
  const originalFind = AuthAccount.findOne;
  const originalCreate = Session.create;
  const originalSessionFind = Session.findOne;
  const originalUserFind = User.findById;
  const originalDelete = Session.deleteOne;
  AuthAccount.findOne = async () => ({
    userId: user._id,
    username: "raj",
    passwordSalt: hashed.salt,
    passwordHash: hashed.hash,
  });
  const sessions = new Map();
  Session.create = async (doc) => {
    sessions.set(doc.tokenHash, { ...doc, _id: "sess-1" });
    return sessions.get(doc.tokenHash);
  };
  Session.findOne = async (query) => sessions.get(query.tokenHash) || null;
  Session.deleteOne = async () => {};
  User.findById = async () => user;

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(requireAuth);
  registerAuthRoutes(app);
  app.get("/api/me", (req, res) => res.json({ name: req.authUser.name }));
  const server = await listen(app);
  const port = server.address().port;
  try {
    const bad = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify({ username: "raj", password: "nope-nope" }),
    });
    assert.equal(bad.status, 401);
    const badBody = await bad.json();
    assert.equal(badBody.error, "Incorrect username or password.");

    const good = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.11" },
      body: JSON.stringify({ username: "Raj", password: "demo-pass-1" }),
    });
    assert.equal(good.status, 200);
    const session = await good.json();
    assert.equal(typeof session.token, "string");
    assert.equal(sessions.has(hashToken(session.token)), true);
    assert.equal(JSON.stringify(session).includes(hashed.hash), false);

    const me = await fetch(`http://127.0.0.1:${port}/api/me`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), { name: "Raj" });
  } finally {
    AuthAccount.findOne = originalFind;
    Session.create = originalCreate;
    Session.findOne = originalSessionFind;
    User.findById = originalUserFind;
    Session.deleteOne = originalDelete;
    await close(server);
  }
});

test("six failures from one address are rate limited", async () => {
  const originalFind = AuthAccount.findOne;
  AuthAccount.findOne = async () => null;
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  registerAuthRoutes(app);
  const server = await listen(app);
  const port = server.address().port;
  try {
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.20" },
        body: JSON.stringify({ username: "raj", password: "wrong-password" }),
      });
      last = res.status;
    }
    assert.equal(last, 429);
  } finally {
    AuthAccount.findOne = originalFind;
    await close(server);
  }
});
});
