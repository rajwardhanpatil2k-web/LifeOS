const {
  User,
  RoutineTemplate,
  DailyPlan,
  LifeEvent,
  DailyScore,
} = require("./models");
const { LIFE_AREAS, seasonalFruitsForMonth } = require("./seed/rajRoutine");
const { computePeriodStats } = require("./insights");
const { getInsightReport } = require("./insightReport");
const { isAiEnabled } = require("./ai");
const { mergeCarryForwards, setCarryForwardStatus, createVoiceTask } = require("./voiceTask");
const { mergeTomorrowPrep, previewPrepItem, isLockedItem, PREP_KEY } = require("./tomorrowPrep");

function todayIST(dateInput) {
  if (dateInput) return dateInput;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weekdayFromDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function nowHHMM() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(totalMin) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMin));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function shiftTime(hhmm, deltaMin) {
  return minutesToHHMM(toMinutes(hhmm) + deltaMin);
}

// Two anchors drive the day: the template's "wake" item for the morning, and
// its "home" item (office end + commute) for the evening. The delta between
// each anchor and the user's configured target is applied to every item
// that follows that anchor, so changing either setting reschedules just that
// half of the day. Items with anchor "fixed" (night routine, sleep) never
// move — see clampFlexibleItems below for how that's protected.
function computeShiftMinutes(templateItems, targetTime, anchorKey) {
  if (!targetTime) return 0;
  const base = templateItems.find((i) => i.key === anchorKey);
  if (!base) return 0;
  return toMinutes(targetTime) - toMinutes(base.scheduledAt);
}

function shiftForAnchor(item, wakeShiftMin, homeShiftMin) {
  if (item.anchor === "fixed") return item.scheduledAt;
  const delta = item.anchor === "home" ? homeShiftMin : wakeShiftMin;
  return shiftTime(item.scheduledAt, delta);
}

// "flexible" items (currently just study) are allowed to compress earlier
// so they never eat into the protected fixed night routine, but they never
// push a fixed item later.
function clampFlexibleItems(items) {
  const fixedStarts = items.filter((i) => i.anchor === "fixed").map((i) => toMinutes(i.scheduledAt));
  if (!fixedStarts.length) return items;
  const earliestFixed = Math.min(...fixedStarts);
  return items.map((item) => {
    // Not yet given a status (fresh template generation) or still pending —
    // either way it's still movable. Already done/skipped keeps its
    // historical time.
    const movable = item.flexible && item.status !== "done" && item.status !== "skipped";
    if (!movable) return item;
    const start = toMinutes(item.scheduledAt);
    const end = start + (item.durationMin || 0);
    if (end <= earliestFixed) return item;
    return { ...item, scheduledAt: minutesToHHMM(Math.max(0, earliestFixed - (item.durationMin || 0))) };
  });
}

