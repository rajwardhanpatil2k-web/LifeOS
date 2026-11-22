import test from "node:test";
import assert from "node:assert/strict";
import { explicitDurationMin, snoozeDelayMs } from "./taskCallConfig.js";
import { planTaskCalls } from "./taskCallPlanner.js";
import { interpretCallReplies } from "./voiceAgent.js";

const NOW_3PM = new Date("2026-11-22T15:00:00+05:30").getTime();
const NOW_6PM = new Date("2026-11-22T18:00:00+05:30").getTime();

function task(extra = {}) {
  return {
    _id: "task-1",
    title: "Deep work",
    status: "pending",
    scheduledAt: "16:00",
    planDate: "2026-11-22",
    durationMin: 30,
    alertLevel: "normal",
    domain: "work",
    ...extra,
  };
}

function phases(items, options) {
  return planTaskCalls(items, { voiceAlerts: false, name: "Raj", ...options }).map((row) => row.phase);
}

test("a future task rings the start call only", () => {
  const planned = planTaskCalls([task()], { now: NOW_3PM, voiceAlerts: false });
  assert.deepEqual(phases([task()], { now: NOW_3PM }), ["start"]);
  assert.equal(planned[0].durationMin, 30);
  assert.equal(new Date(planned[0].at).toISOString(), "2026-11-22T10:30:00.000Z");
});

test("a late task still asks if you are ready", () => {
  assert.deepEqual(phases([task()], { now: NOW_6PM }), ["start"]);
});

test("the end call waits until the task has started and has its own duration", () => {
  const startedAt = "2026-11-22T16:05:00+05:30";
  const planned = planTaskCalls([task({ startedAt })], { now: NOW_3PM, voiceAlerts: false });
  assert.deepEqual(
    planned.map((row) => row.phase),
    ["end"]
  );
  assert.equal(new Date(planned[0].at).toISOString(), "2026-11-22T11:05:00.000Z");
  assert.deepEqual(phases([task({ startedAt, durationMin: 0 })], { now: NOW_3PM }), []);
  assert.deepEqual(phases([task({ startedAt, durationMin: undefined })], { now: NOW_6PM }), []);
});

test("three missed end rings stop the end call and a later remind brings it back", () => {
  const startedAt = "2026-11-22T16:00:00+05:30";
  const started = task({ startedAt });
  assert.deepEqual(phases([started], { now: NOW_6PM, endGaveUpIds: ["task-1"] }), []);
  const followUpUntil = "2026-11-22T18:15:00+05:30";
  const reminded = planTaskCalls([task({ startedAt, followUpUntil })], {
    now: NOW_6PM,
    voiceAlerts: false,
    endGaveUpIds: ["task-1"],
  });
  assert.equal(reminded.length, 1);
  assert.equal(reminded[0].phase, "end");
  assert.equal(new Date(reminded[0].at).toISOString(), "2026-11-22T12:45:00.000Z");
});

test("reject keeps the promised delay", () => {
  assert.equal(snoozeDelayMs("start"), 5 * 60 * 1000);
  assert.equal(snoozeDelayMs("end"), 15 * 60 * 1000);
  assert.equal(snoozeDelayMs("start", 12), 12 * 60 * 1000);
  assert.equal(explicitDurationMin({ durationMin: 0 }), 0);
  assert.equal(explicitDurationMin({}), 0);
  assert.equal(explicitDurationMin({ durationMin: 30 }), 30);
});

test("saying skip marks the task skipped on either call", () => {
  assert.equal(interpretCallReplies("skip", "complete", "Did you finish?"), "skip");
  assert.equal(interpretCallReplies("skip", "ready", "Are you ready?"), "skip");
  assert.equal(interpretCallReplies("remind me", "complete", "Did you finish?"), "remind");
  assert.equal(interpretCallReplies("not yet", "complete", "Did you finish?"), "remind");
  assert.equal(interpretCallReplies("don't skip", "complete", "Did you finish?"), null);
});
