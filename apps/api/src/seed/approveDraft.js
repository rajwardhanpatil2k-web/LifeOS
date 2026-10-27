const VERSION = "raj-v2";

function planApproval(draft) {
  const days = Array.isArray(draft?.days) ? draft.days : [];
  if (!draft || draft.version !== VERSION || days.length !== 7) {
    return { ok: false, error: "No complete raj-v2 draft to approve." };
  }
  const settings = draft.settings || {};
  return {
    ok: true,
    already: draft.approved === true,
    templates: days.map((day) => ({
      weekday: day.weekday,
      dayType: day.dayType,
      items: day.items,
      version: VERSION,
      approved: true,
    })),
    userPatch: {
      wakeTarget: "06:00",
      wakeBaseline: "06:00",
      homeTarget: "20:30",
      homeBaseline: "20:30",
      officeDays: [3, 4, 5],
      sleepHours: settings.sleepHours ?? 8,
      sleepMode: settings.sleepMode || "auto",
      gymBlockMin: settings.gymBlockMin || { wfh: 90, office: 60, off: 90 },
      dayTypes: settings.dayTypes || {},
      deloadEveryWeeks: settings.deloadEveryWeeks ?? 5,
    },
  };
}

function isLocalUri(uri) {
  return /127\.0\.0\.1|localhost/.test(String(uri || ""));
}

async function applyApproval({ disconnect = true } = {}) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
  require("dotenv").config();
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/life_os";
  if (!isLocalUri(uri)) {
    throw new Error("Refusing to approve the draft on a remote database.");
  }
  const { connectDb } = require("../db");
  const { User, RoutineTemplate, RoutineDraft, DailyPlan } = require("../models");
  const { weeklyTemplatesV2, draftSettings } = require("./rajRoutineV2");
  await connectDb();
  const user = await User.findOne({ name: "Raj" });
  if (!user) throw new Error("No local user to attach the approved week to.");

  let draft = await RoutineDraft.findOne({ userId: user._id, version: VERSION });
  if (!draft) {
    draft = await RoutineDraft.create({
      userId: user._id,
      version: VERSION,
      approved: false,
      settings: draftSettings(),
      days: weeklyTemplatesV2(),
    });
  }
  const planned = planApproval(draft);
  if (!planned.ok) throw new Error(planned.error);
  const plansLeft = await DailyPlan.countDocuments({ userId: user._id });
  if (planned.already) {
    const summary = { ok: true, already: true, plansLeft };
    console.log(JSON.stringify(summary, null, 2));
    if (disconnect) await require("mongoose").disconnect();
    return summary;
  }

  for (const day of planned.templates) {
    await RoutineTemplate.updateOne(
      { userId: user._id, weekday: day.weekday },
      {
        $set: {
          dayType: day.dayType,
          items: day.items,
          version: day.version,
          approved: true,
        },
        $setOnInsert: { userId: user._id, weekday: day.weekday },
      },
      { upsert: true }
    );
  }
  Object.assign(user, planned.userPatch);
  await user.save();
  draft.approved = true;
  await draft.save();
  const summary = {
    ok: true,
    already: false,
    version: VERSION,
    templates: planned.templates.length,
    plansLeft,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (disconnect) await require("mongoose").disconnect();
  return summary;
}

if (require.main === module) {
  applyApproval().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { planApproval, applyApproval, isLocalUri };
