import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, findServer } from "../src/config.js";
import type { HubConfig } from "../src/types.js";

test("validateConfig accepts a minimal valid config", () => {
  const r = validateConfig({ servers: [{ name: "a", command: "node" }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test("validateConfig rejects non-object input", () => {
  assert.equal(validateConfig(null).ok, false);
  assert.equal(validateConfig(42).ok, false);
  assert.equal(validateConfig("nope").ok, false);
});

test("validateConfig requires a servers array", () => {
  const r = validateConfig({});
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /servers/);
});

test("validateConfig flags empty servers array", () => {
  const r = validateConfig({ servers: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /empty/.test(e)));
});

test("validateConfig requires name and command", () => {
  const r = validateConfig({ servers: [{}] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /name is required/.test(e)));
  assert.ok(r.errors.some((e) => /command is required/.test(e)));
});

test("validateConfig detects duplicate names", () => {
  const r = validateConfig({
    servers: [
      { name: "dup", command: "node" },
      { name: "dup", command: "python" },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /duplicate server name "dup"/.test(e)));
});

test("validateConfig validates args, env, cwd and healthcheck types", () => {
  const r = validateConfig({
    servers: [
      {
        name: "x",
        command: "node",
        args: ["ok", 5],
        env: { GOOD: "1", BAD: 2 },
        cwd: 99,
        healthcheck: { command: "", timeoutMs: -1 },
      },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /args must be an array of strings/.test(e)));
  assert.ok(r.errors.some((e) => /env values must all be strings/.test(e)));
  assert.ok(r.errors.some((e) => /cwd must be a string/.test(e)));
  assert.ok(r.errors.some((e) => /healthcheck.command is required/.test(e)));
  assert.ok(r.errors.some((e) => /timeoutMs must be a positive number/.test(e)));
});

test("findServer locates by name", () => {
  const config: HubConfig = {
    servers: [
      { name: "a", command: "node" },
      { name: "b", command: "python" },
    ],
  };
  assert.equal(findServer(config, "b")?.command, "python");
  assert.equal(findServer(config, "missing"), undefined);
});
