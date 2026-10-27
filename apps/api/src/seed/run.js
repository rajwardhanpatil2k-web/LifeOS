require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
require("dotenv").config();
const { connectDb } = require("../db");
const { User, RoutineTemplate, RoutineDraft } = require("../models");
const { LIFE_AREAS, weeklyTemplates } = require("./rajRoutine");
const { weeklyTemplatesV2, draftSettings, VERSION } = require("./rajRoutineV2");
const { seedAction } = require("./seedPolicy");

async function seed(options = {}) {
  const { disconnect = true } = options;
  await connectDb();
  let user = await User.findOne({ name: "Raj" });
  if (!user) {
    user = await User.create({
      name: "Raj",
      priorities: ["skin", "hair", "fitness", "learning"],
      deferred: ["dance"],
    });
  }

  const templates = weeklyTemplates();
  const existing = await RoutineTemplate.find({ userId: user._id });
  let insertedV1 = 0;
  for (const t of templates) {
    const already = existing.filter((row) => row.weekday === t.weekday);
    if (seedAction(already, { version: "raj-v1" }) !== "insert") continue;
    await RoutineTemplate.create({
      userId: user._id,
      weekday: t.weekday,
      dayType: t.dayType,
      items: t.items,
      version: "raj-v1",
      approved: true,
    });
    insertedV1 += 1;
  }

  const draft = await RoutineDraft.findOne({ userId: user._id, version: VERSION });
  let insertedDraft = false;
  if (seedAction(draft ? [draft] : [], { version: VERSION }) === "insert-draft") {
    await RoutineDraft.create({
      userId: user._id,
      version: VERSION,
      approved: false,
      settings: draftSettings(),
      days: weeklyTemplatesV2(),
    });
    insertedDraft = true;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: String(user._id),
        templates: templates.length,
        insertedV1,
        draft: insertedDraft ? VERSION : "already-present",
        draftApproved: false,
        areas: LIFE_AREAS.length,
      },
      null,
      2
    )
  );
  if (disconnect) await mongooseDisconnect();
  return user;
}

async function mongooseDisconnect() {
  const mongoose = require("mongoose");
  await mongoose.disconnect();
}

if (require.main === module) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seed };
