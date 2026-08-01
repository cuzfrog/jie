import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHooksConfig } from "./parse-hooks";
import type { HooksConfig } from "./types";

export interface LoadHooksOptions {
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
}

export function loadHooksConfig(options: LoadHooksOptions): HooksConfig {
  const globalHooks = readHooksField(join(options.homeJieDir, "settings.json"));
  const projectHooks =
    options.projectJieDir === null ? undefined : readHooksField(join(options.projectJieDir, "settings.json"));
  return parseHooksConfig(globalHooks, projectHooks);
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
