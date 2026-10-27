const test = require("node:test");
const assert = require("node:assert/strict");
const { suggestProgression, suggestFatigue, weeksTrainedSince, PAIN_LINE } = require("./workout/progression");
const { validateSession } = require("./workout/validate");
const { exercisesFor } = require("./workout/catalog");

const bench = { key: "mon-bench", equipment: "barbell", stepKg: 2.5, repLow: 10, repHigh: 12 };

function session(date, sets, extra = {}) {
  return { date, sets, ...extra };
}

function set(partial) {
  return { exerciseKey: "mon-bench", reps: 10, weightKg: 40, rpe: 7, isWarmup: false, painFlag: false, ...partial };
}

test("pain in the last session holds the weight and shows the pain line", () => {
  const result = suggestProgression({
    exercise: bench,
    today: "2026-10-20",
    sessions: [session("2026-10-18", [set({ painFlag: true, rpe: 6, reps: 12 })])],
  });
  assert.equal(result.type, "hold");
  assert.equal(result.weightKg, null);
  assert.equal(result.note, PAIN_LINE);
});

test("no history gives no number", () => {
  const result = suggestProgression({ exercise: bench, today: "2026-10-20", sessions: [] });
  assert.equal(result.type, "start");
  assert.equal(result.weightKg, null);
  assert.match(result.reason, /2-4 reps left/);
});

test("a gap of 14 days suggests about 10 percent less, on the equipment step", () => {
  const result = suggestProgression({
    exercise: bench,
    today: "2026-10-20",
    sessions: [session("2026-10-06", [set({ weightKg: 40, reps: 12, rpe: 7 })])],
  });
  assert.equal(result.type, "reduce");
  assert.equal(result.weightKg, 35);
});

test("a hard last session or two misses holds instead of adding weight", () => {
  const hard = suggestProgression({
    exercise: bench,
    today: "2026-10-20",
    sessions: [session("2026-10-18", [set({ reps: 12, rpe: 9 })])],
  });
  assert.equal(hard.type, "hold");
  const missed = suggestProgression({
    exercise: bench,
    today: "2026-10-20",
    sessions: [session("2026-10-18", [set({ reps: 12, rpe: 7 })])],
    missedDates: ["2026-10-10", "2026-10-12"],
  });
  assert.equal(missed.type, "hold");
  assert.match(missed.reason, /missed/);
});

test("top reps at a calm effort add one equipment step and nothing more", () => {
  const result = suggestProgression({
    exercise: bench,
    today: "2026-10-20",
    sessions: [session("2026-10-18", [set({ reps: 12, rpe: 8 }), set({ reps: 12, rpe: 7 })])],
  });
  assert.equal(result.type, "progress");
  assert.equal(result.weightKg, 42.5);
});

test("anything short of the top of the range holds and asks for reps", () => {
  const result = suggestProgression({
    exercise: bench,
    today: "2026-10-20",
    sessions: [session("2026-10-18", [set({ reps: 11, rpe: 7 })])],
  });
  assert.equal(result.type, "hold");
  assert.match(result.reason, /more reps/);
});

test("bodyweight work never gets an invented load", () => {
  const pushup = { key: "thu-pushup", equipment: "bodyweight", stepKg: 0, repLow: 12, repHigh: 15 };
  const result = suggestProgression({
    exercise: pushup,
    today: "2026-10-20",
    sessions: [session("2026-10-18", [set({ exerciseKey: "thu-pushup", reps: 15, weightKg: 0, rpe: 7 })])],
  });
  assert.equal(result.type, "hold");
  assert.equal(result.weightKg, 0);
});

test("two hard sessions, high soreness, or a pain flag suggest rest before a deload", () => {
  const hard = suggestFatigue({
    sessions: [
      session("2026-10-18", [set({ rpe: 9 }), set({ rpe: 10 }), set({ rpe: 8 })]),
      session("2026-10-16", [set({ rpe: 9 }), set({ rpe: 9 })]),
    ],
    today: "2026-10-20",
    weeksSinceDeload: 5,
  });
  assert.equal(hard.type, "extra_rest");
  const sore = suggestFatigue({
    sessions: [
      session("2026-10-18", [], { soreness0to4: 3 }),
      session("2026-10-16", [], { soreness0to4: 4 }),
    ],
    today: "2026-10-20",
    weeksSinceDeload: 1,
  });
  assert.equal(sore.type, "extra_rest");
  const pain = suggestFatigue({
    sessions: [session("2026-10-19", [set({ painFlag: true, rpe: 6 })])],
    today: "2026-10-20",
    weeksSinceDeload: 1,
  });
  assert.equal(pain.type, "extra_rest");
});

test("five training weeks suggest a deload", () => {
  const sessions = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"].map((date) =>
    session(date, [set({ rpe: 7 })])
  );
  assert.equal(weeksTrainedSince(sessions, "2026-10-20", ""), 5);
  const result = suggestFatigue({ sessions, today: "2026-10-20", weeksSinceDeload: 5 });
  assert.equal(result.type, "deload");
  assert.match(result.reason, /half the sets/);
});

test("a logged session rejects body weight and calories and keeps a high RPE as a warning", () => {
  const banned = validateSession({
    date: "2026-10-20",
    checkin: { painFlag: false, soreness0to4: 1, sleepOk: true },
    sets: [],
    bodyWeightKg: 70,
  });
  assert.equal(banned.ok, false);
  const warned = validateSession({
    date: "2026-10-20",
    clientId: "abc",
    checkin: { painFlag: true, soreness0to4: 2, sleepOk: false },
    sets: [{ exerciseKey: "mon-bench", reps: 8, weightKg: 40, rpe: 9 }],
  });
  assert.equal(warned.ok, true);
  assert.equal(warned.warnings.length, 1);
  assert.equal(warned.session.checkin.painFlag, true);
});

test("thursday dips stay in the catalog with the swap written as a choice", () => {
  const dips = exercisesFor(4, ["dips"])[0];
  assert.equal(dips.name, "Bench dips");
  assert.deepEqual(dips.substitutes, ["Cable pushdown", "Close-grip push-up"]);
});
