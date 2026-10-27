const INTENTS = new Set(["shift", "skip", "reschedule", "pause", "resume", "extend", "defer", "add_task", "unknown"]);
const SCOPES = new Set(["all", "selected", "named", "window"]);
const FIELDS = ["intent", "scope", "offsetMin", "durationMin", "until", "targetIds", "reason"];
const MAX_SHIFT = 12 * 60;
const LEGACY = {
  shift_tasks: "shift",
  skip_tasks: "skip",
  pause_focus: "pause",
  resume_focus: "resume",
  extend_focus: "extend",
  defer_task: "defer",
  add_task: "add_task",
  unknown: "unknown",
};

function unknownIntent() {
  return {
    intent: "unknown",
    scope: "all",
    offsetMin: 0,
    durationMin: 0,
    until: "",
    targetIds: [],
    reason: "",
  };
}

function knownIds(items) {
  const ids = new Set();
  for (const item of items || []) {
    for (const value of [item._id, item.id, item.key, item.originKey]) {
      if (value != null && value !== "") ids.add(String(value));
    }
  }
  return ids;
}

function validateIntent(raw, items = []) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "I didn't understand that.", intent: unknownIntent() };
  }
  const extra = Object.keys(raw).filter((key) => !FIELDS.includes(key));
  if (extra.length) {
    return { ok: false, error: "I didn't understand that.", intent: unknownIntent() };
  }
  const intentName = INTENTS.has(raw.intent) ? raw.intent : "unknown";
  const scope = SCOPES.has(raw.scope) ? raw.scope : "all";
  const offsetMin = Number(raw.offsetMin) || 0;
  const durationMin = Number(raw.durationMin) || 0;
  if (intentName === "shift" && (offsetMin === 0 || Math.abs(offsetMin) > MAX_SHIFT)) {
    return { ok: false, error: "Say how far to shift, up to 12 hours.", intent: unknownIntent() };
  }
  if (!Number.isFinite(durationMin) || durationMin < 0 || durationMin > 240) {
    return { ok: false, error: "I didn't understand that.", intent: unknownIntent() };
  }
  const until = raw.until == null || raw.until === "" ? "" : String(raw.until);
  if (until && !/^([01]\d|2[0-3]):[0-5]\d$/.test(until)) {
    return { ok: false, error: "I didn't understand that.", intent: unknownIntent() };
  }
  const allowed = knownIds(items);
  const targetIds = (Array.isArray(raw.targetIds) ? raw.targetIds : []).map(String).filter((id) => allowed.has(id));
  if ((scope === "selected" || scope === "named") && Array.isArray(raw.targetIds) && raw.targetIds.length && !targetIds.length) {
    return { ok: false, error: "I couldn't match that to today's plan.", intent: unknownIntent() };
  }
  const reason = String(raw.reason || "").trim().slice(0, 160);
  return {
    ok: intentName !== "unknown",
    intent: { intent: intentName, scope, offsetMin, durationMin, until, targetIds, reason },
  };
}

function fromLegacy(parsed, items) {
  const scope = parsed?.skipScope === "today" ? "all" : (parsed?.skipScope || "all");
  return validateIntent({
    intent: LEGACY[parsed?.intent] || "unknown",
    scope: SCOPES.has(scope) ? scope : "all",
    offsetMin: parsed?.offsetMin || 0,
    durationMin: parsed?.durationMin || 0,
    until: parsed?.until || "",
    targetIds: parsed?.taskIds || [],
    reason: parsed?.reason || "",
  }, items);
}

module.exports = { validateIntent, fromLegacy, unknownIntent, INTENTS, LEGACY };
