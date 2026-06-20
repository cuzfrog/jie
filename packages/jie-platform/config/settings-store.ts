
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

  unsetDefaultTeam(): void;
}

export function makeSettingsStore(cwd: string, homeJieDir: string): SettingsStore {

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
