const { chatJson } = require("./ai");
const { createVoiceTask } = require("./voiceTask");
const { LIFE_AREAS } = require("./seed/rajRoutine");
const {
  padTime,
  TIME_RE,
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
      enum: ["add_task", "pause_focus", "defer_task", "resume_focus", "extend_focus", "unknown"],
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

function parseUntilClock(transcript) {
  const match = String(transcript || "").match(
    /\b(?:until|till|up to)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i
  );
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const mer = (match[3] || "").toLowerCase();
  if (mer.startsWith("p") && hour < 12) hour += 12;
  if (mer.startsWith("a") && hour === 12) hour = 0;
  if (!mer && hour <= 7) hour += 12;
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return "";
  return padTime(hour, minute);
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

function fallbackAssistant(transcript) {
  const lower = String(transcript || "").toLowerCase().replace(/['’]/g, "");
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

async function parseAssistantRequest(transcript, plan) {
  const fallback = fallbackAssistant(transcript);
  const pending = (plan.items || [])
    .filter((item) => item.status === "pending")
    .map((item) => `${item.title} (${item.scheduledAt}, ${item.domain})`)
    .slice(0, 16)
    .join("; ");

  const parsed = await chatJson({
    system:
      "You classify a spoken Life OS request for today in Asia/Kolkata. " +
      "pause_focus = do not disturb / mute all task alarms for a while (haircut, outside, busy). " +
      "If they give a range like 1-2 hours, durationMin is the UPPER bound. " +
      "until is HH:MM 24h if they named a clock, else empty. " +
      "defer_task = remind/alert about an EXISTING task in N minutes. " +
      "resume_focus = I'm back, turn alarms on. extend_focus = add more mute time. " +
      "add_task = create a new calendar task. " +
      "Do not turn a haircut/outside/DND request into add_task.",
    user: `Pending tasks: ${pending || "none"}\nSpoken: ${String(transcript || "").trim()}`,
    schema: ASSISTANT_SCHEMA,
    schemaName: "lifeos_assistant",
    maxTokens: 280,
    temperature: 0.1,
  });

  const merged = normalizeParsed(parsed?.data, fallback);
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

async function runAssistant(user, plan, transcript) {
  const parsed = await parseAssistantRequest(transcript, plan);

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
    error: "I can add a task, pause alarms, or remind you later.",
  };
}

module.exports = {
  parseDurationMin,
  parseDelayMin,
  fallbackAssistant,
  parseAssistantRequest,
  runAssistant,
};
