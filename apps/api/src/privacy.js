const { verifyPassword } = require("./auth/password");

const DELETE_PHRASE = "DELETE MY DATA";
const SECRET_KEYS = new Set(["passwordHash", "passwordSalt", "tokenHash"]);

const USER_COLLECTIONS = [
  "RoutineTemplate",
  "DailyPlan",
  "LifeEvent",
  "DailyScore",
  "InsightReport",
  "CarryForwardTask",
  "RoutineDraft",
  "ShiftOp",
  "WorkoutSession",
  "Suggestion",
  "MutationReceipt",
  "Session",
  "AuthAccount",
  "User",
];

function allowOrigin(origin, allowed) {
  if (!origin) return true;
  const expected = String(allowed || "").trim();
  if (expected) return origin === expected;
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
}

function plain(value) {
  if (value && typeof value.toObject === "function") return value.toObject({ versionKey: false });
  return value;
}

function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = stripSecrets(item);
  }
  return out;
}

function confirmDeleteRequest({ phrase, passwordOk }) {
  if (String(phrase || "") !== DELETE_PHRASE) {
    return { ok: false, status: 400, error: "Type DELETE MY DATA to confirm." };
  }
  if (!passwordOk) return { ok: false, status: 400, error: "Incorrect password." };
  return { ok: true };
}

async function rowsFor(model, filter) {
  if (!model || typeof model.find !== "function") return [];
  const query = model.find(filter);
  if (query && typeof query.lean === "function") return query.lean();
  const rows = await query;
  return Array.isArray(rows) ? rows.map(plain) : [];
}

async function buildExport(userId, models) {
  const user = models.User ? await models.User.findOne({ _id: userId }) : null;
  const account = models.AuthAccount ? await models.AuthAccount.findOne({ userId }) : null;
  const [templates, plans, events, scores, reports, carryForwards, drafts, shifts, workouts, suggestions, receipts, sessions] =
    await Promise.all([
      rowsFor(models.RoutineTemplate, { userId }),
      rowsFor(models.DailyPlan, { userId }),
      rowsFor(models.LifeEvent, { userId }),
      rowsFor(models.DailyScore, { userId }),
      rowsFor(models.InsightReport, { userId }),
      rowsFor(models.CarryForwardTask, { userId }),
      rowsFor(models.RoutineDraft, { userId }),
      rowsFor(models.ShiftOp, { userId }),
      rowsFor(models.WorkoutSession, { userId }),
      rowsFor(models.Suggestion, { userId }),
      rowsFor(models.MutationReceipt, { userId }),
      rowsFor(models.Session, { userId }),
    ]);
  return stripSecrets({
    exportedAt: new Date().toISOString(),
    user: plain(user),
    account: plain(account),
    sessions,
    templates,
    plans,
    events,
    scores,
    reports,
    carryForwards,
    drafts,
    shifts,
    workouts,
    suggestions,
    receipts,
  });
}

async function deleteUserData(userId, models) {
  const removed = {};
  for (const name of USER_COLLECTIONS) {
    const model = models[name];
    if (!model || typeof model.deleteMany !== "function") continue;
    const filter = name === "User" ? { _id: userId } : { userId };
    const result = await model.deleteMany(filter);
    removed[name] = result && result.deletedCount ? result.deletedCount : 0;
  }
  return removed;
}

function registerPrivacyRoutes(app, { wrap, getUser, models }) {
  app.get("/api/export", wrap(async (_req, res) => {
    const user = await getUser();
    const body = await buildExport(user._id, models);
    res.set("Content-Disposition", 'attachment; filename="life-os-export.json"');
    res.json(body);
  }));

  app.delete("/api/data", wrap(async (req, res) => {
    const phrase = req.body?.phrase;
    const password = req.body?.password == null ? "" : String(req.body.password);
    if (String(phrase || "") !== DELETE_PHRASE) {
      return res.status(400).json({ error: "Type DELETE MY DATA to confirm." });
    }
    const user = await getUser();
    const account = await models.AuthAccount.findOne({ userId: user._id });
    const passwordOk = await verifyPassword(password, account?.passwordSalt, account?.passwordHash);
    const decision = confirmDeleteRequest({ phrase, passwordOk });
    if (!decision.ok) return res.status(decision.status).json({ error: decision.error });
    const removed = await deleteUserData(user._id, models);
    res.json({ ok: true, removed });
  }));
}

module.exports = {
  DELETE_PHRASE,
  USER_COLLECTIONS,
  allowOrigin,
  stripSecrets,
  confirmDeleteRequest,
  buildExport,
  deleteUserData,
  registerPrivacyRoutes,
};
