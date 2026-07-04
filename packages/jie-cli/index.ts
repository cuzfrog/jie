#!/usr/bin/env bun
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createJiePlatform, type JiePlatform } from "@cuzfrog/jie-platform";
import {
  createModelRegistry,
  makeAuthStore,
  makeSettingsStore,
} from "@cuzfrog/jie-platform/config";
import { createCommandExecutor } from "@cuzfrog/jie-platform/command";
import { createEventManager } from "@cuzfrog/jie-platform/event";
import {
  createArtifactStore,
  createMemoryManager,
  createStorage,
} from "@cuzfrog/jie-platform/storage";
import { createTeamRegistry } from "@cuzfrog/jie-platform/team";
import { createToolRegistry } from "@cuzfrog/jie-platform/tools";
import { createGitService } from "@cuzfrog/jie-platform/services";
import { createApp, type AppDeps } from "./app";
import { parseFlags, type ParsedArgs } from "./cli-flags";
import {
  runApiKey,
  runLogin,
  runLogout,
  runModel,
  runPrint,
  runTeam,
} from "./commands";
import { VERSION } from "./version";

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
    case "login":
    case "logout":
    case "apiKey":
    case "model":
    case "team": {
      const deps = buildPlatformDeps(cwd, homeJieDir, projectJieDir);
      let platform: JiePlatform;
      try {
        platform = await createJiePlatform({ workspace: cwd, homeJieDir }, deps);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
      }
      switch (args.kind) {
        case "login":
          return runLogin(args, platform);
        case "logout":
          return runLogout(args, platform);
        case "apiKey":
          return runApiKey(args, platform);
        case "model":
          return runModel(args, platform);
        case "team":
          return runTeam(args, platform);
      }
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
      return runPrint(result.app.handle, result.app.teamId, result.app.leaderKey, result.app.agentKeys, args);
    }
  }
}

function buildPlatformDeps(cwd: string, homeJieDir: string, projectJieDir: string | null): AppDeps {
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
  const gitService = createGitService({ cwd });
  const settingsStore = makeSettingsStore(cwd, homeJieDir, projectJieDir);
  const defaultScope = (projectJieDir === null ? "global" : "project") as "global" | "project";
  const commandExecutor = createCommandExecutor({
    authStore,
    settingsStore,
    teamRegistry,
    gitService,
    defaultScope,
    loadActiveTeam: () => Promise.resolve([]),
  });
  return {
    authStore,
    settingsStore,
    eventManager: events,
    storage,
    teamRegistry,
    modelRegistry,
    toolRegistry,
    artifactStore,
    memoryManager,
    gitService,
    commandExecutor,
    defaultScope,
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
  const homeFromEnv = process.env.HOME;
  return homeFromEnv !== undefined && homeFromEnv !== "" ? homeFromEnv : homedir();
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
