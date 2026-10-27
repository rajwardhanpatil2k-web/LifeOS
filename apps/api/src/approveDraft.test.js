const test = require("node:test");
const assert = require("node:assert/strict");
const { planApproval, isLocalUri } = require("./seed/approveDraft");
const { weeklyTemplatesV2, draftSettings } = require("./seed/rajRoutineV2");
const { effectiveShifts, applyShifts } = require("./routes");

function draft() {
  return {
    version: "raj-v2",
    approved: false,
    settings: draftSettings(),
    days: weeklyTemplatesV2(),
  };
}

test("approving the draft publishes the week and leaves existing plans alone", () => {
  const planned = planApproval(draft());
  assert.equal(planned.ok, true);
  assert.equal(planned.already, false);
  assert.equal(planned.templates.length, 7);
  assert.equal(planned.templates.every((row) => row.version === "raj-v2" && row.approved === true), true);
  assert.equal(planned.dailyPlans, undefined);
  assert.equal(isLocalUri("mongodb://127.0.0.1:27017/life_os"), true);
  assert.equal(isLocalUri("mongodb+srv://example.mongodb.net/life_os"), false);

  const user = { ...planned.userPatch, sleepTarget: "22:30" };
  for (const day of planned.templates) {
    const shifts = effectiveShifts(day.items, user);
    assert.equal(shifts.wakeShiftMin, 0, String(day.weekday));
    assert.equal(shifts.homeShiftMin, 0, String(day.weekday));
    const applied = applyShifts(day.items, shifts.wakeShiftMin, shifts.homeShiftMin);
    for (const key of ["wake", "workout", "lunch", "bed"]) {
      const source = day.items.find((item) => item.key === key);
      if (!source) continue;
      assert.equal(applied.find((item) => item.key === key).scheduledAt, source.scheduledAt);
    }
  }
  const wed = planned.templates.find((row) => row.weekday === 3);
  assert.equal(wed.items.find((item) => item.key === "leave-work").scheduledAt, "18:00");
  assert.equal(wed.items.find((item) => item.key === "dinner").scheduledAt, "18:30");
  assert.equal(wed.items.find((item) => item.key === "home").scheduledAt, "20:30");
});

test("a later wake change is measured from the approved weekday wake", () => {
  const planned = planApproval(draft());
  const user = { ...planned.userPatch, wakeTarget: "06:30", sleepTarget: "22:30" };
  const sat = planned.templates.find((row) => row.weekday === 6);
  const shifts = effectiveShifts(sat.items, user);
  assert.equal(shifts.wakeShiftMin, 30);
  const applied = applyShifts(sat.items, shifts.wakeShiftMin, shifts.homeShiftMin);
  assert.equal(applied.find((item) => item.key === "wake").scheduledAt, "06:45");
  assert.equal(applied.find((item) => item.key === "workout").scheduledAt, "07:30");
});

test("without a baseline the old single wake target still shifts the template", () => {
  const sat = weeklyTemplatesV2().find((row) => row.weekday === 6);
  const shifts = effectiveShifts(sat.items, {
    wakeTarget: "06:00",
    homeTarget: "19:30",
    sleepTarget: "22:30",
  });
  assert.equal(shifts.wakeShiftMin, -45);
});

test("an approved draft is not planned as a fresh approval", () => {
  const planned = planApproval({ ...draft(), approved: true });
  assert.equal(planned.ok, true);
  assert.equal(planned.already, true);
});
