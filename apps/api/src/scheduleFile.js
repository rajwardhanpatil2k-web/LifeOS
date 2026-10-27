const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_TYPES = new Set(["office", "weekend", "wfh", "off"]);
const ALERTS = new Set(["info", "normal", "important", "non_negotiable"]);
const ALARMS = new Set(["none", "scan_dismiss"]);
const ANCHORS = new Set(["wake", "home", "fixed"]);
const MOVABLE = new Set(["fixed", "soft", "free"]);
const CATEGORIES = new Set(["workout", "meal", "supplement", "skincare", "haircare", "study", "sleep", "work", "wellness"]);
const DEP_TYPES = new Set(["before", "with", "after", "blocks"]);
const BLOCKS = new Set(["morning", "afternoon", "night"]);
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ITEM_FIELDS = new Set([
  "key", "title", "scheduledAt", "plannedAt", "durationMin", "domain", "category",
  "alertLevel", "alarmMode", "anchor", "movable", "flexible", "locked",
  "minDurationMin", "blockId", "steps", "deps",
]);
const LIVE_FIELDS = new Set([
  "_id", "id", "__v", "status", "skippedReason", "source", "carryForward", "originKey",
  "spokenRequest", "startedAt", "snoozeUntil", "followUpUntil", "heldUntil", "holdReason",
  "createdAt", "updatedAt",
]);
const STEP_FIELDS = new Set(["key", "label"]);
const STEP_IGNORE = new Set(["done", "doneAt", "_id", "id"]);
const DEP_FIELDS = new Set(["type", "target", "minGapMin"]);
const DEP_IGNORE = new Set(["_id", "id"]);
const DAY_FIELDS = new Set(["weekday", "name", "dayType", "items"]);
const DAY_IGNORE = new Set(["_id", "id", "__v", "userId", "version", "approved", "createdAt", "updatedAt"]);
const FILE_FIELDS = new Set(["kind", "version", "days"]);

function unknownFields(value, allowed, ignored) {
  return Object.keys(value).filter((field) => !allowed.has(field) && !ignored.has(field));
}

function problem(dayName, key, message) {
  const where = [dayName, key].filter(Boolean).join(" · ");
  return where ? `${where}: ${message}` : message;
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.toObject === "function") return value.toObject();
  return value;
}

