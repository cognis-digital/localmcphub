# localmcphub

A registry, launcher, and health dashboard for a fleet of local **MCP (Model
Context Protocol)** servers.

You declare your MCP servers once in a small JSON config — name, command, args,
env, cwd, and an optional healthcheck. `localmcphub` then lets you **list** them,
**start/stop** them as managed child processes, and print a **status / health
table** showing what is running, its pid, its last exit code, and whether its
healthcheck passes.

This is a clean-room, dependency-free utility focused on local development and
defensive operations. It does not modify your servers — it only spawns, signals,
and probes the processes you declare.

- License: COCL 1.0
- Maintainer: Cognis Digital


<!-- cognis:example:start -->
## 🔎 Example output

**Sample result format** _(illustrative values — run on your own data for real findings):_

```
{
"results": [
  {
    "id": "1234567890",
    "name": "John Doe",
    "email": "johndoe@example.com",
    "phone": "+1-555-1234"
  },
  {
    "id": "2345678901",
    "name": "Jane Smith",
    "email": "janesmith@example.com",
    "phone": "+1-555-5678"
  }
]
}
```

<!-- cognis:example:end -->

## Install

```bash
npm install
npm run build
```

The build emits `dist/`, and the `localmcphub` binary points at
`dist/src/cli.js`. After an `npm install` of the published package the `bin` is
available on your PATH.

## Config format

A config is a JSON object with a `servers` array. Each server entry:

| Field         | Required | Type                    | Notes                                          |
| ------------- | -------- | ----------------------- | ---------------------------------------------- |
| `name`        | yes      | string (unique)         | Handle used for `start` / `stop`.              |
| `command`     | yes      | string                  | Executable to spawn (`node`, `python`, `npx`). |
| `args`        | no       | string[]                | Arguments passed to the command.               |
| `env`         | no       | record<string,string>   | Merged over the parent environment.            |
| `cwd`         | no       | string                  | Working directory for the process.             |
| `description` | no       | string                  | Free-form note shown nowhere critical.         |
| `healthcheck` | no       | object                  | `{ command, args?, timeoutMs? }`.              |

A healthcheck is any command that exits `0` when the server is healthy. See
[`examples/config.json`](examples/config.json) for a complete example.

## Usage

```bash
# Validate a config (exits non-zero with a list of problems if invalid)
localmcphub validate examples/config.json

# List declared servers as a table
localmcphub list examples/config.json

# Show the live status / health table
localmcphub status examples/config.json
localmcphub status examples/config.json --json     # machine-readable

# Start / stop a server by name (requires --config)
localmcphub start filesystem --config examples/config.json
localmcphub stop  filesystem --config examples/config.json
```

### State file

Running pids and last-exit codes are tracked in a small JSON state file. By
default this lives next to the config as `.localmcphub-state.json`; override it
with `--state <path>`. `status` self-reconciles: if a tracked pid is no longer
alive, the entry is cleared automatically.

### Exit codes

- `validate` exits `1` when the config is invalid, missing, or malformed.
- `start` exits `1` when the spawn fails.
- Unknown commands and missing required arguments exit `1`.
- Everything else exits `0`.

## Architecture

The orchestration logic is decoupled from the operating system so it is fully
unit-testable without ever launching a real long-running process:

- **`ProcessManager`** depends on a pluggable **`Spawner`** interface
  (`spawn` / `isAlive` / `kill` / `runHealthcheck`).
- **`NodeSpawner`** is the production implementation backed by
  `node:child_process`.
- Tests inject a **`FakeSpawner`** that records calls and tracks a virtual set of
  alive pids — no OS processes are created.
- **`StateStore`** persists runtime state behind an injectable IO interface, so
  tests run fully in-memory.
- **`Hub`** ties config + manager + store together and produces the status rows.

## Development

```bash
npm run build     # tsc -> dist/
npm test          # node --test over dist/test/*.test.js
```

Tests use Node's built-in `node:test` runner over the compiled output and the
injected fake spawner; they create no child processes and touch no real MCP
servers.

## Scope

Defensive / utility tooling only: process lifecycle management and health
reporting for servers you already run locally. It performs no network calls of
its own.
