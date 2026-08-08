#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { bootPlatform, type JiePlatform, type JiePlatformOptions } from "@cuzfrog/jie-platform";
import { bootTui, type CreateTUIOptions, type Tui, type TuiDeps } from "@cuzfrog/jie-tui";
import { defaultConsole, type Console } from "@cuzfrog/jie-utils";
import { parseFlags, type ParsedArgs } from "./cli-flags";
import {
  runApiKey,
  runLogin,
  runLogout,
  runModel,
  runPrint,
  runTeam,
  runTeamInstall,
} from "./commands";
import { VERSION } from "./version";

export async function main(argv: string[], cwd: string = process.cwd(), console: Console = defaultConsole): Promise<number> {
  const parsed = parseFlags(argv);
  const homeDir = resolveHomeDir();
  try {
    return await run(parsed, cwd, homeDir, {
      bootPlatform: async (options) => (await bootPlatform(options)).cradle.platform,
      bootTui: (options, deps) => bootTui(options, deps).cradle.tui,
      console,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

interface RunDeps {
  readonly bootPlatform: (options: JiePlatformOptions) => Promise<JiePlatform>;
  readonly bootTui: (options: CreateTUIOptions, deps: TuiDeps) => Tui;
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
  if (args.kind === "team" && (args.action === "add" || args.action === "remove")) {
    return await runTeamInstall(args, homeJieDir, projectJieDir, deps.console);
  }
  const handle = await connectPlatform(
    {
      cwd,
      homeJieDir,
      projectJieDir,
      inMemory: args.kind === "tui" || args.kind === "print" ? args.inMemory : false,
      resumeSessionId: args.kind === "tui" || args.kind === "print" ? args.resume : undefined,
      debug: args.kind === "tui" || args.kind === "print" ? args.debug : false,
    },
    deps.bootPlatform,
    deps.console,
  );
  try {
    switch (args.kind) {
      case "tui": {
        const git = await handle.execute({ name: "getGitStatus" });
        const tui = deps.bootTui(
          { cwd },
          { platform: handle, homeJieDir, gitBranch: git.branch, gitDirty: git.dirty, version: VERSION },
        );
        await handle.execute({ name: "team", teamId: args.team });
        try {
          await tui.start();
        } finally {
          tui.stop();
        }
        await handle.execute({ name: "stop" });
        return 0;
      }
      case "login":
        return await runLogin(args, handle, deps.console);
      case "logout":
        return await runLogout(args, handle, deps.console);
      case "apiKey":
        return await runApiKey(args, handle, deps.console);
      case "model":
        return await runModel(args, handle, deps.console);
      case "team":
        return await runTeam(args, handle, homeJieDir, projectJieDir, deps.console);
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
        return await runPrint(handle, team, args, deps.console);
      }
    }
  } finally {
    await handle.shutdown();
  }
}

async function connectPlatform(
  options: JiePlatformOptions,
  bootPlatform: (options: JiePlatformOptions) => Promise<JiePlatform>,
  console: Console,
): Promise<JiePlatform> {
  let platform: JiePlatform;
  try {
    platform = await bootPlatform(options);
  } catch (error) {
    throw new CliBootError(error instanceof Error ? error.message : String(error));
  }
  platform.subscribe("system.error", (envelope) => {
    console.error(`jie: ${envelope.payload.error}`);
  });
  return platform;
}

class CliBootError extends Error {}

function printHelp(console: Console): void {
  console.print(`jie - The jie platform CLI

Usage:
  jie -p "<instruction>" [--team <id>] [--timeout <s>] [--json]
                 [--api-key <key>] [--resume <id>] [--in-memory] [--debug]
  jie --print "<instruction>" ...

  jie login --provider <id> --api-key <key>
  jie logout [<provider>]
  jie model <provider>/<modelId>
  jie team [<id>]
  jie team add <source> [--project] [--force]
  jie team list
  jie team remove <id> [--project]

  jie --api-key <key>
  jie --resume <session_id>

  jie [--team <id>] [--resume <id>] [--in-memory] [--debug]    # interactive TUI
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
