import test from "node:test";
import assert from "node:assert/strict";
import { serverUrlProblem } from "./serverUrl.js";

test("a release build rejects a plain http server", () => {
  assert.equal(serverUrlProblem("http://10.0.2.2:4000", { release: true }).includes("https://"), true);
  assert.equal(serverUrlProblem("https://lifeos.example", { release: true }), "");
});

test("local development can still use http", () => {
  assert.equal(serverUrlProblem("http://127.0.0.1:4000", { release: false }), "");
});
