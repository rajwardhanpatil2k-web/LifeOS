const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDate, formatHHMM, toInstant, fromInstant, addMinutes } = require("./time");

test("Asia/Kolkata matches the current clock formatting and has no DST shift", () => {
  const samples = [
    Date.UTC(2026, 0, 1, 0, 0),
    Date.UTC(2026, 5, 15, 18, 30),
    Date.UTC(2026, 9, 19, 0, 30),
    Date.UTC(2026, 11, 31, 18, 30),
  ];
  for (const ms of samples) {
    const date = new Date(ms);
    const oldDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    const oldHHMM = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
    assert.equal(formatDate(date, "Asia/Kolkata"), oldDate);
    assert.equal(formatHHMM(date, "Asia/Kolkata"), oldHHMM === "24:00" ? "00:00" : oldHHMM);
  }
  const morning = toInstant("2026-10-19", "06:00", "Asia/Kolkata");
  const winter = toInstant("2026-01-15", "06:00", "Asia/Kolkata");
  assert.equal(morning.instant, Date.parse("2026-10-19T00:30:00.000Z"));
  assert.equal(winter.instant - Date.parse("2026-01-15T00:30:00.000Z"), 0);
  assert.equal(fromInstant(morning.instant, "Asia/Kolkata").hhmm, "06:00");
  assert.equal(morning.ambiguous, false);
});

test("spring-forward skips the missing hour and keeps real elapsed time", () => {
  const before = toInstant("2026-03-08", "01:30", "America/New_York");
  const missing = toInstant("2026-03-08", "02:30", "America/New_York");
  const after = toInstant("2026-03-08", "03:30", "America/New_York");
  assert.equal(before.exists, true);
  assert.equal(missing.exists, false);
  assert.equal(missing.instant, null);
  assert.equal(after.instant - before.instant, 60 * 60 * 1000);
  const plus = addMinutes("2026-03-08", "01:30", 90, "America/New_York");
  assert.equal(plus.hhmm, "04:00");
  assert.equal(plus.date, "2026-03-08");
});

test("fall-back keeps both instants for the repeated hour", () => {
  const first = toInstant("2026-11-01", "01:30", "America/New_York", { fold: 0 });
  const second = toInstant("2026-11-01", "01:30", "America/New_York", { fold: 1 });
  assert.equal(first.ambiguous, true);
  assert.equal(second.instant - first.instant, 60 * 60 * 1000);
  const later = fromInstant(first.instant + 60 * 60 * 1000, "America/New_York");
  assert.equal(later.hhmm, "01:30");
  assert.equal(later.fold, 1);
  assert.notEqual(later.instant, first.instant);
});
