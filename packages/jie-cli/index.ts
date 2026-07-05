#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  createJiePlatform,
  type JiePlatform,
  type JiePlatformOptions,
} from "@cuzfrog/jie-platform";
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
      let platform: JiePlatform;
      try {
        platform = await createJiePlatform({ cwd, homeJieDir, projectJieDir });
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
      const handle = await bootPlatform({
        cwd,
        homeJieDir,
        projectJieDir,
        resumeSessionId: args.resume,
      });
      const team = await handle.loadTeam(args.team);
      if (args.apiKey !== undefined) {
        try {
          await handle.execute({ name: "setApiKey", apiKey: args.apiKey });
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          await handle.stop();
          return 1;
        }
      }
      return runPrint(handle, team, args);
    }
  }
}

async function bootPlatform(
  args: {
    readonly cwd: string;
    readonly homeJieDir: string;
    readonly projectJieDir: string | null;
    readonly resumeSessionId?: string;
  },
  createPlatform: (options: JiePlatformOptions) => Promise<JiePlatform> = createJiePlatform,
): Promise<JiePlatform> {
  const handle = await createPlatform(args);
  handle.subscribe("system.error", (envelope) => {
    console.error(`jie: ${envelope.payload.error}`);
  });
  return handle;
}

function printHelp(): void {
  console.log(`jie - The jie platform CLI

Usage:
  jie -p "<instruction>" [--team <id>] [--timeout <s>] [--json]
                 [--api-key <key>] [--resume <id>]
  jie --print "<instruction>" ...

  jie login --provider <id> --api-key <key>
  jie logout [<provider>]
  jie model <provider>/<modelId>
  jie team [<id>] | [--unset]

  jie --api-key <key>
  jie --resume <session_id>

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