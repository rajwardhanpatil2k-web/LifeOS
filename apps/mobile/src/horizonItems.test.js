import test from "node:test";
import assert from "node:assert/strict";
import { itemsToArm } from "./horizonItems.js";
import { startMillis } from "./taskCallConfig.js";

test("tomorrow's clock is the next day, not today", () => {
  const now = new Date("2026-10-20T12:00:00+05:30");
  const today = startMillis("07:00", now, "2026-10-20");
  const tomorrow = startMillis("07:00", now, "2026-10-21");
  assert.equal(tomorrow - today, 24 * 60 * 60 * 1000);
});

test("horizon arms three days and drops future info lines", () => {
  const horizon = {
    today: "2026-10-20",
    days: [
      { date: "2026-10-20", items: [{ key: "wake", alertLevel: "info" }, { key: "gym" }] },
      { date: "2026-10-21", items: [{ key: "note", alertLevel: "info" }, { key: "gym" }] },
      { date: "2026-10-22", items: [{ key: "dinner" }] },
    ],
  };
  const armed = itemsToArm(horizon, [], "2026-10-20");
  assert.deepEqual(
    armed.map((item) => `${item.planDate}:${item.key}`),
    ["2026-10-20:wake", "2026-10-20:gym", "2026-10-21:gym", "2026-10-22:dinner"]
  );
});

test("without a horizon the current day is still armed", () => {
  const armed = itemsToArm(null, [{ key: "lunch" }], "2026-10-20");
  assert.equal(armed[0].planDate, "2026-10-20");
  assert.equal(armed[0].key, "lunch");
});
