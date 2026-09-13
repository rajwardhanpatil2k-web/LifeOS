// Shared constants for the incoming task-call flow (JS + deep links).
export const TASK_CALL_DEEP_LINK_PATH = "task-call";
export const TASK_CALL_URI_PREFIX = "lifeos://task-call";
export const START_SNOOZE_MIN = 5;
export const END_FOLLOWUP_MIN = 15;
export const DEFAULT_DURATION_MIN = 15;
export const UNANSWERED_RING_MS = 60_000;
// Never ring two task calls inside this window.
export const CALL_GAP_MS = 2 * 60 * 1000;
// Ask "did you finish?" this far before the next task's start, so they don't collide.
export const END_CALL_LEAD_MS = 2 * 60 * 1000;
// After one call ends, wait this long before releasing a queued call.
export const QUEUE_RELEASE_MS = 8_000;

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
