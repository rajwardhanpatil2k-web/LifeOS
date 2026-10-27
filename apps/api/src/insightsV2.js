const { CATALOG } = require("./workout/catalog");

const CATEGORIES = ["workout", "meal", "supplement", "skincare", "haircare"];
const NAMES = new Map(CATALOG.map((row) => [row.key, row.name]));

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

function weekStart(date) {
  const weekday = weekdayFromDate(date);
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

function weekCount(start, end) {
  const keys = new Set();
  let cursor = weekStart(start);
  while (cursor <= end) {
    keys.add(cursor);
    cursor = addDays(cursor, 7);
  }
  return keys.size || 1;
}

function toMinutes(hhmm) {
  if (!/^\d{2}:\d{2}$/.test(String(hhmm || ""))) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function ratio(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : null;
}

function spreadOf(values) {
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const mad = values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / values.length;
  return Math.round(mad);
}

function categoryStreak(days) {
  const settled = days.filter((day) => !day.isToday);
  let longest = 0;
  let running = 0;
  for (const day of settled) {
    if (day.adherence !== null && day.adherence >= 80) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }
  let current = 0;
  for (let i = settled.length - 1; i >= 0; i -= 1) {
    if (settled[i].adherence !== null && settled[i].adherence >= 80) current += 1;
    else break;
  }
  const today = days.find((day) => day.isToday);
  if (today && today.adherence !== null && today.adherence >= 80) current += 1;
  return { current, longest };
}

function byCategory(plans, today) {
  return CATEGORIES.map((category) => {
    const dayMap = new Map();
    let done = 0;
    let total = 0;
    for (const plan of plans) {
      const items = (plan.items || []).filter((item) => item.category === category);
      if (!items.length) continue;
      const dayDone = items.filter((item) => item.status === "done").length;
      done += dayDone;
      total += items.length;
      dayMap.set(plan.date, {
        date: plan.date,
        isToday: plan.date === today,
        adherence: ratio(dayDone, items.length),
      });
    }
    const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const streak = categoryStreak(days);
    return {
      category,
      done,
      total,
      adherence: ratio(done, total),
      streak: streak.current,
      longest: streak.longest,
    };
  }).filter((row) => row.total > 0);
}

function timingOf(plans, lateMinutes) {
  let count = 0;
  let sum = 0;
  for (const plan of plans) {
    for (const item of plan.items || []) {
      const planned = toMinutes(item.plannedAt);
      const scheduled = toMinutes(item.scheduledAt);
      if (planned === null || scheduled === null || planned === scheduled) continue;
      count += 1;
      sum += scheduled - planned;
    }
  }
  return {
    spreadMin: spreadOf(lateMinutes || []),
    plannedVsShifted: {
      count,
      avgMin: count ? Math.round(sum / count) : null,
    },
  };
}

function shiftsOf(shifts) {
  const weekMap = new Map();
  const itemMap = new Map();
  const reasonMap = new Map();
  let minutes = 0;
  for (const op of shifts || []) {
    const week = weekStart(op.date);
    weekMap.set(week, (weekMap.get(week) || 0) + 1);
    const reason = String(op.reason || "").trim();
    if (reason) reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    for (const change of op.changes || []) {
      const from = toMinutes(change.from);
      const to = toMinutes(change.to);
      if (from !== null && to !== null) minutes += Math.abs(to - from);
      const title = (op.before || []).find((row) => String(row.id) === String(change.id))?.title || String(change.id || "task");
      itemMap.set(title, (itemMap.get(title) || 0) + 1);
    }
  }
  return {
    count: (shifts || []).length,
    minutes,
    perWeek: [...weekMap.entries()].map(([week, count]) => ({ week, count })).sort((a, b) => a.week.localeCompare(b.week)),
    mostShifted: [...itemMap.entries()]
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
    reasons: [...reasonMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

function workingSets(session) {
  return (session.sets || []).filter((set) => !set.isWarmup);
}

function workoutOf(sessions, start, end) {
  const ordered = (sessions || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const byExercise = new Map();
  for (const session of ordered) {
    for (const set of workingSets(session)) {
      if (!byExercise.has(set.exerciseKey)) {
        byExercise.set(set.exerciseKey, { key: set.exerciseKey, name: NAMES.get(set.exerciseKey) || set.exerciseKey, volume: 0, rpeSum: 0, rpeCount: 0, best: null });
      }
      const row = byExercise.get(set.exerciseKey);
      const weight = Number(set.weightKg) || 0;
      const reps = Number(set.reps) || 0;
      row.volume += weight * reps;
      if (Number.isFinite(Number(set.rpe))) {
        row.rpeSum += Number(set.rpe);
        row.rpeCount += 1;
      }
      const best = row.best;
      if (!best || weight > best.weightKg || (weight === best.weightKg && reps > best.reps)) {
        row.best = { weightKg: weight, reps, date: session.date };
      }
    }
  }
  const halves = (list) => {
    const sets = list.flatMap(workingSets);
    if (!sets.length) return null;
    const avg = sets.reduce((sum, set) => sum + Number(set.rpe || 0), 0) / sets.length;
    return Math.round(avg * 10) / 10;
  };
  const mid = Math.floor(ordered.length / 2);
  const first = ordered.length >= 2 ? halves(ordered.slice(0, mid)) : null;
  const second = ordered.length >= 2 ? halves(ordered.slice(mid)) : null;
  return {
    sessions: ordered.length,
    sessionsPerWeek: Math.round((ordered.length / weekCount(start, end)) * 10) / 10,
    exercises: [...byExercise.values()]
      .map((row) => ({
        key: row.key,
        name: row.name,
        volume: Math.round(row.volume),
        avgRpe: row.rpeCount ? Math.round((row.rpeSum / row.rpeCount) * 10) / 10 : null,
        best: row.best,
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5),
    rpeTrend: first === null || second === null ? null : { first, second, delta: Math.round((second - first) * 10) / 10 },
  };
}

function recoveryOf(sessions, suggestions) {
  const checkins = (sessions || []).filter((session) => session.checkin);
  const soreness = checkins.map((session) => Number(session.checkin.soreness0to4)).filter((value) => Number.isFinite(value));
  const painFlags = (sessions || []).filter(
    (session) => session.checkin?.painFlag || (session.sets || []).some((set) => set.painFlag)
  ).length;
  const counts = { accepted: 0, dismissed: 0, shown: 0 };
  for (const suggestion of suggestions || []) {
    if (counts[suggestion.status] !== undefined) counts[suggestion.status] += 1;
  }
  return {
    checkins: checkins.length,
    avgSoreness: soreness.length ? Math.round((soreness.reduce((sum, value) => sum + value, 0) / soreness.length) * 10) / 10 : null,
    painFlags,
    suggestions: counts,
  };
}

function computeInsightsV2({ plans = [], shifts = [], sessions = [], suggestions = [], lateMinutes = [], today = "", start, end }) {
  const periodStart = start || plans[0]?.date || today;
  const periodEnd = end || plans[plans.length - 1]?.date || today;
  return {
    byCategory: byCategory(plans, today),
    timing: timingOf(plans, lateMinutes),
    shifts: shiftsOf(shifts),
    workout: periodStart && periodEnd ? workoutOf(sessions, periodStart, periodEnd) : workoutOf(sessions, today, today),
    recovery: recoveryOf(sessions, suggestions),
  };
}

function formatInsightsV2(v2) {
  if (!v2) return [];
  const lines = [];
  if (v2.byCategory.length) {
    lines.push(
      `Categories: ${v2.byCategory
        .map((row) => `${row.category} ${row.adherence}% (${row.done}/${row.total}), streak ${row.streak}d`)
        .join("; ")}`
    );
  }
  if (v2.timing.spreadMin !== null) lines.push(`Timing spread: ${v2.timing.spreadMin} min around the average.`);
  if (v2.timing.plannedVsShifted.count) {
    lines.push(
      `Original plan vs current time: ${v2.timing.plannedVsShifted.count} tasks, average ${v2.timing.plannedVsShifted.avgMin} min.`
    );
  }
  if (v2.shifts.count) {
    const top = v2.shifts.mostShifted.map((row) => `${row.title} x${row.count}`).join(", ");
    lines.push(`Applied shifts: ${v2.shifts.count}, ${v2.shifts.minutes} min moved.${top ? ` Most moved: ${top}.` : ""}`);
  }
  if (v2.workout.sessions) {
    const trend = v2.workout.rpeTrend ? ` Effort ${v2.workout.rpeTrend.first} then ${v2.workout.rpeTrend.second}.` : "";
    lines.push(`Workouts: ${v2.workout.sessions} sessions, ${v2.workout.sessionsPerWeek} per week.${trend}`);
  }
  if (v2.recovery.checkins || v2.recovery.suggestions.accepted || v2.recovery.suggestions.dismissed) {
    lines.push(
      `Recovery counts: ${v2.recovery.checkins} check-ins, average soreness ${v2.recovery.avgSoreness ?? "none"}, flags ${v2.recovery.painFlags}, suggestions accepted ${v2.recovery.suggestions.accepted}, dismissed ${v2.recovery.suggestions.dismissed}.`
    );
  }
  return lines;
}

module.exports = { computeInsightsV2, formatInsightsV2, CATEGORIES };
