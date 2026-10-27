const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { connectDb } = require("./db");
const { registerRoutes } = require("./routes");
const { seed } = require("./seed/run");
const { requireAuth } = require("./auth/middleware");
const { registerAuthRoutes, ensureAuthAccount } = require("./auth/login");
const { allowOrigin } = require("./privacy");

const app = express();
app.set("trust proxy", 1);
const webOrigin = String(process.env.LIFEOS_WEB_ORIGIN || "").trim();
app.use(
  cors({
    origin(origin, callback) {
      if (allowOrigin(origin, webOrigin)) return callback(null, true);
      return callback(null, false);
    },
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(requireAuth);
registerAuthRoutes(app);
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
registerRoutes(app);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

const port = Number(process.env.PORT || 4000);

async function start() {
  await connectDb();
  try {
    const { User } = require("./models");
    const existing = await User.findOne({ name: "Raj" });
    if (!existing || process.env.SEED_ON_START === "true") {
      await seed({ disconnect: false });
    }
    await ensureAuthAccount();
  } catch (err) {
    console.warn("Seed warning:", err.message);
  }
  app.listen(port, "0.0.0.0", () => {
    console.log(`Life OS API on http://127.0.0.1:${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
