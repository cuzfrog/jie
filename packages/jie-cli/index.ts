#!/usr/bin/env bun
/** `jie` — the platform CLI.
 *
 *  This file is the entry point. It only:
 *    1. Parses argv via `cli-flags.ts`.
 *    2. Resolves HOME and constructs the runtime stores.
 *    3. Constructs a `TeamRegistry` for the current cwd.
 *    4. Dispatches to a subcommand module under `./commands/`.
 *
 *  Domain logic lives in:
 *    - `auth-store.ts`, `settings-store.ts` — stores.
 *    - `home-paths.ts` — HOME resolution.
 *    - `commands/auth.ts` — `login`, `logout`, top-level `--api-key`.
 *    - `commands/settings.ts` — `model`, `team`.
 *    - `commands/print.ts` — `jie -p` (the full agentic pipeline).
 *    - `@cuzfrog/jie-platform/team` — `TeamRegistry` (the CLI is a
 *      thin consumer; team loading and discovery live in the
 *      platform's team module).
 */
import type { MergedSettings } from "@cuzfrog/jie-platform";
import { createTeamRegistry, type TeamRegistry, type Team } from "@cuzfrog/jie-platform/team";
import { makeAuthStore, type AuthStore } from "./auth-store.ts";
import { makeSettingsStore, type SettingsStore } from "./settings-store.ts";
import { resolveHomeDir } from "./home-paths.ts";
import { parseFlags, type ParsedCli } from "./cli-flags.ts";
import { runLogin, runLogout, runApiKey } from "./commands/auth.ts";
import { runModel, runTeam } from "./commands/settings.ts";
import { runPrint, type PrintDeps } from "./commands/print.ts";
import { VERSION } from "./version.ts";

interface Deps {
  authStore: AuthStore;
  settingsStore: SettingsStore;
  homeDir: string;
}

function makeDeps(homeDir: string): Deps {
  return {
    authStore: makeAuthStore(homeDir),
    settingsStore: makeSettingsStore(homeDir),
    homeDir,
  };
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseFlags(argv);
  const deps = makeDeps(resolveHomeDir());
  try {
    return await run(parsed, process.cwd(), deps);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

async function run(parsed: ParsedCli, cwd: string, deps: Deps): Promise<number> {
  switch (parsed.kind) {
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
      console.error(parsed.message);
      return 1;
    case "login":
      return runLogin(parsed, deps.authStore);
    case "logout":
      return runLogout(parsed, deps.authStore);
    case "apiKey":
      return runApiKey(parsed, cwd, deps.settingsStore, deps.authStore);
    case "model":
      return runModel(parsed, cwd, deps.settingsStore);
    case "team": {
      const teamRegistry = createTeamRegistry({ workspace: cwd, homeJieDir: deps.homeDir });
      return runTeam(parsed, cwd, deps.settingsStore, teamRegistry);
    }
    case "print":
      return runPrint(parsed, cwd, {
        authStore: deps.authStore,
        settingsStore: deps.settingsStore,
        homeDir: deps.homeDir,
      });
  }
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

/** Backward-compatible test entry point: constructs stores from
 *  `process.env.HOME` and forwards optional test hooks to
 *  `runPrint`. The e2e test calls this with `{ settingsOverride,
 *  resolveModel, getApiKey, createAgent, ... }` to inject mocks. */
export async function runPrintCli(
  parsed: Extract<ParsedCli, { kind: "print" }>,
  cwd: string,
  hooks: Partial<PrintDeps> = {},
): Promise<number> {
  const homeDir = resolveHomeDir();
  const deps: PrintDeps = {
    authStore: makeAuthStore(homeDir),
    settingsStore: makeSettingsStore(homeDir),
    homeDir,
    ...hooks,
  };
  return runPrint(parsed, cwd, deps);
}

// Exported for tests.
export { run as runCli };
export type { ParsedCli, PrintDeps };
export type PrintHooks = Partial<PrintDeps>;
// Used internally by `commands/print.ts`; re-exported here for
// backward compatibility with callers that imported the type from
// `./index.ts` in earlier versions. Prefer importing from the
// owning module directly.
export type { MergedSettings, Team, TeamRegistry };

if (import.meta.main) {
  process.exit(await main(Bun.argv.slice(2)));
}
