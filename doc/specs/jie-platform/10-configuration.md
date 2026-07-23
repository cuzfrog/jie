# Configuration

Platform-level configuration surface: how Jie discovers and loads settings, credentials, models, and teams.

## Persistent Files

| File | Scope | Sensitivity | Holds |
|---|---|---|---|
| `~/.jie/settings.json` | Global user settings | Plain JSON | `defaultProvider`, `defaultModel`, `defaultTeam` |
| `.jie/settings.json` | Project override | Plain JSON | Same fields, deep-merge over global |
| `~/.jie/auth.json` | Global credentials | mode `0600` | API keys, OAuth tokens (schema owned by pi-ai) |
| `~/.jie/models.json` | Global provider definitions | Plain JSON | Custom providers: base URLs, APIs, keys, model catalogs |
| `.jie/models.json` | Project provider overrides | Plain JSON | Same shape; a project entry replaces the global entry of the same provider name |
| `~/.jie/mcp.json`, `.jie/mcp.json` | MCP server definitions | Plain JSON | **Not loaded today** — forward-looking schema (ADR 4) |
| `.jie/teams/<id>/TEAM.md` | Team wiring | Plain text | `leader:` declaration in YAML frontmatter + prose |
| `.jie/teams/<id>/<role>.md` | Agent definition | Plain text | YAML frontmatter (`model?`, `tools`, `subscribe?`) + prose body (system prompt) |

`.jie/settings.json` is the only project-level user settings file — there is no project-level `auth.json`; credentials are global by design. The role identifier is the `.md` filename stem; there is no `name` frontmatter field.

### File-Format Convention

Config files (machine-edited, schema-validated) are **JSON**, parsed by the built-in `JSON.parse` — no external dep. Content files (LLM-authored system prompts with structured metadata) are **`.md` with YAML frontmatter**, parsed by `yaml`. This matches `@earendil-works/pi-coding-agent`'s split.

### Discovery

`.jie/` is discovered by walking up from CWD; `~/.jie/` paths are fixed globals. Both `jie` (TUI) and `jie -p` share this behavior. If no `.jie/settings.json` is found, the platform runs with global-only settings — no interactive init flow.

## `settings.json`

Two locations, **project overrides global with deep-merge** (nested objects merge; top-level scalars and arrays replace).

| Field | Type | Description |
|---|---|---|
| `defaultProvider` | string | Provider id (e.g. `anthropic`, `openai`). |
| `defaultModel` | string | Model id within the provider. |
| `defaultTeam` | string | Last user-selected team. Charset `[A-Za-z0-9_-]{1,32}`. |

**Unknown field policy.** Unrecognized top-level fields are tolerated (warned, ignored) so future versions can land new settings without breaking old files. Unrecognized *values* for recognized fields follow the same policy — e.g. an unknown `defaultProvider` is WARN+ignore (treated as absent; model resolution falls through and may surface `NO_MODEL_ERROR` at team load). Shape errors (e.g. `defaultProvider: 42`) are a hard fail — malformed input, not an unfamiliar value.

The read-side type (loaded by `SettingsStore`, surfaced on `handle.settings` per ADR 13):

```typescript
// packages/jie-platform/config/types.ts
export interface Settings {
  readonly defaultProvider?: string;
  readonly defaultModel?: string;
  readonly defaultTeam?: string;
}
```

Each field may be absent (the user has not run `jie model` yet); the resolution chains below treat absent as "fall through to the next source". The platform never persists its own fields — the only writers are the `setDefaultProvider` / `setDefaultTeam` commands (CLI `jie model` / `jie team`, TUI `/model`).

## Team Selection

The platform resolves which team to run in this order (`TeamManager.resolveTeamId`):

| Order | Source | Notes |
|---|---|---|
|1 | Explicit id — `--team <id>` flag, or the `team` / `resumeSession` command's `teamId` | Hard fail (`TEAM_NOT_FOUND`) if not installed. |
|2 | Merged settings: `defaultTeam` | Used only if it resolves to an installed manifest; a stale value falls through (not an error). |
|3 | First installed user team | Alphabetical across `.jie/teams/*` and `~/.jie/teams/*`, deduped by id, excluding the built-in `minimal`. |
|4 | Built-in `minimal` team | Hardcoded last-resort fallback. See `minimal-team.md`. |

The platform never fails on "no teams available": step 4 always succeeds.

### Lookup Paths

