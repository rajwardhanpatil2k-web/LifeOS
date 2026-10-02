const { TIME_RE } = require("./focusBlock");
const { syncCarryForwardFields } = require("./voiceTask");

const MAX_SHIFT_MIN = 12 * 60;

const WORD_NUM = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  thirty: 30,
  forty: 40,
  fortyfive: 45,
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function itemIds(item) {
  return [item?._id, item?.originKey, item?.key].filter((value) => value != null && value !== "").map(String);
}

function matchesId(item, id) {
  const want = String(id || "");
  if (!want) return false;
  return itemIds(item).includes(want);
}

function primaryId(item) {
  return itemIds(item)[0] || "";
}

function spokenNumber(raw) {
  const token = String(raw || "").toLowerCase().replace(/[\s-]/g, "");
  if (Object.prototype.hasOwnProperty.call(WORD_NUM, token)) return WORD_NUM[token];
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function shiftAmountMin(transcript) {
  const raw = String(transcript || "");
  if (/\b(?:an?\s+hour and a half|one and a half hours?)\b/i.test(raw)) return 90;
  if (/\bhalf(?:\s+an)?\s+hour\b/i.test(raw)) return 30;
  const pair = raw.match(
    /\b(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|thirty|forty|forty[-\s]?five)\s*(hours?|hrs?|minutes?|mins?)\b/i
  );
  if (!pair) return 0;
  const n = spokenNumber(pair[1]);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (/^h/i.test(pair[2])) return Math.round(n * 60);
  return Math.round(n);
}

function shiftSign(lower) {
  if (/\b(earlier|sooner)\b/.test(lower)) return -1;
  if (/\bmove back\b/.test(lower) && !/\b(ahead|later|forward)\b/.test(lower)) return -1;
  return 1;
}

function isShiftUtterance(lower) {
  const work = /\b(task|tasks|schedule|remaining|everything|rest)\b/.test(lower);
  const offset = /\b(ahead|later|earlier|sooner|forward|hour|hours|minute|minutes)\b/.test(lower);
  if (/\b(shift|reschedul\w*|postpon\w*|bump)\b/.test(lower) && (work || offset)) return true;
  if (/\bpush back\b/.test(lower) && (work || offset)) return true;
  if (/\b(move|push)\b/.test(lower) && work && offset) return true;
  return false;
}

function isBlanketShift(transcript) {
  return /\b(remaining|rest of|all|everything|my tasks|the tasks|schedule)\b/i.test(String(transcript || ""));
}

// Null when this is not a shift request. offsetMin 0 means they asked to
// shift but never said how far — callers must not invent a new task.
function detectShift(transcript) {
  const lower = String(transcript || "").toLowerCase().replace(/['’]/g, "");
  if (!isShiftUtterance(lower)) return null;
  const amount = shiftAmountMin(lower);
  return { offsetMin: amount ? shiftSign(lower) * amount : 0 };
}

function shiftClock(hhmm, offsetMin) {
  if (!TIME_RE.test(hhmm)) return "";
  const [hours, minutes] = hhmm.split(":").map(Number);
  const total = hours * 60 + minutes + offsetMin;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

function stampMs(value) {
  if (!value) return 0;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : 0;
}

function isPending(item) {
  return item && item.status !== "done" && item.status !== "skipped";
}

function isUpcoming(item, nowHHMM, nowMs) {
  if (TIME_RE.test(item.scheduledAt) && String(item.scheduledAt) >= nowHHMM) return true;
  const remind = Math.max(stampMs(item.snoozeUntil), stampMs(item.followUpUntil));
  return remind > 0 && remind >= nowMs;
}

function normalizeOffset(offsetMin) {
  const n = Math.round(Number(offsetMin));
  if (!Number.isFinite(n) || n === 0) return null;
  if (Math.abs(n) > MAX_SHIFT_MIN) return null;
  return n;
}

function knownTaskIds(items, taskIds) {
  const requested = (Array.isArray(taskIds) ? taskIds : []).map((id) => String(id)).filter(Boolean);
  if (!requested.length) return [];
  return requested.filter((id) => (items || []).some((item) => matchesId(item, id)));
}

// Pure: does not mutate items. Empty taskIds means every upcoming pending task.
function planTaskShift(items, { offsetMin, taskIds = [], nowHHMM, nowMs = Date.now() } = {}) {
  const offset = normalizeOffset(offsetMin);
  if (offset == null) {
    return { ok: false, error: "Say how far to shift, like 1 hour ahead." };
  }
  const clock = TIME_RE.test(nowHHMM) ? nowHHMM : "00:00";
  const requested = (Array.isArray(taskIds) ? taskIds : []).map((id) => String(id)).filter(Boolean);
  const known = knownTaskIds(items, requested);
  const limited = requested.length > 0;
  const changes = [];

  for (const item of items || []) {
    if (!isPending(item)) continue;
    if (limited && !known.some((id) => matchesId(item, id))) continue;
    if (!isUpcoming(item, clock, nowMs)) continue;
    const hasClock = TIME_RE.test(item.scheduledAt);
    const snooze = stampMs(item.snoozeUntil);
    const follow = stampMs(item.followUpUntil);
    if (!hasClock && !snooze && !follow) continue;
    const id = primaryId(item);
    if (!id) continue;
    changes.push({
      id,
      title: item.title || "Task",
      previousAt: hasClock ? item.scheduledAt : "",
      scheduledAt: hasClock ? shiftClock(item.scheduledAt, offset) : item.scheduledAt || "",
      snoozeUntil: snooze ? new Date(snooze + offset * 60 * 1000) : undefined,
      followUpUntil: follow ? new Date(follow + offset * 60 * 1000) : undefined,
      hadSnooze: !!snooze,
      hadFollowUp: !!follow,
    });
  }

  if (!changes.length) {
    return { ok: false, error: "Nothing left to shift. Finished tasks stay where they are." };
  }

  const first = changes[0];
  const preview = {
    title: changes.length === 1 ? first.title : `${changes.length} tasks moved`,
    scheduledAt: first.scheduledAt,
    reason: "",
    step: changes.length === 1
      ? `${first.title} is now ${first.scheduledAt}.`
      : `Moved ${changes.length} remaining tasks by ${offset} minutes.`,
  };

  return { ok: true, offsetMin: offset, changes, preview, shifted: changes };
}

function commitTaskShift(items, planned) {
  if (!planned?.ok) return planned;
  for (const change of planned.changes) {
    const item = (items || []).find((row) => matchesId(row, change.id));
    if (!item) continue;
    if (change.scheduledAt && TIME_RE.test(change.scheduledAt)) {
      item.scheduledAt = change.scheduledAt;
      item.anchor = "fixed";
    }
    if (change.hadSnooze) item.snoozeUntil = change.snoozeUntil;
    if (change.hadFollowUp) item.followUpUntil = change.followUpUntil;
  }
  return planned;
}

function snapshotItems(items) {
  return (items || []).map((item) => ({
    id: primaryId(item),
    scheduledAt: item.scheduledAt,
    anchor: item.anchor,
    snoozeUntil: item.snoozeUntil,
    followUpUntil: item.followUpUntil,
  }));
}

function restoreItems(items, snapshot) {
  for (const snap of snapshot) {
    const item = (items || []).find((row) => matchesId(row, snap.id));
    if (!item) continue;
    item.scheduledAt = snap.scheduledAt;
    item.anchor = snap.anchor;
    item.snoozeUntil = snap.snoozeUntil;
    item.followUpUntil = snap.followUpUntil;
  }
}

async function applyTaskShift(user, plan, opts) {
  const planned = planTaskShift(plan?.items || [], opts);
  if (!planned.ok) return planned;

  const snapshot = snapshotItems(plan.items);
  commitTaskShift(plan.items, planned);
  plan.items = [...plan.items].sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")));
  if (typeof plan.markModified === "function") plan.markModified("items");

  try {
    if (typeof plan.save === "function") await plan.save();
    if (user) {
      for (const change of planned.changes) {
        const item = plan.items.find((row) => matchesId(row, change.id));
        if (item) await syncCarryForwardFields(user, item);
      }
    }
  } catch (err) {
    restoreItems(plan.items, snapshot);
    plan.items = [...plan.items].sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")));
    if (typeof plan.markModified === "function") plan.markModified("items");
    if (typeof plan.save === "function") await plan.save().catch(() => {});
    throw err;
  }

  return planned;
}

module.exports = {
  MAX_SHIFT_MIN,
  detectShift,
  isBlanketShift,
  shiftClock,
  planTaskShift,
  commitTaskShift,
  applyTaskShift,
  matchesId,
};
