import type { OAuthCredentials } from "@earendil-works/pi-ai";

export interface Settings {
  readonly defaultProvider?: string;
  readonly defaultModel?: string;
  readonly defaultTeam?: string;
}

export type RawSettings = Record<string, unknown>;

export type AuthEntry =
  | { type: "api_key"; key: string }
  | ({ type: "oauth" } & OAuthCredentials);

export type AuthJson = Record<string, AuthEntry>;