function cleanItem(raw, dayName, errors) {
  const item = asObject(raw);
  if (!item) {
    errors.push(problem(dayName, "", "Each task must be an object."));
    return null;
  }
  const key = String(item.key || "").trim();
  if (!KEY.test(key)) {
    errors.push(problem(dayName, key || "(no key)", "Give the task a key of lowercase words, like morning-skin."));
    return null;
  }
  const title = String(item.title || "").trim();
  if (!title || title.length > 120) {
    errors.push(problem(dayName, key, "Title is required and must be 120 characters or less."));
  }
  const scheduledAt = String(item.scheduledAt || "").trim();
  if (!CLOCK.test(scheduledAt)) {
    errors.push(problem(dayName, key, "Time must look like 07:00."));
  }
  const durationMin = Number(item.durationMin);
  if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 240) {
    errors.push(problem(dayName, key, "Duration must be a whole number of minutes from 1 to 240."));
  }
  const next = {
    key,
    title,
    scheduledAt,
    durationMin,
    domain: String(item.domain || "health").slice(0, 40),
    status: "pending",
    source: "routine",
    steps: [],
    deps: [],
  };
  if (item.alertLevel != null) {
    if (!ALERTS.has(item.alertLevel)) errors.push(problem(dayName, key, "alertLevel is not one of the allowed values."));
    else next.alertLevel = item.alertLevel;
  }
  if (item.alarmMode != null) {
    if (!ALARMS.has(item.alarmMode)) errors.push(problem(dayName, key, "alarmMode must be none or scan_dismiss."));
    else next.alarmMode = item.alarmMode;
  }
  if (item.anchor != null) {
    if (!ANCHORS.has(item.anchor)) errors.push(problem(dayName, key, "anchor must be wake, home, or fixed."));
    else next.anchor = item.anchor;
  }
  if (item.movable != null) {
    if (!MOVABLE.has(item.movable)) errors.push(problem(dayName, key, "movable must be fixed, soft, or free."));
    else next.movable = item.movable;
  }
  if (item.category != null && item.category !== "") {
    if (!CATEGORIES.has(item.category)) errors.push(problem(dayName, key, "category is not one of the allowed values."));
    else next.category = item.category;
  }
  if (item.blockId != null && item.blockId !== "") {
    if (!BLOCKS.has(item.blockId)) errors.push(problem(dayName, key, "blockId must be morning, afternoon, or night."));
    else next.blockId = item.blockId;
  }
  if (item.flexible != null) next.flexible = item.flexible === true;
  if (item.locked != null) next.locked = item.locked === true;
  if (item.minDurationMin != null && item.minDurationMin !== "") {
    const min = Number(item.minDurationMin);
    if (!Number.isInteger(min) || min < 1 || min > durationMin) {
      errors.push(problem(dayName, key, "minDurationMin must be a whole number no bigger than the duration."));
    } else next.minDurationMin = min;
  }
  const plannedAt = item.plannedAt == null || item.plannedAt === "" ? scheduledAt : String(item.plannedAt);
  if (!CLOCK.test(plannedAt)) errors.push(problem(dayName, key, "plannedAt must look like 07:00."));
  else next.plannedAt = plannedAt;
  if (Array.isArray(item.steps)) {
    next.steps = item.steps.map((step, index) => {
      const row = asObject(step) || {};
      for (const field of unknownFields(row, STEP_FIELDS, STEP_IGNORE)) {
        errors.push(problem(dayName, key, `Step ${index + 1} has an unknown field "${field}".`));
      }
      const stepKey = String(row.key || "").trim();
      const label = String(row.label || "").trim();
      if (!KEY.test(stepKey) || !label) {
        errors.push(problem(dayName, key, `Step ${index + 1} needs a key and a label.`));
      }
      return { key: stepKey, label: label.slice(0, 400), done: false };
    });
  }
  if (Array.isArray(item.deps)) {
    next.deps = item.deps.map((dep, index) => {
      const row = asObject(dep) || {};
      for (const field of unknownFields(row, DEP_FIELDS, DEP_IGNORE)) {
        errors.push(problem(dayName, key, `Link ${index + 1} has an unknown field "${field}".`));
      }
      if (!DEP_TYPES.has(row.type) || !KEY.test(String(row.target || ""))) {
        errors.push(problem(dayName, key, "A link needs a type (before, with, after, blocks) and a target key."));
      }
      const out = { type: row.type, target: String(row.target || "") };
      if (row.minGapMin != null && row.minGapMin !== "") {
        const gap = Number(row.minGapMin);
        if (!Number.isInteger(gap) || gap < 0 || gap > 240) {
          errors.push(problem(dayName, key, "minGapMin must be a whole number from 0 to 240."));
        } else out.minGapMin = gap;
      }
      return out;
    });
  }
  for (const field of unknownFields(item, ITEM_FIELDS, LIVE_FIELDS)) {
    errors.push(problem(dayName, key, `Unknown field "${field}". Remove it or the file will not be saved.`));
  }
  return next;
}

