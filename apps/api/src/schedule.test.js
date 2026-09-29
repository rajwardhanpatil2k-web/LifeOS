const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { applyShifts, scorePlan, anchorsAreOrdered } = require("./routes");

describe("applyShifts", () => {
  const template = [
    { key: "wake", scheduledAt: "06:00", anchor: "wake", durationMin: 10, alertLevel: "non_negotiable" },
    { key: "workout", scheduledAt: "06:30", anchor: "wake", durationMin: 45, alertLevel: "non_negotiable" },
    { key: "home", scheduledAt: "19:30", anchor: "home", durationMin: 5, alertLevel: "info" },
    { key: "dinner", scheduledAt: "20:30", anchor: "home", durationMin: 30, alertLevel: "normal", flexible: true },
    { key: "skin-night", scheduledAt: "22:00", anchor: "fixed", durationMin: 20, alertLevel: "non_negotiable" },
    { key: "sleep", scheduledAt: "22:30", anchor: "fixed", durationMin: 30, alertLevel: "important" },
  ];

  it("moves the morning with wake time and leaves the night routine fixed", () => {
    const shifted = applyShifts(template, 60, 0);
    assert.equal(shifted.find((item) => item.key === "workout").scheduledAt, "07:30");
    assert.equal(shifted.find((item) => item.key === "sleep").scheduledAt, "22:30");
    assert.equal(shifted.find((item) => item.key === "skin-night").scheduledAt, "22:00");
    assert.equal(shifted.find((item) => item.key === "dinner").scheduledAt, "20:30");
  });

  it("does not roll an overflowing morning item onto 23:59", () => {
    const shifted = applyShifts(template, 18 * 60, 0);
    assert.equal(shifted.find((item) => item.key === "workout").scheduledAt, "06:30");
    assert.equal(shifted.find((item) => item.key === "sleep").scheduledAt, "22:30");
  });

  it("moves the evening with home time without touching fixed items", () => {
    const shifted = applyShifts(template, 0, 30);
    assert.equal(shifted.find((item) => item.key === "dinner").scheduledAt, "21:00");
    assert.equal(shifted.find((item) => item.key === "wake").scheduledAt, "06:00");
    assert.equal(shifted.find((item) => item.key === "sleep").scheduledAt, "22:30");
  });
});

describe("anchorsAreOrdered", () => {
  it("rejects a home time that is earlier than wake or at sleep", () => {
    assert.equal(anchorsAreOrdered({ wakeTarget: "06:00", homeTarget: "02:00", sleepTarget: "22:30" }), false);
    assert.equal(anchorsAreOrdered({ wakeTarget: "06:00", homeTarget: "22:30", sleepTarget: "22:30" }), false);
    assert.equal(anchorsAreOrdered({ wakeTarget: "11:00", homeTarget: "19:30", sleepTarget: "22:30" }), true);
  });
});

describe("scorePlan", () => {
  it("excludes info items and treats an empty actionable day as zero", () => {
    const onlyInfo = scorePlan([
      { domain: "career", alertLevel: "info", status: "pending" },
      { domain: "career", alertLevel: "info", status: "done" },
    ]);
    assert.equal(onlyInfo.total, 0);
    assert.equal(onlyInfo.overall, 0);
    assert.equal(onlyInfo.byDomain.career.total, 0);

    const mixed = scorePlan([
      { domain: "career", alertLevel: "info", status: "pending" },
      { domain: "fitness", alertLevel: "normal", status: "done" },
      { domain: "skin", alertLevel: "normal", status: "skipped" },
    ]);
    assert.equal(mixed.total, 2);
    assert.equal(mixed.completed, 1);
    assert.equal(mixed.overall, 50);
    assert.equal(mixed.skipped, 1);
  });
});
