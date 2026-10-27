const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSchedule, toScheduleFile, mergeDay } = require("./scheduleFile");

function week(patch) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    name: "Day",
    dayType: weekday === 0 || weekday === 6 ? "off" : weekday < 3 ? "wfh" : "office",
    items: [
      {
        key: "wake",
        title: "Wake",
        scheduledAt: "06:00",
        durationMin: 10,
        steps: [{ key: "water", label: "Drink water." }],
        deps: [],
      },
    ],
  }));
  return { kind: "life-os-schedule", version: "raj-v2", days, ...patch };
}

test("a week file is accepted and a bad time is named", () => {
  const good = validateSchedule(week());
  assert.equal(good.ok, true);
  assert.equal(good.days.length, 7);
  const broken = week();
  broken.days[3].items[0].scheduledAt = "6pm";
  broken.days[3].items.push({ ...broken.days[3].items[0], key: "wake" });
  const bad = validateSchedule(broken);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.some((line) => line.includes("Wednesday") && line.includes("07:00")), true);
  assert.equal(bad.errors.some((line) => line.includes("share this key")), true);
});

test("an unknown field is rejected and a round trip still validates", () => {
  const file = week();
  file.days[0].items[0].calories = 400;
  const bad = validateSchedule(file);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.some((line) => line.includes("calories")), true);

  const exported = toScheduleFile([
    { weekday: 0, dayType: "off", version: "raj-v2", items: [{ key: "wake", title: "Wake", scheduledAt: "07:30", durationMin: 10, status: "done", steps: [] }] },
    { weekday: 1, dayType: "wfh", items: [] },
    { weekday: 2, dayType: "wfh", items: [] },
    { weekday: 3, dayType: "office", items: [] },
    { weekday: 4, dayType: "office", items: [] },
    { weekday: 5, dayType: "office", items: [] },
    { weekday: 6, dayType: "weekend", items: [] },
  ]);
  const again = validateSchedule(exported.schedule);
  assert.equal(again.ok, true);
});

test("a link to a missing task is rejected", () => {
  const file = week();
  file.days[1].items[0].deps = [{ type: "before", target: "gym" }];
  const result = validateSchedule(file);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((line) => line.includes("gym")), true);

  const blocked = week();
  blocked.days[3].items[0].deps = [{ type: "blocks", target: "rosemary-oil" }];
  assert.equal(validateSchedule(blocked).ok, true);
});

test("the saved week exports and imports without changes", () => {
  const { weeklyTemplatesV2, VERSION } = require("./seed/rajRoutineV2");
  const templates = weeklyTemplatesV2().map((day) => ({ ...day, version: VERSION }));
  const exported = toScheduleFile(templates);
  assert.equal(exported.ok, true);
  const checked = validateSchedule(exported.schedule);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.ok, true);
  assert.equal(checked.days[3].items.some((item) => item.key === "pm-routine"), true);
});

test("export keeps the editable fields and drops completion state", () => {
  const file = toScheduleFile([
    { weekday: 0, dayType: "off", version: "raj-v2", items: [{ key: "wake", title: "Wake", scheduledAt: "07:30", durationMin: 10, status: "done", steps: [{ key: "water", label: "Drink water.", done: true }] }] },
    { weekday: 1, dayType: "wfh", items: [] },
    { weekday: 2, dayType: "wfh", items: [] },
    { weekday: 3, dayType: "office", items: [] },
    { weekday: 4, dayType: "office", items: [] },
    { weekday: 5, dayType: "office", items: [] },
    { weekday: 6, dayType: "off", items: [] },
  ]);
  assert.equal(file.ok, true);
  assert.equal(file.schedule.days[0].items[0].status, undefined);
  assert.equal(file.schedule.days[0].items[0].steps[0].done, undefined);
});

test("import updates a pending task and leaves a finished one", () => {
  const merged = mergeDay(
    [
      { key: "wake", title: "Wake", scheduledAt: "06:00", status: "done", startedAt: null },
      { key: "lunch", title: "Lunch", scheduledAt: "13:00", status: "pending", steps: [{ key: "plate", label: "Old", done: true }] },
      { key: "old", title: "Old extra", scheduledAt: "15:00", status: "pending" },
    ],
    [
      { key: "wake", title: "Wake later", scheduledAt: "06:30", durationMin: 10, steps: [] },
      { key: "lunch", title: "Lunch", scheduledAt: "13:30", durationMin: 30, steps: [{ key: "plate", label: "New plate" }] },
      { key: "fruit", title: "Fruit", scheduledAt: "16:00", durationMin: 10, steps: [] },
    ]
  );
  const wake = merged.find((item) => item.key === "wake");
  const lunch = merged.find((item) => item.key === "lunch");
  assert.equal(wake.scheduledAt, "06:00");
  assert.equal(wake.title, "Wake");
  assert.equal(lunch.scheduledAt, "13:30");
  assert.equal(lunch.steps[0].done, true);
  assert.equal(lunch.steps[0].label, "New plate");
  assert.equal(merged.some((item) => item.key === "old"), false);
  assert.equal(merged.some((item) => item.key === "fruit"), true);
});
