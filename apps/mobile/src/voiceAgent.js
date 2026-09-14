import { NativeModules, Platform } from "react-native";

const { VoiceAgentModule } = NativeModules;

const available = Platform.OS === "android" && !!VoiceAgentModule;

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty"];

const GREETINGS = {
  morning: ["Hey {name}.", "Morning {name}.", "Alright {name}."],
  afternoon: ["Hey {name}.", "{name}.", "Quick reminder."],
  evening: ["Hey {name}.", "Evening {name}.", "{name}, before the night runs away."],
  night: ["Hey {name}.", "{name}.", "Last stretch."],
};

const CLOSERS = {
  fitness: "Let's get moving.",
  skin: "Keep it gentle.",
  hair: "Don't skip this one.",
  learning: "Even a short session counts.",
  career: "Time to switch gears.",
  health: "You're on it.",
};

export function isVoiceAgentAvailable() {
  return available;
}

export async function setVoiceAgentEnabled(enabled) {
  if (!available) return false;
  return VoiceAgentModule.setEnabled(!!enabled);
}

export async function speakNow(text) {
  if (!available || !text) return false;
  return VoiceAgentModule.speakNow(text);
}

export async function cancelVoiceCues() {
  if (!available) return false;
  return VoiceAgentModule.setEnabled(false);
}

function word(n) {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = n % 10;
  return ones ? `${tens} ${ONES[ones]}` : tens;
}

