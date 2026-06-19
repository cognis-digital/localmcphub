import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";
import { CaptureIO } from "./fakes.js";
import type { HubConfig } from "../src/types.js";

function tmpConfig(config: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "lmh-"));
  const path = join(dir, "config.json");
  writeFileSync(path, typeof config === "string" ? config : JSON.stringify(config), "utf8");
  return { dir, path };
}

const valid: HubConfig = {
  servers: [
    { name: "alpha", command: "node", args: ["a.js"] },
    {
      name: "beta",
      command: "python",
      args: ["b.py"],
      healthcheck: { command: "probe" },
    },
  ],
};

test("no command prints usage and exits 1", async () => {
  const io = new CaptureIO();
  const code = await run([], io);
  assert.equal(code, 1);
  assert.match(io.outText, /Usage:/);
});

test("--help prints usage and exits 0", async () => {
  const io = new CaptureIO();
  const code = await run(["list", "--help"], io);
  assert.equal(code, 0);
  assert.match(io.outText, /Usage:/);
});

test("validate returns 0 and OK for a valid config", async () => {
  const { dir, path } = tmpConfig(valid);
  try {
    const io = new CaptureIO();
    const code = await run(["validate", path], io);
    assert.equal(code, 0);
    assert.match(io.outText, /OK: 2 server\(s\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate returns non-zero and lists errors for a bad config", async () => {
  const { dir, path } = tmpConfig({ servers: [{ command: "node" }, { name: "x" }] });
  try {
    const io = new CaptureIO();
    const code = await run(["validate", path], io);
    assert.equal(code, 1);
    assert.match(io.errText, /INVALID config/);
    assert.match(io.errText, /name is required/);
    assert.match(io.errText, /command is required/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validate fails on missing file", async () => {
  const io = new CaptureIO();
  const code = await run(["validate", "/definitely/not/here.json"], io);
  assert.equal(code, 1);
  assert.match(io.errText, /cannot read config/);
});

test("validate fails on malformed JSON", async () => {
  const { dir, path } = tmpConfig("{ not valid json");
  try {
    const io = new CaptureIO();
    const code = await run(["validate", path], io);
    assert.equal(code, 1);
    assert.match(io.errText, /not valid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("list renders a table of declared servers", async () => {
  const { dir, path } = tmpConfig(valid);
  try {
    const io = new CaptureIO();
    const code = await run(["list", path], io);
    assert.equal(code, 0);
    assert.match(io.outText, /NAME/);
    assert.match(io.outText, /alpha/);
    assert.match(io.outText, /beta/);
    assert.match(io.outText, /probe/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("status on a fresh state shows nothing running (no real spawn)", async () => {
  const { dir, path } = tmpConfig(valid);
  try {
    const statePath = join(dir, "state.json");
    const io = new CaptureIO();
    const code = await run(["status", path, "--state", statePath, "--json"], io);
    assert.equal(code, 0);
    const rows = JSON.parse(io.outText) as Array<{ name: string; running: boolean }>;
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.running === false));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("status table form renders headers", async () => {
  const { dir, path } = tmpConfig(valid);
  try {
    const statePath = join(dir, "state.json");
    const io = new CaptureIO();
    const code = await run(["status", path, "--state", statePath], io);
    assert.equal(code, 0);
    assert.match(io.outText, /RUNNING/);
    assert.match(io.outText, /HEALTH/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown command exits 1", async () => {
  const io = new CaptureIO();
  const code = await run(["frobnicate"], io);
  assert.equal(code, 1);
  assert.match(io.errText, /unknown command/);
});

test("start without --config errors", async () => {
  const io = new CaptureIO();
  const code = await run(["start", "alpha"], io);
  assert.equal(code, 1);
  assert.match(io.errText, /requires --config/);
});
