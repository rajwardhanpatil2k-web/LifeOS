import test from "node:test";
import assert from "node:assert/strict";
import {
  clampLimitMinutes,
  displayUsedMs,
  filterApps,
  formatLimitMinutes,
  formatRemainingClock,
  formatSpent,
  mergeUsage,
  sanitizeLimits,
  stepLimitMinutes,
  usageSummary,
} from "./appLimitMath.js";

test("limit minutes stay inside a day-sized range", () => {
  assert.equal(clampLimitMinutes(60), 60);
  assert.equal(clampLimitMinutes(1), 5);
  assert.equal(clampLimitMinutes(24 * 60), 12 * 60);
  assert.equal(clampLimitMinutes("nope"), 60);
  assert.equal(stepLimitMinutes(60, -1), 55);
  assert.equal(stepLimitMinutes(5, -1), 5);
  assert.equal(stepLimitMinutes(12 * 60, 1), 12 * 60);
});

test("clock and duration text match the overlay", () => {
  assert.equal(formatRemainingClock(0), "0:00");
  assert.equal(formatRemainingClock(1000), "0:01");
  assert.equal(formatRemainingClock(59000), "0:59");
  assert.equal(formatRemainingClock(60000), "1:00");
  assert.equal(formatRemainingClock(61000), "1:01");
  assert.equal(formatRemainingClock(3661000), "1:01:01");
  assert.equal(formatLimitMinutes(5), "5m");
  assert.equal(formatLimitMinutes(60), "1h");
  assert.equal(formatLimitMinutes(90), "1h 30m");
  assert.equal(formatSpent(30000), "<1m");
  assert.equal(formatSpent(42 * 60000), "42m");
});

test("a limit is used up only when today's foreground time reaches it", () => {
  const open = usageSummary(60, 42 * 60000);
  assert.equal(open.blocked, false);
  assert.equal(open.remainingMs, 18 * 60000);
  const done = usageSummary(60, 60 * 60000);
  assert.equal(done.blocked, true);
  assert.equal(done.remainingMs, 0);
  assert.equal(done.fraction, 1);
});

test("the on-screen clock moves only for the app in front, and only briefly", () => {
  const item = { packageName: "com.instagram.android", usedMs: 1000 };
  assert.equal(displayUsedMs(item, { foreground: "com.instagram.android", usageFetchedAt: 1000, now: 4000 }), 4000);
  assert.equal(displayUsedMs(item, { foreground: "com.google.android.youtube", usageFetchedAt: 1000, now: 4000 }), 1000);
  assert.equal(
    displayUsedMs(item, { foreground: "com.instagram.android", usageFetchedAt: 1000, now: 1000 + 60000 }),
    16000
  );
});

test("stored limits drop this app, blanks, and duplicates", () => {
  const clean = sanitizeLimits([
    { packageName: "com.instagram.android", label: "Instagram", limitMinutes: 60 },
    { packageName: "com.instagram.android", label: "Again", limitMinutes: 15 },
    { packageName: "com.raj.lifeos", label: "Life OS", limitMinutes: 30 },
    { packageName: "not a package", label: "Nope", limitMinutes: 30 },
    { packageName: "com.google.android.youtube", label: "  ", limitMinutes: 2000 },
  ]);
  assert.deepEqual(
    clean.map((item) => `${item.packageName}:${item.label}:${item.limitMinutes}`),
    ["com.instagram.android:Instagram:60", "com.google.android.youtube:com.google.android.youtube:720"]
  );
});

test("picker hides apps that already have a limit and puts Instagram and YouTube first", () => {
  const apps = [
    { packageName: "com.spotify.music", label: "Spotify" },
    { packageName: "com.google.android.youtube", label: "YouTube" },
    { packageName: "com.instagram.android", label: "Instagram" },
    { packageName: "com.zzz.notes", label: "Notes" },
  ];
  const shown = filterApps(apps, "", [{ packageName: "com.spotify.music" }]);
  assert.deepEqual(
    shown.map((app) => app.label),
    ["Instagram", "YouTube", "Notes"]
  );
  assert.deepEqual(
    filterApps(apps, "you", []).map((app) => app.packageName),
    ["com.google.android.youtube"]
  );
});

test("usage refresh updates time used without touching the chosen limit", () => {
  const merged = mergeUsage(
    [{ packageName: "com.instagram.android", label: "Instagram", limitMinutes: 120, usedMs: 0 }],
    { "com.instagram.android": 5000 }
  );
  assert.equal(merged[0].limitMinutes, 120);
  assert.equal(merged[0].usedMs, 5000);
});
