import type { OAuthCredentials } from "@earendil-works/pi-ai";
import type { EffortLevel } from "../types";

export interface Settings {
  readonly defaultProvider?: string;
  readonly defaultModel?: string;
  readonly defaultTeam?: string;
  readonly defaultEffort?: EffortLevel;
  readonly modelFilters?: ReadonlyArray<string>;
}

export type RawSettings = Record<string, unknown>;

export type AuthEntry =
  | { type: "api_key"; key: string }
  | ({ type: "oauth" } & OAuthCredentials);

export type AuthJson = Record<string, AuthEntry>;
