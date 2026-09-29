import { composeEndCallCue, composeStartCallCue } from "./voiceAgent";
import {
  AFTER_CALL_COOLDOWN_MS,
  CALL_GAP_MS,
  durationOf,
  endTimeMillis,
  startMillis,
} from "./taskCallConfig";

function parseMillis(value) {
  if (!value) return 0;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : 0;
}

function isCallableItem(item) {
  return item && item.status === "pending" && item.alarmMode !== "scan_dismiss";
}

function isFlexible(draft) {
  if (draft.phase === "end") return !!draft.item.followUpUntil;
  return !!draft.item.snoozeUntil;
}

function clampPause(at, now, pausedUntil) {
  if (pausedUntil > now && at < pausedUntil) return pausedUntil;
  return at;
}

// If the clock time is still ahead, keep it. If we just missed it, ring in
// 2s — not 2 minutes. The old 2-minute cooldown made a 9:00 call fire at 9:02
// whenever JS re-synced in the same minute.
function armAt(clockMs, now) {
  if (!clockMs || clockMs <= 0) return null;
  if (clockMs > now + 1_000) return { at: clockMs, catchUp: false };
  if (now - clockMs > 20 * 60 * 60 * 1000) return null;
  return { at: now + 2_000, catchUp: true };
}

function draftStart(item, now, pausedUntil) {
  if (item.startedAt) return null;
  const scheduled = startMillis(item.scheduledAt);
  const snooze = parseMillis(item.snoozeUntil);
  const clock = Math.max(scheduled, snooze);
  const armed = armAt(clock, now);
  if (!armed) return null;
  return {
    item,
    phase: "start",
    at: clampPause(armed.at, now, pausedUntil),
    flexible: !!snooze,
    catchUp: armed.catchUp,
  };
}

function draftEnd(item, now, pausedUntil) {
  const durationMs = durationOf(item) * 60 * 1000;
  if (durationMs <= 0) return null;
  const scheduledStart = startMillis(item.scheduledAt);
  const scheduledEnd = scheduledStart > 0 ? scheduledStart + durationMs : 0;
  // "I'm ready" owns the remaining duration. If they never started, the
  // scheduled slot still gets a "did you finish?" ring (9:00 + 30m → 9:30).
  const startedEnd = item.startedAt ? endTimeMillis(item) : 0;
  const followUp = parseMillis(item.followUpUntil);
  const clock = Math.max(scheduledEnd, startedEnd, followUp);
  const armed = armAt(clock, now);
  if (!armed) return null;
  return {
    item,
    phase: "end",
    at: clampPause(armed.at, now, pausedUntil),
    flexible: !!followUp,
    catchUp: armed.catchUp,
  };
}

function draftsForItem(item, now, pausedUntil) {
  const start = draftStart(item, now, pausedUntil);
  const end = draftEnd(item, now, pausedUntil);
  if (start?.catchUp && end?.catchUp) return [end];
  if (start && end && Math.abs(start.at - end.at) < 60_000) {
    return [end.catchUp || start.catchUp ? end : start];
  }
  return [start, end].filter(Boolean);
}

export function nextFreeSlot(desiredAt, occupiedAts, gapMs = CALL_GAP_MS) {
  let at = desiredAt;
  let moved = true;
  let guard = 0;
  while (moved && guard < 96) {
    guard += 1;
    moved = false;
    for (const other of occupiedAts) {
      if (Math.abs(at - other) < gapMs) {
        const next = other + gapMs;
        if (next <= at) continue;
        at = next;
        moved = true;
      }
    }
  }
  return at;
}

// Clock-anchored start/end (9:00 and 9:30) must not be shoved around to make
// room for other tasks. Only snooze / follow-up / missed catch-up may slide.
function spaceCalls(drafts, now) {
  const anchored = [];
  const floating = [];
  for (const draft of drafts) {
    if (draft.catchUp || isFlexible(draft)) floating.push(draft);
    else anchored.push(draft);
  }

  const placed = [...anchored];
  const occupied = placed.map((row) => row.at);
  floating.sort((a, b) => a.at - b.at);
  for (const draft of floating) {
    const floor = draft.catchUp ? now + 2_000 : now + AFTER_CALL_COOLDOWN_MS;
    const at = nextFreeSlot(Math.max(draft.at, floor), occupied);
    placed.push({ ...draft, at });
    occupied.push(at);
  }
  return placed.sort((a, b) => a.at - b.at);
}

function toReminder(draft, { voiceAlerts, name }) {
  const { item, phase, at } = draft;
  const spokenText = voiceAlerts
    ? phase === "end"
      ? composeEndCallCue(item, name)
      : composeStartCallCue(item, name)
    : "";
  return {
    id: String(item._id || item.originKey || item.key || ""),
    title: String(item.title || "Task"),
    spokenText,
    alertLevel: item.alertLevel === "info" ? "info" : item.alertLevel || "normal",
    at,
    phase,
    durationMin: durationOf(item),
    domain: item.domain || "",
    item,
  };
}

export function planTaskCalls(items, { now = Date.now(), voiceAlerts = true, name = "Raj", pausedUntil = 0 } = {}) {
  const pending = (items || []).filter(isCallableItem);
  const pauseMs = Number(pausedUntil) > now ? Number(pausedUntil) : 0;
  const drafts = [];
  for (const item of pending) {
    drafts.push(...draftsForItem(item, now, pauseMs));
  }
  return spaceCalls(drafts, now).map((draft) => toReminder(draft, { voiceAlerts, name }));
}

export function nextFreeCallAt(items, { desiredAt, excludeId, now = Date.now() } = {}) {
  const others = (items || []).filter((item) => String(item._id) !== String(excludeId));
  const occupied = planTaskCalls(others, { now, voiceAlerts: false }).map((row) => row.at);
  return nextFreeSlot(Math.max(desiredAt || now + 3_000, now + 3_000), occupied);
}

export function resolveCallDelay(items, { itemId, minutes, now = Date.now() } = {}) {
  const requested = Math.max(1, Number(minutes) || 5);
  const desiredAt = now + requested * 60 * 1000;
  const at = nextFreeCallAt(items, { desiredAt, excludeId: itemId, now });
  const delayMs = Math.max(3_000, at - now);
  return {
    at,
    delayMs,
    minutes: Math.max(1, Math.round(delayMs / 60_000)),
  };
}
