/**
 * Process management abstraction.
 *
 * The ProcessManager never touches `child_process` directly. Instead it depends
 * on a small `Spawner` interface so that tests can inject a fake that records
 * calls and never launches a real long-running process.
 */
import type { ServerSpec } from "./types.js";

/** Options passed to a spawner when launching a process. */
export interface SpawnOptions {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
}

/** Minimal pluggable spawner interface. */
export interface Spawner {
  /** Spawn a detached process and return its pid (or null if it failed). */
  spawn(opts: SpawnOptions): number | null;
  /** Return true if a process with this pid is currently alive. */
  isAlive(pid: number): boolean;
  /** Attempt to terminate the process. Returns true if the signal was sent. */
  kill(pid: number): boolean;
  /** Run a healthcheck command synchronously; resolve true on exit code 0. */
  runHealthcheck(opts: SpawnOptions, timeoutMs: number): Promise<boolean>;
}

/** Result of a start attempt. */
export interface StartResult {
  started: boolean;
  pid: number | null;
  alreadyRunning: boolean;
}

/** Result of a stop attempt. */
export interface StopResult {
  stopped: boolean;
  wasRunning: boolean;
}

/**
 * Coordinates spawning/killing/health-probing of MCP server processes.
 * Stateless beyond the injected spawner — persistence lives in the StateStore.
 */
export class ProcessManager {
  constructor(private readonly spawner: Spawner) {}

  private spawnOptionsFor(spec: ServerSpec): SpawnOptions {
    return {
      command: spec.command,
      args: spec.args ?? [],
      env: { ...process.env, ...(spec.env ?? {}) } as Record<string, string>,
      cwd: spec.cwd,
    };
  }

  /** Spawn a server process. Caller is responsible for persisting state. */
  start(spec: ServerSpec, existingPid: number | null): StartResult {
    if (existingPid !== null && this.spawner.isAlive(existingPid)) {
      return { started: false, pid: existingPid, alreadyRunning: true };
    }
    const pid = this.spawner.spawn(this.spawnOptionsFor(spec));
    return { started: pid !== null, pid, alreadyRunning: false };
  }

  /** Terminate a server process by pid. */
  stop(pid: number | null): StopResult {
    if (pid === null || !this.spawner.isAlive(pid)) {
      return { stopped: false, wasRunning: false };
    }
    const ok = this.spawner.kill(pid);
    return { stopped: ok, wasRunning: true };
  }

  /** Whether a pid currently refers to a live process. */
  isRunning(pid: number | null): boolean {
    return pid !== null && this.spawner.isAlive(pid);
  }

  /**
   * Run the configured healthcheck for a spec. Returns:
   *  - "skipped" when no healthcheck is declared
   *  - "pass"/"fail" otherwise
   */
  async healthcheck(spec: ServerSpec): Promise<"pass" | "fail" | "skipped"> {
    const hc = spec.healthcheck;
    if (!hc) return "skipped";
    const opts: SpawnOptions = {
      command: hc.command,
      args: hc.args ?? [],
      env: { ...process.env, ...(spec.env ?? {}) } as Record<string, string>,
      cwd: spec.cwd,
    };
    const ok = await this.spawner.runHealthcheck(opts, hc.timeoutMs ?? 5000);
    return ok ? "pass" : "fail";
  }
}
