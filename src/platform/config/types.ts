import type { Credential } from "@earendil-works/pi-ai";
import type { EffortLevel, ModelAlias } from "../types";

export interface Settings {
  readonly defaultProvider?: string;
  readonly defaultModel?: string;
  readonly defaultTeam?: string;
  readonly defaultEffort?: EffortLevel;
  readonly modelAliases?: Partial<Record<ModelAlias, string>>;
  readonly modelFilters?: ReadonlyArray<string>;
  readonly language?: "en" | "zh";
  readonly memory?: {
    readonly enabled?: boolean;
    readonly model?: string;
    readonly bootstrapMaxEntries?: number;
    readonly bootstrapMaxChars?: number;
  };
  readonly compaction?: {
    readonly enabled?: boolean;
    readonly reserveTokens?: number;
    readonly keepRecentTokens?: number;
  };
  readonly notification?: {
    readonly soundEnabled?: boolean;
  };
}

export type RawSettings = Record<string, unknown>;

export type AuthEntry = Credential;

export type AuthJson = Record<string, AuthEntry>;
