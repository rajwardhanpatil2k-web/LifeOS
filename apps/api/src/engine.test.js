const test = require("node:test");
const assert = require("node:assert/strict");
const { plan, apply, confirmOp, undoShift } = require("./engine");
const { toInstant } = require("./time");

const TZ = "Asia/Kolkata";
const DATE = "2026-10-19";

function at(hhmm) {
  return toInstant(DATE, hhmm, TZ).instant;
}

function item(partial) {
  return {
    status: "pending",
    durationMin: 30,
    movable: "free",
    ...partial,
  };
}

function ctx(extra = {}) {
  return {
    now: at("06:00"),
    tz: TZ,
    date: DATE,
    bedAt: at("22:00"),
    windDownMin: 30,
    ...extra,
  };
}

function byId(list, id) {
  return list.find((row) => row.id === id);
}

test("a shift that crosses midnight is a conflict and never wraps to 00:30", () => {
  const items = [item({ id: "dinner", title: "Dinner", scheduledAt: "22:30", durationMin: 30 })];
  const result = plan(items, { type: "shift", offsetMin: 120 }, ctx({ bedAt: at("23:59"), windDownMin: 0 }));
  assert.equal(result.ok, false);
  assert.equal(result.conflicts.some((row) => row.code === "midnight"), true);
  assert.equal(JSON.stringify(result).includes("00:30"), false);
  assert.equal(apply(items, result)[0].scheduledAt, "22:30");
});

test("a shift into the bedtime window offers compress and skip", () => {
  const items = [item({ id: "dinner", title: "Dinner", scheduledAt: "19:30", durationMin: 60, movable: "soft" })];
  const result = plan(items, { type: "shift", offsetMin: 150 }, ctx());
  assert.equal(result.ok, false);
  assert.equal(result.conflicts.some((row) => row.code === "cutoff"), true);
  assert.deepEqual(result.options, ["compress", "skip"]);
  assert.equal(apply(items, result)[0].scheduledAt, "19:30");
});

test("a fixed item inside the shifted range stays and is reported", () => {
  const items = [
    item({ id: "lift", title: "Lift", scheduledAt: "10:00", durationMin: 30 }),
    item({ id: "sleep", title: "Wind down", scheduledAt: "11:00", durationMin: 30, movable: "fixed" }),
  ];
  const result = plan(items, { type: "shift", offsetMin: 60 }, ctx());
  assert.equal(result.ok, false);
  assert.equal(result.conflicts.some((row) => row.code === "fixed"), true);
  assert.equal(byId(result.preview.items, "sleep").scheduledAt, "11:00");
  assert.equal(apply(items, result)[1].scheduledAt, "11:00");
});

test("a before dependency moves both items and keeps the gap", () => {
  const items = [
    item({
      id: "banana",
      title: "Banana",
      scheduledAt: "06:45",
      durationMin: 5,
      deps: [{ type: "before", target: "workout", minGapMin: 15 }],
    }),
    item({ id: "workout", title: "Workout", scheduledAt: "07:00", durationMin: 90, category: "workout" }),
  ];
  const result = plan(items, { type: "shift", scope: "selected", targetIds: ["workout"], offsetMin: 30 }, ctx());
  assert.equal(result.ok, true);
  const next = apply(items, result);
  assert.equal(byId(next, "banana").scheduledAt, "07:15");
  assert.equal(byId(next, "workout").scheduledAt, "07:30");
  assert.equal(byId(next, "banana").plannedAt, "06:45");
});

test("a blocks dependency refuses the move", () => {
  const items = [
    item({
      id: "stamp",
      title: "Stamp",
      scheduledAt: "21:00",
      durationMin: 20,
      category: "haircare",
      deps: [{ type: "blocks", target: "oil" }],
    }),
    item({ id: "oil", title: "Oil", scheduledAt: "20:00", durationMin: 10 }),
  ];
  const result = plan(items, { type: "shift", scope: "selected", targetIds: ["oil"], offsetMin: 90 }, ctx({ bedAt: at("23:30"), windDownMin: 0 }));
  assert.equal(result.ok, false);
  assert.equal(result.conflicts.some((row) => row.code === "blocks"), true);
  assert.equal(apply(items, result)[1].scheduledAt, "20:00");
});

test("an overlap cascades by the minimum gap and keeps order", () => {
  const items = [
    item({ id: "a", scheduledAt: "10:00", durationMin: 60 }),
    item({ id: "b", scheduledAt: "10:30", durationMin: 30 }),
  ];
  const result = plan(items, { type: "shift", scope: "selected", targetIds: ["a"], offsetMin: 20 }, ctx());
  assert.equal(result.ok, true);
  const next = apply(items, result);
  assert.equal(byId(next, "a").scheduledAt, "10:20");
  assert.equal(byId(next, "b").scheduledAt, "11:25");
  assert.ok(byId(next, "a").scheduledAt < byId(next, "b").scheduledAt);
});