function hash(value) {
  const s = String(value || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function bucket(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function spokenClock(hhmm) {
  const [h, m] = String(hhmm || "06:00").split(":").map(Number);
  const hour = Number.isFinite(h) ? h : 6;
  const minute = Number.isFinite(m) ? m : 0;
  const h12 = hour % 12 || 12;
  const hourWord = word(h12);
  const nextHour = word(h12 === 12 ? 1 : h12 + 1);
  let clock;
  if (minute === 0) clock = `${hourWord} o'clock`;
  else if (minute === 15) clock = `quarter past ${hourWord}`;
  else if (minute === 30) clock = `${hourWord} thirty`;
  else if (minute === 45) clock = `quarter to ${nextHour}`;
  else clock = `${hourWord} ${word(minute)}`;
  return { clock, hour };
}

function spokenDuration(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 50 && n < 70) return "About an hour";
  if (n >= 120) return `About ${word(Math.round(n / 60))} hours`;
  return `About ${word(n)} minutes`;
}

function soften(text) {
  return String(text || "")
    .replace(/&/g, " and ")
    .replace(/\s*[+/]\s*/g, " and ")
    .replace(/[—–]/g, ", ")
    .replace(/[_*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function greetingFor(item, name, hour) {
  const list = GREETINGS[bucket(hour)] || GREETINGS.morning;
  return list[hash(item.key || item._id) % list.length].replace("{name}", name);
}

function closerFor(item) {
  if (item.alertLevel === "non_negotiable") return "This one's non-negotiable.";
  if (item.alertLevel === "info") return "Whenever you're ready.";
  return CLOSERS[item.domain] || "You've got this.";
}

function firstStepNudge(item) {
  const step = (item.steps || []).find((s) => !s.done && s.label && !String(s.label).includes("__SEASONAL"));
  if (!step) return "";
  const label = soften(step.label);
  if (label.length < 12 || label.length > 90) return "";
  return ` Start with this: ${label.replace(/\.$/, "")}.`;
}

function taskLine(item) {
  const title = soften(item.title) || "your next task";
  const key = item.key || "";
  if (key === "workout" || item.domain === "fitness") return `Time to train. ${title}.`;
  if (key === "sleep") return "Wind-down time. Screens down, protect your sleep.";
  if (key === "study" || item.domain === "learning") return `Study block. ${title}.`;
  if (key.startsWith("skin")) return `Skin time. ${title}.`;
  if (key.startsWith("hair")) return `Hair care. ${title}.`;
  if (key === "breakfast") return "Breakfast is up. Protein and fruit.";
  if (key === "tomorrow-prep") {
    return "Tomorrow's food check. Set out oats, fruit, and whatever dinner needs so morning is easy.";
  }
  if (key === "dinner") return "Dinner time. Keep it balanced.";
  if (key === "home") return "You're home. Give yourself a minute to switch off work.";
  if (item.alertLevel === "info") return `${title} is up, if you want it.`;
  return `Time for ${title}.`;
}

export function composeSpokenCue(item, name = "Raj") {
  const { clock, hour } = spokenClock(item.scheduledAt);
  const greet = greetingFor(item, name || "Raj", hour);
  const duration = spokenDuration(item.durationMin);
  const durationBit = duration ? ` ${duration}.` : "";
  return `${greet} It's ${clock}. ${taskLine(item)}${durationBit}${firstStepNudge(item)} ${closerFor(item)}`;
}

export function composeStartCallCue(item, name = "Raj") {
  const title = soften(item.title) || "your next task";
  return `Hey ${name || "Raj"}. ${title}.`;
}

export function composeEndCallCue(item, name = "Raj") {
  const title = soften(item.title) || "the task";
  return `Hey ${name || "Raj"}. ${title}. Time is up.`;
}

export function composeReadyPrompt(item) {
  const title = soften(item.title) || "this task";
  return `${title}. Are you ready?`;
}

export function composeCompletePrompt(item) {
  const title = soften(item.title) || "this task";
  return `${title}. Did you finish?`;
}

export function interpretDeferMinutes(text) {
  const spoken = String(text || "").toLowerCase().replace(/['’]/g, "");
  if (!spoken) return 0;
  if (/\b(forty[\s-]?five|45)\b/.test(spoken) && /\b(min|later|after|in)\b/.test(spoken)) return 45;
  if (/\b(thirty|30)\b/.test(spoken) && /\b(min|later|after|in)\b/.test(spoken)) return 30;
  const match = spoken.match(/\b(?:in|after)\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?)\b/);
  if (!match) return 0;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (/^h/.test(match[2])) return Math.min(240, n * 60);
  return Math.min(240, n);
}

function normalizeHeard(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[?.!,]/g, " ")
    .replace(/\b(uh|um|erm|hmm|ah)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPromptEcho(spoken, prompt) {
  if (!spoken) return true;
  if (/^(forest|for this|for rest|for the|this task)$/.test(spoken)) return true;
  const promptText = normalizeHeard(prompt);
  if (promptText) {
    if (spoken === promptText) return true;
    if (promptText.includes(spoken) && spoken.split(" ").length >= 3) return true;
    if (spoken.includes(promptText) && !/\b(yes|yeah|yep|yup|ok|okay|no|not|later)\b/.test(spoken)) return true;
  }
  if (/are you ready/.test(spoken) && !/\b(yes|yeah|i am|im|i m)\b/.test(spoken)) return true;
  if (/\bready for\b/.test(spoken) && !/\b(yes|yeah|i am|im|i m|ok|okay)\b/.test(spoken)) return true;
  if (/did you (finish|complete)/.test(spoken) && !/\b(yes|yeah|i did|i have|done)\b/.test(spoken)) return true;
  return false;
}

function meaningFromHeard(spoken, phase) {
  if (interpretDeferMinutes(spoken)) return phase === "end" || phase === "complete" ? "remind" : "snooze";

  const isEnd = phase === "end" || phase === "complete";
  if (isEnd) {
    if (/\b(not done|not yet|havent|have not|didnt|did not|remind me|later|incomplete|skip|wait)\b/.test(spoken)) {
      return "remind";
    }
    if (/\b(no|nope)\b/.test(spoken) && !/\bnow\b/.test(spoken)) return "remind";
    if (/\b(done|complete|completed|finished|finish|yes|yeah|yep|yup|yup i did|i did|i have|sure)\b/.test(spoken)) {
      return "complete";
    }
    return null;
  }

  if (/\b(not now|not ready|later|snooze|busy|reject|nope|wait|hold on)\b/.test(spoken)) return "snooze";
  if (/\bno\b/.test(spoken) && !/\bnow\b/.test(spoken)) return "snooze";
  if (/\b(ready|already|reddy|yes|yeah|yep|yup|ok|okay|start|sure|go ahead|lets go|let us go|im ready|i m ready|i am ready)\b/.test(spoken)) {
    return "ready";
  }
  return null;
}

export function interpretCallReply(text, phase, prompt) {
  const spoken = normalizeHeard(text);
  if (!spoken || isPromptEcho(spoken, prompt)) return null;

  const words = spoken.split(" ").filter(Boolean);
  const tail = words.slice(-4).join(" ");
  return meaningFromHeard(spoken, phase) || (tail !== spoken ? meaningFromHeard(tail, phase) : null);
}

export function interpretCallReplies(texts, phase, prompt) {
  const list = (Array.isArray(texts) ? texts : [texts])
    .map((row) => String(row || "").trim())
    .filter(Boolean);
  const expanded = [];
  for (const text of list) {
    expanded.push(text);
    const words = normalizeHeard(text).split(" ").filter(Boolean);
    if (words.length > 2) expanded.push(words.slice(-3).join(" "));
  }
  for (const text of expanded) {
    const meaning = interpretCallReply(text, phase, prompt);
    if (meaning) return meaning;
  }
  if (list.length) return interpretCallReply(list.join(" "), phase, prompt);
  return null;
}

function triggerMillis(scheduledAt) {
  const [hours, minutes] = String(scheduledAt || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return -1;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

export async function syncVoiceCues(items, { enabled = true, name = "Raj" } = {}) {
  if (!available) return false;
  if (!enabled) {
    await VoiceAgentModule.setEnabled(false);
    return true;
  }
  await VoiceAgentModule.setEnabled(true);
  await VoiceAgentModule.cancelAll();

  if (!Array.isArray(items) || items.length === 0) return true;

  const now = Date.now();
  for (const item of items) {
    if (item.status !== "pending") continue;
    // Wake already has its own ringtone + scanner. Speaking over it is noise.
    if (item.alarmMode === "scan_dismiss") continue;
    const at = triggerMillis(item.scheduledAt);
    if (at <= now + 1_000) continue;
    const text = composeSpokenCue(item, name);
    try {
      await VoiceAgentModule.scheduleCue(String(item._id), text, at);
    } catch (_err) {
      // one bad cue shouldn't drop the rest of the day
    }
  }
  return true;
}

export function previewCue(items, name = "Raj") {
  const next = (items || []).find(
    (item) => item.status === "pending" && item.alarmMode !== "scan_dismiss"
  );
  if (next) return composeSpokenCue(next, name);
  return composeSpokenCue(
    {
      key: "workout",
      title: "Easy run and strength",
      scheduledAt: "06:30",
      durationMin: 45,
      domain: "fitness",
      alertLevel: "non_negotiable",
      steps: [{ label: "Run 20 to 25 minutes, easy pace.", done: false }],
    },
    name
  );
}
