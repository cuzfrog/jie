import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import * as readline from "node:readline/promises";
import { join } from "node:path";
import { createTeamInstaller } from "../teams-installer";
import type { Console } from "../utils";

export interface FirstRunPorts {
  readonly console: Console;
  readonly isInteractive: () => boolean;
  readonly confirm: (question: string) => Promise<boolean>;
  readonly isSentinelPresent: () => boolean;
  readonly markSentinel: () => void;
  readonly installBundledTeam: () => Promise<readonly string[]>;
  readonly ensureBundledMcp: () => void;
}

const SENTINEL_FILENAME = ".first-run-done";
const DEFAULT_CODERS_ID = "default-dev-team";
const BUNDLED_TEAM_CONTENT_DIR = join(import.meta.dir, "../teams");
const MCP_CONFIG_FILE = "mcp.json";
const CODE_LENS_SERVER_NAME = "code-lens";
const CODE_LENS_SERVER = { transport: "stdio", command: "code-lens", args: [] } as const;

export async function runFirstRunWelcome(ports: FirstRunPorts, noInstall: boolean): Promise<void> {
  if (noInstall) return;
  ports.ensureBundledMcp();
  if (ports.isSentinelPresent()) return;
  if (!ports.isInteractive()) return;
  const yes = await ports.confirm(`Install the ${DEFAULT_CODERS_ID} team blueprint to ~/.jie/teams/? [Y/n]`);
  if (yes) {
    try {
      const ids = await ports.installBundledTeam();
      ports.console.print(`Installed team blueprint(s): ${ids.join(", ")}.`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      ports.console.error(
        `Failed to install ${DEFAULT_CODERS_ID}: ${reason}. Install later with: jie team add <source>.`,
      );
    }
  } else {
    ports.console.print("Skipped. Install a team later with: jie team add <source>.");
  }
  ports.markSentinel();
}

export function createFirstRunPorts({
  homeJieDir,
  console,
  confirm = createTtyConfirm(),
  isInteractive = () => process.stdin.isTTY === true,
}: {
  readonly homeJieDir: string;
  readonly console: Console;
  readonly confirm?: (question: string) => Promise<boolean>;
  readonly isInteractive?: () => boolean;
}): FirstRunPorts {
  const userTeamsDir = join(homeJieDir, "teams");
  const sentinelPath = join(homeJieDir, SENTINEL_FILENAME);
  return {
    console,
    isInteractive,
    confirm,
    isSentinelPresent: () => existsSync(sentinelPath),
    markSentinel: () => {
      mkdirSync(homeJieDir, { recursive: true, mode: 0o755 });
      writeFileSync(sentinelPath, "");
    },
    installBundledTeam: () => createTeamInstaller().install(BUNDLED_TEAM_CONTENT_DIR, userTeamsDir),
    ensureBundledMcp: () => ensureBundledMcpConfig(homeJieDir),
  };
}

function createTtyConfirm(): (question: string) => Promise<boolean> {
  return async (question: string) => {
    if (process.stdin.isTTY !== true) return false;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(`${question} `);
      const trimmed = answer.trim().toLowerCase();
      return trimmed === "" || trimmed.startsWith("y");
    } finally {
      rl.close();
    }
  };
}

type Json = null | boolean | number | string | readonly Json[] | McpServersJson;
type McpServersJson = { readonly [key: string]: Json };

function ensureBundledMcpConfig(homeJieDir: string): void {
  mkdirSync(homeJieDir, { recursive: true, mode: 0o755 });
  const path = join(homeJieDir, MCP_CONFIG_FILE);
  const existing = readOptionalText(path);
  const next = mergeCodeLensEntry(existing);
  if (next === null || next === existing) return;
  writeFileSync(path, next, { mode: 0o644 });
}

function mergeCodeLensEntry(existing: string | null): string | null {
  if (existing === null) return serializeMcpConfig({ [CODE_LENS_SERVER_NAME]: CODE_LENS_SERVER });
  let parsed: Json;
  try {
    parsed = JSON.parse(existing);
  } catch {
    return null;
  }
  if (!isJsonObject(parsed)) return null;
  const serversField = parsed["servers"];
  if (serversField === undefined) return serializeMcpConfig({ [CODE_LENS_SERVER_NAME]: CODE_LENS_SERVER });
  if (!isJsonObject(serversField)) return null;
  return serializeMcpConfig({ ...serversField, [CODE_LENS_SERVER_NAME]: CODE_LENS_SERVER });
}

function serializeMcpConfig(servers: McpServersJson): string {
  return JSON.stringify({ servers }, null, 2) + "\n";
}

function readOptionalText(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isJsonObject(value: Json): value is McpServersJson {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { mergeCodeLensEntry as _mergeCodeLensEntry };
