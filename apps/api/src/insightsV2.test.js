const test = require("node:test");
const assert = require("node:assert/strict");
const { computeInsightsV2 } = require("./insightsV2");

function plan(date, items) {
  return { date, items };
}

test("category adherence and streaks ignore days that do not schedule that category", () => {
  const stats = computeInsightsV2({
    today: "2026-10-20",
    start: "2026-10-18",
    end: "2026-10-20",
    plans: [
      plan("2026-10-18", [
        { category: "workout", status: "done" },
        { category: "meal", status: "done" },
      ]),
      plan("2026-10-19", [
        { category: "workout", status: "skipped" },
        { category: "supplement", status: "done" },
      ]),
      plan("2026-10-20", [{ category: "workout", status: "done" }]),
    ],
  });
  const workout = stats.byCategory.find((row) => row.category === "workout");
  assert.equal(workout.done, 2);
  assert.equal(workout.total, 3);
  assert.equal(workout.streak, 1);
  const meal = stats.byCategory.find((row) => row.category === "meal");
  assert.equal(meal.streak, 1);
  assert.equal(stats.byCategory.find((row) => row.category === "skincare"), undefined);
});

test("timing reports the spread and how far items moved from the original plan", () => {
  const stats = computeInsightsV2({
    today: "2026-10-20",
    start: "2026-10-20",
    end: "2026-10-20",
    lateMinutes: [0, 30],
    plans: [plan("2026-10-20", [
      { plannedAt: "19:30", scheduledAt: "20:00", status: "pending" },
      { plannedAt: "13:00", scheduledAt: "13:00", status: "done" },
    ])],
  });
  assert.equal(stats.timing.spreadMin, 15);
  assert.equal(stats.timing.plannedVsShifted.count, 1);
  assert.equal(stats.timing.plannedVsShifted.avgMin, 30);
});

test("the shift ledger counts applied moves, minutes, and the item moved most", () => {
  const stats = computeInsightsV2({
    today: "2026-10-20",
    start: "2026-10-13",
    end: "2026-10-20",
    shifts: [
      {
        date: "2026-10-19",
        reason: "meeting",
        before: [{ id: "dinner", title: "Dinner" }],
        changes: [{ id: "dinner", from: "19:30", to: "20:30" }],
      },
      {
        date: "2026-10-12",
        reason: "meeting",
        before: [{ id: "dinner", title: "Dinner" }],
        changes: [{ id: "dinner", from: "19:30", to: "20:00" }],
      },
    ],
  });
  assert.equal(stats.shifts.count, 2);
  assert.equal(stats.shifts.minutes, 90);
  assert.equal(stats.shifts.mostShifted[0].title, "Dinner");
  assert.equal(stats.shifts.mostShifted[0].count, 2);
  assert.equal(stats.shifts.reasons[0].reason, "meeting");
  assert.equal(stats.shifts.perWeek.length, 2);
});

test("workout progress uses load, the best working set, and the effort trend", () => {
  const stats = computeInsightsV2({
    today: "2026-10-20",
    start: "2026-10-13",
    end: "2026-10-20",
    sessions: [
      {
        date: "2026-10-14",
        sets: [
          { exerciseKey: "mon-bench", reps: 12, weightKg: 40, rpe: 7, isWarmup: true },
          { exerciseKey: "mon-bench", reps: 10, weightKg: 40, rpe: 7 },
        ],
      },
      {
        date: "2026-10-18",
        sets: [{ exerciseKey: "mon-bench", reps: 12, weightKg: 42.5, rpe: 8 }],
      },
    ],
  });
  assert.equal(stats.workout.sessions, 2);
  assert.equal(stats.workout.sessionsPerWeek, 1);
  assert.equal(stats.workout.exercises[0].name, "Bench press");
  assert.equal(stats.workout.exercises[0].volume, 910);
  assert.equal(stats.workout.exercises[0].best.weightKg, 42.5);
  assert.equal(stats.workout.rpeTrend.first, 7);
  assert.equal(stats.workout.rpeTrend.second, 8);
});

test("recovery counts check-ins, flags, and suggestion choices without advice", () => {
  const stats = computeInsightsV2({
    today: "2026-10-20",
    start: "2026-10-20",
    end: "2026-10-20",
    sessions: [
      { date: "2026-10-18", checkin: { painFlag: false, soreness0to4: 1, sleepOk: true }, sets: [] },
      { date: "2026-10-20", checkin: { painFlag: true, soreness0to4: 3, sleepOk: false }, sets: [{ painFlag: true }] },
    ],
    suggestions: [
      { status: "accepted", type: "hold" },
      { status: "dismissed", type: "extra_rest" },
    ],
  });
  assert.equal(stats.recovery.checkins, 2);
  assert.equal(stats.recovery.avgSoreness, 2);
  assert.equal(stats.recovery.painFlags, 1);
  assert.equal(stats.recovery.suggestions.accepted, 1);
  assert.equal(stats.recovery.suggestions.dismissed, 1);
  assert.equal(JSON.stringify(stats.recovery).includes("doctor"), false);
});
