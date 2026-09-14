#!/usr/bin/env node
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const root = path.resolve(__dirname, "..");
const dbPath = path.join(root, "mongo-data");
const procs = [];
let startedMongod = false;

function log(label, chunk) {
  process.stdout.write(`[${label}] ${chunk.toString()}`);
}

function run(label, command, args, extra = {}) {
  const child = spawn(command, args, {
    cwd: extra.cwd || root,
    env: { ...process.env, ...(extra.env || {}) },
    stdio: ["inherit", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => log(label, d));
  child.stderr.on("data", (d) => log(label, d));
  child.on("exit", (code) => console.log(`[${label}] exited ${code}`));
  procs.push(child);
  return child;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => resolve(res.statusCode === 200));
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitFor(fn, tries = 30, delay = 500) {
  for (let i = 0; i < tries; i += 1) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, delay));
  }
  return false;
}

function usingRemoteMongo() {
  const uri = process.env.MONGODB_URI || "";
  return /^mongodb\+srv:\/\//.test(uri) || (uri.startsWith("mongodb://") && !/127\.0\.0\.1|localhost/.test(uri));
}

async function startMongo() {
  if (usingRemoteMongo()) {
    console.log("MONGODB_URI points at a remote cluster — skipping local mongod.");
    return;
  }
  if (await portOpen(27017)) {
    console.log("Mongo already running on 27017");
    return;
  }
  fs.mkdirSync(dbPath, { recursive: true });
  let mongod = "mongod";
  try {
    mongod = execSync("which mongod", { encoding: "utf8" }).trim();
  } catch (_e) {
    console.log("mongod not found. Install MongoDB or start it yourself on 27017.");
    return;
  }
  console.log(`Starting ${mongod}`);
  startedMongod = true;
  run("mongo", mongod, ["--dbpath", dbPath, "--port", "27017", "--bind_ip", "127.0.0.1"]);
  const ok = await waitFor(() => portOpen(27017), 40, 250);
  if (!ok) console.log("Mongo did not open 27017 in time");
}

async function main() {
  console.log("Life OS monitor");
  await startMongo();
  run("api", "npm", ["run", "dev", "--workspace=apps/api"]);
  const ok = await waitFor(() => ping("http://127.0.0.1:4000/health"), 40, 400);
  if (ok) {
    console.log("API healthy: http://127.0.0.1:4000");
    console.log("Today board: http://127.0.0.1:4000");
    const ip = require("os").networkInterfaces();
    let lan = "";
    for (const list of Object.values(ip)) {
      for (const addr of list || []) {
        if (addr.family === "IPv4" && !addr.internal) {
          lan = addr.address;
          break;
        }
      }
      if (lan) break;
    }
    console.log("Mobile (simulator): npm run dev:mobile");
    if (lan) {
      console.log(`Mobile (phone on Wi-Fi): npm run dev:phone  → API http://${lan}:4000`);
    } else {
      console.log("Mobile (phone on Wi-Fi): npm run dev:phone");
    }
  } else {
    console.log("API not healthy yet. Check Mongo on 27017.");
  }
}

function shutdown() {
  procs.forEach((p) => {
    try {
      p.kill("SIGTERM");
    } catch (_e) {
      /* ignore */
    }
  });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
