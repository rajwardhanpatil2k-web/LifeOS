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
// Native fallback only: if JS never replans, park queued calls this far out.
export const QUEUE_RELEASE_MS = 5 * 60 * 1000;

export function durationOf(item) {
  const n = Number(item?.durationMin);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DURATION_MIN;
}

export function startMillis(scheduledAt, now = new Date()) {
  const [hours, minutes] = String(scheduledAt || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return -1;
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const clock = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const at = new Date(`${dateStr}T${clock}:00+05:30`).getTime();
  return Number.isFinite(at) ? at : -1;
}

export function endTimeMillis(item) {
  const durationMs = durationOf(item) * 60 * 1000;
  const started = item?.startedAt ? new Date(item.startedAt).getTime() : 0;
  if (Number.isFinite(started) && started > 0) return started + durationMs;
  const start = startMillis(item?.scheduledAt);
  if (start <= 0) return -1;
  return start + durationMs;
}
