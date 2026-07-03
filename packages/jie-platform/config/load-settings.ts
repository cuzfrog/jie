import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Settings, RawSettings } from "./types";
import { JiePlatformError } from "../jie-platform-errors";

const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const DEFAULT_TEAM_ERROR = (value: unknown): string => `invalid defaultTeam: ${value}`;

export function loadMergedSettings(
  homeJieDir: string,
  projectJieDir: string | null,
): Settings {
  const globalPath = join(homeJieDir, "settings.json");
  const projectPath = projectJieDir === null ? null : join(projectJieDir, "settings.json");

  const globalRaw = readSettingsFile(globalPath);
  const projectRaw = projectPath === null ? null : readSettingsFile(projectPath);

  const globalSettings = globalRaw === null ? {} : validateSettings(globalRaw, globalPath);
  const projectSettings =
    projectRaw === null
      ? {}
      : validateSettings(projectRaw, projectPath ?? "<unknown>");

  return deepMergeSettings(globalSettings, projectSettings);
}

function readSettingsFile(path: string): RawSettings | null {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return JSON.parse(text) as RawSettings;
}

function validateSettings(raw: RawSettings, source: string): Settings {
  const result: { -readonly [K in keyof Settings]: Settings[K] } = {};

  if ("defaultProvider" in raw && raw.defaultProvider !== undefined) {
    if (typeof raw.defaultProvider !== "string") {
      throw new JiePlatformError("INVALID_CONFIG", { detail: `${source}: defaultProvider must be a string` });
    }
    result.defaultProvider = raw.defaultProvider;
  }

  if ("defaultModel" in raw && raw.defaultModel !== undefined) {
    if (typeof raw.defaultModel !== "string") {
      throw new JiePlatformError("INVALID_CONFIG", { detail: `${source}: defaultModel must be a string` });
    }
    result.defaultModel = raw.defaultModel;
  }

  if ("defaultTeam" in raw && raw.defaultTeam !== undefined) {
    if (typeof raw.defaultTeam !== "string") {
      throw new JiePlatformError("INVALID_CONFIG", { detail: `${source}: defaultTeam must be a string` });
    }
    if (!TEAM_ID_PATTERN.test(raw.defaultTeam)) {
      throw new JiePlatformError("INVALID_CONFIG", {
        detail: `${source}: ${DEFAULT_TEAM_ERROR(raw.defaultTeam)}`,
      });
    }
    result.defaultTeam = raw.defaultTeam;
  }

  return result;
}

// stub for future config shape where deep merge is needed.
function deepMergeSettings(
  base: Settings,
  override: Settings,
): Settings {
  return { ...base, ...override };
}
