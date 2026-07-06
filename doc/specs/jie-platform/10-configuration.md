# Configuration

Platform-level configuration surface. Defines how Jie discovers and loads settings for a team.

## Persistent Files

The platform reads and writes a small set of user-visible files. New settings may be added in future versions; this list is illustrative.

| File | Scope | Sensitivity | Holds |
|---|---|---|---|
| `~/.jie/settings.json` | Global user settings | Plain JSON (user-readable) | `defaultProvider`, `defaultModel`, `defaultTeam` |
| `.jie/settings.json` | Project override | Plain JSON (user-readable) | Same fields, deep-merge over global |
| `~/.jie/auth.json` | Global credentials | mode `0600` (sensitive) | API keys, OAuth tokens |
| `~/.jie/mcp.json` | Global MCP server definitions | Plain JSON (forward-looking — Day 2) | MCP server list (stdio / http transports) |
| `.jie/mcp.json` | Project MCP server overrides | Plain JSON (forward-looking — Day 2) | Same shape, project overrides global |
| `.jie/teams/<id>/TEAM.md` | Team wiring | Plain text | `leader:` declaration in YAML frontmatter + prose |
| `.jie/teams/<id>/<role>.md` | Agent definition | Plain text | YAML frontmatter (`name?`, `model?`, `tools`, `subscribe?`) + prose body (system prompt) |

`.jie/settings.json` is the only project-level user settings file. There is no project-level `auth.json` — credentials are global, by design.

### File-Format Convention

Config files (machine-edited, schema-validated) are **JSON**; content files (LLM-authored system prompts with structured metadata) are **`.md` with YAML frontmatter**. This matches `@earendil-works/pi-coding-agent`'s split: `settings.json` / `auth.json` are JSON, while skills and prompts are `.md` with YAML frontmatter.

