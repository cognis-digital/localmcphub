/**
 * Test doubles: a FakeSpawner that never launches a real process, and an
 * in-memory StateIO. Shared across the test suite.
 */
import type { Spawner, SpawnOptions } from "../src/process-manager.js";
import type { StateIO } from "../src/state-store.js";
import type { CliIO } from "../src/cli.js";

export interface SpawnCall {
  opts: SpawnOptions;
}

/**
 * Records spawn/kill calls and tracks a virtual set of alive pids. Healthcheck
 * results are scripted by command name. No OS processes are ever created.
 */
export class FakeSpawner implements Spawner {
  public spawnCalls: SpawnCall[] = [];
  public killCalls: number[] = [];
  private alive = new Set<number>();
  private nextPid = 1000;
  /** When false, spawn() returns null to simulate a launch failure. */
  public spawnSucceeds = true;
  /** Map healthcheck command -> boolean result. Defaults to true. */
  public healthResults = new Map<string, boolean>();

  spawn(opts: SpawnOptions): number | null {
    this.spawnCalls.push({ opts });
    if (!this.spawnSucceeds) return null;
    const pid = this.nextPid++;
    this.alive.add(pid);
    return pid;
  }

  isAlive(pid: number): boolean {
    return this.alive.has(pid);
  }

  kill(pid: number): boolean {
    this.killCalls.push(pid);
    if (!this.alive.has(pid)) return false;
    this.alive.delete(pid);
    return true;
  }

  async runHealthcheck(opts: SpawnOptions): Promise<boolean> {
    if (this.healthResults.has(opts.command)) {
      return this.healthResults.get(opts.command)!;
    }
    return true;
  }

  /** Test helper: simulate a process dying out from under us. */
  killSilently(pid: number): void {
    this.alive.delete(pid);
  }
}

/** In-memory StateIO so the store never hits disk during tests. */
export class MemoryIO implements StateIO {
  public files = new Map<string, string>();
  read(path: string): string | null {
    return this.files.has(path) ? this.files.get(path)! : null;
  }
  write(path: string, data: string): void {
    this.files.set(path, data);
  }
}

/** Capturing CliIO that buffers stdout/stderr lines for assertions. */
export class CaptureIO implements CliIO {
  public stdout: string[] = [];
  public stderr: string[] = [];
  out(line: string): void {
    this.stdout.push(line);
  }
  err(line: string): void {
    this.stderr.push(line);
  }
  get outText(): string {
    return this.stdout.join("\n");
  }
  get errText(): string {
    return this.stderr.join("\n");
  }
}