A team id resolves to a manifest at one of (project wins, per ADR 24's `locate`):

| Order | Source | Lookup |
|---|---|---|
|1 | Project-local | `.jie/teams/<id>/TEAM.md` (under the `.jie/` found by walking up from CWD) |
|2 | Global | `~/.jie/teams/<id>/TEAM.md` |

The platform has no installed/uninstalled state beyond these paths.

### Setting `defaultTeam`

CLI `jie team <id>` executes `setDefaultTeam`: the write scope follows the team's install location — `.jie/teams/<id>/` exists → project `settings.json`; else global. If both exist, project wins. Not installed → `TEAM_NOT_FOUND` (exit 1); the team must be installed before it can be selected. The command persists only — it does not load or start the team.

TUI `/team <id>` does **not** persist; it hot-loads the team in the running session — see "Team Swap" below.

`jie team` / `/team` with no argument executes `getTeamInfo`: prints the current `defaultTeam` (or none) plus the installed team list. There is no explicit unset; a stale `defaultTeam` simply falls through at step 2, and the auto-selection is never persisted.

### Team Swap (TUI)

`/team <id>` executes the platform's `team` command (`TeamManager.load(teamId)`); the TUI is a passive observer of the resulting `system.team.loaded` event:

1. **Already loaded in this process** (same session) → the command returns the existing `TeamInfo` with no body-lifecycle work — the team was alive; the TUI just wasn't watching.
2. **Not loaded** → parse the blueprint (lookup paths above), resolve each soul's model ("Model Resolution"), construct and start the bodies, record the team's `session_id` in the platform's private `Map<team_id, session_id>`, and publish `system.team.loaded`. A team previously active in this process reuses its recorded `session_id`, so `restore()` returns its prior `memory_turns` rows (`08-memory.md`). A team new to this process gets a fresh ULID.
3. **`/resume <session>`** → `listSessions` picker, then the `resumeSession` command: any existing bodies of that team are stopped, the session map entry is replaced, and bodies are rebuilt on the resumed session. `resumeSessionId` is validated by `hasSession`; an unknown id fails the command (`UNKNOWN_SESSION`).

The TUI re-renders from `system.team.loaded` (agent roster, leader focused) and thereafter publishes prompts to the focused agent's `agentKey` via `handle.prompt` — there is no leader-specific prompt topic. **The previously-active team is not stopped**: its bodies keep their `memory_turns` rows, in-memory prompt queue, and LLM context, and continue processing queued prompts autonomously — the platform holds no active-team state (ADR 26); the TUI just stops displaying it.

Load failures fail the command, not the process: an unresolvable soul is skipped; a team with no resolvable model at all fails with `NO_MODEL_ERROR`. Other loaded teams continue unaffected.

## Workspace Inference

The workspace root is `process.cwd()`; no setting overrides it. **Project state** (`.jie/settings.json`, `.jie/teams/`, `.jie/mcp.json`, `.jie/models.json`) is discovered by walking up from CWD to find `.jie/`; **tool path resolution** (`bash` workdir, `read_file`, `write_file`) is rooted at CWD and does not walk. The two concerns are deliberately different — `.jie/` is project state, not the workspace. Launching `jie` from a subdirectory resolves team manifests at the project root but file paths in tool calls relative to the subdirectory.

Storage is **global**, not project state: the `ArtifactStore` and `memory_turns` share one SQLite file at `~/.jie/storage.db` across all projects (`04-storage.md`). The platform creates `~/.jie/` (mode `0755`) at startup if it does not exist.

## Streaming Tunables

Not user-configurable; the values are the contract.

| Constant | Value | Role |
|---|---|---|
| `stream_chunk_size` | `64` | Characters per `agent.stream.chunk` event. |
| `stream_flush_ms` | `200` | Max ms before flushing a partial stream chunk. |

See `03-event-system.md` "Streaming" for application.

## Platform Limits

Hard caps and charsets; not user-configurable. Each row points at the doc that applies the limit.

| Limit | Value | Where applied | Doc |
|---|---|---|---|
| Artifact key charset | `[A-Za-z0-9_./-]{1,256}` | `write_artifact`, `read_artifact`; `list` prefix is escaped, not validated | `04-storage.md` |
| Artifact content cap | **5 MiB** | `write_artifact` | `04-storage.md` |
| `web_fetch` body cap | **5 MiB** (truncated, `truncated: true`) | `web_fetch` | `06-agent-model.md` |
| `write_file` content cap | **5 MiB** | `write_file` | `06-agent-model.md` |
| `bash` stdout / stderr cap | **32 KiB** per stream (independent truncation) | `bash` | `06-agent-model.md` |
| `read_file` default truncation | **2000 lines OR 50 KiB** (whichever first; `offset` / `limit` override) | `read_file` | `06-agent-model.md` |
| Tool telemetry truncation | **4 KiB**, middle-truncated | `agent.tool.call` / `agent.tool.result` payloads (LLM conversation is untruncated) | `03-event-system.md` |
| Tool default timeout | **120 s** (combined with pi-agent's signal via `AbortSignal.any`) | All tools unless overridden | `06-agent-model.md` |
| `bash` timeout | **300 s** (SIGTERM then SIGKILL) | `bash` | `06-agent-model.md` |
| `session_id` | **26 chars** (ULID) | Per process × team | `08-memory.md`, ADR 17 |
| `team_id` charset | `[A-Za-z0-9_-]{1,32}` | `defaultTeam`, `--team`, blueprint loader (hard fail `invalid team_id: <value>`; blocks path traversal) | this doc |
| Role (filename stem) charset | `[A-Za-z0-9_-]{1,64}` | Blueprint loader (hard fail `invalid role: <stem>`); constrains `agent_key = {role}-{N}` | `06-agent-model.md` |
| `notify` `topic` | non-empty, no `agent.` prefix, no `{team_id}.` prefix, no null / control chars | `notify` validation | `06-agent-model.md` |
| `subscribe:` topics | no `agent.` prefix (platform topics are reserved); exact match only, no wildcards | Blueprint loader | `06-agent-model.md` |
| Workspace root | `process.cwd()` (not configurable) | All file-tool path resolution | `09-deployment.md` |
| `auth.json` mode | `0600` | `jie login` / `jie logout` / `--api-key` | this doc, `12-installation.md` |
| `storage.db` mode | `0600` (holds `memory_turns`) | First-open creation | `09-deployment.md` |
| `.jie/` directory mode | `0755` | First creation by the platform | `09-deployment.md` |

## Config Validation

The platform validates settings at startup. **Hard fail (exit 1):**

| Condition | Error |
|---|---|
| `settings.json` JSON parse error | Line/column from the parser. |
| `defaultProvider` / `defaultModel` wrong JSON shape | `<field> must be a string` |
| `defaultTeam` outside `[A-Za-z0-9_-]{1,32}` | `invalid defaultTeam: <value>` |
| `--team <id>` not installed | `TEAM_NOT_FOUND` — `team '<id>' not found` |
| `models.json` malformed | `INVALID_CONFIG` with the file path and parser message |

A stale `defaultTeam` (set but not installed) is **not** a failure — it falls through the selection order (above). `auth.json` is not validated by the platform: its schema is owned by pi-ai's `FileAuthStorageBackend`, and a malformed entry surfaces as a credential error at LLM-call time, not at startup.

## MCP Server Configuration

**Not implemented today** (ADR 4). The platform boot (`bootPlatform`) does not read `mcp.json`, no MCP client connects at startup, and the `ToolRegistry`'s `mcp:<server>:<tool>` / `mcp:<server>:*` spec syntax resolves to zero tools — an agent `.md` listing MCP tools fails tool resolution at team load. The schema below is the forward-looking design that ships when the MCP client lands; no corresponding type exists in the codebase yet:

```json
{ "servers": { "<name>": { "transport": "stdio", "command": "...", "args": ["..."], "auth": { "tokenEnv": "..." } } } }
```

`transport` is `stdio` (`command` + `args`) or `http` (`url`); `auth.tokenEnv` names the env var holding the server's bearer token.

When it lands: `.jie/mcp.json` (project, walk-up) overrides `~/.jie/mcp.json` per server name; each server connects at startup and its catalog registers into `ToolRegistry`; a connect failure is WARN+skip (startup continues without that server's tools); tool-resolution failure inside an agent's `tools:` list fails the team load with an error citing the missing tool. `auth.tokenEnv` is the MCP server's token, not an LLM credential — the no-env-var rule below applies to LLM providers only.

## LLM Provider Configuration

The platform assumes no model or provider. The user picks both (`jie login`, `jie model`) before the first run; the choices persist to `~/.jie/settings.json` and `~/.jie/auth.json`. Before that, team load fails with a clear error (`NO_MODEL_ERROR`).

### Auth: `auth.json`

Single location (`~/.jie/auth.json`), mode `0600`. The schema is whatever pi-ai's `FileAuthStorageBackend` writes — Jie does not redefine it:

```json
{
 "anthropic": { "type": "api_key", "key": "sk-ant-..." },
 "openai": { "type": "api_key", "key": "sk-..." },
 "github-copilot": { "type": "oauth", "access": "...", "refresh": "...", "expires": 1234567890 }
}
```

The `key` field is a plain string — no `!cmd` interpolation, no `$ENV_VAR` expansion. `jie login` (interactive, or `--provider <id> --api-key <key>` for headless use) and `jie logout [<provider>]` are the supported mutators; the file is not edited by hand.

### Credentials Resolution

For a provider, credentials resolve at call time (`ModelRegistry.getApiKey`) — **no environment-variable fallback**:

| Order | Source | Notes |
|---|---|---|
|1 | `~/.jie/auth.json` entry for the provider | Set by `jie login` or `--api-key <key>` (which writes `auth.json` for the resolved provider — taken from `defaultProvider`, or unambiguous when only one provider is known). |
|2 | `apiKey` in the provider's `models.json` entry | Custom providers may carry their key in the provider definition. |

Missing credentials do not throw at resolution time; the error surfaces when the LLM call is attempted.

### Model Resolution

Per-soul at team load (`TeamManager.loadImpl`), before any body is constructed; different roles may resolve to different models:

| Order | Source | When it fires |
|---|---|---|
|1 | `model: <provider>/<modelId>` in the agent's frontmatter | Always wins when present. |
|2 | Merged settings: `defaultProvider` + `defaultModel` | Agent has no `model:` and both settings fields are set. |

An agent with no `model:` **and** no complete settings pair fails the team load with `NO_MODEL_ERROR` ("No model has been selected, please login and select a default model."). Otherwise the `provider/modelId` string (split on the first `/`) resolves through `ModelRegistry`: providers and models declared in `models.json` take precedence, falling back to pi-ai's built-in provider catalog. An unresolvable tuple (unknown provider or model, malformed string) **skips that soul silently** — a team can load with fewer agents than its blueprint declares; `system.team.loaded` carries only the agents that resolved.

`jie model <provider>/<modelId>` writes global settings (`setDefaultModel`) and takes effect at the next team load — bodies fix their model at construction, so a running team is unaffected until it is (re)loaded.

### Provider Configuration: `models.json`

Custom providers (self-hosted endpoints, proxies, non-built-in models) are declared in `models.json` — `~/.jie/models.json` global, `.jie/models.json` project (walk-up); a project entry replaces the global entry of the same provider name:

```json
{
  "providers": {
    "my-local": {
      "baseUrl": "http://192.168.1.6:12345",
      "api": "openai-completions",
      "apiKey": "...",
      "models": [{ "id": "qwen3.5-2b", "contextWindow": 32768 }]
    }
  }
}
```

| Field | Notes |
|---|---|
| `baseUrl` | Required. The provider's endpoint. |
| `api` | Required for providers pi-ai does not know; one of `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, `azure-openai-responses`, `openai-codex-responses`, `bedrock-converse-stream`, `google-vertex`, `mistral-conversations`. Optional for built-in providers (inherited). |
| `apiKey`, `headers` | Optional per-provider credentials / headers. |
| `models` | Model catalog entries (`id` required; `contextWindow`, `maxTokens`, `reasoning`, `cost`, …). |
| `modelOverrides` | Per-model-id overrides for built-in models (e.g. context window). |
| `compat` | API-specific compatibility options, passed through to pi-ai. |

A provider id that collides with a pi-ai built-in overrides that built-in's configuration (base URL, headers, model list). Malformed files fail startup with `INVALID_CONFIG` citing the path.

## CLI / TUI Surface

Commands that mutate persistent files:

| Command | Writes | Notes |
|---|---|---|
| `jie login [--provider <id> --api-key <key>]` | `~/.jie/auth.json` | Interactive provider pick (OAuth or pasted key); flag form is headless. |
| `jie logout [<provider>]` | `~/.jie/auth.json` | Clears one provider, or all. |
| `jie model <provider>/<modelId>` | `~/.jie/settings.json` (global) | Splits on the first `/`. `jie model show` prints the current selection. |
| `jie team <id>` | scope-aware `settings.json` | Persists `defaultTeam`; does not load the team. `jie team` prints current + installed. |
| `jie --api-key <key>` | `~/.jie/auth.json` | Inlined login for the resolved provider. |

Runtime flags (no persistence): `--team <id>` (one-shot load override for `jie` and `jie -p`), `--resume <sessionId>` (load a team on a prior session), `--in-memory` (SQLite `:memory:`; nothing persists), `-p "..."` (one-shot print mode).

TUI slash commands run the same platform commands in-session — no restart: `/login`, `/logout`, `/model <provider>/<modelId>`, `/team [<id>]` (hot-load; "Team Swap" above), `/resume` (session picker). The `<provider>/<modelId>` slash convention is pi's; two separate flags are not accepted.
