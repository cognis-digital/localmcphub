/**
 * Hub: high-level orchestration tying config + process manager + state store.
 */
import type { HubConfig, ServerSpec, StatusRow } from "./types.js";
import { ProcessManager } from "./process-manager.js";
import { StateStore } from "./state-store.js";
import { findServer } from "./config.js";

export interface HubDeps {
  config: HubConfig;
  manager: ProcessManager;
  store: StateStore;
}

export interface StartOutcome {
  name: string;
  started: boolean;
  alreadyRunning: boolean;
  pid: number | null;
}

export interface StopOutcome {
  name: string;
  stopped: boolean;
  wasRunning: boolean;
}

export class Hub {
  private readonly config: HubConfig;
  private readonly manager: ProcessManager;
  private readonly store: StateStore;

  constructor(deps: HubDeps) {
    this.config = deps.config;
    this.manager = deps.manager;
    this.store = deps.store;
  }

  /** List declared servers. */
  list(): ServerSpec[] {
    return this.config.servers;
  }

  /** Start a server by name. Persists the resulting pid. */
  start(name: string): StartOutcome {
    const spec = findServer(this.config, name);
    if (!spec) throw new Error(`no server named "${name}" in config`);

    const existingPid = this.store.getPid(name);
    const result = this.manager.start(spec, existingPid);

    if (result.alreadyRunning) {
      return { name, started: false, alreadyRunning: true, pid: result.pid };
    }

    if (result.started && result.pid !== null) {
      this.store.setRunning({
        name,
        pid: result.pid,
        startedAt: new Date().toISOString(),
        command: spec.command,
        args: spec.args ?? [],
      });
    }

    return {
      name,
      started: result.started,
      alreadyRunning: false,
      pid: result.pid,
    };
  }

  /** Stop a server by name. Records exit and clears running state. */
  stop(name: string): StopOutcome {
    const spec = findServer(this.config, name);
    if (!spec) throw new Error(`no server named "${name}" in config`);

    const pid = this.store.getPid(name);
    const result = this.manager.stop(pid);

    // Whether or not a signal was sent, the server is no longer tracked as
    // running. Record a synthetic exit (0) when we successfully stopped it.
    this.store.clearRunning(name, result.stopped ? 0 : null);

    return { name, stopped: result.stopped, wasRunning: result.wasRunning };
  }

  /** Compute the full status table, running healthchecks where configured. */
  async status(): Promise<StatusRow[]> {
    const rows: StatusRow[] = [];
    for (const spec of this.config.servers) {
      const running = this.store.getRunning(spec.name);
      const pid = running?.pid ?? null;
      const alive = this.manager.isRunning(pid);

      // Reconcile: persisted record exists but process is dead -> clear it.
      if (running && !alive) {
        this.store.clearRunning(spec.name, null);
      }

      const health = alive ? await this.manager.healthcheck(spec) : "skipped";

      rows.push({
        name: spec.name,
        running: alive,
        pid: alive ? pid : null,
        startedAt: alive ? running?.startedAt ?? null : null,
        lastExit: this.store.getLastExit(spec.name),
        health,
      });
    }
    return rows;
  }
}
