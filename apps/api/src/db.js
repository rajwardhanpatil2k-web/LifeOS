const mongoose = require("mongoose");

async function connectDb() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/life_os";
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 20000,
  });
  return mongoose.connection;
}

module.exports = { connectDb };
