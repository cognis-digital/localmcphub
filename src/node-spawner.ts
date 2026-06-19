/**
 * Real Spawner implementation backed by node:child_process.
 *
 * This is the production spawner used by the CLI. It is intentionally thin so
 * that all orchestration logic stays testable in ProcessManager via a fake.
 */
import { spawn, spawnSync } from "node:child_process";
import type { Spawner, SpawnOptions } from "./process-manager.js";

export class NodeSpawner implements Spawner {
  spawn(opts: SpawnOptions): number | null {
    try {
      const child = spawn(opts.command, opts.args, {
        env: opts.env,
        cwd: opts.cwd,
        detached: true,
        stdio: "ignore",
      });
      const pid = child.pid ?? null;
      // Allow the parent (CLI) to exit without waiting on the child.
      child.unref();
      return pid;
    } catch {
      return null;
    }
  }

  isAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      // Signal 0 performs error checking without actually sending a signal.
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM means the process exists but we lack permission — still alive.
      return (err as NodeJS.ErrnoException).code === "EPERM";
    }
  }

  kill(pid: number): boolean {
    if (!this.isAlive(pid)) return false;
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }

  async runHealthcheck(opts: SpawnOptions, timeoutMs: number): Promise<boolean> {
    try {
      const result = spawnSync(opts.command, opts.args, {
        env: opts.env,
        cwd: opts.cwd,
        timeout: timeoutMs,
        stdio: "ignore",
      });
      if (result.error) return false;
      return result.status === 0;
    } catch {
      return false;
    }
  }
}
