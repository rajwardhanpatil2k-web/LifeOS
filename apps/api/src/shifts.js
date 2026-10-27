const { plan: planChange, confirmOp, undoShift } = require("./engine");
const { toInstant, formatHHMM, DEFAULT_TZ } = require("./time");
const { randomToken, hashToken } = require("./auth/tokens");
const { ShiftOp, DailyPlan } = require("./models");
const { isSkippable } = require("./skipTasks");
const { resolveDeferItem } = require("./focusBlock");
const { matchesId } = require("./shiftTasks");

const UNDO_MS = 10 * 60 * 1000;

function itemId(item) {
  return String(item?._id || item?.id || "");
}

function isHeld(item) {
  return !item || item.alarmMode === "scan_dismiss" || item.locked || item.anchor === "fixed" || item.movable === "fixed";
}

function shiftTargets(items, nowHHMM, targetIds = []) {
  const requested = (targetIds || []).map(String).filter(Boolean);
  const pool = (items || []).filter((item) => item.status === "pending" && !item.startedAt && !isHeld(item));
  if (!requested.length) return pool.filter((item) => String(item.scheduledAt || "") >= nowHHMM);
  return pool.filter((item) => requested.some((id) => matchesId(item, id)));
}

function engineItem(item) {
  return {
    id: itemId(item),
    title: item.title || "Task",
    scheduledAt: item.scheduledAt,
    plannedAt: item.plannedAt || item.scheduledAt,
    durationMin: Number(item.durationMin) || 15,
    minDurationMin: item.minDurationMin,
    status: item.status || "pending",
    startedAt: item.startedAt ? 1 : null,
    movable: item.movable || (item.anchor === "fixed" ? "fixed" : item.flexible ? "free" : "soft"),
    anchor: item.anchor,
    alertLevel: item.alertLevel,
    category: item.category,
    domain: item.domain,
    deps: item.deps || [],
  };
}

function bedInstant(date, tz, user, items) {
  const bed = (items || []).find((item) => item.key === "bed");
  const hhmm = bed?.scheduledAt || user?.sleepTarget || "22:30";
  const instant = toInstant(date, hhmm, tz);
  return instant.exists ? instant.instant : toInstant(date, "22:30", tz).instant;
}

function contextFor(user, plan, now = Date.now()) {
  const tz = user?.timezone || DEFAULT_TZ;
  return {
    now,
    tz,
    date: plan.date,
    bedAt: bedInstant(plan.date, tz, user, plan.items),
    windDownMin: 30,
  };
}

function rows(items) {
  return items.map((item) => ({
    id: itemId(item),
    title: item.title || "",
    scheduledAt: item.scheduledAt,
    durationMin: item.durationMin || 0,
    status: item.status || "pending",
  }));
}

function findItem(plan, id) {
  return (plan.items || []).find((item) => matchesId(item, id)) || null;
}

async function savePreview({ user, plan, source, intent, reason, before, after, changes, conflicts, summary }) {
  const token = randomToken();
  const doc = await ShiftOp.create({
    userId: user._id,
    date: plan.date,
    source: source === "ai" ? "ai" : "manual",
    intent,
    status: "previewed",
    planRevision: plan.revision || 0,
    tokenHash: hashToken(token),
    before,
    after,
    changes,
    conflicts: conflicts || [],
    reason: reason || "",
  });
  return {
    ok: true,
    needsConfirm: true,
    shift: {
      id: String(doc._id),
      token,
      status: "previewed",
      changes,
      conflicts: conflicts || [],
      undoForMs: UNDO_MS,
    },
    preview: summary,
  };
}

async function openShiftPreview(user, plan, { offsetMin, targetIds = [], source = "manual", now } = {}) {
  const ctx = contextFor(user, plan, now);
  const nowHHMM = formatHHMM(new Date(ctx.now), ctx.tz);
  const targets = shiftTargets(plan.items, nowHHMM, targetIds);
  if (!targets.length) return { ok: false, error: "Nothing left to shift. Finished tasks stay where they are." };
  const intent = {
    type: "shift",
    scope: "selected",
    offsetMin: Number(offsetMin),
    targetIds: targets.map(itemId),
  };
  const planned = planChange(targets.concat(plan.items.filter((item) => !targets.includes(item))).map(engineItem), intent, ctx);
  if (!planned.ok) {
    return { ok: false, error: planned.conflicts[0]?.message || "That shift does not fit.", conflicts: planned.conflicts };
  }
  const changedIds = new Set(planned.changes.map((change) => String(change.id)));
  const before = rows((plan.items || []).filter((item) => changedIds.has(itemId(item))));
  const after = planned.changes.map((change) => ({
    id: change.id,
    title: before.find((row) => row.id === String(change.id))?.title || "",
    scheduledAt: change.to,
    durationMin: change.durationMin,
    status: "pending",
  }));
  const count = planned.changes.length;
  const first = planned.changes[0];
  return savePreview({
    user,
    plan,
    source,
    intent: "shift",
    before,
    after,
    changes: planned.changes,
    conflicts: planned.conflicts,
    summary: {
      title: count === 1 ? `Move ${after[0]?.title || "this task"}` : `Move ${count} tasks`,
      scheduledAt: first?.to || "",
      reason: "",
      step: count === 1 ? `${after[0]?.title || "This task"} would move to ${first.to}.` : `${count} tasks would move.`,
    },
  });
}

