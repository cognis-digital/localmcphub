/**
 * Core type definitions for localmcphub.
 */

/** A single healthcheck definition for an MCP server. */
export interface HealthCheck {
  /** Command to run (resolved relative to the server cwd / PATH). */
  command: string;
  /** Arguments passed to the healthcheck command. */
  args?: string[];
  /** Milliseconds to wait before considering the healthcheck failed. Default 5000. */
  timeoutMs?: number;
}

/** Declaration of a single local MCP server. */
export interface ServerSpec {
  /** Unique, human-readable name. Used as the handle for start/stop. */
  name: string;
  /** Optional human description. */
  description?: string;
  /** Executable to spawn (e.g. "node", "python", "npx"). */
  command: string;
  /** Arguments passed to the command. */
  args?: string[];
  /** Extra environment variables merged over the parent environment. */
  env?: Record<string, string>;
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Optional healthcheck to probe whether the server is actually responsive. */
  healthcheck?: HealthCheck;
}

/** Top-level config file shape. */
export interface HubConfig {
  /** Optional config schema version. */
  version?: number;
  servers: ServerSpec[];
}

/** Persisted runtime record for a single managed server. */
export interface ServerState {
  name: string;
  pid: number;
  /** ISO timestamp the process was started. */
  startedAt: string;
  command: string;
  args: string[];
}

/** Result of validating a config. */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Health probe outcome. */
export type HealthStatus = "pass" | "fail" | "skipped";

/** A row in the status table. */
export interface StatusRow {
  name: string;
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  /** Last recorded exit code, if the process previously exited. */
  lastExit: number | null;
  health: HealthStatus;
}
