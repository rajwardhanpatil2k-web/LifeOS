const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseSkipReason,
  parseSkipTitleQuery,
  detectSkipScope,
  skipRemainingToday,
  skipSelected,
  skipNamed,
} = require("./skipTasks");
const { fallbackAssistant } = require("./voiceAssistant");

function item(partial) {
  return {
    status: "pending",
    alarmMode: "none",
    durationMin: 30,
    domain: "ops",
    ...partial,
  };
}

describe("parseSkipReason", () => {
  it("pulls a festival or meeting reason out of spoken skip requests", () => {
    assert.equal(
      parseSkipReason("skip all remaining tasks today because I'm visiting for Ganesh Chaturthi"),
      "I'm visiting for Ganesh Chaturthi"
    );
    assert.equal(parseSkipReason("skip these, visiting a meeting"), "A meeting");
    assert.equal(parseSkipReason("not doing these, Ganesh Chaturthi"), "Ganesh Chaturthi");
  });
});

describe("detectSkipScope", () => {
  it("skips the rest of today, selected tasks, or a named task", () => {
    assert.equal(detectSkipScope("skip all the tasks for today, I'm busy with other work").scope, "today");
    assert.equal(detectSkipScope("I will not do these things today").scope, "today");
    assert.equal(detectSkipScope("skip these because I'm in a meeting", ["a"]).scope, "selected");
    assert.equal(detectSkipScope("skip workout because I'm at a meeting").scope, "named");
    assert.equal(parseSkipTitleQuery("skip workout because I'm at a meeting"), "workout");
  });

  it("treats Ganesh / festival as skip-today when nothing is selected", () => {
    assert.equal(detectSkipScope("I'm busy with Ganesh Chaturthi").scope, "today");
  });
});

describe("skipRemainingToday", () => {
  it("skips pending work and keeps the wake QR alarm", () => {
    const workout = item({ _id: "1", key: "workout", title: "Workout", scheduledAt: "07:00" });
    const wake = item({
      _id: "2",
      key: "wake",
      title: "Wake",
      scheduledAt: "06:00",
      alarmMode: "scan_dismiss",
    });
    const done = item({ _id: "3", key: "skin", title: "Skin", scheduledAt: "07:30", status: "done" });
    const result = skipRemainingToday({ items: [workout, wake, done] }, "Ganesh Chaturthi");
    assert.equal(workout.status, "skipped");
    assert.equal(workout.skippedReason, "Ganesh Chaturthi");
    assert.equal(wake.status, "pending");
    assert.equal(done.status, "done");
    assert.equal(result.skipped.length, 1);
    assert.equal(result.kept.length, 1);
  });
});

describe("skipSelected and skipNamed", () => {
  it("skips only the highlighted tasks", () => {
    const workout = item({ _id: "w", key: "workout", title: "Workout", scheduledAt: "07:00" });
    const study = item({ _id: "s", key: "study", title: "Study", scheduledAt: "20:00", domain: "learning" });
    const result = skipSelected({ items: [workout, study] }, ["s"], "visiting family");
    assert.equal(workout.status, "pending");
    assert.equal(study.status, "skipped");
    assert.equal(study.skippedReason, "Visiting family");
    assert.equal(result.skipped.length, 1);
  });

  it("skips a named pending task", () => {
    const workout = item({ _id: "w", key: "workout", title: "Workout", scheduledAt: "07:00" });
    const study = item({ _id: "s", key: "study", title: "Study block", scheduledAt: "20:00", domain: "learning" });
    const result = skipNamed({ items: [workout, study] }, "study", "meeting");
    assert.equal(study.status, "skipped");
    assert.equal(workout.status, "pending");
    assert.equal(result.skipped[0].title, "Study block");
  });
});

describe("fallbackAssistant skip vs pause", () => {
  it("classifies skip separately from a temporary pause", () => {
    assert.equal(fallbackAssistant("Don't disturb me for two hours, I'm cutting my hair").intent, "pause_focus");
    assert.equal(fallbackAssistant("skip all remaining tasks today because I'm visiting a meeting").intent, "skip_tasks");
    assert.equal(fallbackAssistant("skip these, Ganesh Chaturthi", { itemIds: ["1"] }).skipScope, "selected");
    assert.equal(fallbackAssistant("I'm back").intent, "resume_focus");
  });
});
