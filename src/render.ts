/**
 * Plain-text table rendering for status / list output. Zero dependencies.
 */
import type { ServerSpec, StatusRow } from "./types.js";

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

/** Render an array of rows (objects) as an aligned ASCII table. */
export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  const line = (cells: string[]): string =>
    cells.map((c, i) => pad(c, widths[i])).join("  ").trimEnd();
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  return [line(headers), sep, ...rows.map(line)].join("\n");
}

/** Render the status rows as a table. */
export function renderStatus(rows: StatusRow[]): string {
  const headers = ["NAME", "RUNNING", "PID", "STARTED", "LAST-EXIT", "HEALTH"];
  const body = rows.map((r) => [
    r.name,
    r.running ? "yes" : "no",
    r.pid === null ? "-" : String(r.pid),
    r.startedAt ?? "-",
    r.lastExit === null ? "-" : String(r.lastExit),
    r.health,
  ]);
  return renderTable(headers, body);
}

/** Render the declared servers as a table. */
export function renderList(servers: ServerSpec[]): string {
  const headers = ["NAME", "COMMAND", "ARGS", "CWD", "HEALTHCHECK"];
  const body = servers.map((s) => [
    s.name,
    s.command,
    (s.args ?? []).join(" ") || "-",
    s.cwd ?? "-",
    s.healthcheck ? `${s.healthcheck.command} ${(s.healthcheck.args ?? []).join(" ")}`.trim() : "-",
  ]);
  return renderTable(headers, body);
}
