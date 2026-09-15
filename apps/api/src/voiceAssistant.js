const { chatJson } = require("./ai");
const { createVoiceTask } = require("./voiceTask");
const { LIFE_AREAS } = require("./seed/rajRoutine");
const { parseSpokenClock } = require("./clockParse");
const {
  TIME_RE,
  hhmmIST,
  DEFAULT_PAUSE_MIN,
  MIN_PAUSE_MIN,
  MAX_PAUSE_MIN,
  startFocusBlock,
  extendFocusBlock,
  resumeFocusBlock,
  applyDefer,
  resolveDeferItem,
  isFocusActive,
  previewForPause,
  previewForDefer,
  previewForResume,
} = require("./focusBlock");
const {
  parseSkipReason,
  parseSkipTitleQuery,
  detectSkipScope,
  skipRemainingToday,
  skipSelected,
  skipNamed,
  previewForSkip,
} = require("./skipTasks");

const DOMAINS = LIFE_AREAS.map((area) => area.key);

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
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fortyfive: 45,
};

const ASSISTANT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "confidence",
    "durationMin",
    "until",
    "reason",
    "skipScope",
    "titleQuery",
    "delayMin",
    "title",
    "scheduledAt",
    "durationTaskMin",
    "domain",
    "step",
  ],
  properties: {
    intent: {
      type: "string",
      enum: ["add_task", "pause_focus", "defer_task", "resume_focus", "extend_focus", "skip_tasks", "unknown"],
    },
    skipScope: {
      type: "string",
      enum: ["today", "selected", "named", ""],
    },
    confidence: { type: "number" },
    durationMin: { type: "integer" },
    until: { type: "string" },
    reason: { type: "string" },
    titleQuery: { type: "string" },
    delayMin: { type: "integer" },
    title: { type: "string" },
    scheduledAt: { type: "string" },
    durationTaskMin: { type: "integer" },
    domain: { type: "string" },
    step: { type: "string" },
  },
};

