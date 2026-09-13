require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
require("dotenv").config();
const { connectDb } = require("../db");
const { User, RoutineTemplate } = require("../models");
const { LIFE_AREAS, weeklyTemplates } = require("./rajRoutine");

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
  for (const t of templates) {
    await RoutineTemplate.findOneAndUpdate(
      { userId: user._id, weekday: t.weekday },
      {
        userId: user._id,
        weekday: t.weekday,
        dayType: t.dayType,
        items: t.items,
        version: "raj-v1",
        approved: true,
      },
      { upsert: true, new: true }
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: String(user._id),
        templates: templates.length,
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
