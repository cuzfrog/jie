#!/usr/bin/env bun
/** `jie` — the platform CLI.
 *
 *  This file is the entry point. It only:
 *    1. Parses argv via `cli-flags.ts`.
 *    2. Resolves HOME, `~/.jie/`, and the runtime stores.
 *    3. Constructs the platform's `JiePlatformDeps` (bus,
 *       storage, registries, memory) for branches that need
 *       them.
 *    4. Dispatches to a subcommand module under `./commands/`
 *       (or to `createApp` + `runPrint` for the `-p` branch).
 *
 *  Domain logic lives in:
 *    - `@cuzfrog/jie-platform/config` — stores (`AuthStore`,
 *      `SettingsStore`) and the `paths` / `load-*` utilities they
 *      wrap.
 *    - `commands/auth.ts` — `login`, `logout`, top-level `--api-key`.
 *    - `commands/settings.ts` — `model`, `team`.
 *    - `commands/print.ts` — `jie -p` (the full agentic pipeline).
 *    - `@cuzfrog/jie-platform` — `createJiePlatform` (the print
 *      branch goes through `createApp` which owns the call).
 *    - `@cuzfrog/jie-platform/team` — `TeamRegistry` (the `team`
 *      subcommand uses it for `isInstalled` / `listInstalled` /
 *      `locate`).
 */
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  ModelRegistry,
  makeAuthStore,
  makeSettingsStore,
} from "@cuzfrog/jie-platform/config";
import { createEventBus } from "@cuzfrog/jie-platform/core";
import { createStorage, createMemoryManager } from "@cuzfrog/jie-platform/storage";
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
  switch (args.kind) {
    case "help":
      printHelp();
      return 0;
    case "version":
      console.log(`jie ${VERSION}`);
      return 0;
    case "tui":
      // TUI branch stub. When the TUI package lands, the
      // structure mirrors the `-p` branch below:
      //   const result = await createApp(args, deps);
      //   if (result.kind === "error") return result.code;
      //   return runTuiFlow(result.context.handle, result.context.teamId, ...);
      // For now we just signal that the branch is not yet
      // implemented; we do not call `createApp` because the
      // TUI flow is a no-op and `createJiePlatform` would fail
      // without a configured model.
      console.error("TUI not implemented in v1 MVP; use jie -p");
      return 1;
    case "error":
      console.error(args.message);
      return 1;
    case "login": {
      const authStore = makeAuthStore(homeDir);
      return runLogin(args, authStore);
    }
    case "logout": {
      const authStore = makeAuthStore(homeDir);
      return runLogout(args, authStore);
    }
    case "apiKey": {
      const authStore = makeAuthStore(homeDir);
      const settingsStore = makeSettingsStore(cwd, homeJieDir);
      return runApiKey(args, settingsStore, authStore);
    }
    case "model": {
      const settingsStore = makeSettingsStore(cwd, homeJieDir);
      return runModel(args, cwd, settingsStore);
    }
    case "team": {
      const teamRegistry = createTeamRegistry({ workspace: cwd, homeJieDir });
      const settingsStore = makeSettingsStore(cwd, homeJieDir);
      return runTeam(args, settingsStore, teamRegistry);
    }
    case "print": {
      const deps = buildPlatformDeps(cwd, homeJieDir);
      const result = await createApp(
        {
          kind: "print",
          cwd,
          homeJieDir,
          teamId: args.team,
          apiKey: args.apiKey,
          resume: args.resume,
          continueLast: args.continueLast,
        },
        deps,
      );
      if (result.kind === "error") return result.code;
      return runPrint(result.context.handle, result.context.teamId, result.context.leaderRole, result.context.leaderKey, args);
    }
  }
}

function buildPlatformDeps(cwd: string, homeJieDir: string) {
  mkdirSync(homeJieDir, { recursive: true, mode: 0o755 });
  const storage = createStorage({
    type: "sqlite",
    filePath: join(homeJieDir, "storage.db"),
  });
  const teamRegistry = createTeamRegistry({ workspace: cwd, homeJieDir });
  const modelRegistry = ModelRegistry.load(cwd, { homeDir: dirname(homeJieDir) });
  const toolRegistry = createToolRegistry();
  const memoryManager = createMemoryManager(storage);
  const bus = createEventBus();
  return {
    authStore: makeAuthStore(dirname(homeJieDir)),
    settingsStore: makeSettingsStore(cwd, homeJieDir),
    bus,
    storage,
    teamRegistry,
    modelRegistry,
    toolRegistry,
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

/** HOME resolution. Reads `process.env.HOME` first so tests can
 *  redirect HOME without `os.homedir()` caching the value at
 *  startup; falls back to `os.homedir()` when unset or empty. */
function resolveHomeDir(): string {
  const fromEnv = process.env.HOME;
  return fromEnv !== undefined && fromEnv !== "" ? fromEnv : homedir();
}

if (import.meta.main) {
  process.exit(await main(Bun.argv.slice(2)));
}

export type { ParsedArgs } from "./cli-flags.ts";
