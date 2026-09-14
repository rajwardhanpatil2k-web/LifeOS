const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  applyCatchUp,
  startFocusBlock,
  resumeFocusBlock,
  CATCH_UP_GAP_MS,
  istDate,
} = require("./focusBlock");
const { fallbackAssistant, parseDurationMin } = require("./voiceAssistant");

function item(partial) {
  return {
    status: "pending",
    alarmMode: "none",
    durationMin: 30,
    domain: "ops",
    ...partial,
  };
}

function planWith(items, date = "2026-09-14") {
  return { date, items };
}

const user = { sleepTarget: "22:30", focusBlock: { active: false } };

describe("parseDurationMin", () => {
  it("uses the upper bound of a range", () => {
    assert.equal(parseDurationMin("don't disturb me for one to two hours"), 120);
    assert.equal(parseDurationMin("pause for 1-2 hours"), 120);
  });

  it("parses an hour and half hour", () => {
    assert.equal(parseDurationMin("pause for an hour"), 60);
    assert.equal(parseDurationMin("don't disturb me for a half hour"), 30);
  });
});

describe("fallbackAssistant", () => {
  it("classifies pause, resume, defer, add, and skip", () => {
    assert.equal(fallbackAssistant("Don't disturb me for two hours, I'm cutting my hair").intent, "pause_focus");
    assert.equal(fallbackAssistant("I'm back").intent, "resume_focus");
    assert.equal(fallbackAssistant("For workout, alert me after 30 minutes").intent, "defer_task");
    assert.equal(fallbackAssistant("laundry around 8 PM").intent, "add_task");
    assert.equal(fallbackAssistant("skip all tasks today, I'm busy with other work").intent, "skip_tasks");
  });
});

describe("applyCatchUp", () => {
  it("holds missed items slot-by-slot and leaves future items alone", () => {
    const workout = item({ key: "workout", title: "Workout", scheduledAt: "17:00" });
    const skin = item({ key: "skin-evening", title: "Skin", scheduledAt: "17:30" });
    const dinner = item({ key: "dinner", title: "Dinner", scheduledAt: "21:00", domain: "health" });
    const plan = planWith([workout, skin, dinner]);
    const until = istDate(plan.date, "18:00");

    applyCatchUp(plan, user, until);

    assert.equal(workout.holdReason, "focus_block");
    assert.equal(skin.holdReason, "focus_block");
    assert.equal(dinner.holdReason, undefined);
    assert.equal(new Date(skin.snoozeUntil).getTime() - new Date(workout.snoozeUntil).getTime(), CATCH_UP_GAP_MS);
    assert.equal(new Date(workout.snoozeUntil).getTime(), until.getTime());
  });

  it("skips a stale breakfast instead of catching it up at night", () => {
    const breakfast = item({ key: "breakfast", title: "Breakfast", scheduledAt: "07:40", domain: "health" });
    const plan = planWith([breakfast]);
    applyCatchUp(plan, user, istDate(plan.date, "20:00"));
    assert.equal(breakfast.status, "skipped");
    assert.equal(breakfast.skippedReason, "missed_during_focus");
  });

  it("on early resume, restores still-future items and catch-up only what was missed", () => {
    const missed = item({ key: "workout", title: "Workout", scheduledAt: "17:00" });
    const later = item({ key: "study", title: "Study", scheduledAt: "20:00", domain: "learning" });
    const plan = planWith([missed, later]);
    const pauseUntil = istDate(plan.date, "21:00");
    applyCatchUp(plan, user, pauseUntil);
    assert.equal(later.holdReason, "focus_block");

    const now = istDate(plan.date, "18:00");
    resumeFocusBlock({ ...user, focusBlock: { active: true, until: pauseUntil, reason: "hair" } }, plan, now);

    assert.equal(later.holdReason, undefined);
    assert.equal(missed.holdReason, "focus_block");
    assert.equal(new Date(missed.snoozeUntil).getTime(), now.getTime());
  });
});

describe("startFocusBlock", () => {
  it("persists an active block until the requested window", () => {
    const plan = planWith([item({ key: "workout", title: "Workout", scheduledAt: "17:00" })]);
    const now = istDate(plan.date, "16:00");
    const raj = { sleepTarget: "22:30", focusBlock: { active: false } };
    const result = startFocusBlock(raj, plan, { durationMin: 90, reason: "cutting hair", now });
    assert.equal(raj.focusBlock.active, true);
    assert.equal(raj.focusBlock.reason, "cutting hair");
    assert.equal(result.until.getTime(), now.getTime() + 90 * 60 * 1000);
  });
});
