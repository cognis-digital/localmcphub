import { test } from "node:test";
import assert from "node:assert/strict";
import { ProcessManager } from "../src/process-manager.js";
import type { ServerSpec } from "../src/types.js";
import { FakeSpawner } from "./fakes.js";

const spec: ServerSpec = {
  name: "echo",
  command: "node",
  args: ["server.js"],
  env: { FOO: "bar" },
  cwd: "/srv",
};

test("start spawns when no existing pid and persists nothing itself", () => {
  const fake = new FakeSpawner();
  const pm = new ProcessManager(fake);
  const r = pm.start(spec, null);
  assert.equal(r.started, true);
  assert.equal(r.alreadyRunning, false);
  assert.equal(typeof r.pid, "number");
  assert.equal(fake.spawnCalls.length, 1);
  // env is merged over process.env
  assert.equal(fake.spawnCalls[0].opts.env.FOO, "bar");
  assert.equal(fake.spawnCalls[0].opts.cwd, "/srv");
  assert.deepEqual(fake.spawnCalls[0].opts.args, ["server.js"]);
});

test("start is a no-op when existing pid is still alive", () => {
  const fake = new FakeSpawner();
  const pm = new ProcessManager(fake);
  const first = pm.start(spec, null);
  const again = pm.start(spec, first.pid);
  assert.equal(again.alreadyRunning, true);
  assert.equal(again.started, false);
  assert.equal(again.pid, first.pid);
  assert.equal(fake.spawnCalls.length, 1, "should not re-spawn");
});

test("start respawns when the existing pid is dead", () => {
  const fake = new FakeSpawner();
  const pm = new ProcessManager(fake);
  const first = pm.start(spec, null);
  fake.killSilently(first.pid!);
  const again = pm.start(spec, first.pid);
  assert.equal(again.alreadyRunning, false);
  assert.equal(again.started, true);
  assert.equal(fake.spawnCalls.length, 2);
});

test("start reports failure when spawner returns null", () => {
  const fake = new FakeSpawner();
  fake.spawnSucceeds = false;
  const pm = new ProcessManager(fake);
  const r = pm.start(spec, null);
  assert.equal(r.started, false);
  assert.equal(r.pid, null);
});

test("stop kills a live pid", () => {
  const fake = new FakeSpawner();
  const pm = new ProcessManager(fake);
  const first = pm.start(spec, null);
  const r = pm.stop(first.pid);
  assert.equal(r.wasRunning, true);
  assert.equal(r.stopped, true);
  assert.deepEqual(fake.killCalls, [first.pid]);
  assert.equal(pm.isRunning(first.pid), false);
});

test("stop is a no-op for null or dead pid", () => {
  const fake = new FakeSpawner();
  const pm = new ProcessManager(fake);
  assert.deepEqual(pm.stop(null), { stopped: false, wasRunning: false });
  assert.deepEqual(pm.stop(424242), { stopped: false, wasRunning: false });
});

test("healthcheck returns skipped when none configured", async () => {
  const fake = new FakeSpawner();
  const pm = new ProcessManager(fake);
  assert.equal(await pm.healthcheck(spec), "skipped");
});

test("healthcheck returns pass/fail per scripted result", async () => {
  const fake = new FakeSpawner();
  const pm = new ProcessManager(fake);
  const withHc: ServerSpec = {
    ...spec,
    healthcheck: { command: "curl", args: ["-sf", "http://x"] },
  };
  assert.equal(await pm.healthcheck(withHc), "pass");
  fake.healthResults.set("curl", false);
  assert.equal(await pm.healthcheck(withHc), "fail");
});
