/** Settings persistence (`./.jie/settings.json` and `~/.jie/settings.json`).
 *
 *  Wraps the platform's read-only `loadMergedSettings` with the
 *  write side and the self-heal for `defaultTeam`. Project scope
 *  (`./.jie/settings.json`) wins over global
 *  (`~/.jie/settings.json`) per the spec's merge order; callers
 *  pick the scope for `write` based on whether the current
 *  working directory is inside a project root. The store
 *  discovers the project root internally for `load` and
 *  `resolveDefaultTeam`.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  findProjectJieRoot,
  globalSettingsPath,
  homeJieDir,
  projectSettingsPath,
} from "./paths.ts";
import { loadMergedSettings } from "./load-settings.ts";
import type { MergedSettings, RawSettings } from "./types.ts";

export type Scope = "project" | "global";

export interface SettingsStore {
  load(cwd: string): MergedSettings;
  write(settings: MergedSettings, scope: Scope, cwd: string): void;
  /** Removes `defaultTeam` from the merged settings and writes back
   *  to whichever scope the previous `defaultTeam` lived in
   *  (project if a project `.jie/settings.json` exists, else global). */
  unsetDefaultTeam(cwd: string): void;
  /** Picks the right `defaultTeam` for the current installed teams.
   *
   *  - If `settings.defaultTeam` is unset, returns `null` (no work).
   *  - If it points to an installed team, returns `null`
   *    (already correct).
   *  - If it is set but no installed team matches, picks the
   *    first-available user team (project + global, deduped,
   *    alphabetical) and writes it back to the scope (project or
   *    global) where the stale value lived. Returns the recovered
   *    team id. Logs the recovery via `console.warn`.
   *  - If no user teams are installed at all, removes the
   *    `defaultTeam` field from the same scope and returns `null`
   *    (the platform falls back to the built-in minimal team per
   *    the spec's selection order). */
  resolveDefaultTeam(settings: MergedSettings, cwd: string): string | null;
}

export function makeSettingsStore(homeDir: string): SettingsStore {
  return {
    load(cwd) {
      try {
        return loadMergedSettings(cwd, { homeDir });
      } catch {
        return {} as MergedSettings;
      }
    },
    write(settings, scope, cwd) {
      if (scope === "project") {
        const root = findProjectJieRoot(cwd) ?? cwd;
        mkdirSync(join(root, ".jie"), { recursive: true, mode: 0o755 });
        writeRawSettings(
          join(root, ".jie", "settings.json"),
          settings as RawSettings,
        );
      } else {
        mkdirSync(homeJieDir(homeDir), { recursive: true, mode: 0o755 });
        writeRawSettings(globalSettingsPath(homeDir), settings as RawSettings);
      }
    },
    unsetDefaultTeam(cwd) {
      const existing = this.load(cwd);
      const next: MergedSettings = { ...existing };
      delete next.defaultTeam;
      const scope: Scope = projectSettingsPath(cwd) !== null ? "project" : "global";
      this.write(next, scope, cwd);
    },
    resolveDefaultTeam(settings, cwd) {
      const staleId = settings.defaultTeam;
      if (staleId === undefined) return null;
      if (isTeamInstalled(staleId, cwd, homeDir)) return null;

      const projectRoot = findProjectJieRoot(cwd) ?? cwd;
      const projectPathFull = join(projectRoot, ".jie", "settings.json");
      const globalPathFull = globalSettingsPath(homeDir);

      const projectRaw = readRawSettings(projectPathFull);
      const globalRaw = readRawSettings(globalPathFull);

      const projectHasStale = projectRaw?.defaultTeam === staleId;
      const globalHasStale = globalRaw?.defaultTeam === staleId;
      const scopePath = projectHasStale
        ? projectPathFull
        : globalHasStale
          ? globalPathFull
          : null;
      const scopeLabel = projectHasStale ? "project" : "global";

      const available = listInstalledTeams(projectRoot, homeDir);
      if (available.length === 0) {
        if (scopePath !== null) clearDefaultTeam(scopePath);
        console.warn(
          `defaultTeam '${staleId}' is not installed; no user teams available; falling back to built-in minimal team`,
        );
        return null;
      }

      const recovered = available[0]!;
      if (scopePath !== null) {
        const source = scopePath === projectPathFull ? projectRaw : globalRaw;
        const next: RawSettings = { ...(source ?? {}) };
        next.defaultTeam = recovered;
        writeRawSettings(scopePath, next);
      }
      console.warn(
        `defaultTeam '${staleId}' is not installed; resetting to '${recovered}' in ${scopeLabel} settings`,
      );
      return recovered;
    },
  };
}

function isTeamInstalled(
  teamId: string,
  projectPath: string,
  homeDir: string,
): boolean {
  const candidates = [
    join(projectPath, ".jie", "teams", teamId, "TEAM.md"),
    join(homeDir, ".jie", "teams", teamId, "TEAM.md"),
  ];
  return candidates.some((p) => existsSync(p));
}

function listInstalledTeams(projectPath: string, homeDir: string): string[] {
  const ids = new Set<string>();
  for (const root of [
    join(projectPath, ".jie", "teams"),
    join(homeDir, ".jie", "teams"),
  ]) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (existsSync(join(root, entry, "TEAM.md"))) ids.add(entry);
    }
  }
  return [...ids].sort();
}

function readRawSettings(path: string): RawSettings | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RawSettings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function writeRawSettings(path: string, value: RawSettings): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function clearDefaultTeam(path: string): void {
  const raw = readRawSettings(path);
  if (raw === null) return;
  delete raw.defaultTeam;
  writeRawSettings(path, raw);
}
