const { RoutineTemplate } = require("./models");
const { seasonalFruitsForMonth } = require("./seed/rajRoutine");

const PREP_KEY = "tomorrow-prep";
const DEFAULT_PREP_TIME = "20:00";
const FOOD_KEYS = new Set(["breakfast", "seasonal-fruit", "seeds-dryfruits", "dinner", "office"]);

function weekdayFromDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function nextDateIST(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function fillSeasonalFruit(items, date) {
  const month = Number(date.slice(5, 7));
  const fruits = seasonalFruitsForMonth(month);
  return (items || []).map((item) =>
    item.key === "seasonal-fruit"
      ? { ...item, steps: [{ key: "fruit", label: `In season this month: ${fruits.join(", ")}. Pick 1–2.` }] }
      : item
  );
}

function foodLines(items) {
  const lines = [];
  for (const item of items) {
    if (item.key === "breakfast") {
      lines.push({
        key: "breakfast",
        label: "Breakfast: eggs or other protein, oats/poha/roti, fruit, nuts.",
      });
    } else if (item.key === "seasonal-fruit") {
      const raw = (item.steps || [])[0]?.label || "";
      const fruits = raw.replace(/^In season this month:\s*/, "").replace(/\. Pick 1–2\.$/, "");
      lines.push({
        key: "fruit",
        label: fruits ? `Fruit: ${fruits}. Pick 1–2.` : "Fruit: pick 1–2 seasonal pieces.",
      });
    } else if (item.key === "seeds-dryfruits") {
      for (const step of item.steps || []) {
        if (step.label) lines.push({ key: step.key, label: step.label });
      }
    } else if (item.key === "dinner") {
      lines.push({ key: "dinner", label: "Dinner: protein, vegetables, and moderate carbs." });
    } else if (item.key === "office") {
      for (const step of item.steps || []) {
        if ((step.key === "lunch" || step.key === "snack") && step.label) {
          lines.push({ key: step.key, label: step.label });
        }
      }
    }
  }
  return lines;
}

async function previewTomorrowFood(user, date) {
  const tomorrow = nextDateIST(date);
  const weekday = weekdayFromDate(tomorrow);
  const template = await RoutineTemplate.findOne({ userId: user._id, weekday }).lean();
  if (!template) return [];
  return foodLines(fillSeasonalFruit(template.items, tomorrow).filter((item) => FOOD_KEYS.has(item.key)));
}

function buildPrepItem(user, lines) {
  const scheduledAt =
    user.prepTarget && /^([01]\d|2[0-3]):[0-5]\d$/.test(user.prepTarget) ? user.prepTarget : DEFAULT_PREP_TIME;
  return {
    key: PREP_KEY,
    domain: "health",
    title: "Get tomorrow's food ready",
    scheduledAt,
    durationMin: 10,
    alertLevel: "important",
    alarmMode: "none",
    anchor: "fixed",
    flexible: false,
    locked: true,
    source: "routine",
    status: "pending",
    steps: [
      { key: "set-out", label: "Set these out tonight so tomorrow is easy.", done: false },
      ...lines.map((line) => ({ key: line.key, label: line.label, done: false })),
    ],
  };
}

async function previewPrepItem(user, date) {
  return buildPrepItem(user, await previewTomorrowFood(user, date));
}

function stepsMatch(current, next) {
  const left = (current || []).map((s) => s.label).join("\n");
  const right = (next || []).map((s) => s.label).join("\n");
  return left === right;
}

async function mergeTomorrowPrep(user, plan) {
  const next = await previewPrepItem(user, plan.date);
  const existing = plan.items.find((item) => item.key === PREP_KEY);
  if (!existing) {
    plan.items.push(next);
    plan.items = [...plan.items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    await plan.save();
    return plan;
  }

  let dirty = false;
  if (!existing.locked) {
    existing.locked = true;
    dirty = true;
  }
  if (existing.anchor !== "fixed") {
    existing.anchor = "fixed";
    dirty = true;
  }
  if (existing.status === "pending") {
    if (existing.scheduledAt !== next.scheduledAt) {
      existing.scheduledAt = next.scheduledAt;
      dirty = true;
    }
    const anyDone = (existing.steps || []).some((step) => step.done);
    if (!anyDone && (existing.title !== next.title || !stepsMatch(existing.steps, next.steps))) {
      existing.title = next.title;
      existing.steps = next.steps;
      dirty = true;
    }
  }
  if (dirty) {
    plan.items = [...plan.items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    await plan.save();
  }
  return plan;
}

function isLockedItem(item) {
  return Boolean(item && (item.locked || item.key === PREP_KEY));
}

module.exports = {
  PREP_KEY,
  DEFAULT_PREP_TIME,
  previewPrepItem,
  mergeTomorrowPrep,
  isLockedItem,
};
