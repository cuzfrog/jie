import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHooksConfig } from "./parse-hooks";
import type { HookSource, LoadHooksResult } from "./types";

export interface LoadHooksOptions {
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
}

export function loadHooksConfig(options: LoadHooksOptions): LoadHooksResult {
  const sources: HookSource[] = [];
  const globalPath = join(options.homeJieDir, "settings.json");
  sources.push({ path: globalPath, hooks: readHooksField(globalPath) });
  if (options.projectJieDir !== null) {
    const projectPath = join(options.projectJieDir, "settings.json");
    sources.push({ path: projectPath, hooks: readHooksField(projectPath) });
  }
  return parseHooksConfig(sources);
}

function readHooksField(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isObject(parsed) ? parsed.hooks : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