function spokenNumber(raw) {
  const text = String(raw || "").toLowerCase().replace(/[\s-]/g, "");
  if (text === "fortyfive") return 45;
  if (Object.prototype.hasOwnProperty.call(WORD_NUM, String(raw || "").toLowerCase())) {
    return WORD_NUM[String(raw).toLowerCase()];
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function unitToMin(n, unit) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (/^h/.test(unit)) return Math.round(n * 60);
  return Math.round(n);
}

function clampPause(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return DEFAULT_PAUSE_MIN;
  return Math.max(MIN_PAUSE_MIN, Math.min(MAX_PAUSE_MIN, Math.round(minutes)));
}

function parseDurationMin(transcript) {
  const raw = String(transcript || "");
  const range = raw.match(
    /\b(?:for\s+)?(?:around\s+|about\s+)?(\d+|one|two|three|four|an?)\s*(?:to|-|or)\s*(\d+|one|two|three|four)\s*(hours?|hrs?|minutes?|mins?)\b/i
  );
  if (range) {
    const upper = spokenNumber(range[2]);
    return clampPause(unitToMin(upper, range[3]));
  }
  const hourHalf = raw.match(/\b(?:an?\s+)?hour and a half\b/i);
  if (hourHalf) return 90;
  const halfHour = raw.match(/\b(?:a\s+)?half(?: an)? hour\b/i);
  if (halfHour) return 30;
  const pair = raw.match(
    /\b(?:for\s+)?(?:around\s+|about\s+)?(\d+|one|two|three|four|an?)\s*(hours?|hrs?|minutes?|mins?)\b/i
  );
  if (pair) return clampPause(unitToMin(spokenNumber(pair[1]), pair[2]));
  return DEFAULT_PAUSE_MIN;
}

function parseDelayMin(transcript) {
  const raw = String(transcript || "");
  if (/\b(forty[\s-]?five|45)\b/.test(raw) && /\b(min|later|after|in)\b/i.test(raw)) return 45;
  if (/\b(thirty|30)\b/.test(raw) && /\b(min|later|after|in)\b/i.test(raw)) return 30;
  const match = raw.match(/\b(?:in|after)\s+(\d+|an?|one|two|three)\s*(hours?|hrs?|minutes?|mins?)\b/i);
  if (match) {
    const n = unitToMin(spokenNumber(match[1]), match[2]);
    return Math.max(1, Math.min(MAX_PAUSE_MIN, n || 30));
  }
  return 30;
}

function parseUntilClock(transcript, nowHHMM = hhmmIST()) {
  const raw = String(transcript || "");
  if (!/\b(until|till|up to)\b/i.test(raw)) return "";
  return parseSpokenClock(raw, nowHHMM);
}

function parseReason(transcript) {
  const raw = String(transcript || "").replace(/\s+/g, " ").trim();
  if (/haircut|cutting (my )?hair/i.test(raw)) return "cutting hair";
  const match = raw.match(/\b(?:because )?(?:i(?:['’]?m| am)|while i(?:['’]?m| am))\s+(.+)$/i);
  if (match) {
    const reason = match[1]
      .replace(/\bfor (around |about )?\d+.*/i, "")
      .replace(/\bfor (around |about )?(an?|one|two) .*/i, "")
      .replace(/[.,]+$/g, "")
      .trim();
    if (reason && reason.length < 80) return reason.charAt(0).toUpperCase() + reason.slice(1);
  }
  if (/\boutside\b/i.test(raw)) return "outside";
  return "";
}

function parseTitleQuery(transcript) {
  const raw = String(transcript || "");
  const match = raw.match(
    /\b(?:for|about)\s+(?:the\s+)?(.+?)\s+(?:alert|remind|call|after|in)\b/i
  ) || raw.match(/\b(?:alert|remind|call) me (?:about|for)\s+(?:the\s+)?(.+?)\s+(?:in|after)\b/i);
  if (!match) return "";
  return match[1].replace(/\b(this task|this|it)\b/gi, " ").replace(/\s+/g, " ").trim();
}

function parseExtendMin(transcript) {
  const raw = String(transcript || "");
  if (/\banother half hour\b/i.test(raw) || /\b30 more\b/i.test(raw)) return 30;
  const match = raw.match(/\b(?:another|more|extra|extend)?\s*(\d+|an?|one|two)\s*(hours?|hrs?|minutes?|mins?)(?: more)?\b/i);
  if (match) return clampPause(unitToMin(spokenNumber(match[1]), match[2]));
  return 30;
}

function fallbackAssistant(transcript, { itemIds = [] } = {}) {
  const lower = String(transcript || "").toLowerCase().replace(/['’]/g, "");
  const skip = detectSkipScope(transcript, itemIds);
  if (skip) {
    return {
      intent: "skip_tasks",
      skipScope: skip.scope,
      titleQuery: skip.titleQuery || parseSkipTitleQuery(transcript),
      reason: parseSkipReason(transcript) || parseReason(transcript),
      confidence: 0.94,
    };
  }
  if (/\b(im back|i am back|resume alarms|cancel (dnd|pause|do not disturb)|stop (the )?(pause|dnd)|alarms back on)\b/.test(lower)) {
    return { intent: "resume_focus", confidence: 0.95 };
  }
  if (/\b(another (half )?hour|\d+ more( minutes?)?|extend( the)? (pause|dnd)|give me (another )?\d+)\b/.test(lower)) {
    return { intent: "extend_focus", durationMin: parseExtendMin(transcript), confidence: 0.9 };
  }
  if (
    /\b(dont disturb|do not disturb|pause (all )?(alarms|alerts|calls)|pause for|dnd|im (outside|out|busy)|cutting (my )?hair|haircut|leave me alone)\b/.test(
      lower
    )
  ) {
    return {
      intent: "pause_focus",
      durationMin: parseDurationMin(transcript),
      until: parseUntilClock(transcript),
      reason: parseReason(transcript),
      confidence: 0.92,
    };
  }
  const hasDefer = /\b((alert|remind|call) me (in|after)|after \d+|in \d+ minutes?|snooze (this|it|for))\b/.test(lower);
  const hasClock = /\b(around|at|by)\s+\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?\b/.test(lower);
  if (hasDefer && !hasClock) {
    return {
      intent: "defer_task",
      delayMin: parseDelayMin(transcript),
      titleQuery: parseTitleQuery(transcript),
      confidence: 0.88,
    };
  }
  return { intent: "add_task", confidence: 0.4 };
}

function normalizeParsed(data, fallback) {
  const intent = data?.intent || fallback.intent || "unknown";
  const durationMin = Number.isFinite(data?.durationMin) && data.durationMin > 0
    ? clampPause(data.durationMin)
    : fallback.durationMin || DEFAULT_PAUSE_MIN;
  const delayMin = Number.isFinite(data?.delayMin) && data.delayMin > 0
    ? Math.max(1, Math.min(MAX_PAUSE_MIN, Math.round(data.delayMin)))
    : fallback.delayMin || 30;
  const until = TIME_RE.test(data?.until) ? data.until : fallback.until || "";
  const domain = DOMAINS.includes(data?.domain) ? data.domain : "ops";
  return {
    intent,
    confidence: Number.isFinite(data?.confidence) ? data.confidence : fallback.confidence || 0,
    durationMin,
    until,
    reason: String(data?.reason || fallback.reason || "").trim(),
    skipScope: ["today", "selected", "named"].includes(data?.skipScope)
      ? data.skipScope
      : fallback.skipScope || "",
    titleQuery: String(data?.titleQuery || fallback.titleQuery || "").trim(),
    delayMin,
    title: String(data?.title || "").trim(),
    scheduledAt: TIME_RE.test(data?.scheduledAt) ? data.scheduledAt : "",
    durationTaskMin:
      Number.isFinite(data?.durationTaskMin) && data.durationTaskMin > 0
        ? Math.round(data.durationTaskMin)
        : 30,
    domain,
    step: String(data?.step || data?.title || "").trim(),
  };
}

async function parseAssistantRequest(transcript, plan, { itemIds = [] } = {}) {
  const fallback = fallbackAssistant(transcript, { itemIds });
  const nowHHMM = hhmmIST();
  const pending = (plan.items || [])
    .filter((item) => item.status === "pending")
    .map((item) => `${item.title} (${item.scheduledAt}, ${item.domain})`)
    .slice(0, 16)
    .join("; ");

  const parsed = await chatJson({
    system:
      "You classify a spoken Life OS request for today in Asia/Kolkata. " +
      `Current time in Asia/Kolkata is ${nowHHMM}. ` +
      "skip_tasks = they will NOT do remaining or selected tasks today (festival, meeting, visiting, busy with other work). " +
      "skipScope is today (all remaining), selected (the tasks they highlighted), or named (one task by title). " +
      "reason is why they skipped, for later insights. " +
      "pause_focus = do not disturb / mute all task alarms for a while (haircut, outside, busy) and come back later. " +
      "If they give a range like 1-2 hours, durationMin is the UPPER bound. " +
      "until is HH:MM 24h if they named a clock, else empty. " +
      "defer_task = remind/alert about an EXISTING task in N minutes. " +
      "resume_focus = I'm back, turn alarms on. extend_focus = add more mute time. " +
      "add_task = create a new calendar task. " +
      "For add_task, scheduledAt is 24-hour HH:MM. Keep the exact minute they said; 'around' does not mean round the clock. " +
      "If they name a clock without AM/PM, pick the NEXT upcoming occurrence today " +
      `(example: now ${nowHHMM} and 'around 9:56' is the next 09:56 or 21:56 that has not passed). ` +
      "Skip wins over pause when they say skip / not doing / cancel today's tasks. " +
      "Do not turn a haircut/outside/DND request into add_task.",
    user: `Pending tasks: ${pending || "none"}\nSelected task ids: ${(itemIds || []).join(", ") || "none"}\nSpoken: ${String(transcript || "").trim()}`,
    schema: ASSISTANT_SCHEMA,
    schemaName: "lifeos_assistant",
    maxTokens: 280,
    temperature: 0.1,
  });

  const merged = normalizeParsed(parsed?.data, fallback);
  if (merged.intent === "add_task" || fallback.intent === "add_task") {
    const spokenAt = parseSpokenClock(transcript, nowHHMM);
    if (spokenAt) merged.scheduledAt = spokenAt;
  }
  if (fallback.intent === "skip_tasks") {
    return { ...merged, ...fallback, intent: "skip_tasks", confidence: Math.max(merged.confidence, fallback.confidence) };
  }
  if (fallback.intent === "pause_focus" || fallback.intent === "resume_focus" || fallback.intent === "extend_focus") {
    return { ...merged, ...fallback, intent: fallback.intent, confidence: Math.max(merged.confidence, fallback.confidence) };
  }
  if (fallback.intent === "defer_task" && (merged.intent === "add_task" || merged.intent === "unknown")) {
    return { ...merged, ...fallback, intent: "defer_task", confidence: fallback.confidence };
  }
  if (merged.intent === "unknown" || (merged.confidence < 0.45 && fallback.intent !== "add_task")) {
    if (fallback.intent === "add_task") return { ...merged, intent: "add_task", confidence: Math.max(merged.confidence, 0.4) };
    return { ...merged, intent: "unknown", confidence: merged.confidence };
  }
  return merged;
}

async function runAssistant(user, plan, transcript, { itemIds = [] } = {}) {
  const parsed = await parseAssistantRequest(transcript, plan, { itemIds });

  if (parsed.intent === "skip_tasks") {
    const reason = parsed.reason || parseSkipReason(transcript);
    let result;
    if (parsed.skipScope === "selected") {
      if (!itemIds.length) {
        return { intent: "unknown", parsed, error: "Select the tasks first, then tell me why you're skipping them." };
      }
      result = skipSelected(plan, itemIds, reason);
    } else if (parsed.skipScope === "named") {
      result = skipNamed(plan, parsed.titleQuery, reason);
    } else {
      result = skipRemainingToday(plan, reason);
    }
    if (!result.skipped.length) {
      return { intent: "unknown", parsed, error: "Nothing pending to skip. The wake alarm stays on." };
    }
    return {
      intent: "skip_tasks",
      parsed,
      preview: previewForSkip(result),
      skipped: result.skipped,
    };
  }

  if (parsed.intent === "pause_focus") {
    const result = startFocusBlock(user, plan, {
      durationMin: parsed.durationMin,
      untilClock: parsed.until,
      reason: parsed.reason,
      source: "ai",
    });
    return {
      intent: "pause_focus",
      parsed,
      preview: previewForPause(result.until, result.reason),
      skipped: result.skipped,
    };
  }

  if (parsed.intent === "extend_focus") {
    const result = isFocusActive(user)
      ? extendFocusBlock(user, plan, parsed.durationMin || 30)
      : startFocusBlock(user, plan, {
          durationMin: parsed.durationMin || 30,
          reason: parsed.reason,
          source: "ai",
        });
    return {
      intent: "extend_focus",
      parsed,
      preview: previewForPause(result.until, result.reason),
      skipped: result.skipped,
    };
  }

  if (parsed.intent === "resume_focus") {
    const result = resumeFocusBlock(user, plan);
    return {
      intent: "resume_focus",
      parsed,
      preview: previewForResume(),
      skipped: result.skipped,
    };
  }

  if (parsed.intent === "defer_task") {
    const item = resolveDeferItem(plan, parsed.titleQuery);
    if (!item) {
      return { intent: "unknown", parsed, error: "No pending task to remind you about." };
    }
    const result = applyDefer(user, item, parsed.delayMin);
    return {
      intent: "defer_task",
      parsed,
      item,
      preview: previewForDefer(item, result.at),
    };
  }

  if (parsed.intent === "add_task") {
    const taskParsed = parsed.title
      ? {
          title: parsed.title,
          scheduledAt: parsed.scheduledAt || undefined,
          durationMin: parsed.durationTaskMin,
          domain: parsed.domain,
          step: parsed.step || parsed.title,
        }
      : null;
    const created = await createVoiceTask(user, plan, transcript, taskParsed);
    return {
      intent: "add_task",
      parsed: created.parsed,
      item: created.item,
      preview: {
        title: created.parsed.title,
        scheduledAt: created.parsed.scheduledAt,
        step: created.parsed.step,
      },
    };
  }

  return {
    intent: "unknown",
    parsed,
    error: "I can add a task, pause alarms, skip tasks, or remind you later.",
  };
}

module.exports = {
  parseDurationMin,
  parseDelayMin,
  fallbackAssistant,
  parseAssistantRequest,
  runAssistant,
};
