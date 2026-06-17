import type { OAuthCredentials } from "@earendil-works/pi-ai";

export type ConfigScope = "user" | "project";

/** Merged settings after deep-merging `.jie/settings.json` over
 *  `~/.jie/settings.json`. Unrecognized top-level fields on disk are
 *  tolerated (warned, ignored) and are NOT surfaced here — only the
 *  three v1 fields are exposed. */
export interface MergedSettings {
  defaultProvider?: string;
  defaultModel?: string;
  defaultTeam?: string;
}

/** The on-disk shape of `settings.json` (relaxed: every field is
 *  optional and may be of any JSON type so that the validation layer
 *  can surface precise errors). */
export type RawSettings = Record<string, unknown>;

/** A single provider entry in `auth.json`. Two shapes:
 *  - `{ type: "api_key", key }` — plain API key (v1, per ADR 21).
 *  - `{ type: "oauth", ...OAuthCredentials }` — OAuth credentials,
 *    shape owned by `@earendil-works/pi-ai`'s `FileAuthStorageBackend`. */
export type AuthEntry =
  | { type: "api_key"; key: string }
  | ({ type: "oauth" } & OAuthCredentials);

/** The on-disk shape of `~/.jie/auth.json`. */
export type AuthJson = Record<string, AuthEntry>;

/** Discriminator for the MCP server transport. */
export type McpTransport = "stdio" | "http";

/** Single MCP server config (forward-looking — used by `startJie` once
 *  the MCP client lands; the platform does not load `mcp.json` in v1). */
export interface McpServerConfig {
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  auth?: {
    token_env?: string;
  };
}

/** The on-disk shape of `mcp.json`. */
export interface McpConfig {
  servers: Record<string, McpServerConfig>;
}