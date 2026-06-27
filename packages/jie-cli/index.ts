#!/usr/bin/env bun
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  createModelRegistry,
  makeAuthStore,
  makeSettingsStore,
} from "@cuzfrog/jie-platform/config";
import { createEventManager } from "@cuzfrog/jie-platform/event";
import {
  createArtifactStore,
  createMemoryManager,
  createStorage,
} from "@cuzfrog/jie-platform/storage";
import { createTeamRegistry } from "@cuzfrog/jie-platform/team";
import { createToolRegistry } from "@cuzfrog/jie-platform/tools";
import { createApp } from "./app.ts";
import { parseFlags, type ParsedArgs } from "./cli-flags.ts";
import {
  runApiKey,
  runLogin,
  runLogout,
  runModel,
  runPrint,
  runTeam,
} from "./commands/index.ts";
import { VERSION } from "./version.ts";

export async function main(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const parsed = parseFlags(argv);
  const homeDir = resolveHomeDir();
  try {
    return await run(parsed, cwd, homeDir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

async function run(args: ParsedArgs, cwd: string, homeDir: string): Promise<number> {
  const homeJieDir = join(homeDir, ".jie");
  const projectJieDir = findProjectJieDir(cwd);
  switch (args.kind) {
    case "help":
      printHelp();
      return 0;
    case "version":
      console.log(`jie ${VERSION}`);
      return 0;
    case "tui":
      console.error("TUI not implemented in v1 MVP; use jie -p");
      return 1;
    case "error":
      console.error(args.message);
      return 1;
    case "login": {
      const authStore = makeAuthStore(homeJieDir);
      return runLogin(args, authStore);
    }
    case "logout": {
      const authStore = makeAuthStore(homeJieDir);
      return runLogout(args, authStore);
    }
    case "apiKey": {
      const authStore = makeAuthStore(homeJieDir);
      const settingsStore = makeSettingsStore(cwd, homeJieDir, projectJieDir);
      return runApiKey(args, settingsStore, authStore);
    }
    case "model": {
      const settingsStore = makeSettingsStore(cwd, homeJieDir, projectJieDir);
      return runModel(args, projectJieDir, settingsStore);
    }
    case "team": {
      const teamRegistry = createTeamRegistry({ homeJieDir, projectJieDir });
      const settingsStore = makeSettingsStore(cwd, homeJieDir, projectJieDir);
      return runTeam(args, settingsStore, teamRegistry);
    }
    case "print": {
      const dependencies = buildPlatformDeps(cwd, homeJieDir, projectJieDir);
      const result = await createApp(
        {
          kind: "print",
          cwd,
          homeJieDir,
          projectJieDir,
          teamId: args.team,
          apiKey: args.apiKey,
          resume: args.resume,
          continueLast: args.continueLast,
        },
        dependencies,
      );
      if (result.kind === "error") return result.code;
      return runPrint(result.app.handle, result.app.teamId, result.app.leaderRole, result.app.leaderKey, result.app.agentKeys, args);
    }
  }
}

function buildPlatformDeps(cwd: string, homeJieDir: string, projectJieDir: string | null) {
  mkdirSync(homeJieDir, { recursive: true, mode: 0o755 });
  const storage = createStorage({
    type: "sqlite",
    filePath: join(homeJieDir, "storage.db"),
  });
  const teamRegistry = createTeamRegistry({ homeJieDir, projectJieDir });
  const authStore = makeAuthStore(homeJieDir);
  const modelRegistry = createModelRegistry(homeJieDir, projectJieDir, authStore);
  const memoryManager = createMemoryManager(storage);
  const artifactStore = createArtifactStore(storage);
  const events = createEventManager();
  const toolRegistry = createToolRegistry({
    workspaceRoot: cwd,
    eventManager: events,
    artifactStore,
  });
  return {
    authStore,
    settingsStore: makeSettingsStore(cwd, homeJieDir, projectJieDir),
    eventManager: events,
    storage,
    teamRegistry,
    modelRegistry,
    toolRegistry,
    artifactStore,
    memoryManager,
  };
}

function printHelp(): void {
  console.log(`jie - The jie platform CLI

Usage:
  jie -p "<instruction>" [--team <id>] [--timeout <s>] [--json]
                 [--api-key <key>] [--resume <id> | --continue]
  jie --print "<instruction>" ...

  jie login --provider <id> --api-key <key>
  jie logout [<provider>]
  jie model <provider>/<modelId>
  jie team [<id>] | [--unset]

  jie --api-key <key>
  jie --resume <session_id> | --continue

  jie [--team <id>]                  # interactive TUI (not in v1 MVP)
  jie --version
  jie --help
`);
}

function resolveHomeDir(): string {
  const fromEnv = process.env.HOME;
  return fromEnv !== undefined && fromEnv !== "" ? fromEnv : homedir();
}

function findProjectJieDir(cwd: string): string | null {
  let current = cwd;
  for (;;) {
    const candidate = join(current, ".jie");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

if (import.meta.main) {
  process.exit(await main(Bun.argv.slice(2)));
}
