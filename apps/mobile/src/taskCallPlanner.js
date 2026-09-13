import { composeEndCallCue, composeStartCallCue } from "./voiceAgent";
import {
  CALL_GAP_MS,
  durationOf,
  END_CALL_LEAD_MS,
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

function nextTaskStartMs(item, pending) {
  const myStart = startMillis(item.scheduledAt);
  let next = Infinity;
  for (const other of pending) {
    if (String(other._id) === String(item._id)) continue;
    const otherStart = Math.max(startMillis(other.scheduledAt), parseMillis(other.snoozeUntil));
    if (otherStart > myStart && otherStart < next) next = otherStart;
  }
  return Number.isFinite(next) ? next : -1;
}

function pullEndBeforeNextStart(item, endAt, pending) {
  const nextStart = nextTaskStartMs(item, pending);
  if (nextStart <= 0 || endAt + CALL_GAP_MS <= nextStart) return endAt;
  const started = parseMillis(item.startedAt);
  const earliest = Math.max(startMillis(item.scheduledAt) + 60_000, started > 0 ? started + 30_000 : 0);
  return Math.max(earliest, nextStart - END_CALL_LEAD_MS);
}

function draftCall(item, pending, now) {
  if (item.startedAt) {
    let at = Math.max(endTimeMillis(item), parseMillis(item.followUpUntil));
    at = pullEndBeforeNextStart(item, at, pending);
    if (at <= now + 1_000) at = now + 4_000;
    return { item, phase: "end", at, flexible: !!item.followUpUntil };
  }

  let at = Math.max(startMillis(item.scheduledAt), parseMillis(item.snoozeUntil));
  if (at <= now + 1_000) {
    const recentlyDue = startMillis(item.scheduledAt) > now - 4 * 60 * 60 * 1000;
    if (parseMillis(item.snoozeUntil) || recentlyDue) at = now + 4_000;
    else return null;
  }
  return { item, phase: "start", at, flexible: !!item.snoozeUntil };
}

export function nextFreeSlot(desiredAt, occupiedAts, gapMs = CALL_GAP_MS) {
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

function spaceCalls(drafts, now) {
  const sorted = [...drafts].sort((a, b) => {
    if (Math.abs(a.at - b.at) >= CALL_GAP_MS) return a.at - b.at;
    const af = isFlexible(a);
    const bf = isFlexible(b);
    if (af !== bf) return af ? 1 : -1;
    if (a.phase !== b.phase) return a.phase === "end" ? -1 : 1;
    return a.at - b.at;
  });

  const placed = [];
  for (const draft of sorted) {
    const at = nextFreeSlot(Math.max(draft.at, now + 2_000), placed.map((row) => row.at));
    placed.push({ ...draft, at });
  }
  return placed;
}

function toReminder(draft, { voiceAlerts, name }) {
  const { item, phase, at } = draft;
  const spokenText = voiceAlerts
    ? phase === "end"
      ? composeEndCallCue(item, name)
      : composeStartCallCue(item, name)
    : "";
  return {
    id: String(item._id),
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

export function planTaskCalls(items, { now = Date.now(), voiceAlerts = true, name = "Raj" } = {}) {
  const pending = (items || []).filter(isCallableItem);
  const drafts = [];
  for (const item of pending) {
    const draft = draftCall(item, pending, now);
    if (draft) drafts.push(draft);
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
