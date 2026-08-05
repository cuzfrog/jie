import type { OAuthCredentials } from "@earendil-works/pi-ai";
import type { EffortLevel } from "../types";

export interface Settings {
  readonly defaultProvider?: string;
  readonly defaultModel?: string;
  readonly defaultTeam?: string;
  readonly defaultEffort?: EffortLevel;
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
}

export type RawSettings = Record<string, unknown>;

export type AuthEntry =
  | { type: "api_key"; key: string }
  | ({ type: "oauth" } & OAuthCredentials);

export type AuthJson = Record<string, AuthEntry>;
