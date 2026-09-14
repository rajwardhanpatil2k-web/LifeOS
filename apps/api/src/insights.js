// Deterministic insight aggregation.
//
// Everything numeric lives here and is computed straight from DailyPlan
// documents — the LLM in ai.js only ever gets handed these finished numbers to
// narrate. That split is deliberate: a model that is asked to *calculate*
// adherence will confidently invent it, so it never gets the chance.
//
// Note on "settled" vs "all": today is almost always half-finished, so mixing
// it into adherence makes every month look worse than it is. Ratios are
// computed over settled (past) days only, with today reported separately.

const { DailyPlan } = require("./models");

const GREEN_DAY_THRESHOLD = 0.8;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function weekdayFromDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Local wall-clock HH:MM in the user's timezone for a stored UTC timestamp —
// needed because scheduledAt is IST wall time but doneAt is a UTC Date.
function localHHMM(date, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
}

// Monday-start ISO-ish week containing `date`.
function weekRange(date) {
  const weekday = weekdayFromDate(date);
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(date, offsetToMonday);
  return { start, end: addDays(start, 6) };
}

function monthRange(date) {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

function resolvePeriod(period, date) {
  if (period === "week") {
    const { start, end } = weekRange(date);
    return { period: "week", start, end, periodKey: `${start}..${end}`, label: `Week of ${start}` };
  }
  const { start, end } = monthRange(date);
  const [y, m] = date.split("-").map(Number);
  return {
    period: "month",
    start,
    end,
    periodKey: `${y}-${pad(m)}`,
    label: `${MONTH_NAMES[m - 1]} ${y}`,
  };
}

function ratio(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : null;
}

// A day counts toward streaks if enough of it got done. Days with no plan at
// all (app never opened) break the streak — that's the honest reading, since
// an untracked day is a day the routine didn't happen.
function computeStreaks(days) {
  const settled = days.filter((d) => !d.isToday);
  const byDate = new Map(settled.map((d) => [d.date, d]));

  let longest = 0;
  let running = 0;
  let greenDays = 0;
  for (const day of settled) {
    if (day.adherence !== null && day.adherence >= GREEN_DAY_THRESHOLD * 100) {
      running += 1;
      greenDays += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  // Current streak walks backwards from the latest settled day. Today being
  // unfinished must not zero out a real streak, so it's skipped entirely
  // unless it's already green, in which case it extends the count.
  const today = days.find((d) => d.isToday);
  let current = 0;
  let cursor = settled.length ? settled[settled.length - 1].date : null;
  while (cursor) {
    const day = byDate.get(cursor);
    if (!day || day.adherence === null || day.adherence < GREEN_DAY_THRESHOLD * 100) break;
    current += 1;
    cursor = addDays(cursor, -1);
  }
  if (today && today.adherence !== null && today.adherence >= GREEN_DAY_THRESHOLD * 100) {
    current += 1;
  }

  return {
    current,
    longest,
    greenDays,
    settledDays: settled.filter((d) => d.total > 0).length,
    threshold: Math.round(GREEN_DAY_THRESHOLD * 100),
  };
}

async function computePeriodStats(user, { period = "month", date, today }) {
  const resolved = resolvePeriod(period, date || today);
  const plans = await DailyPlan.find({
    userId: user._id,
    date: { $gte: resolved.start, $lte: resolved.end },
  })
    .sort({ date: 1 })
    .lean();

  const days = [];
  const domainMap = new Map();
  const weekdayMap = new Map();
  const itemMap = new Map();
  const skipReasonMap = new Map();

  let completed = 0;
  let skipped = 0;
  let pending = 0;
  let total = 0;
  let settledCompleted = 0;
  let settledTotal = 0;

  let latenessSum = 0;
  let latenessCount = 0;
  let onTimeCount = 0;

  for (const plan of plans) {
    const isToday = plan.date === today;
    const items = plan.items || [];
    let dayDone = 0;
    let dayTotal = 0;

    for (const item of items) {
      const domain = item.domain || "other";
      dayTotal += 1;
      total += 1;
      if (item.status === "done") completed += 1;
      else if (item.status === "skipped") skipped += 1;
      else pending += 1;
      if (item.status === "done") dayDone += 1;

      if (!domainMap.has(domain)) domainMap.set(domain, { domain, done: 0, skipped: 0, total: 0 });
      const dom = domainMap.get(domain);
      dom.total += 1;
      if (item.status === "done") dom.done += 1;
      if (item.status === "skipped") dom.skipped += 1;

      const itemKey = item.key || item.title;
      if (!itemMap.has(itemKey)) {
        itemMap.set(itemKey, {
          key: itemKey,
          title: item.title,
          domain,
          scheduledAt: item.scheduledAt,
          done: 0,
          skipped: 0,
          pending: 0,
          total: 0,
          lateSum: 0,
          lateCount: 0,
          skipReasons: [],
        });
      }
      const entry = itemMap.get(itemKey);
      entry.total += 1;
      if (item.status === "done") entry.done += 1;
      else if (item.status === "skipped") entry.skipped += 1;
      else entry.pending += 1;
      if (item.status === "skipped" && item.skippedReason) {
        entry.skipReasons.push(item.skippedReason);
        const key = String(item.skippedReason).trim().toLowerCase();
        const prev = skipReasonMap.get(key);
        skipReasonMap.set(key, {
          reason: prev?.reason || String(item.skippedReason).trim(),
          count: (prev?.count || 0) + 1,
        });
      }

      // How late did it actually happen? The item finishes when its last step
      // is checked, so that timestamp is the real completion time.
      if (item.status === "done" && Array.isArray(item.steps) && item.steps.length) {
        const stamps = item.steps.map((s) => s.doneAt).filter(Boolean);
        if (stamps.length) {
          const finishedAt = stamps.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
          const lateMin = toMinutes(localHHMM(finishedAt, user.timezone)) - toMinutes(item.scheduledAt);
          // Ignore absurd deltas from midnight-wrapping night items.
          if (Math.abs(lateMin) <= 12 * 60) {
            entry.lateSum += lateMin;
            entry.lateCount += 1;
            latenessSum += lateMin;
            latenessCount += 1;
            if (lateMin <= 15) onTimeCount += 1;
          }
        }
      }
    }

    if (!isToday) {
      settledCompleted += dayDone;
      settledTotal += dayTotal;
    }

    const weekday = plan.weekday ?? weekdayFromDate(plan.date);
    if (!weekdayMap.has(weekday)) {
      weekdayMap.set(weekday, { weekday, name: WEEKDAY_NAMES[weekday], done: 0, total: 0, days: 0 });
    }
    const wd = weekdayMap.get(weekday);
    if (!isToday) {
      wd.done += dayDone;
      wd.total += dayTotal;
      wd.days += 1;
    }

    days.push({
      date: plan.date,
      weekday,
      weekdayName: WEEKDAY_NAMES[weekday],
      dayType: plan.dayType,
      completed: dayDone,
      total: dayTotal,
      adherence: ratio(dayDone, dayTotal),
      isToday,
    });
  }

  const byDomain = [...domainMap.values()]
    .map((d) => ({ ...d, adherence: ratio(d.done, d.total) }))
    .sort((a, b) => (b.adherence ?? -1) - (a.adherence ?? -1));

  const byWeekday = [...weekdayMap.values()]
    .map((w) => ({ ...w, adherence: ratio(w.done, w.total) }))
    .sort((a, b) => a.weekday - b.weekday);

  const items = [...itemMap.values()]
    .map((i) => ({
      key: i.key,
      title: i.title,
      domain: i.domain,
      scheduledAt: i.scheduledAt,
      done: i.done,
      skipped: i.skipped,
      pending: i.pending,
      total: i.total,
      adherence: ratio(i.done, i.total),
      avgLateMin: i.lateCount ? Math.round(i.lateSum / i.lateCount) : null,
      skipReasons: i.skipReasons.slice(0, 5),
    }))
    .sort((a, b) => (a.adherence ?? 101) - (b.adherence ?? 101));

  // Split the settled days in half to see whether things are trending up or
  // falling apart — the single most useful signal in a monthly review.
  const settledDays = days.filter((d) => !d.isToday && d.total > 0);
  const mid = Math.floor(settledDays.length / 2);
  const halfAdherence = (slice) => {
    const done = slice.reduce((sum, d) => sum + d.completed, 0);
    const tot = slice.reduce((sum, d) => sum + d.total, 0);
    return ratio(done, tot);
  };
  const firstHalf = settledDays.length >= 4 ? halfAdherence(settledDays.slice(0, mid)) : null;
  const secondHalf = settledDays.length >= 4 ? halfAdherence(settledDays.slice(mid)) : null;

  const streaks = computeStreaks(days);
  const todayEntry = days.find((d) => d.isToday) || null;

  return {
    ...resolved,
    generatedAt: new Date().toISOString(),
    daysTracked: days.length,
    daysSettled: settledDays.length,
    totals: { completed, skipped, pending, total, adherence: ratio(completed, total) },
    settled: {
      completed: settledCompleted,
      total: settledTotal,
      adherence: ratio(settledCompleted, settledTotal),
      days: settledDays.length,
    },
    today: todayEntry,
    streaks,
    byDomain,
    byWeekday,
    items,
    weakest: items.filter((i) => i.adherence !== null).slice(0, 5),
    strongest: items.filter((i) => i.adherence !== null).slice(-5).reverse(),
    punctuality: {
      measured: latenessCount,
      avgLateMin: latenessCount ? Math.round(latenessSum / latenessCount) : null,
      onTimeRate: ratio(onTimeCount, latenessCount),
    },
    momentum: {
      firstHalfAdherence: firstHalf,
      secondHalfAdherence: secondHalf,
      delta: firstHalf !== null && secondHalf !== null ? secondHalf - firstHalf : null,
    },
    skipReasons: [...skipReasonMap.entries()]
      .map(([, entry]) => entry)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    timeline: days,
  };
}

module.exports = { computePeriodStats, resolvePeriod, GREEN_DAY_THRESHOLD };
