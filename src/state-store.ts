/**
 * Tiny JSON-backed state store tracking running server pids and last exit codes.
 *
 * Filesystem access is isolated behind an injectable IO interface so the store
 * can be exercised in-memory by tests without touching disk.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { ServerState } from "./types.js";

/** Minimal filesystem interface for the state store. */
export interface StateIO {
  read(path: string): string | null;
  write(path: string, data: string): void;
}

/** Default IO backed by node:fs. */
export const fsStateIO: StateIO = {
  read(path: string): string | null {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  write(path: string, data: string): void {
    const dir = dirname(path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, data, "utf8");
  },
};

interface StateFile {
  running: Record<string, ServerState>;
  lastExit: Record<string, number>;
}

const EMPTY: StateFile = { running: {}, lastExit: {} };

export class StateStore {
  private data: StateFile;

  constructor(private readonly path: string, private readonly io: StateIO = fsStateIO) {
    this.data = this.read();
  }

  private read(): StateFile {
    const raw = this.io.read(this.path);
    if (raw === null) return { running: {}, lastExit: {} };
    try {
      const parsed = JSON.parse(raw) as Partial<StateFile>;
      return {
        running: parsed.running ?? {},
        lastExit: parsed.lastExit ?? {},
      };
    } catch {
      return { running: {}, lastExit: {} };
    }
  }

  private flush(): void {
    this.io.write(this.path, JSON.stringify(this.data, null, 2));
  }

  /** Record a started server. */
  setRunning(state: ServerState): void {
    this.data.running[state.name] = state;
    delete this.data.lastExit[state.name];
    this.flush();
  }

  /** Get the persisted running record for a server, if any. */
  getRunning(name: string): ServerState | null {
    return this.data.running[name] ?? null;
  }

  /** Get persisted pid for a server, or null. */
  getPid(name: string): number | null {
    return this.data.running[name]?.pid ?? null;
  }

  /** Mark a server as stopped, recording its exit code. */
  clearRunning(name: string, exitCode: number | null): void {
    if (this.data.running[name]) delete this.data.running[name];
    if (exitCode !== null) this.data.lastExit[name] = exitCode;
    this.flush();
  }

  /** Last known exit code for a server, or null. */
  getLastExit(name: string): number | null {
    return this.data.lastExit[name] ?? null;
  }

  /** Reset everything (used in tests / `reset`). */
  static empty(): StateFile {
    return { ...EMPTY, running: {}, lastExit: {} };
  }
}
