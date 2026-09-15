const { CarryForwardTask } = require("./models");
const { chatJson } = require("./ai");
const { LIFE_AREAS } = require("./seed/rajRoutine");
const { TIME_RE, hhmmIST } = require("./focusBlock");
const { parseSpokenClock } = require("./clockParse");

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

function fallbackParse(transcript, nowHHMM = hhmmIST()) {
  const raw = String(transcript || "").replace(/\s+/g, " ").trim();
  const spokenAt = parseSpokenClock(raw, nowHHMM);

  let title = raw
    .replace(/\b(i (actually )?have (a )?task of|i (need|want|have) to|please |can you |plan it|add (a )?task|remind me (to|of|about))\b/gi, " ")
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
  else if (/(skin|face|cream)/.test(lower)) domain = "skin";
  else if (/(hair)/.test(lower)) domain = "hair";
  else if (/(sleep|water|health)/.test(lower)) domain = "health";

  return {
    title,
    scheduledAt: spokenAt || "20:00",
    durationMin: 30,
    domain,
    step: title,
  };
}

function resolveScheduledAt(transcript, llmTime, nowHHMM = hhmmIST()) {
  const spokenAt = parseSpokenClock(transcript, nowHHMM);
  if (spokenAt) return spokenAt;
  if (TIME_RE.test(llmTime)) return llmTime;
  return fallbackParse(transcript, nowHHMM).scheduledAt;
}

async function parseVoiceTask(transcript) {
  const nowHHMM = hhmmIST();
  const fallback = fallbackParse(transcript, nowHHMM);
  const parsed = await chatJson({
    system:
      "Parse a spoken life-admin request into one calendar task for today in Asia/Kolkata. " +
      `Current time in Asia/Kolkata is ${nowHHMM}. ` +
      "scheduledAt must be 24-hour HH:MM. Keep the exact hour and minute they said — 'around' does not mean round the clock. " +
      "If they name a clock without AM/PM, pick the NEXT upcoming occurrence today. " +
      `Example: now ${nowHHMM} and 'around 9:56' is the next 09:56 or 21:56 that has not passed, never the one already behind. ` +
      "'Around 8 PM' is 20:00. 'Morning' without a clock is 09:00. " +
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
  const scheduledAt = resolveScheduledAt(transcript, data.scheduledAt, nowHHMM);
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
  let added = 0;
  for (const task of open) {
    const existing = plan.items.find(
      (item) => item.originKey === task.originKey || item.key === task.originKey
    );
    if (existing) {
      if (existing.status === "done") {
        task.status = "done";
        await task.save();
      } else if (existing.status === "pending" && existing.scheduledAt && existing.scheduledAt !== task.scheduledAt) {
        task.scheduledAt = existing.scheduledAt;
        if (existing.title) task.title = existing.title;
        if (Number.isFinite(existing.durationMin) && existing.durationMin > 0) {
          task.durationMin = existing.durationMin;
        }
        await task.save();
      }
      continue;
    }
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

async function syncCarryForwardFields(user, item) {
  const originKey = carryKeyOf(item);
  if (!originKey) return;
  const update = {};
  if (TIME_RE.test(item.scheduledAt)) update.scheduledAt = item.scheduledAt;
  if (item.title) update.title = item.title;
  if (Number.isFinite(Number(item.durationMin)) && Number(item.durationMin) > 0) {
    update.durationMin = Math.round(Number(item.durationMin));
  }
  if (!Object.keys(update).length) return;
  await CarryForwardTask.updateOne({ userId: user._id, originKey }, update);
}

async function createVoiceTask(user, plan, transcript, parsedInput) {
  const nowHHMM = hhmmIST();
  const parsed = parsedInput?.title
    ? {
        title: parsedInput.title,
        scheduledAt: resolveScheduledAt(transcript, parsedInput.scheduledAt, nowHHMM),
        durationMin:
          Number.isFinite(parsedInput.durationMin) && parsedInput.durationMin > 0
            ? Math.round(parsedInput.durationMin)
            : 30,
        domain: DOMAINS.includes(parsedInput.domain) ? parsedInput.domain : "ops",
        step: String(parsedInput.step || parsedInput.title).trim() || parsedInput.title,
      }
    : await parseVoiceTask(transcript);
  const originKey = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  fallbackParse,
  resolveScheduledAt,
  parseVoiceTask,
  mergeCarryForwards,
  setCarryForwardStatus,
  syncCarryForwardFields,
  createVoiceTask,
  carryKeyOf,
};
