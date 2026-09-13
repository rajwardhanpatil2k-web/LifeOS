// Opt-in demo history so the Insights screen has something to chew on before
// you've accumulated weeks of real tracking.
//
// Everything it writes is tagged generatedFrom: "demo-backfill", so
// `node src/seed/backfillDemo.js --clear` removes exactly this and nothing
// else. Today's plan is never touched — your real day stays real.
//
//   node src/seed/backfillDemo.js            # last 45 days
//   node src/seed/backfillDemo.js --days=30
//   node src/seed/backfillDemo.js --clear

require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
require("dotenv").config();

const mongoose = require("mongoose");
const { connectDb } = require("../db");
const {
  User,
  RoutineTemplate,
  DailyPlan,
  DailyScore,
  LifeEvent,
  InsightReport,
} = require("../models");

const TAG = "demo-backfill";

// Deliberately uneven so the insights have real patterns to find: skin/hair
// nearly perfect, workout wobbling on office days, study as the obvious leak
// that collapses at the end of the week.
const DOMAIN_ADHERENCE = {
  skin: 0.92,
  hair: 0.88,
  fitness: 0.62,
  learning: 0.44,
  health: 0.74,
  career: 0.58,
  mind: 0.7,
  social: 0.6,
  fun: 0.65,
  other: 0.7,
};

const WEEKDAY_MULTIPLIER = {
  0: 1.12, // Sunday — free day, better follow-through
  1: 1.0,
  2: 0.98,
  3: 0.95,
  4: 0.86, // Thursday slump
  5: 0.8, // Friday collapse
  6: 1.05,
};

const SKIP_REASONS = [
  "too tired",
  "office ran late",
  "ran out of time",
  "woke up late",
  "not in the mood",
  "headache",
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function todayIST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weekdayFromDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Deterministic pseudo-random so re-running produces the same history instead
// of a different past every time.
function seededRandom(seed) {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) {
    state = (state * 31 + seed.charCodeAt(i)) % 2147483647;
  }
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

// IST wall-clock HH:MM on `date` as a real UTC Date (IST = UTC+5:30).
function istDateTime(date, hhmm, extraMinutes = 0) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const utcMinutes = h * 60 + min + extraMinutes - 330;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + utcMinutes * 60000);
}

async function clear(user) {
  const plans = await DailyPlan.deleteMany({ userId: user._id, generatedFrom: TAG });
  const dates = await DailyPlan.find({ userId: user._id }).distinct("date");
  const scores = await DailyScore.deleteMany({
    userId: user._id,
    date: { $nin: dates },
  });
  const events = await LifeEvent.deleteMany({ userId: user._id, source: TAG });
  // Cached narration was written about the demo numbers — drop it so nothing
  // describes history that no longer exists.
  const reports = await InsightReport.deleteMany({ userId: user._id });
  console.log(
    JSON.stringify(
      {
        cleared: true,
        plansRemoved: plans.deletedCount,
        scoresRemoved: scores.deletedCount,
        eventsRemoved: events.deletedCount,
        cachedReportsRemoved: reports.deletedCount,
      },
      null,
      2
    )
  );
}

async function backfill(user, days) {
  const today = todayIST();
  const templates = await RoutineTemplate.find({ userId: user._id }).lean();
  const byWeekday = new Map(templates.map((t) => [t.weekday, t]));
  if (!byWeekday.size) throw new Error("No routine templates found — run the seed first.");

  let created = 0;
  let skippedExisting = 0;
  const gapDays = [];

  for (let offset = days; offset >= 1; offset -= 1) {
    const date = addDays(today, -offset);
    const weekday = weekdayFromDate(date);
    const template = byWeekday.get(weekday);
    if (!template) continue;

    const existing = await DailyPlan.findOne({ userId: user._id, date }).lean();
    if (existing && existing.generatedFrom !== TAG) {
      skippedExisting += 1;
      continue;
    }

    const rand = seededRandom(`${date}-plan`);

    // A couple of completely untracked days makes the streak logic honest.
    if (rand() < 0.07) {
      gapDays.push(date);
      continue;
    }

    const weekdayMult = WEEKDAY_MULTIPLIER[weekday] ?? 1;
    // Slow upward trend across the window so momentum has something to show.
    const trend = 0.82 + ((days - offset) / days) * 0.3;

    const items = [];
    const events = [];
    let done = 0;

    for (const templateItem of template.items) {
      const base = DOMAIN_ADHERENCE[templateItem.domain] ?? 0.7;
      const chance = Math.min(0.98, base * weekdayMult * trend);
      const roll = rand();
      const steps = (templateItem.steps || []).map((s) => ({ ...s, done: false, doneAt: null }));

      let status = "pending";
      let skippedReason;

      if (roll < chance) {
        status = "done";
        done += 1;
        // Real completions drift late; non-negotiables drift least.
        const drift =
          templateItem.alertLevel === "non_negotiable"
            ? Math.round(rand() * 8)
            : Math.round(rand() * 45) - 5;
        steps.forEach((s, idx) => {
          s.done = true;
          s.doneAt = istDateTime(date, templateItem.scheduledAt, drift + idx * 2);
        });
        events.push({
          userId: user._id,
          date,
          domain: templateItem.domain,
          type: "complete_item",
          itemKey: templateItem.key,
          status: "done",
          source: TAG,
          createdAt: istDateTime(date, templateItem.scheduledAt, drift),
        });
      } else if (roll < chance + (1 - chance) * 0.55) {
        status = "skipped";
        skippedReason = SKIP_REASONS[Math.floor(rand() * SKIP_REASONS.length)];
        events.push({
          userId: user._id,
          date,
          domain: templateItem.domain,
          type: "skip_item",
          itemKey: templateItem.key,
          status: "skipped",
          notes: skippedReason,
          source: TAG,
          createdAt: istDateTime(date, templateItem.scheduledAt, 30),
        });
      }

      items.push({
        ...templateItem,
        status,
        skippedReason,
        steps,
      });
    }

    await DailyPlan.findOneAndUpdate(
      { userId: user._id, date },
      {
        userId: user._id,
        date,
        weekday,
        dayType: template.dayType,
        items,
        generatedFrom: TAG,
        status: "closed",
        wakeShiftMin: 0,
        homeShiftMin: 0,
      },
      { upsert: true, new: true }
    );

    const byDomain = {};
    for (const item of items) {
      if (!byDomain[item.domain]) byDomain[item.domain] = { done: 0, total: 0 };
      byDomain[item.domain].total += 1;
      if (item.status === "done") byDomain[item.domain].done += 1;
    }

    await DailyScore.findOneAndUpdate(
      { userId: user._id, date },
      {
        userId: user._id,
        date,
        overall: items.length ? Math.round((done / items.length) * 100) : 0,
        completed: done,
        total: items.length,
        byDomain,
      },
      { upsert: true, new: true }
    );

    if (events.length) await LifeEvent.insertMany(events);
    created += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        daysRequested: days,
        plansCreated: created,
        untrackedGapDays: gapDays,
        realPlansLeftAlone: skippedExisting,
        tag: TAG,
        note: "Remove anytime with: node src/seed/backfillDemo.js --clear",
      },
      null,
      2
    )
  );
}

async function main() {
  const args = process.argv.slice(2);
  const daysArg = args.find((a) => a.startsWith("--days="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 45;

  await connectDb();
  const user = await User.findOne({ name: "Raj" });
  if (!user) throw new Error("No user found — run the seed first.");

  if (args.includes("--clear")) await clear(user);
  else await backfill(user, days);

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { backfill, clear, TAG };
