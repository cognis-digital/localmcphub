/**
 * Config loading and validation.
 */
import { readFileSync } from "node:fs";
import type { HubConfig, ServerSpec, ValidationResult } from "./types.js";

/** Read and parse a config file from disk. Throws on missing file or bad JSON. */
export function loadConfig(path: string): HubConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`cannot read config "${path}": ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`config "${path}" is not valid JSON: ${(err as Error).message}`);
  }
  return parsed as HubConfig;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Validate a parsed config object. Pure: never throws, returns a structured
 * result so callers (CLI / tests) can decide how to surface errors.
 */
export function validateConfig(config: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(config)) {
    return { ok: false, errors: ["config must be a JSON object"] };
  }

  if (!Array.isArray(config.servers)) {
    return { ok: false, errors: ['config must have a "servers" array'] };
  }

  if (config.servers.length === 0) {
    errors.push('"servers" array is empty');
  }

  const seen = new Map<string, number>();

  config.servers.forEach((server, index) => {
    const where = `servers[${index}]`;
    if (!isObject(server)) {
      errors.push(`${where} must be an object`);
      return;
    }

    const name = server.name;
    if (typeof name !== "string" || name.trim() === "") {
      errors.push(`${where}.name is required and must be a non-empty string`);
    } else {
      const prev = seen.get(name);
      if (prev !== undefined) {
        errors.push(`duplicate server name "${name}" (servers[${prev}] and ${where})`);
      } else {
        seen.set(name, index);
      }
    }

    if (typeof server.command !== "string" || server.command.trim() === "") {
      errors.push(`${where}.command is required and must be a non-empty string`);
    }

    if (server.args !== undefined && !isStringArray(server.args)) {
      errors.push(`${where}.args must be an array of strings`);
    }

    if (server.cwd !== undefined && typeof server.cwd !== "string") {
      errors.push(`${where}.cwd must be a string`);
    }

    if (server.env !== undefined) {
      if (!isObject(server.env)) {
        errors.push(`${where}.env must be an object of string values`);
      } else if (!Object.values(server.env).every((v) => typeof v === "string")) {
        errors.push(`${where}.env values must all be strings`);
      }
    }

    if (server.healthcheck !== undefined) {
      const hc = server.healthcheck;
      if (!isObject(hc)) {
        errors.push(`${where}.healthcheck must be an object`);
      } else {
        if (typeof hc.command !== "string" || hc.command.trim() === "") {
          errors.push(`${where}.healthcheck.command is required and must be a non-empty string`);
        }
        if (hc.args !== undefined && !isStringArray(hc.args)) {
          errors.push(`${where}.healthcheck.args must be an array of strings`);
        }
        if (hc.timeoutMs !== undefined && (typeof hc.timeoutMs !== "number" || hc.timeoutMs <= 0)) {
          errors.push(`${where}.healthcheck.timeoutMs must be a positive number`);
        }
      }
    }
  });

  return { ok: errors.length === 0, errors };
}

/** Find a server spec by name, or undefined. */
export function findServer(config: HubConfig, name: string): ServerSpec | undefined {
  return config.servers.find((s) => s.name === name);
}
