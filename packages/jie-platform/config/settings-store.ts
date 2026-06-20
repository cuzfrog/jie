/** Settings persistence (`./.jie/settings.json` and `~/.jie/settings.json`).
 *
 *  Wraps the platform's read-only `loadMergedSettings` with the
 *  write side. Project scope (`./.jie/settings.json`) wins over
 *  global (`~/.jie/settings.json`) per the spec's merge order;
 *  callers pick the scope for `write` based on whether the
 *  current working directory is inside a project root.
 *
 *  Both `cwd` and `homeJieDir` are bound at construction; the
 *  returned store is a closure over them. The interface is the
 *  three CRUD operations; the stale-defaultTeam recovery is
 *  the CLI's concern (`packages/jie-cli/app.ts`), not the
 *  store's.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  findProjectJieRoot,
  projectSettingsPath,
} from "./paths.ts";
import { loadMergedSettings } from "./load-settings.ts";
import type { Settings, RawSettings } from "./types.ts";

export type Scope = "project" | "global";

export interface SettingsStore {
  load(): Settings;
  write(settings: Settings, scope: Scope): void;
  /** Removes `defaultTeam` from the merged settings and writes
   *  back to whichever scope the previous `defaultTeam` lived
   *  in (project if a project `.jie/settings.json` exists,
   *  else global). */
  unsetDefaultTeam(): void;
}

export function makeSettingsStore(cwd: string, homeJieDir: string): SettingsStore {
  // `loadMergedSettings` takes the user's HOME directory (the
  // parent of `.jie/`), not the `.jie/` dir itself. The store's
  // public surface uses `homeJieDir` (the `.jie/` dir); the load
  // call derives `homeDir` for the platform's read-only helper.
  const homeDir = dirname(homeJieDir);
  return {
    load(): Settings {
      try {
        return loadMergedSettings(cwd, { homeDir });
      } catch {
        return {} as Settings;
      }
    },
    write(settings, scope): void {
      if (scope === "project") {
        const root = findProjectJieRoot(cwd) ?? cwd;
        mkdirSync(join(root, ".jie"), { recursive: true, mode: 0o755 });
        writeRawSettings(
          join(root, ".jie", "settings.json"),
          settings as unknown as RawSettings,
        );
      } else {
        mkdirSync(homeJieDir, { recursive: true, mode: 0o755 });
        writeRawSettings(
          join(homeJieDir, "settings.json"),
          settings as unknown as RawSettings,
        );
      }
    },
    unsetDefaultTeam(): void {
      const existing = this.load();
      const next: Settings = { ...existing };
      delete next.defaultTeam;
      const scope: Scope = projectSettingsPath(cwd) !== null ? "project" : "global";
      this.write(next, scope);
    },
  };
}

function writeRawSettings(path: string, value: RawSettings): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}