function validateSchedule(body) {
  const errors = [];
  const file = asObject(body);
  if (!file || file.kind !== "life-os-schedule") {
    return { ok: false, errors: ["This file is not a Life OS schedule. Export a fresh one and edit that."] };
  }
  for (const field of unknownFields(file, FILE_FIELDS, new Set())) {
    errors.push(`Unknown field "${field}". Remove it or the file will not be saved.`);
  }
  const version = String(file.version || "imported").trim().slice(0, 40) || "imported";
  if (!Array.isArray(file.days) || file.days.length !== 7) {
    errors.push("The file must contain all 7 days, Sunday through Saturday.");
    return { ok: false, errors };
  }
  const seen = new Set();
  const days = [];
  for (const rawDay of file.days) {
    const day = asObject(rawDay);
    const weekday = Number(day && day.weekday);
    const dayName = DAY_NAMES[weekday] || "Day";
    if (!day || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      errors.push("Each day needs a weekday from 0 (Sunday) to 6 (Saturday).");
      continue;
    }
    if (seen.has(weekday)) errors.push(problem(dayName, "", "This weekday is listed twice."));
    seen.add(weekday);
    for (const field of unknownFields(day, DAY_FIELDS, DAY_IGNORE)) {
      errors.push(problem(dayName, "", `Unknown field "${field}". Remove it or the file will not be saved.`));
    }
    if (!DAY_TYPES.has(day.dayType)) {
      errors.push(problem(dayName, "", "dayType must be office, wfh, off, or weekend."));
    }
    if (!Array.isArray(day.items)) {
      errors.push(problem(dayName, "", "items must be a list."));
      continue;
    }
    const keys = new Set();
    const items = [];
    for (const rawItem of day.items) {
      const item = cleanItem(rawItem, dayName, errors);
      if (!item) continue;
      if (keys.has(item.key)) errors.push(problem(dayName, item.key, "Two tasks share this key."));
      keys.add(item.key);
      items.push(item);
    }
    for (const item of items) {
      for (const dep of item.deps || []) {
        if (dep.type === "blocks" || !dep.target || keys.has(dep.target)) continue;
        errors.push(problem(dayName, item.key, `It points at ${dep.target}, which is not on this day.`));
      }
    }
    items.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
    days.push({ weekday, name: DAY_NAMES[weekday], dayType: day.dayType, items });
  }
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    if (!seen.has(weekday)) errors.push(`Missing ${DAY_NAMES[weekday]}.`);
  }
  days.sort((a, b) => a.weekday - b.weekday);
  return { ok: errors.length === 0, errors, version, days };
}

function publicItem(raw) {
  const item = asObject(raw) || {};
  const next = {
    key: item.key,
    title: item.title,
    scheduledAt: item.scheduledAt,
    plannedAt: item.plannedAt || item.scheduledAt,
    durationMin: item.durationMin,
    domain: item.domain,
    category: item.category,
    alertLevel: item.alertLevel,
    alarmMode: item.alarmMode,
    anchor: item.anchor,
    movable: item.movable,
    flexible: item.flexible,
    locked: item.locked,
    minDurationMin: item.minDurationMin,
    blockId: item.blockId,
    steps: (item.steps || []).map((step) => ({ key: step.key, label: step.label })),
    deps: item.deps || [],
  };
  return Object.fromEntries(Object.entries(next).filter(([, value]) => value != null && value !== ""));
}

function toScheduleFile(templates) {
  const byDay = new Map((templates || []).map((row) => [Number(row.weekday), row]));
  const days = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const row = byDay.get(weekday);
    if (!row) return { ok: false, error: `No saved schedule for ${DAY_NAMES[weekday]}.` };
    days.push({
      weekday,
      name: DAY_NAMES[weekday],
      dayType: row.dayType,
      items: (row.items || []).map(publicItem),
    });
  }
  const version = String((byDay.get(1) || byDay.get(0) || {}).version || "imported");
  return {
    ok: true,
    schedule: { kind: "life-os-schedule", version, days },
  };
}

function mergeSteps(existing, next) {
  const previous = new Map((existing || []).map((step) => [step.key, step]));
  return (next || []).map((step) => {
    const prior = previous.get(step.key);
    return {
      key: step.key,
      label: step.label,
      done: prior ? !!prior.done : false,
      doneAt: prior && prior.done ? prior.doneAt || null : null,
    };
  });
}

function mergeDay(existingItems, templateItems) {
  const incoming = new Map(templateItems.map((item) => [item.key, item]));
  const kept = [];
  for (const raw of existingItems || []) {
    const existing = asObject(raw);
    if (!existing || !existing.key) continue;
    const next = incoming.get(existing.key);
    if (!next) {
      if (existing.status === "pending" && !existing.startedAt) continue;
      kept.push(existing);
      continue;
    }
    incoming.delete(existing.key);
    if (existing.status !== "pending" || existing.startedAt) {
      kept.push(existing);
      continue;
    }
    kept.push({
      ...existing,
      ...next,
      status: "pending",
      steps: mergeSteps(existing.steps, next.steps),
    });
  }
  for (const added of incoming.values()) {
    kept.push({ ...added, status: "pending", steps: (added.steps || []).map((step) => ({ ...step, done: false })) });
  }
  kept.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  return kept;
}

module.exports = {
  DAY_NAMES,
  validateSchedule,
  toScheduleFile,
  mergeDay,
  publicItem,
};
