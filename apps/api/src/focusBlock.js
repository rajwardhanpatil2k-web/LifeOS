const IST = "Asia/Kolkata";
const CATCH_UP_GAP_MS = 5 * 60 * 1000;
const CALL_GAP_MS = 2 * 60 * 1000;
const MEAL_STALE_MS = 3 * 60 * 60 * 1000;
const MIN_PAUSE_MIN = 10;
const MAX_PAUSE_MIN = 240;
const DEFAULT_PAUSE_MIN = 60;
const STALE_MEAL_KEYS = new Set(["breakfast", "lunch", "dinner", "seasonal-fruit"]);

function padTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function todayIST(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hhmmIST(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatClock12(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function istDate(dateStr, hhmm) {
  const clock = TIME_RE.test(hhmm) ? hhmm : "00:00";
  return new Date(`${dateStr}T${clock}:00+05:30`);
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function sleepAt(user, dateStr) {
  const clock = TIME_RE.test(user?.sleepTarget) ? user.sleepTarget : "22:30";
  return istDate(dateStr, clock);
}

function isCallable(item) {
  return item && item.status === "pending" && item.alarmMode !== "scan_dismiss";
}

function originalFireMs(item, dateStr) {
  const start = istDate(dateStr, item.scheduledAt).getTime();
  if (item.startedAt) {
    const duration = (Number(item.durationMin) > 0 ? Number(item.durationMin) : 15) * 60 * 1000;
    return start + duration;
  }
  return start;
}

function isStaleMeal(item, untilMs, dateStr) {
  return STALE_MEAL_KEYS.has(item.key) && originalFireMs(item, dateStr) + MEAL_STALE_MS < untilMs;
}

function nextFreeSlot(desiredAt, occupiedAts, gapMs = CALL_GAP_MS) {
  let at = desiredAt;
  let moved = true;
  while (moved) {
    moved = false;
    for (const other of occupiedAts) {
      if (Math.abs(at - other) < gapMs) {
        at = other + gapMs;
        moved = true;
      }
    }
  }
  return at;
}

function clearFocusHold(item) {
  if (item.holdReason !== "focus_block") return;
  if (item.startedAt) item.followUpUntil = undefined;
  else item.snoozeUntil = undefined;
  item.heldUntil = undefined;
  item.holdReason = undefined;
}

function skipMissed(item, skipped) {
  item.status = "skipped";
  item.skippedReason = "missed_during_focus";
  item.snoozeUntil = undefined;
  item.followUpUntil = undefined;
  item.heldUntil = undefined;
  item.holdReason = undefined;
  skipped.push(item);
}

function holdItem(item, atDate, untilDate) {
  if (item.startedAt) item.followUpUntil = atDate;
  else item.snoozeUntil = atDate;
  item.heldUntil = untilDate;
  item.holdReason = "focus_block";
}

function applyCatchUp(plan, user, until) {
  const dateStr = plan.date;
  const untilMs = until.getTime();
  const sleepMs = sleepAt(user, dateStr).getTime();
  const skipped = [];

  for (const item of plan.items) {
    if (!isCallable(item)) continue;
    if (item.holdReason === "defer") continue;
    if (item.holdReason === "focus_block" && originalFireMs(item, dateStr) >= untilMs) {
      clearFocusHold(item);
    }
  }

  const candidates = plan.items.filter((item) => {
    if (!isCallable(item)) return false;
    if (item.holdReason === "defer") {
      const when = item.startedAt ? item.followUpUntil : item.snoozeUntil;
      if (when && new Date(when).getTime() >= untilMs) return false;
    }
    return originalFireMs(item, dateStr) < untilMs;
  });

  candidates.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));

  const occupied = [];
  const candidateSet = new Set(candidates);
  for (const item of plan.items) {
    if (!isCallable(item) || candidateSet.has(item)) continue;
    occupied.push(originalFireMs(item, dateStr));
  }

  let t = untilMs;
  for (const item of candidates) {
    if (isStaleMeal(item, untilMs, dateStr) || item.key === "sleep") {
      skipMissed(item, skipped);
      continue;
    }

    t = nextFreeSlot(Math.max(t, untilMs), occupied, CALL_GAP_MS);
    if (t >= sleepMs) {
      skipMissed(item, skipped);
      continue;
    }

    holdItem(item, new Date(t), until);
    occupied.push(t);
    t += CATCH_UP_GAP_MS;
  }

  return { skipped };
}

function clampUntil(until, dateStr) {
  const endOfDay = istDate(dateStr, "23:59");
  if (until.getTime() > endOfDay.getTime()) return endOfDay;
  return until;
}

function resolveUntil({ durationMin, untilClock, now = new Date(), dateStr }) {
  const day = dateStr || todayIST(now);
  if (untilClock && TIME_RE.test(untilClock)) {
    const at = istDate(day, untilClock);
    if (at.getTime() >= now.getTime() + MIN_PAUSE_MIN * 60 * 1000) {
      return clampUntil(at, day);
    }
  }
  let minutes = Number(durationMin);
  if (!Number.isFinite(minutes) || minutes <= 0) minutes = DEFAULT_PAUSE_MIN;
  minutes = Math.max(MIN_PAUSE_MIN, Math.min(MAX_PAUSE_MIN, Math.round(minutes)));
  return clampUntil(new Date(now.getTime() + minutes * 60 * 1000), day);
}

function isFocusActive(user, now = new Date()) {
  const block = user?.focusBlock;
  if (!block?.active || !block.until) return false;
  return new Date(block.until).getTime() > now.getTime();
}

function publicFocusBlock(user, now = new Date()) {
  const block = user?.focusBlock || {};
  const until = block.until ? new Date(block.until) : null;
  const active = !!block.active && !!until && until.getTime() > now.getTime();
  return {
    active,
    until: until ? until.toISOString() : null,
    reason: String(block.reason || "").trim(),
    startedAt: block.startedAt ? new Date(block.startedAt).toISOString() : null,
    resumeMode: "catch_up",
  };
}

function expireFocusBlockIfNeeded(user, now = new Date()) {
  if (!user?.focusBlock?.active) return false;
  const until = user.focusBlock.until ? new Date(user.focusBlock.until).getTime() : 0;
  if (until > now.getTime()) return false;
  user.focusBlock.active = false;
  return true;
}

function startFocusBlock(user, plan, { durationMin, untilClock, reason, source = "ai", now = new Date() } = {}) {
  const until = resolveUntil({ durationMin, untilClock, now, dateStr: plan.date });
  const { skipped } = applyCatchUp(plan, user, until);
  user.focusBlock = {
    active: true,
    startedAt: user.focusBlock?.startedAt && isFocusActive(user, now) ? user.focusBlock.startedAt : now,
    until,
    reason: String(reason || user.focusBlock?.reason || "").trim(),
    resumeMode: "catch_up",
    source,
  };
  return { until, reason: user.focusBlock.reason, skipped };
}

function extendFocusBlock(user, plan, extraMin, now = new Date()) {
  const extra = Math.max(MIN_PAUSE_MIN, Math.min(MAX_PAUSE_MIN, Math.round(Number(extraMin) || 30)));
  const base = isFocusActive(user, now) ? new Date(user.focusBlock.until).getTime() : now.getTime();
  const until = clampUntil(new Date(base + extra * 60 * 1000), plan.date);
  const { skipped } = applyCatchUp(plan, user, until);
  user.focusBlock = {
    active: true,
    startedAt: user.focusBlock?.startedAt || now,
    until,
    reason: String(user.focusBlock?.reason || "").trim(),
    resumeMode: "catch_up",
    source: user.focusBlock?.source || "ai",
  };
  return { until, reason: user.focusBlock.reason, skipped, extraMin: extra };
}

function resumeFocusBlock(user, plan, now = new Date()) {
  const reason = String(user.focusBlock?.reason || "").trim();
  const { skipped } = applyCatchUp(plan, user, now);
  user.focusBlock = {
    active: false,
    startedAt: user.focusBlock?.startedAt || now,
    until: now,
    reason,
    resumeMode: "catch_up",
    source: user.focusBlock?.source || "ai",
  };
  return { until: now, reason, skipped };
}

function applyDefer(user, item, minutes, now = new Date()) {
  let mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) mins = 30;
  mins = Math.max(1, Math.min(MAX_PAUSE_MIN, Math.round(mins)));
  let at = new Date(now.getTime() + mins * 60 * 1000);
  if (isFocusActive(user, now)) {
    const pauseUntil = new Date(user.focusBlock.until);
    if (pauseUntil.getTime() > at.getTime()) at = pauseUntil;
  }
  if (item.startedAt) item.followUpUntil = at;
  else item.snoozeUntil = at;
  item.heldUntil = at;
  item.holdReason = "defer";
  return { minutes: mins, at };
}

function resolveDeferItem(plan, titleQuery) {
  const pending = (plan.items || []).filter(isCallable);
  if (!pending.length) return null;
  const q = String(titleQuery || "").trim().toLowerCase();
  if (!q || q === "this" || q === "this task" || q === "it") {
    const hhmm = hhmmIST();
    const due = pending.filter((item) => String(item.scheduledAt) <= hhmm);
    return due[0] || pending[0];
  }
  const matched = pending.filter((item) => {
    const title = String(item.title || "").toLowerCase();
    const key = String(item.key || "").toLowerCase();
    const domain = String(item.domain || "").toLowerCase();
    return title.includes(q) || key.includes(q) || domain === q;
  });
  if (matched.length) {
    matched.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
    return matched[0];
  }
  return pending[0];
}

function previewForPause(until, reason) {
  const clock = formatClock12(until);
  return {
    title: `Silent until ${clock}`,
    scheduledAt: hhmmIST(until),
    reason: reason || "",
    step: reason ? `${reason}. Alarms resume slot by slot afterwards.` : "Alarms resume slot by slot afterwards.",
  };
}

function previewForDefer(item, at) {
  return {
    title: item.title,
    scheduledAt: hhmmIST(at),
    reason: "",
    step: `I'll call you at ${formatClock12(at)}.`,
  };
}

function previewForResume() {
  return {
    title: "Alarms back on",
    scheduledAt: hhmmIST(),
    reason: "",
    step: "Missed slots will ring one at a time.",
  };
}

module.exports = {
  IST,
  TIME_RE,
  CATCH_UP_GAP_MS,
  CALL_GAP_MS,
  MIN_PAUSE_MIN,
  MAX_PAUSE_MIN,
  DEFAULT_PAUSE_MIN,
  padTime,
  todayIST,
  hhmmIST,
  formatClock12,
  istDate,
  isCallable,
  applyCatchUp,
  resolveUntil,
  isFocusActive,
  publicFocusBlock,
  expireFocusBlockIfNeeded,
  startFocusBlock,
  extendFocusBlock,
  resumeFocusBlock,
  applyDefer,
  resolveDeferItem,
  previewForPause,
  previewForDefer,
  previewForResume,
};
