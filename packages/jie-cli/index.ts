#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  createJiePlatform,
  defaultConsole,
  type Console,
  type JiePlatform,
  type JiePlatformOptions,
} from "@cuzfrog/jie-platform";
import { type CreateTUIOptions, type Tui, type TuiDeps, createTui } from "@cuzfrog/jie-tui";
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

export async function main(argv: string[], cwd: string = process.cwd(), console: Console = defaultConsole): Promise<number> {
  const parsed = parseFlags(argv);
  const homeDir = resolveHomeDir();
  try {
    return await run(parsed, cwd, homeDir, { createPlatform: createJiePlatform, createTui, console });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

interface RunDeps {
  readonly createPlatform: (options: JiePlatformOptions) => Promise<JiePlatform>;
  readonly createTui: (options: CreateTUIOptions, deps: TuiDeps) => Tui;
  readonly console: Console;
}

async function run(args: ParsedArgs, cwd: string, homeDir: string, deps: RunDeps): Promise<number> {
  const homeJieDir = join(homeDir, ".jie");
  const projectJieDir = findProjectJieDir(cwd);
  switch (args.kind) {
    case "help":
      printHelp(deps.console);
      return 0;
    case "version":
      deps.console.print(`jie ${VERSION}`);
      return 0;
    case "error":
      deps.console.error(args.message);
      return 1;
  }
  const handle = await bootPlatform({ cwd, homeJieDir, projectJieDir }, deps.createPlatform, deps.console);
  switch (args.kind) {
    case "tui": {
      const tui = deps.createTui({ cwd }, { platform: handle });
      await handle.execute({ name: "team", teamId: args.team });
      await tui.start();
      await handle.execute({ name: "stop" });
      return 0;
    }
    case "login":
      return runLogin(args, handle, deps.console);
    case "logout":
      return runLogout(args, handle, deps.console);
    case "apiKey":
      return runApiKey(args, handle, deps.console);
    case "model":
      return runModel(args, handle, deps.console);
    case "team":
      return runTeam(args, handle, deps.console);
    case "print": {
      const team = await handle.execute({ name: "team", teamId: args.team });
      if (args.apiKey !== undefined) {
        try {
          await handle.execute({ name: "setApiKey", apiKey: args.apiKey });
        } catch (error) {
          deps.console.error(error instanceof Error ? error.message : String(error));
          await handle.execute({ name: "stop" });
          return 1;
        }
      }
      return runPrint(handle, team, args, deps.console);
    }
  }
}

async function bootPlatform(
  options: JiePlatformOptions,
  createPlatform: (options: JiePlatformOptions) => Promise<JiePlatform>,
  console: Console,
): Promise<JiePlatform> {
  let handle: JiePlatform;
  try {
    handle = await createPlatform(options);
  } catch (error) {
    throw new CliBootError(error instanceof Error ? error.message : String(error));
  }
  handle.subscribe("system.error", (envelope) => {
    console.error(`jie: ${envelope.payload.error}`);
  });
  return handle;
}

class CliBootError extends Error {}

function printHelp(console: Console): void {
  console.print(`jie - The jie platform CLI

Usage:
  jie -p "<instruction>" [--team <id>] [--timeout <s>] [--json]
                 [--api-key <key>] [--resume <id>]
  jie --print "<instruction>" ...

  jie login --provider <id> --api-key <key>
  jie logout [<provider>]
  jie model <provider>/<modelId>
  jie team [<id>]

  jie --api-key <key>
  jie --resume <session_id>

  jie [--team <id>]                  # interactive TUI
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

export {
  run as _run,
}
