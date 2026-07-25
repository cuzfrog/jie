import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JiePlatformError } from "../jie-platform-errors";
import type { McpConfig, McpServerAuth, McpServerConfig } from "./types";

const MCP_CONFIG_FILE = "mcp.json";
const SERVER_NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function loadMergedMcpConfig(homeJieDir: string, projectJieDir: string | null): McpConfig {
  const servers = readServerEntries(join(homeJieDir, MCP_CONFIG_FILE));
  if (projectJieDir !== null) {
    for (const [name, server] of readServerEntries(join(projectJieDir, MCP_CONFIG_FILE))) servers.set(name, server);
  }
  return { servers };
}

function readServerEntries(path: string): Map<string, McpServerConfig> {
  const text = readOptionalFile(path);
  if (text === null) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw configError(path, error instanceof Error ? error.message : String(error));
  }
  if (!isJsonObject(parsed)) throw configError(path, "root must be a JSON object");
  const serversField = parsed["servers"];
  if (serversField === undefined) return new Map();
  if (!isJsonObject(serversField)) throw configError(path, "servers must be an object");
  const entries = new Map<string, McpServerConfig>();
  for (const [name, value] of Object.entries(serversField)) entries.set(name, parseServerEntry(name, value, path));
  return entries;
}

function readOptionalFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function parseServerEntry(name: string, raw: unknown, source: string): McpServerConfig {
  if (!SERVER_NAME_PATTERN.test(name)) {
    throw configError(source, `invalid server name '${name}' (allowed characters: A-Za-z0-9._-, max 64)`);
  }
  if (!isJsonObject(raw)) throw configError(source, `server '${name}' must be an object`);
  const transport = raw["transport"];
  if (transport !== "stdio" && transport !== "http") {
    throw configError(source, `server '${name}' transport must be 'stdio' or 'http'`);
  }
  const auth = parseAuth(raw["auth"], name, source);
  if (transport === "stdio") {
    const command = raw["command"];
    if (typeof command !== "string") throw configError(source, `server '${name}' command must be a string`);
    return { transport, command, args: parseArgs(raw["args"], name, source), auth };
  }
  const url = raw["url"];
  if (typeof url !== "string") throw configError(source, `server '${name}' url must be a string`);
  return { transport, url, auth };
}

function parseArgs(raw: unknown, name: string, source: string): ReadonlyArray<string> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw configError(source, `server '${name}' args must be an array of strings`);
  const args: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") throw configError(source, `server '${name}' args must be an array of strings`);
    args.push(entry);
  }
  return args;
}

function parseAuth(raw: unknown, name: string, source: string): McpServerAuth | null {
  if (raw === undefined) return null;
  if (!isJsonObject(raw)) throw configError(source, `server '${name}' auth must be an object`);
  const tokenEnv = raw["tokenEnv"];
  if (typeof tokenEnv !== "string") throw configError(source, `server '${name}' auth.tokenEnv must be a string`);
  return { tokenEnv };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configError(source: string, detail: string): JiePlatformError {
  return new JiePlatformError("INVALID_CONFIG", { detail: `${source}: ${detail}` });
}
