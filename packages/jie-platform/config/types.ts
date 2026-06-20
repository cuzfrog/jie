import type { OAuthCredentials } from "@earendil-works/pi-ai";

export interface Settings {
  defaultProvider?: string;
  defaultModel?: string;
  defaultTeam?: string;
}

export type RawSettings = Record<string, unknown>;

export type AuthEntry =
  | { type: "api_key"; key: string }
  | ({ type: "oauth" } & OAuthCredentials);

export type AuthJson = Record<string, AuthEntry>;

export interface McpServerConfig {
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  auth?: {
    token_env?: string;
  };
}