import { readFileSync } from "node:fs";
import type { Settings, RawSettings } from "./types.ts";
import { globalSettingsPath, projectSettingsPath } from "./paths.ts";

const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

const DEFAULT_TEAM_ERROR = (value: unknown): string =>
  `invalid defaultTeam: ${value}`;

function readSettingsFile(path: string): RawSettings | null {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  return JSON.parse(text) as RawSettings;
}

function validateSettings(raw: RawSettings, source: string): Settings {
  const result: Settings = {};

  if ("defaultProvider" in raw && raw.defaultProvider !== undefined) {
    if (typeof raw.defaultProvider !== "string") {
      throw new Error(`${source}: defaultProvider must be a string`);
    }
    result.defaultProvider = raw.defaultProvider;
  }

  if ("defaultModel" in raw && raw.defaultModel !== undefined) {
    if (typeof raw.defaultModel !== "string") {
      throw new Error(`${source}: defaultModel must be a string`);
    }
    result.defaultModel = raw.defaultModel;
  }

  if ("defaultTeam" in raw && raw.defaultTeam !== undefined) {
    if (typeof raw.defaultTeam !== "string") {
      throw new Error(`${source}: defaultTeam must be a string`);
    }
    if (!TEAM_ID_PATTERN.test(raw.defaultTeam)) {
      throw new Error(`${source}: ${DEFAULT_TEAM_ERROR(raw.defaultTeam)}`);
    }
    result.defaultTeam = raw.defaultTeam;
  }

  return result;
}

function deepMergeSettings(
  base: Settings,
  override: Settings,
): Settings {
  return { ...base, ...override };
}

export function loadMergedSettings(
  cwd: string,
  options: { homeDir: string },
): Settings {
  const globalPath = globalSettingsPath(options.homeDir);
  const projectPath = projectSettingsPath(cwd);

  const globalRaw = readSettingsFile(globalPath);
  const projectRaw = projectPath === null ? null : readSettingsFile(projectPath);

  const globalSettings = globalRaw === null ? {} : validateSettings(globalRaw, globalPath);
  const projectSettings =
    projectRaw === null
      ? {}
      : validateSettings(projectRaw, projectPath ?? "<unknown>");

  return deepMergeSettings(globalSettings, projectSettings);
}