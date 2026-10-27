const test = require("node:test");
const assert = require("node:assert/strict");
const { classifySafety, DECLINE_MESSAGE } = require("./ai/safetyGate");
const { validateIntent, fromLegacy } = require("./ai/intentSchema");
const { runAssistant } = require("./voiceAssistant");
const { PAIN_LINE, withPainNote } = require("./ai/painPrompt");

test("the safety gate declines medical phrasing and leaves ordinary requests alone", () => {
  assert.equal(classifySafety("my knee hurts").category, "pain");
  assert.equal(classifySafety("is this rash infected").category, "skin");
  assert.equal(classifySafety("how much creatine should I take").category, "dosage");
  assert.equal(classifySafety("do I have a rotator cuff tear").category, "diagnosis");
  assert.equal(classifySafety("is it safe to stamp over a cut").category, "safety");
  assert.equal(classifySafety("I sprained my wrist").category, "injury");
  assert.equal(classifySafety("mute alarms, my knee hurts").category, "pain");
  assert.equal(classifySafety("shift dinner, I have a rash").category, "skin");
  assert.equal(classifySafety("push the tasks by 1 hour"), null);
  assert.equal(classifySafety("skip the rest of today"), null);
  assert.equal(classifySafety("mute all alarms for one hour"), null);
});

test("a medical request is declined before any schedule change", async () => {
  const plan = {
    date: "2026-10-19",
    items: [{ _id: "dinner", title: "Dinner", scheduledAt: "19:30", status: "pending" }],
  };
  const result = await runAssistant({ aiEnabled: true }, plan, "mute alarms, my knee hurts");
  assert.equal(result.declined, true);
  assert.equal(result.category, "pain");
  assert.equal(result.error, DECLINE_MESSAGE);
  assert.equal(plan.items[0].scheduledAt, "19:30");
  assert.equal(JSON.stringify(result).includes("mute alarms, my knee hurts"), false);
});

test("cloud AI off still accepts a clear local command and explains the rest", async () => {
  const user = { aiEnabled: false };
  const plan = { date: "2026-10-19", items: [], revision: 0 };
  const quiet = await runAssistant(user, plan, "what should I eat for my knee pain");
  assert.equal(quiet.declined, true);
  const vague = await runAssistant(user, plan, "hello there friend");
  assert.equal(vague.intent, "unknown");
  assert.match(vague.error, /Cloud AI is off/);
});

test("intent v2 rejects unknown fields, huge shifts, and invented ids", () => {
  const items = [{ _id: "dinner", key: "dinner" }];
  assert.equal(validateIntent({ intent: "shift", scope: "all", offsetMin: 60, extra: true }, items).ok, false);
  assert.equal(validateIntent({ intent: "shift", scope: "all", offsetMin: 13 * 60 }, items).ok, false);
  assert.equal(validateIntent({ intent: "shift", scope: "selected", offsetMin: 30, targetIds: ["nope"] }, items).ok, false);
  const ok = fromLegacy({ intent: "shift_tasks", offsetMin: 60, taskIds: ["dinner"], reason: "meeting" }, items);
  assert.equal(ok.ok, true);
  assert.equal(ok.intent.intent, "shift");
  assert.equal(ok.intent.targetIds[0], "dinner");
  assert.equal(ok.intent.reason, "meeting");
});

test("workout items carry the pain line and other items do not", () => {
  const items = withPainNote([
    { domain: "fitness", title: "Push" },
    { domain: "health", title: "Lunch" },
  ]);
  assert.equal(items[0].safetyNote, PAIN_LINE);
  assert.equal(items[1].safetyNote, undefined);
});