async function openSkipPreview(user, plan, { scope = "today", itemIds = [], titleQuery = "", reason = "", source = "ai" } = {}) {
  let chosen = [];
  if (scope === "selected") {
    const ids = new Set(itemIds.map(String));
    chosen = (plan.items || []).filter((item) => ids.has(itemId(item)) || ids.has(String(item.key || "")) || ids.has(String(item.originKey || "")));
  } else if (scope === "named") {
    const item = resolveDeferItem(plan, titleQuery);
    chosen = item ? [item] : [];
  } else {
    chosen = (plan.items || []).filter((item) => item.status === "pending");
  }
  const skipped = chosen.filter(isSkippable);
  if (!skipped.length) return { ok: false, error: "Nothing pending to skip. The wake alarm stays on." };
  const before = rows(skipped);
  const after = before.map((row) => ({ ...row, status: "skipped" }));
  const count = skipped.length;
  return savePreview({
    user,
    plan,
    source,
    intent: "skip",
    reason,
    before,
    after,
    changes: [],
    conflicts: [],
    summary: {
      title: count === 1 ? `Skip ${skipped[0].title}` : `Skip ${count} tasks`,
      scheduledAt: "",
      reason: reason || "",
      step: reason ? `${reason}.` : "These would be skipped.",
      count,
    },
  });
}

async function confirmShift(user, token, now = Date.now()) {
  if (!token) return { ok: false, error: "Preview expired. Ask again." };
  const op = await ShiftOp.findOne({ tokenHash: hashToken(String(token)) });
  if (!op) return { ok: false, error: "Preview expired. Ask again." };
  const plan = await DailyPlan.findOne({ userId: user._id, date: op.date });
  if (!plan) return { ok: false, error: "That day is not available." };
  const gate = confirmOp(op.toObject(), plan.revision || 0);
  if (!gate.ok) return gate;
  if (gate.idempotent) {
    return { ok: true, idempotent: true, shiftId: String(op._id), undoUntil: op.undoUntil, plan };
  }
  if (op.intent === "skip") {
    for (const row of op.after || []) {
      const item = findItem(plan, row.id);
      if (!item || !isSkippable(item)) continue;
      item.status = "skipped";
      item.skippedReason = op.reason || "busy";
    }
  } else {
    for (const change of op.changes || []) {
      const item = findItem(plan, change.id);
      if (!item || item.status !== "pending" || item.startedAt) continue;
      if (!item.plannedAt) item.plannedAt = item.scheduledAt;
      item.scheduledAt = change.to;
      if (change.durationMin != null) item.durationMin = change.durationMin;
    }
  }
  if (typeof plan.markModified === "function") plan.markModified("items");
  await plan.save();
  op.status = "applied";
  op.appliedAt = new Date(now);
  op.undoUntil = new Date(now + UNDO_MS);
  await op.save();
  return { ok: true, idempotent: false, shiftId: String(op._id), undoUntil: op.undoUntil, plan };
}

async function undoShiftOp(user, shiftId, now = Date.now()) {
  const op = await ShiftOp.findOne({ _id: shiftId, userId: user._id });
  if (!op || op.status !== "applied") return { ok: false, error: "Nothing to undo." };
  if (!op.undoUntil || now > new Date(op.undoUntil).getTime()) {
    op.status = "expired";
    await op.save();
    return { ok: false, error: "Undo expired." };
  }
  const plan = await DailyPlan.findOne({ userId: user._id, date: op.date });
  if (!plan) return { ok: false, error: "That day is not available." };
  const current = (plan.items || []).map((item) => ({
    id: itemId(item),
    scheduledAt: item.scheduledAt,
    durationMin: item.durationMin || 0,
    status: item.status || "pending",
    startedAt: item.startedAt ? 1 : null,
  }));
  const restored = undoShift(op.before || [], op.after || [], current);
  for (const row of restored.items) {
    if (!restored.restored.includes(row.id)) continue;
    const item = findItem(plan, row.id);
    if (!item) continue;
    item.scheduledAt = row.scheduledAt;
    item.durationMin = row.durationMin;
    item.status = row.status;
    if (row.status === "pending") item.skippedReason = undefined;
  }
  if (typeof plan.markModified === "function") plan.markModified("items");
  await plan.save();
  op.status = "undone";
  await op.save();
  return { ok: true, restored: restored.restored, leftAlone: restored.leftAlone, plan };
}

module.exports = {
  UNDO_MS,
  shiftTargets,
  openShiftPreview,
  openSkipPreview,
  confirmShift,
  undoShiftOp,
};
