
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMergedSettings } from "./load-settings";
import type { Settings, RawSettings } from "./types";

export type Scope = "project" | "global";

export interface SettingsStore {
  load(): Settings;
  write(settings: Settings, scope: Scope): void;

  unsetDefaultTeam(): void;
}

export function makeSettingsStore(
  cwd: string,
  homeJieDir: string,
  projectJieDir: string | null,
): SettingsStore {
  return {
    load(): Settings {
      try {
        return loadMergedSettings(homeJieDir, projectJieDir);
      } catch {
        return {} as Settings;
      }
    },
    write(settings, scope): void {
      if (scope === "project") {
        const target = projectJieDir ?? join(cwd, ".jie");
        mkdirSync(target, { recursive: true, mode: 0o755 });
        writeRawSettings(
          join(target, "settings.json"),
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
      const scope: Scope = projectJieDir !== null ? "project" : "global";
      this.write(next, scope);
    },
  };
}

function writeRawSettings(path: string, value: RawSettings): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}
