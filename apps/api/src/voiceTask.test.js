const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseSpokenClock } = require("./clockParse");
const { fallbackParse, resolveScheduledAt } = require("./voiceTask");
const { fallbackAssistant } = require("./voiceAssistant");

const CREAM = "remind me of applying cream around 9:56";

describe("parseSpokenClock", () => {
  it("keeps 9:56 as morning when that slot is still ahead", () => {
    assert.equal(parseSpokenClock(CREAM, "09:50"), "09:56");
  });

  it("uses tonight's 9:56 when the morning slot has passed", () => {
    assert.equal(parseSpokenClock(CREAM, "21:50"), "21:56");
    assert.equal(parseSpokenClock(CREAM, "10:00"), "21:56");
  });

  it("does not treat good-morning or cream names as AM", () => {
    assert.equal(parseSpokenClock("good morning remind me cream at 9:56", "21:50"), "21:56");
    assert.equal(parseSpokenClock("morning cream around 9:56", "21:50"), "21:56");
    assert.equal(parseSpokenClock("in the morning at 9", "21:00"), "09:00");
  });

  it("honors explicit AM/PM and evening words", () => {
    assert.equal(parseSpokenClock("around 9:56 PM", "10:00"), "21:56");
    assert.equal(parseSpokenClock("around 9:56 AM", "21:50"), "09:56");
    assert.equal(parseSpokenClock("tonight at 9", "18:00"), "21:00");
    assert.equal(parseSpokenClock("in the morning at 9", "21:00"), "09:00");
    assert.equal(parseSpokenClock("laundry around 8 PM", "12:00"), "20:00");
  });

  it("does not grab duration minutes as a clock", () => {
    assert.equal(parseSpokenClock("apply cream for 30 minutes around 9:56", "21:50"), "21:56");
    assert.equal(parseSpokenClock("don't disturb for 2 hours", "21:00"), "");
  });
});

describe("fallbackParse", () => {
  it("schedules the cream reminder at the next 9:56 and keeps a short title", () => {
    const parsed = fallbackParse(CREAM, "21:50");
    assert.equal(parsed.scheduledAt, "21:56");
    assert.equal(parsed.title, "Applying cream");
    assert.equal(parsed.domain, "skin");
  });

  it("defaults to 8 PM when no clock is spoken", () => {
    assert.equal(fallbackParse("add a grocery run", "11:00").scheduledAt, "20:00");
  });
});

describe("resolveScheduledAt", () => {
  it("overrides an LLM morning clock when tonight's slot is the next one", () => {
    assert.equal(resolveScheduledAt(CREAM, "09:56", "21:50"), "21:56");
    assert.equal(resolveScheduledAt(CREAM, "10:00", "21:50"), "21:56");
  });

  it("keeps a spoken morning clock when it is still upcoming", () => {
    assert.equal(resolveScheduledAt(CREAM, "21:56", "09:50"), "09:56");
  });
});

describe("fallbackAssistant clock vs defer", () => {
  it("treats remind-me-around-clock as add_task, not defer", () => {
    assert.equal(fallbackAssistant(CREAM).intent, "add_task");
    assert.equal(fallbackAssistant("alert me after 30 minutes").intent, "defer_task");
  });
});
