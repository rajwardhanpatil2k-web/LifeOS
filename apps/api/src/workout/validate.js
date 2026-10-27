const BANNED = ["bodyweightkg", "bodyweight", "bodyWeight", "calories", "calorie", "macros", "protein", "carbs", "fat"];

function bannedKey(value, path = "") {
  if (!value || typeof value !== "object") return "";
  for (const key of Object.keys(value)) {
    if (BANNED.includes(key) || BANNED.includes(key.toLowerCase())) return path ? `${path}.${key}` : key;
    if (key !== "sets" && value[key] && typeof value[key] === "object") {
      const found = bannedKey(value[key], path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  if (Array.isArray(value.sets)) {
    for (let i = 0; i < value.sets.length; i += 1) {
      const found = bannedKey(value.sets[i], `sets[${i}]`);
      if (found) return found;
    }
  }
  return "";
}

function validateSession(body) {
  const banned = bannedKey(body);
  if (banned) return { ok: false, error: "Body weight, calories, and macros are not tracked." };
  const date = String(body?.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Date must be YYYY-MM-DD." };
  const checkin = body?.checkin || {};
  if (typeof checkin.painFlag !== "boolean") return { ok: false, error: "Say whether there is pain today." };
  const soreness = Number(checkin.soreness0to4);
  if (!Number.isInteger(soreness) || soreness < 0 || soreness > 4) return { ok: false, error: "Soreness is 0 to 4." };
  if (typeof checkin.sleepOk !== "boolean") return { ok: false, error: "Say whether sleep was okay." };
  const sets = Array.isArray(body.sets) ? body.sets : null;
  if (!sets) return { ok: false, error: "Sets must be a list." };
  const clean = [];
  const warnings = [];
  for (const set of sets) {
    const reps = Number(set.reps);
    const rpe = Number(set.rpe);
    const weightKg = set.weightKg == null || set.weightKg === "" ? 0 : Number(set.weightKg);
    if (!set.exerciseKey) return { ok: false, error: "Each set needs an exercise." };
    if (!Number.isInteger(reps) || reps < 0 || reps > 100) return { ok: false, error: "Reps must be a whole number." };
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return { ok: false, error: "RPE is 1 to 10." };
    if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 500) return { ok: false, error: "Weight is the load you lifted, in kg." };
    if (rpe > 8) warnings.push("RPE above 8. The target is 6–8, with reps left.");
    clean.push({
      exerciseKey: String(set.exerciseKey),
      setIndex: Number.isInteger(set.setIndex) ? set.setIndex : clean.length,
      reps,
      weightKg,
      rpe,
      isWarmup: Boolean(set.isWarmup),
      painFlag: Boolean(set.painFlag),
    });
  }
  return {
    ok: true,
    warnings: [...new Set(warnings)],
    session: {
      date,
      planItemId: String(body.planItemId || ""),
      clientId: String(body.clientId || ""),
      checkin: { painFlag: checkin.painFlag, soreness0to4: soreness, sleepOk: checkin.sleepOk },
      sets: clean,
      notes: String(body.notes || "").slice(0, 240),
    },
  };
}

module.exports = { validateSession };