- JSON: `settings.json`, `auth.json`, `mcp.json`. Parsed by the bun/Node built-in `JSON.parse`; no external dep.
- YAML: team `.md` frontmatter. Parsed by `yaml@2.9.0` (per the platform's runtime-deps block in `monorepo-structure.md`).

### Discovery

`.jie/settings.json` is discovered by walking up from CWD to find `.jie/`. `~/.jie/settings.json` and `~/.jie/auth.json` are fixed global paths. Both `jie` (TUI) and `jie -p` modes share this behavior.

If no `.jie/settings.json` is found, the platform runs with global-only settings — no interactive init flow.

## `settings.json`

JSON, two locations, **project overrides global with deep-merge** (nested objects merge, top-level scalars replace, arrays replace). This mirrors pi's `settings.json` convention.

| Location | Scope |
|---|---|
| `~/.jie/settings.json` | Global (all projects) |
| `.jie/settings.json` | Project (current directory; deep-merge over global) |

For v1, three fields are recognized. Other fields are tolerated and ignored (forward-compatibility with future settings). Unfamiliar *values* for recognized fields (e.g. `defaultProvider: "not-a-real-provider"`) follow the same WARN-and-ignore policy — see "Unknown field policy" below.

```json
{
 "defaultProvider": "anthropic",
 "defaultModel": "claude-sonnet-4-20250514",
 "defaultTeam": "dev"
}
```

| Field | Type | Description |
|---|---|---|
| `defaultProvider` | string | Provider id (e.g. `anthropic`, `openai`). Unknown values are tolerated (WARN, treat as absent — see "Unknown field policy" below). |
| `defaultModel` | string | Model id within the provider (e.g. `claude-sonnet-4-20250514`). |
| `defaultTeam` | string | Last user-selected team. Charset `[A-Za-z0-9_-]{1,32}`. See "Team Selection". |

**Unknown field policy.** Unrecognized top-level fields in `settings.json` are tolerated (warned, ignored) so future Jie versions can land new settings without breaking old files. Unrecognized *values* for recognized fields follow the same policy where it makes sense — e.g. `defaultProvider: "not-a-real-provider"` is WARN+ignore (treat the field as absent; model resolution falls through to per-agent `model:`, and if none, surfaces "No model has been selected" at startup pre-check). `jie model <provider>/<modelId>` similarly warns but still writes the user's choice. Shape errors (e.g. `defaultProvider: 42`, `defaultTeam: ["foo"]`) remain a hard fail — those are malformed JSON, not unfamiliar values.

The TypeScript type consumed by the platform (loaded by `SettingsStore` at startup; surfaced on `JiePlatform.settings` per ADR 13):

```typescript
// packages/jie-platform/types/settings.ts

/**
 * Merged settings after deep-merging .jie/settings.json over ~/.jie/settings.json.
 * Unrecognized fields are tolerated on disk (warned, ignored) and are NOT
 * surfaced here — only the three v1 fields are exposed. The `?` on each field
 * reflects that a recognized field may be absent in the merged file (e.g. the
 * user has not run `jie model` yet); the `defaultProvider`/`defaultModel`
 * resolution chain in 06-agent-model.md "Model Resolution" treats absent as
 * "fall through to next source".
 */
export interface MergedSettings {
  defaultProvider?: string;  // e.g. "anthropic", "openai"
  defaultModel?:    string;  // model id within the provider
  defaultTeam?:     string;  // charset [A-Za-z0-9_-]{1,32}
}
```

The merge rule is **deep-merge for nested objects, replace for top-level scalars and arrays** (per "settings.json" header above). The platform never persists its own fields; the only writer is the CLI's `jie model` / `jie team` / `jie --api-key` commands. `MergedSettings` is the read-side projection — it is what `startJie` sees after the CLI's resolution step.

## Team Selection

The platform resolves which team to run with this order:

| Order | Source | Notes |
|---|---|---|
|1 | `--team <id>` CLI flag (one-shot override) | TUI has no equivalent — `/team <id>` is persistent (writes to settings). Hard fail if `<id>` is not installed. |
|2 | Merged settings: `defaultTeam` | Stale values are auto-recovered — see "Stale `defaultTeam` Recovery" below. |
|3 | First-available user team | Alphabetical across `.jie/teams/*` and `~/.jie/teams/*`, deduped by id. |
|4 | Built-in minimal team | The platform's hardcoded fallback (`packages/jie-platform/team/built-in/minimal-team.ts`). Always available; used only when steps1–3 yield no team. See `minimal-team.md`. |

### Lookup Paths

Once a team id is resolved, the manifest is located at one of:

| Order | Source | Lookup |
|---|---|---|
|1 | Project-local | `.jie/teams/<team_id>/TEAM.md` (relative to the `.jie/` directory discovered by walking up from CWD) |
|2 | Global | `~/.jie/teams/<team_id>/TEAM.md` |

The platform has no concept of an installed / uninstalled team beyond these filesystem paths.

### Stale `defaultTeam` Recovery

If `defaultTeam` from merged settings does not resolve to an installed manifest, the platform self-heals:

1. If at least one user team is installed (project + global combined, deduped), pick the first-available alphabetically and write it to the same settings scope where the stale value lived (project `.jie/settings.json` if the stale value was in project settings, else global `~/.jie/settings.json`). Log: `defaultTeam '<id>' is not installed; resetting to '<first-available>'`. Continue startup with the reset value.
2. If no user teams are installed, clear the stale `defaultTeam` field (write settings back without it). Log: `defaultTeam '<id>' is not installed; no user teams available; falling back to built-in minimal team`. Continue startup with the platform's built-in minimal team (step 4 of the selection order).

This handles the case where the user removed a team directory but their `settings.json` still references it. The platform self-heals instead of failing on the next run.

### Setting `defaultTeam`

CLI: `jie team <id>`. TUI: `/team <id>`.

The platform picks the settings scope based on where `<id>` is installed:

- `.jie/teams/<id>/` exists → write to `.jie/settings.json`.
- Else `~/.jie/teams/<id>/` exists → write to `~/.jie/settings.json`.
- Else → exit1; the team must be installed before it can be selected.

If both project-local and global copies exist, project wins (matches the lookup precedence). The CLI command does not start the team; the TUI command swaps the running team in-session — see "Team Swap" below.

### Team Swap (TUI)

`/team <id>` (and `/team` followed by selection in the picker) takes effect immediately in the running TUI session. The TUI is a passive observer; swap is a view change, not a body-lifecycle change (per ADR 19):

1. The TUI consults the platform's internal `loadedTeams` map (per `addrs/13-platform-entry-function.md` and ADR 19). If the team is already loaded, no body-lifecycle work happens — the team is alive, the TUI just wasn't watching.
2. If the team is not loaded, the platform calls `loadTeam(teamId)` (a Day 2+ method on the handle, not in v1's `{ bus, stop }` surface): parse the blueprint per "Team Selection" rules (steps 1–4); resolve each `AgentSoul.model`; construct bodies; register them on the bus; record them in `loadedTeams`. The platform's private `Map<team_id, session_id>` (`08-memory.md` and ADR 18) is consulted for the new team's `team_id`: if the team was previously active in this process, the recorded `session_id` is passed to each new body; the body uses it and `restore()` returns the prior `memory_turns` rows. If the team is new in this process, the platform mints a fresh `session_id`, records it under the team's `team_id`, and passes it to each new body. All agents in the new team share this session id. The platform's map is in-memory only and is lost on process exit (per `08-memory.md` "Restore").
3. The TUI re-renders: it now subscribes to `{active_team_id}.leader.prompt` for prompt publication and filters platform events by the active team's `team_id` (from the envelope). Tabs/panels for the new team's agents appear via the existing "Agent Discovery" primitives. Every prior team's conversation history is retained for the lifetime of the process run; switching back to a previously-active team restores its conversation in full (the recorded `session_id` is reused, the in-memory event buffer is preserved per the TUI's per-`(team_id, agent_key)` event log).
4. **The previously-active team is not stopped or destroyed.** Its bodies keep their state — `memory_turns` rows, in-memory prompt queue, LLM context, in-progress work. The TUI just stops publishing prompts to that team's prompt topic. The team's agents continue processing any queued prompts autonomously; the TUI just isn't watching.

TUI hint on success: `default team set`.

### Showing and Resetting

- `jie team` (no arg) / `/team` (no arg) — print the current `defaultTeam` from merged settings, plus the list of installed teams (project + global, deduped). TUI uses pi's selection-filter UI for picking.
- There is no explicit unset. A stale `defaultTeam` (its blueprint was removed) is treated as absent at team-load time and falls back to the first installed user team, else the built-in minimal team. `load()` does not persist this auto-selection; only `jie team <id>` / `/team <id>` writes `defaultTeam`.

## Workspace Inference

The workspace root is `process.cwd()`. The platform does not read any field to override it. Path resolution in tools (e.g. `bash` workdir enforcement, `read_file`, `write_file`) is rooted at CWD.

Implication: launching `jie` from a subdirectory of a project produces a workspace rooted at that subdirectory. Team manifest lookup and `settings.json` discovery walk up to the project root, but path resolution in tools does not — file paths in tool calls are relative to CWD, not the project root.

> **Project state files** (`.jie/settings.json`, `.jie/teams/`, `.jie/mcp.json`, `.jie/storage.db`) are discovered by walking up from CWD to find `.jie/`. **Tool path resolution** (`bash` workdir, `read_file`, `write_file`) is rooted at CWD. The two concerns are deliberately different — `.jie/` is project state, not the workspace. v1 may diverge the two; the TUI surfaces both per backlog #21.

### ArtifactStore

Open at the `.jie/storage.db` discovered by walking up from CWD — same walk as settings and team lookup (see "Workspace Inference" above). If the walked-up `.jie/` does not exist, the platform creates it at the walk's root so a fresh invocation works without manual `mkdir .jie`. SQLite, single-writer by design.

## Streaming Tunables

The following streaming-related platform constants are not user-configurable in v1. Other platform constants (tool timeouts, content caps, etc.) live in their respective tool sections.

| Constant | Value | Role |
|---|---|---|
| `stream_chunk_size` | `64` | Characters per `agent.stream.chunk` event. |
| `stream_flush_ms` | `200` | Max ms before flushing a partial stream chunk. |

See `03-event-system.md` "Streaming" for how these are applied.

## Platform Limits

A consolidated view of the platform's hard caps and charsets. These are not user-configurable in v1; the values are the contract. Each row points at the doc that applies the limit.

| Limit | Value | Where applied | Doc |
|---|---|---|---|
| Artifact key charset | `[A-Za-z0-9_./-]{1,256}` | `write_artifact`, `read_artifact`, `list` (prefix is escaped, not validated) | `05-artifact-store.md`, `06-agent-model.md` |
| Artifact content cap | **5 MiB** (`content.length` chars) | `write_artifact` | `05-artifact-store.md`, `06-agent-model.md` |
| `web_fetch` body cap | **5 MiB** | `web_fetch` (truncated at 5 MiB; `truncated: true` set) | `06-agent-model.md` |
| `write_file` content cap | **5 MiB** (`content.length` chars) | `write_file` | `06-agent-model.md` |
| `bash` stdout / stderr cap | **32 KiB** per stream | `bash` (truncated independently; `[truncated to 32 KiB]` marker appended) | `06-agent-model.md` |
| `read_file` default truncation | **2000 lines OR 50 KiB** (whichever first) | `read_file` (override with `offset` / `limit`) | `06-agent-model.md` |
| `read_file` `offset` / `limit` clamping | `offset` ≥ 1 (0 → 1); `limit` ≥ 1 (0 → unset) | `read_file` (clamped at the call site; no error) | `06-agent-model.md` |
| Tool telemetry input / output truncation | **4 KiB** middle-truncated | `agent.tool.call`, `agent.tool.result` event payloads (LLM conversation is untruncated) | `06-agent-model.md` |
| Tool default timeout | **120 s** | All tools unless overridden; combined with pi-agent's signal via `AbortSignal.any` | `06-agent-model.md` "Tool" |
| `bash` timeout | **300 s** | `bash` (per invocation; SIGTERM then SIGKILL) | `06-agent-model.md` |
| `session_id` length | **26 chars** (ULID via `ulid@2.3.0`) | Per-team session id; per `addrs/13-platform-entry-function.md` and ADR 18 | `08-memory.md`, `addrs/13` |
| `team_id` charset | `[A-Za-z0-9_-]{1,32}` | `defaultTeam` in `settings.json`, `--team` flag, team-blueprint loader; loader hard-fails on non-conforming directory names with `invalid team_id: <value>` (spaces and special chars rejected) | `10-configuration.md` (this doc), `06-agent-model.md` |
| Agent role (filename stem) charset | `[A-Za-z0-9_-]{1,64}` | Team-blueprint loader validates the `.md` filename stem; hard-fails on non-conforming stems with `invalid role: <stem>` (spaces and special chars rejected). The `agent_key = {role}-{N}` is therefore constrained. | `06-agent-model.md`, ADR 16 |
| `notify` `topic` constraints | non-empty, not starting with `agent.`, not starting with `{team_id}.`, no null / control chars | `notify` tool validation | `06-agent-model.md` |
| `subscribe:` topic constraints | not starting with `agent.` (rejected with `subscribe_rejects_platform_topic`) | Team-blueprint loader | `06-agent-model.md` |
| `subscribe:` wildcards | not interpreted in v1 (exact-match subject only) | Team-blueprint loader | `06-agent-model.md` |
| Workspace root | `process.cwd()` (not configurable) | All file-tool path resolution | `09-deployment.md`, `06-agent-model.md` |
| `auth.json` mode | `0600` (sensitive) | `jie login`, `jie logout`, `jie --api-key` | `10-configuration.md`, `12-installation.md` |
| `storage.db` mode | `0600` (sensitive — holds `memory_turns`) | First-open creation | `09-deployment.md` |
| `.jie/` directory mode | `0755` | First-creation by the platform | `09-deployment.md` |

The limits are platform-wide. Per-tool overrides exist only where called out: `bash` uses 300 s (vs. the 120 s default); individual tools may declare their own content caps. v1 exposes no user-facing knob for any of these; the values are the contract. Day 2+ may add `settings.json` fields to make some of these configurable (likely candidates: the streaming tunables, the bash timeout, and the tool default timeout — content caps are less likely to be tunable because they map to platform-level SQL/HTTP limits).

## Config Validation

The platform validates settings at startup. **Any of the following is a hard fail with exit code1:**

| Condition | Error |
|---|---|
| `settings.json` JSON parse error | Line/column from the parser. |
| `defaultProvider` is not a string (wrong JSON shape) | `defaultProvider must be a string` |
| `defaultProvider` is a string but is not a known `KnownProvider` | **WARN to stderr, treat the field as absent.** Init-state behavior: model resolution falls through to per-agent `model:` only, and (if none) surfaces "No model has been selected" at startup pre-check. |
| `defaultModel` is not a string (wrong JSON shape) | `defaultModel must be a string` |
| `defaultTeam` does not match `[A-Za-z0-9_-]{1,32}` | `invalid defaultTeam: <value>` |
| `--team <id>` flag is given but `<id>` is not installed | `team '<id>' not found: checked .jie/teams/<id>/ and ~/.jie/teams/<id>/` |
| `--team <id>` flag is given but `<id>` does not match `[A-Za-z0-9_-]{1,32}` | `invalid team id: <value>` (same charset as `defaultTeam`; prevents path-traversal via `..` or special chars) |

Stale `defaultTeam` (value set but team not installed) is **not** a hard fail — see "Stale `defaultTeam` Recovery" above.

The platform never fails on "no teams available": the built-in minimal team is the last-resort fallback when no user teams are installed and no `--team` / `defaultTeam` is given. See `minimal-team.md`.

### `auth.json` Validation

`auth.json` is not validated by the platform — its schema is owned by `@earendil-works/pi-ai`'s `FileAuthStorageBackend`, which writes the canonical shape and refuses to read malformed entries at the provider-call boundary. A malformed `auth.json` surfaces as a credential resolution error at LLM call time, not at startup.

## MCP Server Configuration

> **Day 2.** Per ADR 15, MCP client integration is **not in v1 MVP**. The platform's `startJie` does not load `mcp.json` in v1. The schema below is forward-looking; it is the design that ships when the MCP client lands. The `ToolRegistry`'s `mcp:<server>:<tool>` and `mcp:<server>:*` spec syntax returns zero matches in v1, so an agent `.md` that lists MCP tools fails the cascade-policy startup check.

MCP servers are configured in `.jie/mcp.json` (project-level; `~/.jie/mcp.json` for global defaults). The project file is discovered by walking up from CWD to find `.jie/`. The platform connects to every listed server at startup, fetches tool catalogs, and registers tools into `ToolRegistry`.

### Schema

```json
{
  "servers": {
    "<name>": {
      "transport": "stdio" | "http",
      "command":  "<string>",
      "args":     ["<string>"],
      "url":      "<string>",
      "auth": {
        "token_env": "<string>"
      }
    }
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `transport` | `"stdio" \| "http"` | Required. |
| `command` | string | Required for stdio transport. |
| `args` | string[] | Optional. Arguments to the stdio command. |
| `url` | string | Required for http transport. |
| `auth.token_env` | string | Optional. Name of an env var containing a bearer token. **This is the MCP server's auth token, not the LLM provider's API key** — `auth.json` is the sole LLM credential source in v1 (per ADR 21); the no-env-var rule does not apply to MCP server auth. |

The TypeScript type consumed by the platform (forward-looking — used by `createJiePlatform` once the MCP client lands per ADR 15):

```typescript
// packages/jie-platform/types/mcp.ts (forward-looking — used by createJiePlatform once the MCP client lands)

export interface McpServerConfig {
  transport:  'stdio' | 'http';
  command?:   string;        // stdio only
  args?:      string[];      // stdio only
  url?:       string;        // http only
  auth?: {
    token_env?: string;      // name of an env var containing a bearer token
  };
}
```

The `McpServerConfig` field-validity rules (`command` required for stdio, `url` required for http) are enforced by the MCP client when it reads the config at startup; the type itself permits either field to be absent because the discriminator is `transport`. A stdio entry with `url` set (or vice versa) is silently ignored at the field level — the client only reads the field it expects for the transport. In v1 (per ADR 15) the platform does not load `mcp.json`; the type is declared for forward compatibility.

### Resolution

- **`~/.jie/mcp.json`** — global (shared across projects).
- **`.jie/mcp.json`** (project; discovered by walking up from CWD) — project-level overrides. Server entries with the same `<name>` replace the global entry entirely (no merge).

### Startup Behavior

1. Load merged `mcp.json`.
2. For each server: attempt to connect.
3. **If connect fails**: log a `WARN` with the server name and reason. Do not register that server's tools. **Startup continues** with the rest of the team. The team's `ToolRegistry` will simply lack that server's tools.
4. **If connect succeeds**: fetch tool catalog, register tools into `ToolRegistry`.
5. Stdio subprocesses are monitored. If a server dies mid-session, its in-flight tool calls time out or return `mcp_server_unreachable`; subsequent calls also return errors. Agents handle these as tool-result errors.

### Cascade: Agent Load Failure

If an agent's `.md` `tools:` list references a tool that cannot be resolved (e.g. from a failed MCP server, or an unknown built-in name), the **agent's `AgentSoul` construction fails**, and the team's load fails with an error citing the missing tool. The platform's policy is:

- MCP connect failure → soft (WARN, skip, continue).
- Tool resolution failure inside an agent → hard (the team's `loadTeam` fails).
- **Model resolution failure** (any agent's `model:` cannot be resolved — no `model:` in `.md`, and the merged `settings.json` does not provide a resolvable default) → hard (the team's `loadTeam` fails) with the same error message as `startJie`'s pre-check: "No model has been selected, please login and select a default model." The TUI displays the error in the input area; the previously-active team keeps running.

Per-team scope (per ADR 19): a team whose blueprint depends on a missing tool or missing model fails fast with a precise error. Other loaded teams continue running unaffected. The CLI / TUI surfaces the failure to the user; the user can either fix the blueprint, install the missing tool, or switch to a different team. In v1 (no MCP), the only tools available are the built-ins, so an agent `.md` listing `mcp:*` tools fails the cascade check.

## LLM Provider Configuration

The platform does not assume a model or provider. The user picks both via CLI commands (`jie login`, `jie model`) before the first run, and the platform persists the choice to `~/.jie/settings.json` and `~/.jie/auth.json`. After that, the platform always has a runnable configuration; before that, every startup fails with a clear error pointing at the right command.

### Auth: `auth.json`

JSON, single location (`~/.jie/auth.json`), file mode `0600`. The schema mirrors pi's `auth.json`:

```json
{
 "anthropic": { "type": "api_key", "key": "sk-ant-..." },
 "openai": { "type": "api_key", "key": "sk-..." },
 "github-copilot": { "type": "oauth", "access": "...", "refresh": "...", "expires":1234567890 }
}
```

The schema is whatever `@earendil-works/pi-ai`'s `FileAuthStorageBackend` writes — Jie does not redefine it. In v1 the `key` field is a plain string (no `!cmd` interpolation, no `$ENV_VAR` expansion; per ADR 21). OAuth tokens (anthropic, openai-codex, github-copilot) are stored here after `jie login` and refreshed automatically by pi-ai at call time.

The CLI mutates `auth.json` via `jie login` and `jie logout`. The file is not edited by hand in v1; `jie login` is the supported entry point.

### Credentials Resolution Order

For a given provider, credentials resolve in this order at call time (per ADR 21 — v1 has **no environment-variable fallback**; `auth.json` is the sole credential source):

| Order | Source | Notes |
|---|---|---|
|1 | `jie --api-key <key>` flag | Writes `auth.json` for the resolved provider. The flag is the inlined `jie login --provider <id> --api-key <key>` flow. The entry persists across runs. |
|2 | `~/.jie/auth.json` entry for the provider | Set by `jie login` or `jie --api-key`. Sole credential source at LLM-call time. |
|3 | Custom provider keys from `~/.jie/models.json` | Day2 concern. v1 has no `models.json`. |

**No env-var fallback in v1.** The platform does not read provider environment variables. `auth.json` is the only credential source. A user with a key in their shell runs `jie --api-key <key>` once; the entry is then in `auth.json` and persists across runs. The "Auth file beats env" rule from the previous version of this spec is no longer needed because there is no env to beat.

The `auth.json` `key` field in v1 is a plain string (no `!cmd` interpolation, no `$ENV_VAR` expansion). The previous interpolation grammar was a pi-ai concern that is no longer reachable.

If credentials are missing for the resolved provider, `getModel()` does not throw; the error surfaces when the LLM call is attempted. The agent receives a tool-like error in its conversation and may degrade gracefully.

### Model Resolution

A model's `(provider, modelId)` tuple is resolved at startup, before any `AgentSoul` is constructed. The `startJie` entry walks every agent in the blueprint and resolves each one against the chain below. Resolution is per-agent and may produce different `(provider, modelId)` per role.

| Order | Source | When it fires |
|---|---|---|
|1 | `model: <provider>/<modelId>` in agent `.md` frontmatter | Always wins when present. Team author pinned this agent explicitly. |
|2 | Merged settings: `defaultProvider` + `defaultModel` | Agent has no `model:`; user has set both fields. |
|3 | Merged settings: `defaultProvider` only | Agent has no `model:`; user has set only the provider. Model id is taken from `@earendil-works/pi-ai`'s `defaultModelPerProvider[defaultProvider]`. |
|4 | (none) | **No** model resolved; `TeamManager.loadAll()` publishes `system.error` with `team '<id>' failed to load: NO_MODEL_ERROR` and the team is omitted from `handle.teams` — see `06-agent-model.md` "Team Loading". |

The platform delegates the per-provider fallback in step3 to `pi-ai`'s built-in `defaultModelPerProvider` table. Jie does not maintain its own default-model table; if `pi-ai` ships an updated default for a provider, Jie inherits it on the next release with no spec change.

`AgentSoul.model` is still a required field at the *type* level — it just may be inherited from settings rather than declared in the agent's `.md`. When a soul fails to resolve (row 4 above), the team is omitted from the loaded map rather than blocking startup — `handle.teams` carries only teams whose souls were successfully resolved. The platform's `getApiKey(provider)` resolver returns the entry from `auth.json` for the resolved provider (per ADR 21); pi-ai's `getEnvApiKey` is no longer used.

Per-team model resolution is owned by `TeamManager.loadImpl` (called from `loadAll` during `handle.start()`); failures publish `system.error` rather than aborting startup, per `06-agent-model.md` "Team Loading".

## CLI / TUI Surface

The commands that mutate persistent files:

| Command | File it writes | Notes |
|---|---|---|
| `jie login` | `~/.jie/auth.json` | Interactive: pick provider, then OAuth or paste API key. `--provider <id> --api-key <key>` for headless use. |
| `jie logout [<provider>]` | `~/.jie/auth.json` | Clears the entry for the named provider; no argument clears all. |
| `jie model <provider>/<modelId>` | `~/.jie/settings.json` | Splits on first `/`; sets `defaultProvider` and `defaultModel`. |
| `jie team <id>` | `.jie/settings.json` or `~/.jie/settings.json` | Scope-aware: writes to the same scope as the team's install location. TUI hot-swaps the running team; CLI takes effect on next invocation. |
| `jie team` (no arg) | (read-only) | Prints current `defaultTeam` and installed teams. |

The `--team <id>` flag is a one-shot override for `jie` and `jie -p`; the TUI does not have a one-shot equivalent — use `/team <id>` for both persistence and hot-swap.

`jie model <provider>/<modelId>` takes effect on the next LLM call (no restart, matching pi's convention). The platform re-resolves `(provider, modelId)` from merged settings on every LLM call; `/model` writes to settings and the next call picks up the change.

`jie model` writes to **global** settings (`~/.jie/settings.json`). Project-level overrides go in `.jie/settings.json`, edited by hand. This mirrors pi's split: `/login` and `/model` are global-only; project settings are file-edited.

Unstructured text input for `provider` and `model` in CLI args and TUI slash commands follows pi's convention `<provider>/<modelId>`. Two separate flags (e.g. `--provider` and `--model`) are not accepted in v1; the slash is the canonical separator.

## Provider Configuration (v1)

No provider-level config in `settings.json` for v1. Base URLs, custom endpoints, and provider-specific options (e.g., `azureBaseUrl`, `vertex region`) are not configurable — agents use pi's default endpoints. Custom provider configuration is a Day2 concern.
