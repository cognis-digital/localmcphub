#!/usr/bin/env node
/**
 * localmcphub command-line interface.
 *
 * Commands:
 *   list      <config.json>
 *   status    <config.json> [--json]
 *   validate  <config.json>
 *   start     <name> --config <config.json>
 *   stop      <name> --config <config.json>
 *
 * The state file defaults to ".localmcphub-state.json" next to the config,
 * overridable with --state <path>.
 */
import { resolve, dirname, join } from "node:path";
import { loadConfig, validateConfig } from "./config.js";
import { ProcessManager } from "./process-manager.js";
import { NodeSpawner } from "./node-spawner.js";
import { StateStore } from "./state-store.js";
import { Hub } from "./hub.js";
import { renderStatus, renderList } from "./render.js";
import type { HubConfig } from "./types.js";

export interface CliIO {
  out(line: string): void;
  err(line: string): void;
}

const defaultIO: CliIO = {
  out: (line) => process.stdout.write(line + "\n"),
  err: (line) => process.stderr.write(line + "\n"),
};

const USAGE = `localmcphub — registry + launcher + health dashboard for local MCP servers

Usage:
  localmcphub list      <config.json>
  localmcphub status    <config.json> [--json]
  localmcphub validate  <config.json>
  localmcphub start     <name> --config <config.json> [--state <path>]
  localmcphub stop      <name> --config <config.json> [--state <path>]

Options:
  --json            Emit machine-readable JSON (status only)
  --config <path>   Path to config (required for start/stop)
  --state <path>    Override the runtime state file location
  -h, --help        Show this help`;

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (tok === "-h") {
      flags.help = true;
    } else {
      positionals.push(tok);
    }
  }
  return { positionals, flags };
}

function defaultStatePath(configPath: string): string {
  return join(dirname(resolve(configPath)), ".localmcphub-state.json");
}

function buildHub(configPath: string, statePath: string): Hub {
  const config = loadConfig(configPath) as HubConfig;
  const result = validateConfig(config);
  if (!result.ok) {
    throw new Error(`invalid config:\n  - ${result.errors.join("\n  - ")}`);
  }
  const manager = new ProcessManager(new NodeSpawner());
  const store = new StateStore(statePath);
  return new Hub({ config, manager, store });
}

/**
 * Execute the CLI. Returns a process exit code. Pure with respect to IO via the
 * injectable `io` parameter so behaviour can be asserted in tests.
 */
export async function run(argv: string[], io: CliIO = defaultIO): Promise<number> {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];

  if (flags.help || !command) {
    io.out(USAGE);
    return command ? 0 : 1;
  }

  try {
    switch (command) {
      case "list": {
        const configPath = positionals[1];
        if (!configPath) throw new Error("list requires <config.json>");
        const config = loadConfig(configPath);
        const v = validateConfig(config);
        if (!v.ok) throw new Error(`invalid config:\n  - ${v.errors.join("\n  - ")}`);
        io.out(renderList(config.servers));
        return 0;
      }

      case "validate": {
        const configPath = positionals[1];
        if (!configPath) throw new Error("validate requires <config.json>");
        const config = loadConfig(configPath);
        const v = validateConfig(config);
        if (v.ok) {
          io.out(`OK: ${(config.servers ?? []).length} server(s) declared, config is valid`);
          return 0;
        }
        io.err("INVALID config:");
        for (const e of v.errors) io.err(`  - ${e}`);
        return 1;
      }

      case "status": {
        const configPath = positionals[1];
        if (!configPath) throw new Error("status requires <config.json>");
        const statePath =
          typeof flags.state === "string" ? flags.state : defaultStatePath(configPath);
        const hub = buildHub(configPath, statePath);
        const rows = await hub.status();
        if (flags.json) {
          io.out(JSON.stringify(rows, null, 2));
        } else {
          io.out(renderStatus(rows));
        }
        return 0;
      }

      case "start": {
        const name = positionals[1];
        if (!name) throw new Error("start requires <name>");
        const configPath = typeof flags.config === "string" ? flags.config : undefined;
        if (!configPath) throw new Error("start requires --config <config.json>");
        const statePath =
          typeof flags.state === "string" ? flags.state : defaultStatePath(configPath);
        const hub = buildHub(configPath, statePath);
        const r = hub.start(name);
        if (r.alreadyRunning) {
          io.out(`"${name}" is already running (pid ${r.pid})`);
          return 0;
        }
        if (r.started) {
          io.out(`started "${name}" (pid ${r.pid})`);
          return 0;
        }
        io.err(`failed to start "${name}"`);
        return 1;
      }

      case "stop": {
        const name = positionals[1];
        if (!name) throw new Error("stop requires <name>");
        const configPath = typeof flags.config === "string" ? flags.config : undefined;
        if (!configPath) throw new Error("stop requires --config <config.json>");
        const statePath =
          typeof flags.state === "string" ? flags.state : defaultStatePath(configPath);
        const hub = buildHub(configPath, statePath);
        const r = hub.stop(name);
        if (r.wasRunning && r.stopped) {
          io.out(`stopped "${name}"`);
          return 0;
        }
        io.out(`"${name}" was not running`);
        return 0;
      }

      default:
        io.err(`unknown command: ${command}`);
        io.err(USAGE);
        return 1;
    }
  } catch (err) {
    io.err(`error: ${(err as Error).message}`);
    return 1;
  }
}

// Entrypoint guard: only auto-run when invoked as the CLI binary.
const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("cli.js");
  } catch {
    return false;
  }
})();

if (isMain) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