test("done, skipped, and started items stay put", () => {
  const items = [
    item({ id: "done", scheduledAt: "10:00", status: "done" }),
    item({ id: "skip", scheduledAt: "11:00", status: "skipped" }),
    item({ id: "live", scheduledAt: "12:00", startedAt: 1 }),
    item({ id: "open", scheduledAt: "13:00" }),
  ];
  const result = plan(items, { type: "shift", offsetMin: 60 }, ctx());
  const next = apply(items, result);
  assert.equal(result.ok, true);
  assert.equal(byId(next, "done").scheduledAt, "10:00");
  assert.equal(byId(next, "skip").scheduledAt, "11:00");
  assert.equal(byId(next, "live").scheduledAt, "12:00");
  assert.equal(byId(next, "open").scheduledAt, "14:00");
});

test("a negative shift cannot move an item into the past", () => {
  const items = [item({ id: "snack", scheduledAt: "10:10", durationMin: 15 })];
  const result = plan(items, { type: "shift", offsetMin: -30 }, ctx({ now: at("10:00") }));
  assert.equal(result.ok, false);
  assert.equal(result.conflicts.some((row) => row.code === "past"), true);
  assert.equal(apply(items, result)[0].scheduledAt, "10:10");
});

test("a zero shift and a shift over 12 hours are rejected", () => {
  const items = [item({ id: "snack", scheduledAt: "16:00" })];
  for (const offsetMin of [0, 13 * 60, -13 * 60]) {
    const result = plan(items, { type: "shift", offsetMin }, ctx());
    assert.equal(result.ok, false);
    assert.equal(result.conflicts[0].code, "rejected");
    assert.equal(apply(items, result)[0].scheduledAt, "16:00");
  }
});

test("selected scope moves only that item and its dependency group", () => {
  const items = [
    item({ id: "a", scheduledAt: "09:00" }),
    item({ id: "b", scheduledAt: "15:00" }),
    item({ id: "c", scheduledAt: "18:00" }),
  ];
  const result = plan(items, { type: "shift", scope: "selected", targetIds: ["b"], offsetMin: 30 }, ctx());
  const next = apply(items, result);
  assert.equal(byId(next, "a").scheduledAt, "09:00");
  assert.equal(byId(next, "b").scheduledAt, "15:30");
  assert.equal(byId(next, "c").scheduledAt, "18:00");
});

test("compress refuses to go below minDurationMin", () => {
  const items = [item({
    id: "dinner",
    title: "Dinner",
    scheduledAt: "19:30",
    durationMin: 60,
    minDurationMin: 50,
    movable: "soft",
  })];
  const result = plan(items, { type: "shift", offsetMin: 90, resolution: "compress" }, ctx());
  assert.equal(result.ok, false);
  assert.equal(result.conflicts.some((row) => row.code === "min_duration"), true);
  assert.equal(apply(items, result)[0].durationMin, 60);
});

test("undo restores untouched items and reports the ones that changed", () => {
  const before = [
    { id: "a", scheduledAt: "10:00", durationMin: 30, status: "pending" },
    { id: "b", scheduledAt: "11:00", durationMin: 30, status: "pending" },
  ];
  const after = [
    { id: "a", scheduledAt: "12:00", durationMin: 30, status: "pending" },
    { id: "b", scheduledAt: "13:00", durationMin: 30, status: "pending" },
  ];
  const current = [
    { id: "a", scheduledAt: "12:00", durationMin: 30, status: "done" },
    { id: "b", scheduledAt: "13:00", durationMin: 30, status: "pending" },
  ];
  const result = undoShift(before, after, current);
  assert.deepEqual(result.leftAlone, ["a"]);
  assert.deepEqual(result.restored, ["b"]);
  assert.equal(byId(result.items, "a").scheduledAt, "12:00");
  assert.equal(byId(result.items, "b").scheduledAt, "11:00");
});

test("a stale confirm token is rejected and a second confirm applies once", () => {
  const stale = confirmOp({ status: "previewed", planRevision: 3 }, 4);
  assert.equal(stale.ok, false);
  assert.equal(stale.error, "plan changed, preview again");

  let op = { status: "previewed", planRevision: 3, id: "op-1" };
  const first = confirmOp(op, 3);
  op = first.op;
  const second = confirmOp(op, 3);
  assert.equal(first.ok, true);
  assert.equal(first.idempotent, false);
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, true);
  assert.equal(second.op.status, "applied");
  assert.equal(second.op, op);
});
