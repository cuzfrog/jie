import { readFileSync } from "node:fs";
import { getProviders } from "@earendil-works/pi-ai";
import type { MergedSettings, RawSettings } from "./types.ts";
import { globalSettingsPath, projectSettingsPath } from "./paths.ts";

const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

const DEFAULT_TEAM_ERROR = (value: unknown): string =>
  `invalid defaultTeam: ${value}`;

/** Reads and JSON-parses a `settings.json` file. Returns the raw
 *  parsed value (a `Record<string, unknown>`) or `null` when the file
 *  is absent. A JSON parse error is rethrown with a synthesized
 *  message — the platform's contract is to hard-fail on parse errors. */
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

/** Validates a single settings file. Returns a partial `MergedSettings`
 *  (only fields that pass). Throws on:
 *  - `defaultProvider` not a string
 *  - `defaultModel` not a string
 *  - `defaultTeam` not matching `[A-Za-z0-9_-]{1,32}`
 *  Unknown `defaultProvider` values are WARN-and-ignored (treated as
 *  absent), per the "Unknown field policy" in the spec. */
export function validateSettings(raw: RawSettings, source: string): MergedSettings {
  const result: MergedSettings = {};

  if ("defaultProvider" in raw && raw.defaultProvider !== undefined) {
    if (typeof raw.defaultProvider !== "string") {
      throw new Error(`${source}: defaultProvider must be a string`);
    }
    if (isKnownProvider(raw.defaultProvider)) {
      result.defaultProvider = raw.defaultProvider;
    } else {
      console.warn(
        `${source}: unknown defaultProvider '${raw.defaultProvider}'; treating as absent`,
      );
    }
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

const KNOWN_PROVIDERS = new Set<string>(getProviders());

function isKnownProvider(provider: string): boolean {
  return KNOWN_PROVIDERS.has(provider);
}

/** Deep-merges two settings records. Project (the second arg) wins for
 *  top-level scalars and replaces arrays; nested plain-object values
 *  recurse. The merge only runs over keys that are present in either
 *  side; other top-level fields are not surfaced. The deep-merge is
 *  general — the platform's v1 schema has no nested objects, but the
 *  rule is in place for future settings. */
export function deepMergeSettings(
  base: MergedSettings,
  override: MergedSettings,
): MergedSettings {
  return { ...base, ...override };
}

/** Load and deep-merge settings. Walks up from `cwd` to find the
 *  project `.jie/`, then merges the project's `settings.json` over
 *  `~/.jie/settings.json` (project wins). Throws on JSON parse errors
 *  or shape validation errors. Returns an empty object when neither
 *  file exists. */
export function loadMergedSettings(
  cwd: string,
  options: { homeDir?: string } = {},
): MergedSettings {
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

/** Validate a team id against the v1 charset `[A-Za-z0-9_-]{1,32}`. */
export function isValidTeamId(id: string): boolean {
  return TEAM_ID_PATTERN.test(id);
}