const { Exercise, WorkoutSession, Suggestion, LifeEvent } = require("../models");
const { CATALOG, exercisesFor } = require("./catalog");
const { validateSession } = require("./validate");
const {
  PAIN_LINE,
  suggestProgression,
  suggestFatigue,
  weeksTrainedSince,
  lastTime,
} = require("./progression");
const { formatDate, DEFAULT_TZ } = require("../time");

async function ensureExercises() {
  const existing = await Exercise.find({}, { key: 1 }).lean();
  const have = new Set(existing.map((row) => row.key));
  const missing = CATALOG.filter((row) => !have.has(row.key));
  if (missing.length) await Exercise.insertMany(missing);
}

function plainSession(doc) {
  return {
    date: doc.date,
    painFlag: Boolean(doc.checkin?.painFlag),
    checkin: doc.checkin,
    soreness0to4: doc.checkin?.soreness0to4,
    sets: doc.sets || [],
  };
}

async function historyFor(user) {
  const rows = await WorkoutSession.find({ userId: user._id }).sort({ date: -1 }).lean();
  return rows.map(plainSession);
}

async function lastDeloadDate(user) {
  const row = await Suggestion.findOne({ userId: user._id, type: "deload", status: "accepted" }).sort({ updatedAt: -1 }).lean();
  return row ? formatDate(row.updatedAt, DEFAULT_TZ) : "";
}

function suggestionsFor(exercises, sessions, today, missedDates) {
  return exercises.map((exercise) => ({
    exerciseKey: exercise.key,
    ...suggestProgression({ exercise, sessions, today, missedDates }),
  }));
}

function registerWorkoutRoutes(app, { wrap, getUser }) {
  app.get("/api/workouts/plan", wrap(async (req, res) => {
    const user = await getUser();
    await ensureExercises();
    const weekday = Number(req.query.weekday);
    const stepKeys = String(req.query.steps || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    const exercises = exercisesFor(weekday, stepKeys);
    const sessions = await historyFor(user);
    const today = formatDate(new Date(), DEFAULT_TZ);
    const since = await lastDeloadDate(user);
    const fatigue = suggestFatigue({
      sessions,
      today,
      weeksSinceDeload: weeksTrainedSince(sessions, today, since),
      deloadEveryWeeks: user.deloadEveryWeeks || 5,
    });
    res.json({
      painLine: PAIN_LINE,
      exercises: exercises.map((exercise) => ({
        ...exercise,
        last: lastTime(sessions, exercise.key),
        suggestion: suggestProgression({ exercise, sessions, today }),
      })),
      fatigue,
    });
  }));

  app.post("/api/workouts", wrap(async (req, res) => {
    const user = await getUser();
    const parsed = validateSession(req.body || {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    if (!parsed.session.clientId) return res.status(400).json({ error: "A client id is required." });
    const existing = await WorkoutSession.findOne({ userId: user._id, clientId: parsed.session.clientId });
    if (existing) {
      return res.json({ session: existing, warnings: [], already: true, painLine: parsed.session.checkin.painFlag ? PAIN_LINE : "" });
    }
    const sessions = await historyFor(user);
    const today = parsed.session.date;
    const keys = [...new Set(parsed.session.sets.map((set) => set.exerciseKey))];
    const exercises = CATALOG.filter((row) => keys.includes(row.key));
    const suggestions = suggestionsFor(exercises, sessions, today);
    const since = await lastDeloadDate(user);
    const withToday = [
      { date: today, checkin: parsed.session.checkin, sets: parsed.session.sets },
      ...sessions,
    ];
    const fatigue = suggestFatigue({
      sessions: withToday,
      today,
      weeksSinceDeload: weeksTrainedSince(withToday, today, since),
      deloadEveryWeeks: user.deloadEveryWeeks || 5,
    });
    const session = await WorkoutSession.create({ userId: user._id, ...parsed.session });
    const shown = [];
    for (const suggestion of suggestions) {
      shown.push(await Suggestion.create({
        userId: user._id,
        type: suggestion.type,
        exerciseKey: suggestion.exerciseKey,
        reason: suggestion.reason,
        reasonCodes: [suggestion.type],
        weightKg: suggestion.weightKg,
        status: "shown",
        sessionId: session._id,
      }));
    }
    if (fatigue) {
      shown.push(await Suggestion.create({
        userId: user._id,
        type: fatigue.type,
        reason: fatigue.reason,
        reasonCodes: [fatigue.type],
        status: "shown",
        sessionId: session._id,
      }));
    }
    await LifeEvent.create({
      userId: user._id,
      date: today,
      domain: "fitness",
      type: "checkin",
      itemKey: parsed.session.planItemId,
      status: "logged",
      meta: {
        painFlag: parsed.session.checkin.painFlag,
        soreness0to4: parsed.session.checkin.soreness0to4,
        sleepOk: parsed.session.checkin.sleepOk,
      },
      source: "manual",
    });
    await LifeEvent.create({
      userId: user._id,
      date: today,
      domain: "fitness",
      type: "session_ended",
      itemKey: parsed.session.planItemId,
      status: "logged",
      meta: { sets: parsed.session.sets.length },
      source: "manual",
    });
    res.json({
      session,
      suggestions: shown,
      warnings: parsed.warnings,
      painLine: parsed.session.checkin.painFlag ? PAIN_LINE : "",
      planChanged: false,
    });
  }));

  app.post("/api/suggestions/:id/:action", wrap(async (req, res) => {
    const user = await getUser();
    const action = req.params.action === "accept" ? "accepted" : req.params.action === "dismiss" ? "dismissed" : "";
    if (!action) return res.status(400).json({ error: "Accept or dismiss the suggestion." });
    const suggestion = await Suggestion.findOne({ _id: req.params.id, userId: user._id });
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found." });
    suggestion.status = action;
    await suggestion.save();
    await LifeEvent.create({
      userId: user._id,
      date: formatDate(new Date(), DEFAULT_TZ),
      domain: "fitness",
      type: action === "accepted" ? "suggestion_accepted" : "suggestion_dismissed",
      status: action,
      meta: { suggestionType: suggestion.type },
      source: "manual",
    });
    res.json({
      suggestion,
      planChanged: false,
      note: action === "accepted" && (suggestion.type === "extra_rest" || suggestion.type === "deload")
        ? "Saved. The day does not change until you skip or shift that workout and confirm it."
        : "",
    });
  }));
}

module.exports = { registerWorkoutRoutes };
