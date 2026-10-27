const test = require("node:test");
const assert = require("node:assert/strict");
const { seedAction } = require("./seed/seedPolicy");
const { weeklyTemplatesV2, draftSettings, BED, WAKE, GYM_MIN } = require("./seed/rajRoutineV2");

function day(name) {
  return weeklyTemplatesV2().find((row) => row.name === name);
}

function item(name, key) {
  return day(name).items.find((row) => row.key === key);
}

test("seed writes a missing v1 template and never overwrites one", () => {
  assert.equal(seedAction([], { version: "raj-v1" }), "insert");
  assert.equal(seedAction([{ version: "raj-v1", weekday: 1 }], { version: "raj-v1" }), "skip");
});

test("seed inserts the v2 draft once and does not approve it", () => {
  assert.equal(seedAction([], { version: "raj-v2" }), "insert-draft");
  assert.equal(seedAction([{ version: "raj-v2", approved: false }], { version: "raj-v2" }), "skip");
  assert.equal(seedAction([{ version: "raj-v2", approved: true }], { version: "raj-v2" }), "skip");
});

test("the draft week matches the agreed clocks", () => {
  const days = weeklyTemplatesV2();
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((row) => row.dayType), ["off", "wfh", "wfh", "office", "office", "office", "off"]);
  for (const row of days) {
    assert.equal(item(row.name, "wake").scheduledAt, WAKE[row.weekday]);
    assert.equal(item(row.name, "bed").scheduledAt, BED[row.weekday]);
    assert.equal(item(row.name, "workout").durationMin, GYM_MIN[row.weekday]);
    assert.equal(item(row.name, "wake").alarmMode, "scan_dismiss");
    assert.equal(item(row.name, "bed").movable, "fixed");
  }
  assert.equal(item("Wed", "home").scheduledAt, "20:30");
  assert.equal(item("Wed", "leave-work").scheduledAt, "18:00");
  assert.equal(item("Mon", "banana").deps[0].minGapMin, 15);
  assert.equal(item("Wed", "pm-routine").deps[0].type, "blocks");
  assert.equal(item("Wed", "pm-routine").steps.some((step) => step.label.includes("0.5 mm") && step.label.includes("one press")), true);
  assert.equal(item("Wed", "pm-routine").steps.some((step) => /shampoo/i.test(step.label)), true);
  assert.equal(item("Thu", "pm-routine").steps.some((step) => /paused/i.test(step.label)), true);
  assert.equal(item("Thu", "pm-routine").steps.some((step) => /leave it on overnight/i.test(step.label)), false);
  assert.equal(item("Sun", "supplements"), undefined);
  assert.equal(item("Mon", "supplements").category, "supplement");
  assert.equal(item("Mon", "study").movable, "free");
  for (const name of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    assert.equal(item(name, "lunch").title, "Lunch");
    assert.equal(item(name, "seed-blend").title, "Sunflower-sesame seed blend");
    assert.equal(item(name, "fruit").scheduledAt, "16:00");
    assert.equal(item(name, "fruit").steps.length, 2);
  }
  assert.equal(item("Wed", "study"), undefined);
  const settings = draftSettings();
  assert.equal(settings.sleepHours, 8);
  assert.equal(settings.gymBlockMin.office, 60);
  assert.equal(JSON.stringify(days).includes("calorie"), false);
  assert.equal(JSON.stringify(days).includes("body weight"), false);
});
