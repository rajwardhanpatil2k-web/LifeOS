const { CarryForwardTask } = require("./models");
const { chatJson } = require("./ai");
const { LIFE_AREAS } = require("./seed/rajRoutine");

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DOMAINS = LIFE_AREAS.map((a) => a.key);

const PARSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "scheduledAt", "durationMin", "domain", "step"],
  properties: {
    title: { type: "string" },
    scheduledAt: { type: "string" },
    durationMin: { type: "integer" },
    domain: { type: "string", enum: DOMAINS },
    step: { type: "string" },
  },
};

function padTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fallbackParse(transcript) {
  const raw = String(transcript || "").replace(/\s+/g, " ").trim();
  let hour = 20;
  let minute = 0;
  const match = raw.match(
    /\b(?:around|at|by|before|after)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i
  );
  if (match) {
    hour = Number(match[1]);
    minute = match[2] ? Number(match[2]) : 0;
    const mer = (match[3] || "").toLowerCase();
    if (mer.startsWith("p") && hour < 12) hour += 12;
    if (mer.startsWith("a") && hour === 12) hour = 0;
    if (!mer && hour <= 7) hour += 12;
    if (hour > 23) hour = 23;
    if (!Number.isFinite(minute) || minute > 59) minute = 0;
  }

  let title = raw
    .replace(/\b(i (actually )?have (a )?task of|i (need|want|have) to|please |can you |plan it|add (a )?task|remind me to)\b/gi, " ")
    .replace(/\b(around|at|by|before|after)\s+\d{1,2}(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ,]+|[. ,]+$/g, "");
  if (!title) title = raw || "New task";
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const lower = raw.toLowerCase();
  let domain = "ops";
  if (/(workout|gym|run|exercise)/.test(lower)) domain = "fitness";
  else if (/(study|dsa|learn)/.test(lower)) domain = "learning";
  else if (/(skin|face)/.test(lower)) domain = "skin";
  else if (/(hair)/.test(lower)) domain = "hair";
  else if (/(sleep|water|health)/.test(lower)) domain = "health";

  return {
    title,
    scheduledAt: padTime(hour, minute),
    durationMin: 30,
    domain,
    step: title,
  };
}

async function parseVoiceTask(transcript) {
  const fallback = fallbackParse(transcript);
  const parsed = await chatJson({
    system:
      "Parse a spoken life-admin request into one calendar task for today in Asia/Kolkata. " +
      "scheduledAt must be 24-hour HH:MM. 'Around 8 PM' is 20:00. 'Morning' without a clock is 09:00. " +
      "Pick the closest domain. durationMin is a reasonable estimate, usually 20-45. " +
      "title is short and concrete. step is the first action.",
    user: String(transcript || "").trim(),
    schema: PARSE_SCHEMA,
    schemaName: "voice_task",
    maxTokens: 250,
    temperature: 0.1,
  });

  const data = parsed?.data;
  if (!data) return fallback;
  const scheduledAt = TIME_RE.test(data.scheduledAt) ? data.scheduledAt : fallback.scheduledAt;
  const domain = DOMAINS.includes(data.domain) ? data.domain : fallback.domain;
  const durationMin = Number.isFinite(data.durationMin) && data.durationMin > 0 ? Math.round(data.durationMin) : 30;
  const title = String(data.title || fallback.title).trim() || fallback.title;
  return {
    title,
    scheduledAt,
    durationMin,
    domain,
    step: String(data.step || title).trim() || title,
  };
}

function itemFromCarry(task) {
  return {
    key: task.originKey,
    originKey: task.originKey,
    domain: task.domain,
    title: task.title,
    scheduledAt: task.scheduledAt,
    durationMin: task.durationMin,
    alertLevel: task.alertLevel || "normal",
    alarmMode: "none",
    anchor: "fixed",
    flexible: false,
    carryForward: true,
    source: "ai",
    spokenRequest: task.spokenRequest,
    status: "pending",
    steps: (task.steps || []).map((step) => ({
      key: step.key,
      label: step.label,
      done: false,
      doneAt: null,
    })),
  };
}

async function mergeCarryForwards(user, plan) {
  const open = await CarryForwardTask.find({ userId: user._id, status: "open" });
  if (!open.length) return plan;
  const have = new Set(plan.items.map((item) => item.originKey || item.key).filter(Boolean));
  let added = 0;
  for (const task of open) {
    if (have.has(task.originKey)) continue;
    plan.items.push(itemFromCarry(task));
    added += 1;
  }
  if (!added) return plan;
  plan.items = [...plan.items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  await plan.save();
  return plan;
}

function carryKeyOf(item) {
  if (item.originKey) return item.originKey;
  if (String(item.key || "").startsWith("ai-")) return item.key;
  return null;
}

async function setCarryForwardStatus(user, item, status) {
  const originKey = carryKeyOf(item);
  if (!originKey) return;
  await CarryForwardTask.updateOne({ userId: user._id, originKey }, { status });
}

async function createVoiceTask(user, plan, transcript, parsedInput) {
  const parsed = parsedInput?.title
    ? {
        title: parsedInput.title,
        scheduledAt: TIME_RE.test(parsedInput.scheduledAt)
          ? parsedInput.scheduledAt
          : (await parseVoiceTask(transcript)).scheduledAt,
        durationMin:
          Number.isFinite(parsedInput.durationMin) && parsedInput.durationMin > 0
            ? Math.round(parsedInput.durationMin)
            : 30,
        domain: DOMAINS.includes(parsedInput.domain) ? parsedInput.domain : "ops",
        step: String(parsedInput.step || parsedInput.title).trim() || parsedInput.title,
      }
    : await parseVoiceTask(transcript);
  const originKey = `ai-${Date.now()}`;
  const steps = [{ key: "main", label: parsed.step, done: false }];
  await CarryForwardTask.create({
    userId: user._id,
    originKey,
    title: parsed.title,
    scheduledAt: parsed.scheduledAt,
    durationMin: parsed.durationMin,
    domain: parsed.domain,
    alertLevel: "normal",
    steps,
    spokenRequest: String(transcript || "").trim(),
    status: "open",
  });
  plan.items.push({
    ...itemFromCarry({
      originKey,
      title: parsed.title,
      scheduledAt: parsed.scheduledAt,
      durationMin: parsed.durationMin,
      domain: parsed.domain,
      alertLevel: "normal",
      steps,
      spokenRequest: String(transcript || "").trim(),
    }),
  });
  plan.items = [...plan.items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  await plan.save();
  return { item: plan.items.find((i) => i.originKey === originKey), parsed };
}

module.exports = {
  TIME_RE,
  parseVoiceTask,
  mergeCarryForwards,
  setCarryForwardStatus,
  createVoiceTask,
  carryKeyOf,
};
