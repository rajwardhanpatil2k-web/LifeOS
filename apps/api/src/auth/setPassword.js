const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../../.env") });
require("dotenv").config();

const { connectDb } = require("../db");
const { AuthAccount, User } = require("../models");
const { hashPassword } = require("./password");
const { Session } = require("../models");

async function main() {
  const username = String(process.argv[2] || process.env.LIFEOS_LOGIN_USER || "").trim().toLowerCase();
  const password = process.argv[3] || process.env.LIFEOS_LOGIN_PASSWORD || "";
  if (!username || !password) {
    console.error("Usage: npm run auth:set -- <username> <password>");
    console.error("Or set LIFEOS_LOGIN_USER and LIFEOS_LOGIN_PASSWORD.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  await connectDb();
  const user = await User.findOne({ name: "Raj" });
  if (!user) {
    console.error("No user record yet. Start the API once so the routine can seed, then retry.");
    process.exit(1);
  }
  const hashed = await hashPassword(password);
  await AuthAccount.findOneAndUpdate(
    {},
    { userId: user._id, username, passwordSalt: hashed.salt, passwordHash: hashed.hash },
    { upsert: true, new: true }
  );
  await Session.deleteMany({ userId: user._id });
  console.log(`Login updated for ${username}. Existing sessions were signed out.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message || "Could not update the login.");
  process.exit(1);
});
