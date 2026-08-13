import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isErrnoException } from "..";
import { loadMergedSettings } from "./load-settings";
import type { Settings } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import type { EffortLevel, ModelAlias } from "../types";

export interface SettingsStore {
  load(): Settings;
  setDefaultProvider(provider: string, modelId: string): void;
  setDefaultEffort(effort: EffortLevel): void;
  setDefaultTeam(teamId: string, scope: "project" | "global"): void;
  setModelAlias(alias: ModelAlias, modelRef: string): void;
  setModelFilters(filters: ReadonlyArray<string>): void;
  setNotificationSoundEnabled(enabled: boolean): void;
}

export class SettingsStoreImpl implements SettingsStore {
  private readonly globalPath: string;
  private readonly projectPath: string;

  constructor(
    cwd: string,
    private readonly homeJieDir: string,
    private readonly projectJieDir: string | null,
  ) {
    this.globalPath = join(homeJieDir, "settings.json");
    this.projectPath = projectJieDir === null ? join(cwd, ".jie", "settings.json") : join(projectJieDir, "settings.json");
  }

  load(): Settings {
    return loadMergedSettings(this.homeJieDir, this.projectJieDir);
  }

  setDefaultProvider(provider: string, modelId: string): void {
    const projectSettings = readSettingsFile(this.projectPath);
    const usesProjectScope = projectSettings.defaultProvider !== undefined || projectSettings.defaultModel !== undefined;
    const path = usesProjectScope ? this.projectPath : this.globalPath;
    const base = usesProjectScope ? projectSettings : readSettingsFile(this.globalPath);
    const next: Settings = { ...base, defaultProvider: provider, defaultModel: modelId };
    writeSettingsFile(path, next);
  }

  setDefaultEffort(effort: EffortLevel): void {
    const next: Settings = { ...readSettingsFile(this.globalPath), defaultEffort: effort };
    writeSettingsFile(this.globalPath, next);
  }

  setDefaultTeam(teamId: string, scope: "project" | "global"): void {
    const path = scope === "project" ? this.projectPath : this.globalPath;
    const next: Settings = { ...readSettingsFile(path), defaultTeam: teamId };
    writeSettingsFile(path, next);
  }

  setModelAlias(alias: ModelAlias, modelRef: string): void {
    const projectSettings = readSettingsFile(this.projectPath);
    const usesProjectScope = projectSettings.defaultProvider !== undefined || projectSettings.defaultModel !== undefined;
    const path = usesProjectScope ? this.projectPath : this.globalPath;
    const base = usesProjectScope ? projectSettings : readSettingsFile(this.globalPath);
    const next: Settings = { ...base, modelAliases: { ...base.modelAliases, [alias]: modelRef } };
    writeSettingsFile(path, next);
  }

  setModelFilters(filters: ReadonlyArray<string>): void {
    const next: Settings = { ...readSettingsFile(this.globalPath), modelFilters: filters };
    writeSettingsFile(this.globalPath, next);
  }

  setNotificationSoundEnabled(enabled: boolean): void {
    const base = readSettingsFile(this.globalPath);
    const notification: NonNullable<Settings["notification"]> = { ...base.notification, soundEnabled: enabled };
    const next: Settings = { ...base, notification };
    writeSettingsFile(this.globalPath, next);
  }
}

function readSettingsFile(path: string): Settings {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return {};
    throw error;
  }
  try {
    const parsed: Settings = JSON.parse(text);
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JiePlatformError("INVALID_CONFIG", { detail: `${path}: ${message}` });
  }
}

function writeSettingsFile(path: string, value: Settings): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}