function applyShifts(templateItems, wakeShiftMin, homeShiftMin) {
  const shifted = templateItems.map((item) => ({
    ...item,
    scheduledAt: shiftForAnchor(item, wakeShiftMin, homeShiftMin),
  }));
  return clampFlexibleItems(shifted).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

// The "seasonal-fruit" item ships with a placeholder step — filled in here
// with whatever's actually in season for the target date's month, since a
// once-per-weekday template has no idea what month it'll be used in.
function fillSeasonalFruit(items, date) {
  const month = Number(date.slice(5, 7));
  const fruits = seasonalFruitsForMonth(month);
  return items.map((item) =>
    item.key === "seasonal-fruit"
      ? { ...item, steps: [{ key: "fruit", label: `In season this month: ${fruits.join(", ")}. Pick 1–2.` }] }
      : item
  );
}

function scorePlan(items) {
  const actionable = items.filter((i) => i.alertLevel !== "info");
  const total = actionable.length || items.length;
  const completed = (actionable.length ? actionable : items).filter((i) => i.status === "done").length;
  const skipped = items.filter((i) => i.status === "skipped").length;
  const overall = total ? Math.round((completed / total) * 100) : 0;
  const byDomain = {};
  for (const item of items) {
    if (!byDomain[item.domain]) byDomain[item.domain] = { done: 0, total: 0 };
    if (item.alertLevel !== "info") {
      byDomain[item.domain].total += 1;
      if (item.status === "done") byDomain[item.domain].done += 1;
    }
  }
  return { overall, completed, total, skipped, byDomain };
}

function nextAction(items, hhmm) {
  const pending = items.filter((i) => i.status === "pending");
  if (!pending.length) return null;
  const due = pending.filter((i) => i.scheduledAt <= hhmm);
  if (due.length) return due[0];
  return pending[0];
}

async function getUser() {
  let user = await User.findOne({ name: "Raj" });
  if (!user) {
    const { seed } = require("./seed/run");
    await seed({ disconnect: false });
    user = await User.findOne({ name: "Raj" });
  }
  return user;
}

async function ensureDailyPlan(user, date) {
  let plan = await DailyPlan.findOne({ userId: user._id, date });
  if (plan) {
    await mergeCarryForwards(user, plan);
    await mergeTomorrowPrep(user, plan);
    return plan;
  }
  const weekday = weekdayFromDate(date);
  const template = await RoutineTemplate.findOne({ userId: user._id, weekday });
  if (!template) throw new Error("No template for weekday " + weekday);
  const wakeShiftMin = computeShiftMinutes(template.items, user.wakeTarget, "wake");
  const homeShiftMin = computeShiftMinutes(template.items, user.homeTarget, "home");
  const scheduled = fillSeasonalFruit(applyShifts(template.items, wakeShiftMin, homeShiftMin), date);
  plan = await DailyPlan.create({
    userId: user._id,
    date,
    weekday,
    dayType: template.dayType,
    items: scheduled.map((item) => ({
      ...item,
      status: "pending",
      steps: (item.steps || []).map((s) => ({ ...s, done: false })),
    })),
    generatedFrom: template.version,
    status: "active",
    wakeShiftMin,
    homeShiftMin,
  });
  await mergeCarryForwards(user, plan);
  await mergeTomorrowPrep(user, plan);
  return plan;
}

async function saveScore(user, plan) {
  const scored = scorePlan(plan.items);
  await DailyScore.findOneAndUpdate(
    { userId: user._id, date: plan.date },
    { userId: user._id, date: plan.date, ...scored },
    { upsert: true, new: true }
  );
  return scored;
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function registerRoutes(app) {
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "life-os-api" });
  });

  app.get("/api/me", wrap(async (_req, res) => {
    const user = await getUser();
    res.json({
      user,
      areas: LIFE_AREAS,
      focus: ["skin", "hair", "fitness", "learning"],
      deferred: ["dance"],
    });
  }));

  app.get("/api/today", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.query.date);
    const plan = await ensureDailyPlan(user, date);
    const hhmm = nowHHMM();
    const scored = await saveScore(user, plan);
    res.json({
      date,
      weekday: plan.weekday,
      dayType: plan.dayType,
      now: hhmm,
      next: nextAction(plan.items, hhmm),
      items: plan.items,
      score: scored,
      focus: ["skin", "hair", "fitness", "learning"],
    });
  }));

  app.post("/api/items/:itemId/complete", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    item.status = "done";
    item.snoozeUntil = undefined;
    item.followUpUntil = undefined;
    item.steps.forEach((s) => {
      s.done = true;
      s.doneAt = s.doneAt || new Date();
    });
    await setCarryForwardStatus(user, item, "done");
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: item.domain,
      type: "complete_item",
      itemKey: item.key,
      status: "done",
      source: req.body.source || "manual",
    });
    const scored = await saveScore(user, plan);
    res.json({ item, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  app.post("/api/items/:itemId/skip", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    item.status = "skipped";
    item.skippedReason = req.body.reason || req.body.reason || "skipped";
    item.snoozeUntil = undefined;
    item.followUpUntil = undefined;
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: item.domain,
      type: "skip_item",
      itemKey: item.key,
      status: "skipped",
      notes: item.skippedReason,
    });
    const scored = await saveScore(user, plan);
    res.json({ item, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  app.post("/api/items/:itemId/undo", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    const previousStatus = item.status;
    item.status = "pending";
    item.skippedReason = undefined;
    item.startedAt = undefined;
    item.snoozeUntil = undefined;
    item.followUpUntil = undefined;
    item.steps.forEach((s) => {
      s.done = false;
      s.doneAt = null;
    });
    if (item.carryForward || item.source === "ai") {
      await setCarryForwardStatus(user, item, "open");
    }
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: item.domain,
      type: "undo_item",
      itemKey: item.key,
      status: "pending",
      notes: `was ${previousStatus}`,
    });
    const scored = await saveScore(user, plan);
    res.json({ item, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  app.post("/api/items/:itemId/steps/:stepKey", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    const step = item.steps.find((s) => s.key === req.params.stepKey);
    if (!step) return res.status(404).json({ error: "Step not found" });
    // The mobile client always POSTs an empty body — this is a genuine
    // toggle (flip whatever it currently is), not "always mark done". An
    // explicit boolean is still honored for any other caller that wants to
    // set the state directly instead of flipping it.
    step.done = typeof req.body.done === "boolean" ? req.body.done : !step.done;
    step.doneAt = step.done ? new Date() : null;
    if (item.steps.length && item.steps.every((s) => s.done)) {
      item.status = "done";
      item.snoozeUntil = undefined;
      item.followUpUntil = undefined;
      await setCarryForwardStatus(user, item, "done");
    } else if (item.status === "done") {
      // It auto-completed because every step was checked — now one isn't,
      // so it's genuinely not done anymore. Drop back to pending instead of
      // leaving a "done" item with an unchecked step.
      item.status = "pending";
      if (item.carryForward || item.source === "ai") {
        await setCarryForwardStatus(user, item, "open");
      }
    }
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: item.domain,
      type: "toggle_step",
      itemKey: item.key,
      stepKey: step.key,
      status: step.done ? "done" : "pending",
    });
    const scored = await saveScore(user, plan);
    res.json({ item, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  // Incoming-call: user answered the start ring and said they are ready.
  app.post("/api/items/:itemId/ready", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    if (item.status !== "pending") {
      return res.status(400).json({ error: "Item is no longer pending" });
    }
    item.startedAt = new Date();
    item.snoozeUntil = undefined;
    item.followUpUntil = undefined;
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: item.domain,
      type: "ready_item",
      itemKey: item.key,
      status: "pending",
      source: req.body.source || "task_call",
    });
    const scored = await saveScore(user, plan);
    res.json({ item, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  // Incoming-call: reject the start ring → remind again after `minutes` (default 5).
  app.post("/api/items/:itemId/snooze", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    if (item.status !== "pending") {
      return res.status(400).json({ error: "Item is no longer pending" });
    }
    const minutes = Number.isFinite(Number(req.body.minutes)) ? Math.max(1, Number(req.body.minutes)) : 5;
    item.snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: item.domain,
      type: "snooze_item",
      itemKey: item.key,
      status: "pending",
      notes: `${minutes}m`,
      source: req.body.source || "task_call",
    });
    const scored = await saveScore(user, plan);
    res.json({ item, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  // Incoming-call: end-of-task "I have not done it" → ring again after 15 minutes.
  app.post("/api/items/:itemId/remind-later", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    if (item.status !== "pending") {
      return res.status(400).json({ error: "Item is no longer pending" });
    }
    const minutes = Number.isFinite(Number(req.body.minutes)) ? Math.max(1, Number(req.body.minutes)) : 15;
    if (!item.startedAt) item.startedAt = new Date();
    item.followUpUntil = new Date(Date.now() + minutes * 60 * 1000);
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: item.domain,
      type: "remind_later_item",
      itemKey: item.key,
      status: "pending",
      notes: `${minutes}m`,
      source: req.body.source || "task_call",
    });
    const scored = await saveScore(user, plan);
    res.json({ item, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  // Drag-to-reorder: takes whatever subset of today's item ids you're
  // rearranging, in their new order, and reassigns them across THEIR OWN
  // existing time slots (sorted ascending) — so reordering "Intervals" above
  // "Skin morning" just swaps which one happens at which of those two times,
  // with no drift and no need to touch anything outside that subset.
  app.post("/api/today/reorder", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const order = req.body.order;
    if (!Array.isArray(order) || order.length < 2) {
      return res.status(400).json({ error: "order must include at least 2 item ids" });
    }
    const targets = order.map((id) => plan.items.id(id));
    if (targets.some((t) => !t)) return res.status(404).json({ error: "unknown item id in order" });

    const slots = targets.map((t) => t.scheduledAt).slice().sort((a, b) => a.localeCompare(b));
    order.forEach((id, idx) => {
      plan.items.id(id).scheduledAt = slots[idx];
    });
    plan.items = [...plan.items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    await plan.save();

    const scored = await saveScore(user, plan);
    res.json({ items: plan.items, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  // Manually set a task's wall-clock time (and optionally rename it).
  app.patch("/api/items/:itemId/schedule", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const { scheduledAt, title, durationMin } = req.body || {};
    if (scheduledAt) {
      if (!TIME_RE.test(scheduledAt)) return res.status(400).json({ error: "scheduledAt must be HH:MM" });
      item.scheduledAt = scheduledAt;
      // Manual time edits for today shouldn't be overwritten by a later wake/home tweak.
      item.anchor = "fixed";
      item.startedAt = undefined;
      item.snoozeUntil = undefined;
      item.followUpUntil = undefined;
      if (item.key === PREP_KEY) {
        user.prepTarget = scheduledAt;
        await user.save();
      }
    }
    if (!isLockedItem(item) && typeof title === "string" && title.trim()) item.title = title.trim();
    if (!isLockedItem(item) && Number.isFinite(durationMin) && durationMin > 0) {
      item.durationMin = Math.round(durationMin);
    }

    plan.items = [...plan.items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: item.domain,
      type: "edit_schedule",
      itemKey: item.key,
      status: item.status,
      meta: { scheduledAt: item.scheduledAt },
    });
    const scored = await saveScore(user, plan);
    res.json({ items: plan.items, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  // Add a one-off custom task to today's plan.
  app.post("/api/today/items", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const { title, scheduledAt, domain, durationMin, alertLevel } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: "title is required" });
    if (!scheduledAt || !TIME_RE.test(scheduledAt)) {
      return res.status(400).json({ error: "scheduledAt must be HH:MM" });
    }

    const allowedDomains = LIFE_AREAS.map((a) => a.key);
    const itemDomain = allowedDomains.includes(domain) ? domain : "ops";
    const level = ["info", "normal", "important", "non_negotiable"].includes(alertLevel)
      ? alertLevel
      : "normal";
    const key = `custom-${Date.now()}`;
    const label = String(title).trim();

    plan.items.push({
      key,
      domain: itemDomain,
      title: label,
      scheduledAt,
      durationMin: Number.isFinite(durationMin) && durationMin > 0 ? Math.round(durationMin) : 30,
      alertLevel: level,
      alarmMode: "none",
      anchor: "fixed",
      flexible: false,
      status: "pending",
      steps: [{ key: "main", label, done: false }],
    });
    plan.items = [...plan.items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: itemDomain,
      type: "add_item",
      itemKey: key,
      status: "pending",
      notes: label,
    });
    const scored = await saveScore(user, plan);
    res.json({ items: plan.items, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  // Remove a custom task added for today only.
  app.delete("/api/items/:itemId", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.query.date || req.body?.date);
    const plan = await ensureDailyPlan(user, date);
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    if (isLockedItem(item)) {
      return res.status(400).json({ error: "This reminder stays on the plan. You can only change its time." });
    }
    const removable = String(item.key || "").startsWith("custom-") || item.source === "ai" || item.carryForward;
    if (!removable) {
      return res.status(400).json({ error: "Only custom or AI tasks can be removed" });
    }
    if (item.source === "ai" || item.carryForward) {
      await setCarryForwardStatus(user, item, "cancelled");
    }
    plan.items = plan.items.filter((i) => String(i._id) !== String(item._id));
    await plan.save();
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: item.domain,
      type: "remove_item",
      itemKey: item.key,
      status: "removed",
      notes: item.title,
    });
    const scored = await saveScore(user, plan);
    res.json({ items: plan.items, score: scored, next: nextAction(plan.items, nowHHMM()) });
  }));

  app.post("/api/tasks/voice", wrap(async (req, res) => {
    const user = await getUser();
    const date = todayIST(req.body.date);
    const plan = await ensureDailyPlan(user, date);
    const transcript = String(req.body.transcript || "").trim();
    if (transcript.length < 3) return res.status(400).json({ error: "Say the task you want to add." });

    const { item, parsed } = await createVoiceTask(user, plan, transcript);
    await LifeEvent.create({
      userId: user._id,
      date,
      domain: parsed.domain,
      type: "add_voice_task",
      itemKey: item.key,
      status: "pending",
      notes: transcript,
      source: "ai",
    });
    const scored = await saveScore(user, plan);
    res.json({
      item,
      parsed,
      items: plan.items,
      score: scored,
      next: nextAction(plan.items, nowHHMM()),
    });
  }));

  app.get("/api/settings", wrap(async (_req, res) => {
    const user = await getUser();
    res.json({
      name: user.name || "Raj",
      wakeTarget: user.wakeTarget,
      homeTarget: user.homeTarget,
      sleepTarget: user.sleepTarget,
      prepTarget: user.prepTarget || "20:00",
      themeMode: user.themeMode,
      voiceAlerts: user.voiceAlerts !== false,
    });
  }));

  app.put("/api/settings", wrap(async (req, res) => {
    const user = await getUser();
    const { wakeTarget, homeTarget, themeMode, voiceAlerts, prepTarget } = req.body || {};
    if (wakeTarget && TIME_RE.test(wakeTarget)) user.wakeTarget = wakeTarget;
    if (homeTarget && TIME_RE.test(homeTarget)) user.homeTarget = homeTarget;
    if (prepTarget && TIME_RE.test(prepTarget)) user.prepTarget = prepTarget;
    if (themeMode === "dark" || themeMode === "light") user.themeMode = themeMode;
    if (typeof voiceAlerts === "boolean") user.voiceAlerts = voiceAlerts;
    await user.save();

    const date = todayIST();
    const plan = await DailyPlan.findOne({ userId: user._id, date });
    let scored = null;
    if (plan) {
      const weekday = weekdayFromDate(date);
      const template = await RoutineTemplate.findOne({ userId: user._id, weekday });
      if (template) {
        const newWakeShift = computeShiftMinutes(template.items, user.wakeTarget, "wake");
        const newHomeShift = computeShiftMinutes(template.items, user.homeTarget, "home");
        // Recompute pending items straight from the immutable template
        // (fresh shift + clamp) rather than nudging their current, possibly
        // already-clamped, scheduledAt — that incremental approach compounds
        // errors once clamping has kicked in once. Completed/skipped items
        // keep whatever time they actually happened at.
        const freshByKey = new Map(
          applyShifts(template.items, newWakeShift, newHomeShift).map((i) => [i.key, i])
        );
        const updated = plan.items.map((doc) => {
          const item = doc.toObject();
          if (item.status !== "pending") return item;
          if (item.key === PREP_KEY) {
            return { ...item, scheduledAt: user.prepTarget || item.scheduledAt, locked: true, anchor: "fixed" };
          }
          // Keep manually edited or custom-added times when wake/home shifts.
          if (item.anchor === "fixed") return item;
          const fresh = freshByKey.get(item.key);
          return fresh ? { ...item, scheduledAt: fresh.scheduledAt } : item;
        });
        updated.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
        plan.items = updated;
        plan.wakeShiftMin = newWakeShift;
        plan.homeShiftMin = newHomeShift;
        await plan.save();
      }
      await mergeTomorrowPrep(user, plan);
      scored = await saveScore(user, plan);
    }

    res.json({
      name: user.name || "Raj",
      wakeTarget: user.wakeTarget,
      homeTarget: user.homeTarget,
      sleepTarget: user.sleepTarget,
      prepTarget: user.prepTarget || "20:00",
      themeMode: user.themeMode,
      voiceAlerts: user.voiceAlerts !== false,
      today: plan ? { items: plan.items, score: scored, next: nextAction(plan.items, nowHHMM()) } : null,
    });
  }));

  app.get("/api/day/:date", wrap(async (req, res) => {
    const user = await getUser();
    const date = req.params.date;
    const today = todayIST();

    if (date === today) {
      const plan = await ensureDailyPlan(user, date);
      const scored = await saveScore(user, plan);
      return res.json({
        date,
        weekday: plan.weekday,
        dayType: plan.dayType,
        items: plan.items,
        score: scored,
        isToday: true,
        isPreview: false,
      });
    }

    const existing = await DailyPlan.findOne({ userId: user._id, date });
    if (existing) {
      const score = await DailyScore.findOne({ userId: user._id, date });
      return res.json({
        date,
        weekday: existing.weekday,
        dayType: existing.dayType,
        items: existing.items,
        score: score || null,
        isToday: false,
        isPreview: false,
      });
    }

    const weekday = weekdayFromDate(date);
    const template = await RoutineTemplate.findOne({ userId: user._id, weekday });
    if (!template) return res.status(404).json({ error: "No template for that day" });
    const wakeShiftMin = computeShiftMinutes(template.items, user.wakeTarget, "wake");
    const homeShiftMin = computeShiftMinutes(template.items, user.homeTarget, "home");
    const items = fillSeasonalFruit(applyShifts(template.items, wakeShiftMin, homeShiftMin), date).map((item) => ({
      ...item,
      status: "pending",
      steps: (item.steps || []).map((s) => ({ ...s, done: false })),
    }));
    items.push(await previewPrepItem(user, date));
    items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    res.json({
      date,
      weekday,
      dayType: template.dayType,
      items,
      score: null,
      isToday: false,
      isPreview: true,
    });
  }));

  app.get("/api/week", wrap(async (req, res) => {
    const user = await getUser();
    const origin = todayIST(req.query.date);
    const [y, m, d] = origin.split("-").map(Number);
    const originDate = new Date(Date.UTC(y, m - 1, d));
    const startOffset = originDate.getUTCDay();
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const dt = new Date(originDate);
      dt.setUTCDate(originDate.getUTCDate() - startOffset + i);
      const date = dt.toISOString().slice(0, 10);
      const plan = await DailyPlan.findOne({ userId: user._id, date });
      const score = await DailyScore.findOne({ userId: user._id, date });
      const template = await RoutineTemplate.findOne({
        userId: user._id,
        weekday: dt.getUTCDay(),
      });
      days.push({
        date,
        weekday: dt.getUTCDay(),
        dayType: template?.dayType,
        score: score || null,
        itemCount: plan?.items?.length || template?.items?.length || 0,
        completed: plan?.items?.filter((x) => x.status === "done").length || 0,
        highlight: (template?.items || [])
          .filter((item) => ["skin", "hair", "fitness", "learning"].includes(item.domain))
          .map((item) => item.title),
      });
    }
    res.json({ days });
  }));

  app.get("/api/progress", wrap(async (req, res) => {
    const user = await getUser();
    const scores = await DailyScore.find({ userId: user._id })
      .sort({ date: -1 })
      .limit(14);
    const events = await LifeEvent.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ scores, events });
  }));

  // Numbers only — fast, free, no OpenAI call. The app renders every chart
  // from this, so the screen is fully usable before (or without) narration.
  app.get("/api/insights", wrap(async (req, res) => {
    const user = await getUser();
    const today = todayIST();
    const period = req.query.period === "week" ? "week" : "month";
    const stats = await computePeriodStats(user, {
      period,
      date: req.query.date || today,
      today,
    });
    res.json({ stats, aiEnabled: isAiEnabled() });
  }));

  // The written review. Cached per period against a hash of the numbers, so
  // this only actually spends tokens when something changed or ?refresh=1.
  app.get("/api/insights/report", wrap(async (req, res) => {
    const user = await getUser();
    const today = todayIST();
    const period = req.query.period === "week" ? "week" : "month";
    const stats = await computePeriodStats(user, {
      period,
      date: req.query.date || today,
      today,
    });
    const report = await getInsightReport(user, stats, {
      refresh: req.query.refresh === "1",
    });
    res.json({ stats, report, aiEnabled: isAiEnabled() });
  }));

  // Month navigation for the insights screen: which months actually have data.
  app.get("/api/insights/periods", wrap(async (_req, res) => {
    const user = await getUser();
    const dates = await DailyPlan.find({ userId: user._id }).distinct("date");
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))].sort().reverse();
    res.json({ months, firstTrackedDate: dates.sort()[0] || null });
  }));
}

module.exports = { registerRoutes };
