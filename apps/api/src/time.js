const DEFAULT_TZ = "Asia/Kolkata";

function pad(n) {
  return String(n).padStart(2, "0");
}

function parts(ms, tz) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const map = {};
  for (const part of formatted) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    hh: Number(hour),
    mm: Number(map.minute),
    date: `${map.year}-${map.month}-${map.day}`,
    hhmm: `${hour}:${map.minute}`,
  };
}

function formatDate(date, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatHHMM(date, tz = DEFAULT_TZ) {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return text === "24:00" ? "00:00" : text;
}

function parseClock(date, hhmm) {
  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm] = String(hhmm).split(":").map(Number);
  return { y, m, d, hh, mm };
}

function sameClock(got, want) {
  return got.y === want.y && got.m === want.m && got.d === want.d && got.hh === want.hh && got.mm === want.mm;
}

/**
 * Local calendar time to an absolute instant.
 * A spring-forward gap returns exists:false.
 * A fall-back repeated hour returns both instants; fold 0 is the earlier one.
 * @param {string} date YYYY-MM-DD
 * @param {string} hhmm HH:MM
 * @param {string} tz IANA zone
 * @param {{fold?: 0|1}} [opts]
 */
function toInstant(date, hhmm, tz = DEFAULT_TZ, opts = {}) {
  const want = parseClock(date, hhmm);
  if ([want.y, want.m, want.d, want.hh, want.mm].some((n) => !Number.isFinite(n))) {
    return { exists: false, instant: null, date: String(date), hhmm: String(hhmm), tz, ambiguous: false, fold: 0 };
  }
  const guess = Date.UTC(want.y, want.m - 1, want.d, want.hh, want.mm, 0);
  const hits = [];
  for (let t = guess - 16 * 60 * 60 * 1000; t <= guess + 16 * 60 * 60 * 1000; t += 60 * 1000) {
    if (sameClock(parts(t, tz), want)) hits.push(t);
  }
  if (!hits.length) {
    return { exists: false, instant: null, date: String(date), hhmm: String(hhmm), tz, ambiguous: false, fold: 0 };
  }
  const fold = opts.fold === 1 && hits.length > 1 ? 1 : 0;
  return {
    exists: true,
    instant: hits[fold],
    date: String(date),
    hhmm: String(hhmm),
    tz,
    ambiguous: hits.length > 1,
    fold,
  };
}

function fromInstant(ms, tz = DEFAULT_TZ) {
  const local = parts(ms, tz);
  const first = toInstant(local.date, local.hhmm, tz, { fold: 0 });
  const fold = first.ambiguous && first.instant !== ms ? 1 : 0;
  return {
    exists: true,
    instant: ms,
    date: local.date,
    hhmm: local.hhmm,
    tz,
    ambiguous: first.ambiguous,
    fold,
  };
}

function addMinutes(date, hhmm, minutes, tz = DEFAULT_TZ, opts) {
  const base = toInstant(date, hhmm, tz, opts);
  if (!base.exists) return base;
  return fromInstant(base.instant + minutes * 60 * 1000, tz);
}

module.exports = {
  DEFAULT_TZ,
  formatDate,
  formatHHMM,
  toInstant,
  fromInstant,
  addMinutes,
  parts,
};
