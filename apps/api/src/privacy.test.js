const test = require("node:test");
const assert = require("node:assert/strict");
const {
  allowOrigin,
  stripSecrets,
  confirmDeleteRequest,
  buildExport,
  deleteUserData,
  DELETE_PHRASE,
  USER_COLLECTIONS,
} = require("./privacy");

function bucket(docs) {
  const state = { docs: docs.map((row) => ({ ...row })) };
  function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => String(row[key]) === String(value));
  }
  return {
    state,
    find(filter) {
      return { lean: async () => state.docs.filter((row) => matches(row, filter)) };
    },
    findOne(filter) {
      return state.docs.find((row) => matches(row, filter)) || null;
    },
    async deleteMany(filter) {
      const before = state.docs.length;
      state.docs = state.docs.filter((row) => !matches(row, filter));
      return { deletedCount: before - state.docs.length };
    },
  };
}

test("browser calls are limited to the configured origin", () => {
  assert.equal(allowOrigin(undefined, "https://lifeos.example"), true);
  assert.equal(allowOrigin("https://lifeos.example", "https://lifeos.example"), true);
  assert.equal(allowOrigin("https://evil.example", "https://lifeos.example"), false);
  assert.equal(allowOrigin("http://127.0.0.1:4000", ""), true);
  assert.equal(allowOrigin("http://127.0.0.1:4000", "https://lifeos.example"), false);
  assert.equal(allowOrigin("https://evil.example", ""), false);
});

test("export drops password hashes and session token hashes", async () => {
  const userId = "user-1";
  const models = {
    User: bucket([{ _id: userId, name: "Raj" }]),
    AuthAccount: bucket([{ userId, username: "raj", passwordHash: "secret-hash", passwordSalt: "salt" }]),
    Session: bucket([{ userId, tokenHash: "token-hash", deviceLabel: "phone" }]),
    DailyPlan: bucket([{ userId, date: "2026-10-20" }]),
  };
  const body = await buildExport(userId, models);
  const json = JSON.stringify(body);
  assert.equal(json.includes("secret-hash"), false);
  assert.equal(json.includes("token-hash"), false);
  assert.equal(json.includes("salt"), false);
  assert.equal(body.account.username, "raj");
  assert.equal(body.sessions[0].deviceLabel, "phone");
  assert.equal(body.plans[0].date, "2026-10-20");
  assert.equal(stripSecrets({ tokenHash: "x", title: "Dinner" }).title, "Dinner");
});

test("delete-all requires the phrase and the password, then removes only that user's rows", async () => {
  assert.equal(confirmDeleteRequest({ phrase: "delete", passwordOk: true }).ok, false);
  assert.equal(confirmDeleteRequest({ phrase: DELETE_PHRASE, passwordOk: false }).error, "Incorrect password.");
  assert.equal(confirmDeleteRequest({ phrase: DELETE_PHRASE, passwordOk: true }).ok, true);

  const userId = "user-1";
  const models = {};
  for (const name of USER_COLLECTIONS) {
    const filterId = name === "User" ? { _id: userId, name: "Raj" } : { userId, note: name };
    models[name] = bucket([filterId, { userId: "someone-else", note: "keep" }]);
  }
  models.Exercise = bucket([{ key: "bench" }]);
  const removed = await deleteUserData(userId, models);
  assert.equal(removed.DailyPlan, 1);
  assert.equal(removed.Session, 1);
  assert.equal(removed.User, 1);
  assert.equal(models.DailyPlan.state.docs.length, 1);
  assert.equal(models.DailyPlan.state.docs[0].userId, "someone-else");
  assert.equal(models.Exercise.state.docs.length, 1);
  assert.equal(removed.Exercise, undefined);
});
