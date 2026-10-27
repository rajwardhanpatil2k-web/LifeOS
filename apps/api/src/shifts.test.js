const test = require("node:test");
const assert = require("node:assert/strict");
const { shiftTargets } = require("./shifts");

test("a shift preview leaves the wake alarm and past tasks alone", () => {
  const items = [
    { _id: "wake", title: "Wake", scheduledAt: "06:00", status: "pending", alarmMode: "scan_dismiss" },
    { _id: "done", title: "Amla", scheduledAt: "06:05", status: "done" },
    { _id: "past", title: "Workout", scheduledAt: "07:00", status: "pending" },
    { _id: "locked", title: "Prep", scheduledAt: "19:15", status: "pending", locked: true },
    { _id: "dinner", title: "Dinner", scheduledAt: "19:30", status: "pending" },
  ];
  const targets = shiftTargets(items, "18:00", []);
  assert.deepEqual(targets.map((item) => item._id), ["dinner"]);
});

test("a selected shift ignores an id that is not on the plan", () => {
  const items = [{ _id: "dinner", title: "Dinner", scheduledAt: "19:30", status: "pending" }];
  const targets = shiftTargets(items, "18:00", ["missing", "dinner"]);
  assert.deepEqual(targets.map((item) => item._id), ["dinner"]);
});
