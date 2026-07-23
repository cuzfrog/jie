import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { JiePlatformError } from "../jie-platform-errors";
import { type TeamBlueprintLocation } from "../team";
import { loadMergedSettings } from "./load-settings";
import type { Settings, RawSettings } from "./types";

export interface SettingsStore {
  load(): Settings;
  setDefaultProvider(provider: string, modelId: string): void;
  setDefaultTeam(teamId: string): void;
}

export class SettingsStoreImpl implements SettingsStore {
  private readonly globalPath: string;
  private readonly projectPath: string;

  constructor(
    cwd: string,
    private readonly homeJieDir: string,
    private readonly projectJieDir: string | null,
    private readonly teamLocator: (teamId: string) => TeamBlueprintLocation,
  ) {
    this.globalPath = join(homeJieDir, "settings.json");
    this.projectPath = projectJieDir === null ? join(cwd, ".jie", "settings.json") : join(projectJieDir, "settings.json");
  }

  load(): Settings {
    try {
      return loadMergedSettings(this.homeJieDir, this.projectJieDir);
    } catch {
      return {} as Settings;
    }
  }

  setDefaultProvider(provider: string, modelId: string): void {
    const next: Settings = {
      ...readSettingsFile(this.globalPath),
      defaultProvider: provider,
      defaultModel: modelId,
    };
    writeSettingsFile(this.globalPath, next);
  }

  setDefaultTeam(teamId: string): void {
    const location = this.teamLocator(teamId);
    if (location === null) {
      throw new JiePlatformError("TEAM_NOT_FOUND", { detail: `team '${teamId}' not found` });
    }
    const path = location === "project" ? this.projectPath : this.globalPath;
    const next: Settings = { ...readSettingsFile(path), defaultTeam: teamId };
    writeSettingsFile(path, next);
  }
}

function readSettingsFile(path: string): Settings {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {} as Settings;
    throw error;
  }
  try {
    return JSON.parse(text) as Settings;
  } catch {
    return {} as Settings;
  }
}

function writeSettingsFile(path: string, value: Settings): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  writeFileSync(path, `${JSON.stringify(value as unknown as RawSettings, null, 2)}\n`, "utf-8");
}
