import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import * as readline from "node:readline/promises";
import { join } from "node:path";
import { createTeamInstaller } from "../team-installer";
import type { Console } from "../utils";

export interface FirstRunPorts {
  readonly console: Console;
  readonly isInteractive: () => boolean;
  readonly confirm: (question: string) => Promise<boolean>;
  readonly isSentinelPresent: () => boolean;
  readonly markSentinel: () => void;
  readonly installBundledTeam: () => Promise<readonly string[]>;
}

const SENTINEL_FILENAME = ".first-run-done";
const DEFAULT_CODERS_ID = "default-coders";
const BUNDLED_TEAM_CONTENT_DIR = join(import.meta.dir, "../team-content");

export async function runFirstRunWelcome(ports: FirstRunPorts, noInstall: boolean): Promise<void> {
  if (noInstall) return;
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
