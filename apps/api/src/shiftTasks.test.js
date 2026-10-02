const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { applyTaskShift, planTaskShift, shiftClock } = require("./shiftTasks");

function item(overrides) {
  return {
    status: "pending",
    anchor: "home",
    domain: "health",
    ...overrides,
  };
}

const NOW = "18:00";
const NOW_MS = new Date("2026-10-02T18:00:00+05:30").getTime();

describe("shiftClock", () => {
  it("wraps past midnight instead of dropping the task", () => {
    assert.equal(shiftClock("23:30", 60), "00:30");
    assert.equal(shiftClock("00:15", -60), "23:15");
  });
});

describe("planTaskShift", () => {
  it("moves every upcoming pending task and keeps ids", () => {
    const dinner = item({ _id: "d1", key: "dinner", title: "Dinner", scheduledAt: "19:00" });
    const taskB = item({ _id: "b1", key: "task-b", title: "Task B", scheduledAt: "20:00", domain: "ops" });
    const taskC = item({ _id: "c1", key: "task-c", title: "Task C", scheduledAt: "21:00", domain: "ops" });
    const done = item({ _id: "w1", key: "workout", title: "Workout", scheduledAt: "19:30", status: "done" });
    const past = item({ _id: "p1", key: "lunch", title: "Lunch", scheduledAt: "13:00" });
    const untimed = item({ _id: "u1", key: "note", title: "Note", scheduledAt: "" });
    const items = [dinner, taskB, taskC, done, past, untimed];

    const planned = planTaskShift(items, { offsetMin: 60, nowHHMM: NOW, nowMs: NOW_MS });

    assert.equal(planned.ok, true);
    assert.equal(planned.changes.length, 3);
    assert.deepEqual(planned.changes.map((row) => row.id), ["d1", "b1", "c1"]);
    assert.equal(planned.changes[0].scheduledAt, "20:00");
    assert.equal(planned.changes[1].scheduledAt, "21:00");
    assert.equal(planned.changes[2].scheduledAt, "22:00");
    assert.equal(dinner.scheduledAt, "19:00");
    assert.equal(items.length, 6);
  });

  it("shifts a scheduled reminder with the task", () => {
    const at = new Date("2026-10-02T19:00:00+05:30");
    const dinner = item({
      _id: "d1",
      key: "dinner",
      title: "Dinner",
      scheduledAt: "19:00",
      snoozeUntil: at,
      followUpUntil: new Date(at.getTime() + 30 * 60 * 1000),
    });
    const planned = planTaskShift([dinner], { offsetMin: 60, nowHHMM: NOW, nowMs: NOW_MS });
    assert.equal(planned.changes[0].snoozeUntil.toISOString(), new Date(at.getTime() + 60 * 60 * 1000).toISOString());
    assert.equal(
      planned.changes[0].followUpUntil.toISOString(),
      new Date(at.getTime() + 90 * 60 * 1000).toISOString()
    );
  });

  it("can limit the move to known ids and ignores an invented id", () => {
    const dinner = item({ _id: "d1", title: "Dinner", scheduledAt: "19:00" });
    const taskB = item({ _id: "b1", title: "Task B", scheduledAt: "20:00" });
    const onlyB = planTaskShift([dinner, taskB], {
      offsetMin: 60,
      taskIds: ["b1"],
      nowHHMM: NOW,
      nowMs: NOW_MS,
    });
    assert.deepEqual(onlyB.changes.map((row) => row.id), ["b1"]);

    const invented = planTaskShift([dinner, taskB], {
      offsetMin: 60,
      taskIds: ["does-not-exist"],
      nowHHMM: NOW,
      nowMs: NOW_MS,
    });
    assert.equal(invented.ok, false);
    assert.equal(dinner.scheduledAt, "19:00");
  });
});

describe("applyTaskShift", () => {
  it("updates the existing records in one pass and does not add tasks", async () => {
    const dinner = item({ _id: "d1", key: "dinner", title: "Dinner", scheduledAt: "19:00" });
    const taskB = item({ _id: "b1", key: "task-b", title: "Task B", scheduledAt: "20:00" });
    const taskC = item({ _id: "c1", key: "task-c", title: "Task C", scheduledAt: "21:00" });
    const plan = { items: [dinner, taskB, taskC], saves: 0, async save() { this.saves += 1; } };

    const result = await applyTaskShift(null, plan, { offsetMin: 60, nowHHMM: NOW, nowMs: NOW_MS });

    assert.equal(result.ok, true);
    assert.equal(plan.saves, 1);
    assert.equal(plan.items.length, 3);
    assert.equal(dinner._id, "d1");
    assert.equal(dinner.scheduledAt, "20:00");
    assert.equal(dinner.anchor, "fixed");
    assert.equal(taskB.scheduledAt, "21:00");
    assert.equal(taskC.scheduledAt, "22:00");
  });

  it("rolls every task back when the save fails", async () => {
    const dinner = item({ _id: "d1", title: "Dinner", scheduledAt: "19:00", anchor: "home" });
    const taskB = item({ _id: "b1", title: "Task B", scheduledAt: "20:00", anchor: "home" });
    let saves = 0;
    const plan = {
      items: [dinner, taskB],
      async save() {
        saves += 1;
        if (saves === 1) throw new Error("disk full");
      },
    };

    await assert.rejects(() => applyTaskShift(null, plan, { offsetMin: 60, nowHHMM: NOW, nowMs: NOW_MS }));
    assert.equal(dinner.scheduledAt, "19:00");
    assert.equal(dinner.anchor, "home");
    assert.equal(taskB.scheduledAt, "20:00");
    assert.equal(plan.items.length, 2);
    assert.equal(saves, 2);
  });

  it("does not write when the offset is missing", async () => {
    const dinner = item({ _id: "d1", title: "Dinner", scheduledAt: "19:00" });
    const plan = { items: [dinner], saves: 0, async save() { this.saves += 1; } };
    const result = await applyTaskShift(null, plan, { offsetMin: 0, nowHHMM: NOW, nowMs: NOW_MS });
    assert.equal(result.ok, false);
    assert.equal(plan.saves, 0);
    assert.equal(dinner.scheduledAt, "19:00");
  });
});
