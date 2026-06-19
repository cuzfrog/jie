/** Settings persistence (`./.jie/settings.json` and `~/.jie/settings.json`).
 *
 *  Wraps the platform's read-only `loadMergedSettings` with the
 *  write side. Project scope (`./.jie/settings.json`) wins over
 *  global (`~/.jie/settings.json`) per the spec's merge order;
 *  callers pick the scope based on whether the current working
 *  directory is inside a project root.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  findProjectJieRoot,
  globalSettingsPath,
  homeJieDir,
  loadMergedSettings,
  projectSettingsPath,
  type MergedSettings,
} from "./index.ts";

export type Scope = "project" | "global";

export interface SettingsStore {
  load(cwd: string): MergedSettings;
  write(settings: MergedSettings, scope: Scope, cwd: string): void;
  /** Removes `defaultTeam` from the merged settings and writes back
   *  to whichever scope the previous `defaultTeam` lived in
   *  (project if a project `.jie/settings.json` exists, else global). */
  unsetDefaultTeam(cwd: string): void;
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
        writeFileSync(
          join(root, ".jie", "settings.json"),
          `${JSON.stringify(settings, null, 2)}\n`,
          "utf-8",
        );
      } else {
        mkdirSync(homeJieDir(homeDir), { recursive: true, mode: 0o755 });
        writeFileSync(
          globalSettingsPath(homeDir),
          `${JSON.stringify(settings, null, 2)}\n`,
          "utf-8",
        );
      }
    },
    unsetDefaultTeam(cwd) {
      const existing = this.load(cwd);
      const next: MergedSettings = { ...existing };
      delete next.defaultTeam;
      const scope: Scope = projectSettingsPath(cwd) !== null ? "project" : "global";
      this.write(next, scope, cwd);
    },
  };
}