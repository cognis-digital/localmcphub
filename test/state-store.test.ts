import { test } from "node:test";
import assert from "node:assert/strict";
import { StateStore } from "../src/state-store.js";
import { MemoryIO } from "./fakes.js";

test("setRunning persists and getPid reads back", () => {
  const io = new MemoryIO();
  const store = new StateStore("/state.json", io);
  store.setRunning({
    name: "a",
    pid: 123,
    startedAt: "2026-06-19T00:00:00.000Z",
    command: "node",
    args: ["s.js"],
  });
  assert.equal(store.getPid("a"), 123);
  assert.equal(store.getRunning("a")?.command, "node");
  // persisted to the (in-memory) file
  assert.ok(io.files.get("/state.json")!.includes("123"));
});

test("state survives reconstruction from the same IO", () => {
  const io = new MemoryIO();
  const s1 = new StateStore("/state.json", io);
  s1.setRunning({ name: "a", pid: 7, startedAt: "t", command: "node", args: [] });
  const s2 = new StateStore("/state.json", io);
  assert.equal(s2.getPid("a"), 7);
});

test("clearRunning records last exit and removes running entry", () => {
  const io = new MemoryIO();
  const store = new StateStore("/state.json", io);
  store.setRunning({ name: "a", pid: 9, startedAt: "t", command: "node", args: [] });
  store.clearRunning("a", 1);
  assert.equal(store.getPid("a"), null);
  assert.equal(store.getLastExit("a"), 1);
});

test("setRunning clears any prior last-exit", () => {
  const io = new MemoryIO();
  const store = new StateStore("/state.json", io);
  store.setRunning({ name: "a", pid: 1, startedAt: "t", command: "node", args: [] });
  store.clearRunning("a", 2);
  assert.equal(store.getLastExit("a"), 2);
  store.setRunning({ name: "a", pid: 2, startedAt: "t", command: "node", args: [] });
  assert.equal(store.getLastExit("a"), null);
});

test("missing file yields empty state without throwing", () => {
  const io = new MemoryIO();
  const store = new StateStore("/nope.json", io);
  assert.equal(store.getPid("anything"), null);
  assert.equal(store.getLastExit("anything"), null);
});

test("corrupt JSON is tolerated as empty state", () => {
  const io = new MemoryIO();
  io.files.set("/state.json", "{not json");
  const store = new StateStore("/state.json", io);
  assert.equal(store.getPid("a"), null);
});
