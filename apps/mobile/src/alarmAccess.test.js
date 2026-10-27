import test from "node:test";
import assert from "node:assert/strict";
import { AI_MUTE_LEASE_MS } from "./taskCallConfig.js";
import { accessNotes, aiMuteHolds, muteLeaseEndsAt, shouldCancelWakeAlarm } from "./alarmAccess.js";

test("missing alarm permissions name the weaker path", () => {
  const notes = accessNotes({
    notifications: false,
    exactAlarms: false,
    fullScreen: false,
    battery: false,
  });
  assert.deepEqual(
    notes.map((note) => note.id),
    ["notifications", "exact", "fullScreen", "battery"]
  );
  assert.equal(notes.find((note) => note.id === "exact").text.includes("late"), true);
  assert.equal(notes.find((note) => note.id === "fullScreen").text.includes("notification"), true);
  assert.deepEqual(accessNotes({ exactAlarms: true, fullScreen: true, notifications: true, battery: true }), []);
});

test("a focus pause that covers wake does not cancel the wake alarm", () => {
  const wake = Date.parse("2026-10-21T06:00:00+05:30");
  assert.equal(shouldCancelWakeAlarm({ focusUntil: wake + 60 * 60 * 1000, nextWake: wake }), false);
});

test("the AI mute lease expires on its own if the app is killed", () => {
  const started = Date.parse("2026-10-20T21:00:00+05:30");
  const ends = muteLeaseEndsAt(started);
  assert.equal(ends - started, AI_MUTE_LEASE_MS);
  assert.equal(aiMuteHolds(ends, started + 60_000), true);
  assert.equal(aiMuteHolds(ends, ends), false);
});
