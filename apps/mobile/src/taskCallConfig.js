// Shared constants for the incoming task-call flow (JS + deep links).
export const TASK_CALL_DEEP_LINK_PATH = "task-call";
export const TASK_CALL_URI_PREFIX = "lifeos://task-call";
export const START_SNOOZE_MIN = 5;
export const END_FOLLOWUP_MIN = 15;
export const DEFAULT_DURATION_MIN = 15;
export const UNANSWERED_RING_MS = 60_000;
// Never ring two task calls inside this window — overdue catch-up stays slot-by-slot.
export const CALL_GAP_MS = 5 * 60 * 1000;
// After hanging up, wait this long before the next overdue start-call.
export const AFTER_CALL_COOLDOWN_MS = 2 * 60 * 1000;
// Ask "did you finish?" this far before the next task's start, so they don't collide.
export const END_CALL_LEAD_MS = 2 * 60 * 1000;
// Native fallback only: if JS never replans, park queued calls this far out.
export const QUEUE_RELEASE_MS = 5 * 60 * 1000;

export function durationOf(item) {
  const n = Number(item?.durationMin);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DURATION_MIN;
}

export function startMillis(scheduledAt) {
  const [hours, minutes] = String(scheduledAt || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return -1;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

export function endTimeMillis(item) {
  const start = startMillis(item?.scheduledAt);
  if (start <= 0) return -1;
  return start + durationOf(item) * 60 * 1000;
}
