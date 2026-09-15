const { padTime, hhmmIST } = require("./focusBlock");

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function fromMinutes(total) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  return padTime(Math.floor(clamped / 60), clamped % 60);
}

function findClockMatch(raw) {
  const text = String(raw || "");
  const prefixed = text.match(
    /\b(?:around|at|by|before|until|till|up to)\s+(\d{1,2})(?:[:.](\d{2})|\s+(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i
  );
  if (prefixed) return [prefixed[0], prefixed[1], prefixed[2] || prefixed[3], prefixed[4]];
  const withMer = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
  if (withMer) return withMer;
  const withMinutes = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (withMinutes) return withMinutes;
  return null;
}

function nextOccurrence(hour12, minute, nowHHMM) {
  const nowMin = toMinutes(nowHHMM);
  const amHour = hour12 === 12 ? 0 : hour12;
  const pmHour = hour12 === 12 ? 12 : hour12 + 12;
  const am = amHour * 60 + minute;
  const pm = pmHour * 60 + minute;
  if (am >= nowMin) return fromMinutes(am);
  if (pm >= nowMin) return fromMinutes(pm);
  return fromMinutes(pm);
}

function clockToHHMM({ hour, minute, mer, morningHint, eveningHint }, nowHHMM) {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return "";
  let min = Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 0;
  if (hour > 12) return padTime(hour, min);

  const meridiem = String(mer || "").toLowerCase();
  if (meridiem.startsWith("p") || (!meridiem && eveningHint)) {
    if (hour < 12) hour += 12;
    return padTime(hour, min);
  }
  if (meridiem.startsWith("a") || (!meridiem && morningHint)) {
    if (hour === 12) hour = 0;
    return padTime(hour, min);
  }
  return nextOccurrence(hour, min, nowHHMM);
}

function parseSpokenClock(transcript, nowHHMM = hhmmIST()) {
  const match = findClockMatch(transcript);
  if (!match) return "";
  const lower = String(transcript || "").toLowerCase();
  return clockToHHMM(
    {
      hour: Number(match[1]),
      minute: match[2] ? Number(match[2]) : 0,
      mer: match[3] || "",
      morningHint: /\b(this morning|in the morning|tomorrow morning)\b/.test(lower),
      eveningHint: /\b(tonight|this evening|in the evening)\b/.test(lower),
    },
    nowHHMM
  );
}

module.exports = { parseSpokenClock, findClockMatch };
