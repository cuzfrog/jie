import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Settings, RawSettings } from "./types";
import { isEffortLevel } from "../types";
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
  try {
    return JSON.parse(text) as RawSettings;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JiePlatformError("INVALID_CONFIG", { detail: `${path}: ${message}` });
  }
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

  if ("defaultEffort" in raw && raw.defaultEffort !== undefined) {
    if (!isEffortLevel(raw.defaultEffort)) {
      throw new JiePlatformError("INVALID_CONFIG", {
        detail: `${source}: invalid defaultEffort: ${JSON.stringify(raw.defaultEffort)}`,
      });
    }
    result.defaultEffort = raw.defaultEffort;
  }

  if ("modelFilters" in raw && raw.modelFilters !== undefined) {
    if (!Array.isArray(raw.modelFilters) || raw.modelFilters.some((filter) => typeof filter !== "string" || filter === "")) {
      throw new JiePlatformError("INVALID_CONFIG", {
        detail: `${source}: modelFilters must be an array of non-empty strings`,
      });
    }
    result.modelFilters = raw.modelFilters;
  }

  if ("compaction" in raw && raw.compaction !== undefined) {
    result.compaction = validateCompaction(raw.compaction, source);
  }

  return result;
}

function validateCompaction(value: unknown, source: string): Settings["compaction"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new JiePlatformError("INVALID_CONFIG", { detail: `${source}: compaction must be an object` });
  }
  const raw = value as Record<string, unknown>;
  const result: { -readonly [K in keyof NonNullable<Settings["compaction"]>]: NonNullable<Settings["compaction"]>[K] } = {};
  if ("enabled" in raw && raw.enabled !== undefined) {
    if (typeof raw.enabled !== "boolean") {
      throw new JiePlatformError("INVALID_CONFIG", { detail: `${source}: compaction.enabled must be a boolean` });
    }
    result.enabled = raw.enabled;
  }
  if ("reserveTokens" in raw && raw.reserveTokens !== undefined) {
    result.reserveTokens = validatePositiveInteger(raw.reserveTokens, "compaction.reserveTokens", source);
  }
  if ("keepRecentTokens" in raw && raw.keepRecentTokens !== undefined) {
    result.keepRecentTokens = validatePositiveInteger(raw.keepRecentTokens, "compaction.keepRecentTokens", source);
  }
  return result;
}

function validatePositiveInteger(value: unknown, label: string, source: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new JiePlatformError("INVALID_CONFIG", { detail: `${source}: ${label} must be a positive integer` });
  }
  return value;
}

function deepMergeSettings(
  base: Settings,
  override: Settings,
): Settings {
  if (base.compaction === undefined || override.compaction === undefined) {
    return { ...base, ...override };
  }
  return { ...base, ...override, compaction: { ...base.compaction, ...override.compaction } };
}
