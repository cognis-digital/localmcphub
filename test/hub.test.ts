import { test } from "node:test";
import assert from "node:assert/strict";
import { Hub } from "../src/hub.js";
import { ProcessManager } from "../src/process-manager.js";
import { StateStore } from "../src/state-store.js";
import type { HubConfig } from "../src/types.js";
import { FakeSpawner, MemoryIO } from "./fakes.js";

function makeHub(config: HubConfig) {
  const fake = new FakeSpawner();
  const manager = new ProcessManager(fake);
  const store = new StateStore("/state.json", new MemoryIO());
  return { hub: new Hub({ config, manager, store }), fake, store };
}

const config: HubConfig = {
  servers: [
    { name: "alpha", command: "node", args: ["a.js"] },
    {
      name: "beta",
      command: "python",
      args: ["b.py"],
      healthcheck: { command: "probe", args: ["beta"] },
    },
  ],
};

test("list returns declared servers", () => {
  const { hub } = makeHub(config);
  assert.deepEqual(hub.list().map((s) => s.name), ["alpha", "beta"]);
});

test("start persists pid and start again is a no-op", () => {
  const { hub, store } = makeHub(config);
  const r = hub.start("alpha");
  assert.equal(r.started, true);
  assert.equal(typeof r.pid, "number");
  assert.equal(store.getPid("alpha"), r.pid);

  const again = hub.start("alpha");
  assert.equal(again.alreadyRunning, true);
  assert.equal(again.pid, r.pid);
});

test("start throws for unknown server", () => {
  const { hub } = makeHub(config);
  assert.throws(() => hub.start("ghost"), /no server named "ghost"/);
});

test("stop kills the tracked pid and records exit 0", () => {
  const { hub, store } = makeHub(config);
  hub.start("alpha");
  const r = hub.stop("alpha");
  assert.equal(r.wasRunning, true);
  assert.equal(r.stopped, true);
  assert.equal(store.getPid("alpha"), null);
  assert.equal(store.getLastExit("alpha"), 0);
});

test("stop on a not-running server is a graceful no-op", () => {
  const { hub } = makeHub(config);
  const r = hub.stop("beta");
  assert.equal(r.wasRunning, false);
  assert.equal(r.stopped, false);
});

test("status reflects running, pid, started and health", async () => {
  const { hub } = makeHub(config);
  hub.start("alpha");
  hub.start("beta");
  const rows = await hub.status();
  const alpha = rows.find((r) => r.name === "alpha")!;
  const beta = rows.find((r) => r.name === "beta")!;

  assert.equal(alpha.running, true);
  assert.equal(typeof alpha.pid, "number");
  assert.ok(alpha.startedAt);
  // alpha has no healthcheck -> skipped even though running
  assert.equal(alpha.health, "skipped");

  assert.equal(beta.running, true);
  // beta healthcheck scripted to pass by default
  assert.equal(beta.health, "pass");
});

test("status reconciles a pid that died out-of-band", async () => {
  const { hub, store, fake } = makeHub(config);
  const r = hub.start("alpha");
  fake.killSilently(r.pid!);
  const rows = await hub.status();
  const alpha = rows.find((x) => x.name === "alpha")!;
  assert.equal(alpha.running, false);
  assert.equal(alpha.pid, null);
  // running entry should have been cleared
  assert.equal(store.getPid("alpha"), null);
});

test("status marks failing healthcheck as fail", async () => {
  const { hub, fake } = makeHub(config);
  fake.healthResults.set("probe", false);
  hub.start("beta");
  const rows = await hub.status();
  assert.equal(rows.find((r) => r.name === "beta")!.health, "fail");
});
