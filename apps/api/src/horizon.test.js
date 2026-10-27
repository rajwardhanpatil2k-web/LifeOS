const test = require("node:test");
const assert = require("node:assert/strict");
const { horizonDates, addDays } = require("./horizon");
const { shouldApply } = require("./outbox");

test("horizon is today plus the next two days, capped at 3", () => {
  assert.deepEqual(horizonDates("2026-10-20", 3), ["2026-10-20", "2026-10-21", "2026-10-22"]);
  assert.deepEqual(horizonDates("2026-10-31", 9), ["2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("a repeated client id does not apply again", () => {
  const first = { clientId: "c1", clientAt: 100 };
  assert.equal(shouldApply(null, first).apply, true);
  assert.equal(shouldApply(first, first).apply, false);
  assert.equal(shouldApply(first, { clientId: "c1", clientAt: 500 }).duplicate, true);
});

test("a later client clock wins the same item field", () => {
  const earlier = { clientId: "c1", clientAt: 100 };
  assert.equal(shouldApply(earlier, { clientId: "c2", clientAt: 200 }).apply, true);
  assert.equal(shouldApply({ clientId: "c2", clientAt: 200 }, earlier).stale, true);
});
