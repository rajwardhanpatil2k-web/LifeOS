const PAIN_LINE =
  "Sharp or joint pain means stop that movement. Dull muscle effort is normal. If pain persists, please see a professional.";

const START_LINE = "Start light enough to finish every set with 2-4 reps left.";

function daysBetween(earlier, later) {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function weekIndex(date) {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return -1;
  return Math.floor(t / (7 * 86400000));
}

function workingSets(sets, exerciseKey) {
  return (sets || []).filter((set) => set.exerciseKey === exerciseKey && !set.isWarmup);
}

function sessionsFor(exerciseKey, sessions) {
  return (sessions || [])
    .filter((session) => workingSets(session.sets, exerciseKey).length)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function hasPain(session, exerciseKey) {
  if (!session) return false;
  if (session.painFlag || session.checkin?.painFlag) return true;
  return (session.sets || []).some((set) => set.exerciseKey === exerciseKey && set.painFlag);
}

function bestWorkingSet(sets) {
  return sets.reduce((best, set) => {
    if (!best) return set;
    if ((set.weightKg || 0) > (best.weightKg || 0)) return set;
    if ((set.weightKg || 0) === (best.weightKg || 0) && (set.reps || 0) > (best.reps || 0)) return set;
    return best;
  }, null);
}

function roundLighter(weightKg, stepKg) {
  if (!stepKg || !weightKg) return null;
  const stepped = Math.floor((weightKg * 0.9) / stepKg) * stepKg;
  const rounded = Math.round(stepped * 10) / 10;
  if (rounded > 0 && rounded < weightKg) return rounded;
  const oneStep = Math.round((weightKg - stepKg) * 10) / 10;
  return oneStep > 0 ? oneStep : rounded;
}

function suggestProgression({ exercise, sessions, today, missedDates = [] }) {
  const key = exercise?.key;
  const history = sessionsFor(key, sessions);
  const last = history[0] || null;
  if (hasPain(last, key)) {
    return { type: "hold", weightKg: null, reason: "Last time had a pain flag, so hold the weight.", note: PAIN_LINE };
  }
  const lastSets = last ? workingSets(last.sets, key) : [];
  if (!lastSets.length) {
    return { type: "start", weightKg: null, reason: START_LINE, note: "" };
  }
  const gap = daysBetween(last.date, today);
  const best = bestWorkingSet(lastSets);
  if (gap >= 14) {
    const lighter = roundLighter(best?.weightKg || 0, exercise.stepKg);
    return {
      type: "reduce",
      weightKg: lighter,
      reason: lighter
        ? `About 10% less after ${gap} days away: ${lighter} kg.`
        : `About 10% easier after ${gap} days away. No load to reduce.`,
      note: "",
    };
  }
  const missed = (missedDates || []).filter((date) => daysBetween(date, today) >= 0 && daysBetween(date, today) <= 14);
  const hard = lastSets.some((set) => Number(set.rpe) >= 9);
  if (hard || missed.length >= 2) {
    return {
      type: "hold",
      weightKg: best?.weightKg ?? null,
      reason: hard ? "Last time was RPE 9 or higher, so hold." : "Two or more missed sessions in 14 days, so hold.",
      note: "",
    };
  }
  const topped =
    exercise.repHigh &&
    exercise.stepKg > 0 &&
    lastSets.every((set) => Number(set.reps) >= exercise.repHigh && Number(set.rpe) <= 8);
  if (topped) {
    const next = Math.round(((best?.weightKg || 0) + exercise.stepKg) * 10) / 10;
    return {
      type: "progress",
      weightKg: next,
      reason: `Every set hit the top of the range at RPE 8 or below. Smallest step: ${next} kg.`,
      note: "",
    };
  }
  return {
    type: "hold",
    weightKg: best?.weightKg ?? null,
    reason: "Hold the weight and aim for more reps.",
    note: "",
  };
}

function sessionIsHard(session) {
  const sets = (session.sets || []).filter((set) => !set.isWarmup);
  if (!sets.length) return false;
  const hard = sets.filter((set) => Number(set.rpe) >= 9).length;
  return hard / sets.length >= 0.6;
}

function suggestFatigue({ sessions, today, weeksSinceDeload = 0, deloadEveryWeeks = 5 }) {
  const recent = (sessions || []).filter((session) => {
    const gap = daysBetween(session.date, today);
    return gap >= 0 && gap <= 7;
  });
  const pain = recent.some((session) => session.painFlag || session.checkin?.painFlag || (session.sets || []).some((set) => set.painFlag));
  const soreDays = new Set(
    recent.filter((session) => Number(session.soreness0to4 ?? session.checkin?.soreness0to4) >= 3).map((session) => session.date)
  );
  const trained = (sessions || [])
    .filter((session) => (session.sets || []).some((set) => !set.isWarmup))
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const twoHard = trained.length >= 2 && sessionIsHard(trained[0]) && sessionIsHard(trained[1]);
  if (pain || soreDays.size >= 2 || twoHard) {
    return {
      type: "extra_rest",
      reason: pain
        ? "A pain flag is a reason to rest or do mobility, not to add load."
        : soreDays.size >= 2
          ? "Soreness has been 3 or higher twice in 7 days."
          : "Effort has been RPE 9–10 on most sets for two sessions in a row.",
      note: PAIN_LINE,
    };
  }
  if (weeksSinceDeload >= deloadEveryWeeks) {
    return {
      type: "deload",
      reason: "Same exercises, about half the sets, lighter, RPE 6 or less. You can accept, delay, or dismiss.",
      note: "",
    };
  }
  return null;
}

function weeksTrainedSince(sessions, today, lastDeloadDate) {
  const keys = new Set();
  for (const session of sessions || []) {
    if (session.missed) continue;
    if (!(session.sets || []).some((set) => !set.isWarmup)) continue;
    if (lastDeloadDate && session.date <= lastDeloadDate) continue;
    if (session.date > today) continue;
    const key = weekIndex(session.date);
    if (key >= 0) keys.add(key);
  }
  return keys.size;
}

function lastTime(sessions, exerciseKey) {
  const last = sessionsFor(exerciseKey, sessions)[0];
  if (!last) return null;
  const best = bestWorkingSet(workingSets(last.sets, exerciseKey));
  if (!best) return null;
  return {
    date: last.date,
    weightKg: best.weightKg ?? null,
    reps: best.reps ?? null,
    rpe: best.rpe ?? null,
  };
}

module.exports = {
  PAIN_LINE,
  START_LINE,
  suggestProgression,
  suggestFatigue,
  weeksTrainedSince,
  lastTime,
  daysBetween,
};
