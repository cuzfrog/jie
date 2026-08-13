import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import * as readline from "node:readline/promises";
import { join } from "node:path";
import { createManifestInstaller, type InstallResult } from "../manifest/installer";
import type { Console } from "../utils";

export interface FirstRunPorts {
  readonly console: Console;
  readonly isInteractive: () => boolean;
  readonly confirm: (question: string) => Promise<boolean>;
  readonly isSentinelPresent: () => boolean;
  readonly markSentinel: () => void;
  readonly installBundledManifests: () => Promise<InstallResult>;
  readonly ensureBundledMcp: () => void;
}

const SENTINEL_FILENAME = ".first-run-done";
const BUNDLED_TEAM_IDS = ["jie-dev-team", "jie-assisted-developer"] as const;
const BUNDLED_MANIFEST_DIR = join(import.meta.dir, "../manifest");
const MCP_CONFIG_FILE = "mcp.json";
const CODE_LENS_SERVER_NAME = "code-lens";
const CODE_LENS_SERVER = { transport: "stdio", command: "code-lens", args: [] } as const;

export async function runFirstRunWelcome(ports: FirstRunPorts, noInstall: boolean): Promise<void> {
  if (noInstall) return;
  ports.ensureBundledMcp();
  if (ports.isSentinelPresent()) return;
  if (!ports.isInteractive()) return;
  const yes = await ports.confirm(
    `Install the bundled team blueprints (${BUNDLED_TEAM_IDS.join(", ")}) and shared agents to ~/.jie/? [Y/n]`,
  );
  if (yes) {
    try {
      const result = await ports.installBundledManifests();
      const teamPart = result.teams.length > 0 ? `team blueprint(s): ${result.teams.join(", ")}` : "";
      const agentPart = result.agents.length > 0 ? `shared agent(s): ${result.agents.join(", ")}` : "";
      const summary = [teamPart, agentPart].filter(Boolean).join("; ");
      ports.console.print(`Installed ${summary}.`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      ports.console.error(
        `Failed to install bundled team blueprints: ${reason}. Install later with: jie team add <source>.`,
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
    installBundledManifests: () => createManifestInstaller().install(BUNDLED_MANIFEST_DIR, homeJieDir),
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
