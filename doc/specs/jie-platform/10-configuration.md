# Configuration

Platform-level configuration surface: how Jie discovers and loads settings, credentials, models, and teams.

## Persistent Files

| File | Scope | Sensitivity | Holds |
|---|---|---|---|
| `~/.jie/settings.json` | Global user settings | Plain JSON | `defaultProvider`, `defaultModel`, `defaultTeam`, `defaultEffort`, `hooks` (see "Hooks") |
| `.jie/settings.json` | Project override | Plain JSON | Same fields; deep-merge over global, except `hooks` which merge additively |
| `~/.jie/auth.json` | Global credentials | mode `0600` | API keys, OAuth tokens (schema owned by pi-ai) |
| `~/.jie/models.json` | Global provider definitions | Plain JSON | Custom providers: base URLs, APIs, keys, model catalogs |
| `.jie/models.json` | Project provider overrides | Plain JSON | Same shape; a project entry replaces the global entry of the same provider name |
| `~/.jie/mcp.json`, `.jie/mcp.json` | MCP server definitions | Plain JSON | Platform connects stdio servers at startup; project overrides per name (ADR 4) |
| `.jie/teams/<id>/TEAM.md` | Team wiring | Plain text | `leader:` declaration in YAML frontmatter + prose |
| `.jie/teams/<id>/<role>.md` | Agent definition | Plain text | YAML frontmatter (`model?`, `tools`, `subscribe?`, `skills?`) + prose body (system prompt) |
| `~/.jie/skills/<name>/SKILL.md` | Global skill | Plain text | YAML frontmatter (`name?`, `description`) + prose body; see "Skills" |
| `.jie/skills/<name>/SKILL.md` | Project skill | Plain text | Same shape; a project skill overrides a global skill of the same name |
| `~/.jie/AGENTS.md`, `~/.jie/CLAUDE.md` | Global context | Plain text | Auto-loaded instructions; see "Context Files" |
| `<ancestor>/AGENTS.md`, `<ancestor>/CLAUDE.md` | Project context | Plain text | Read from every ancestor of CWD (root→CWD); see "Context Files" |

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
| `defaultEffort` | string | Default reasoning effort: one of `off` \| `low` \| `medium` \| `high` \| `max`. Absent means `off`. Applied at team load and live to running agents inheriting it. |

**Unknown field policy.** Unrecognized top-level fields are tolerated (warned, ignored) so future versions can land new settings without breaking old files. Unrecognized *values* for recognized fields follow the same policy — e.g. an unknown `defaultProvider` is WARN+ignore (treated as absent; model resolution falls through and may surface `NO_MODEL_ERROR` at team load). Shape errors (e.g. `defaultProvider: 42`) are a hard fail — malformed input, not an unfamiliar value.

The read-side type (loaded by `SettingsStore`, surfaced on `handle.settings` per ADR 13):

```typescript
// packages/jie-platform/config/types.ts
export interface Settings {
  readonly defaultProvider?: string;
  readonly defaultModel?: string;
  readonly defaultTeam?: string;
  readonly defaultEffort?: EffortLevel;
  readonly modelFilters?: ReadonlyArray<string>;
}
```

Each field may be absent (the user has not run `jie model` yet); the resolution chains below treat absent as "fall through to the next source". The platform never persists its own fields — the only writers are the `setDefaultProvider` / `setDefaultTeam` / `setDefaultEffort` / `setModelFilters` commands (CLI `jie model` / `jie team`, TUI `/model` / `/effort` / `/model-filter`). `modelFilters` holds case-insensitive substring patterns that narrow the TUI's `/model` candidate list; it does not affect model resolution.

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

### Setting `defaultEffort`

TUI `/effort <level>` executes `setDefaultEffort`, writing `defaultEffort` to the **global** `settings.json` (like `setDefaultProvider`). `/effort` with no argument executes `getDefaultEffort` and shows the current default (`off` when absent). The value applies at team load — `TeamManager.load` reads the merged setting and threads it into `AgentBodyParams.effort` — and immediately to every live agent inheriting the default: the command publishes `user.effort.update` after the write, and each body applies it (`06-agent-model.md`, "Effort update"). `JieAgentBody` maps effort onto the pi-agent `thinkingLevel` (`max` → `xhigh`, other levels pass through; pi's own `off` level means no extended thinking) and reports it through `agent.model.assigned` and `ModelInfo.effort`. Out-of-vocabulary values in the file hard-fail `INVALID_CONFIG` (closed vocabulary, like the `defaultTeam` charset).

### Team Swap (TUI)

`/team <id>` executes the platform's `team` command (`TeamManager.load(teamId)`); the TUI is a passive observer of the resulting `system.team.loaded` event:

1. **Already loaded in this process** (same session) → the command returns the existing `TeamInfo` with no body-lifecycle work — the team was alive; the TUI just wasn't watching.
2. **Not loaded** → parse the blueprint (lookup paths above), resolve each soul's model ("Model Resolution"), construct and start the bodies, record the team's `session_id` in the platform's private `Map<team_id, session_id>`, and publish `system.team.loaded`. A team previously active in this process reuses its recorded `session_id`, so `restore()` returns its prior `memory_turns` rows (`08-memory.md`). A team new to this process gets a fresh ULID.
3. **`/resume <session>`** → `listSessions` picker, then the `resumeSession` command: any existing bodies of that team are stopped, the session map entry is replaced, and bodies are rebuilt on the resumed session. `resumeSessionId` is validated by `hasSession`; an unknown id fails the command (`UNKNOWN_SESSION`).

The TUI re-renders from `system.team.loaded` (agent roster, leader focused) and thereafter publishes prompts to the focused agent's `agentKey` via `handle.prompt` — there is no leader-specific prompt topic. **The previously-active team is not stopped**: its bodies keep their `memory_turns` rows, in-memory prompt queue, and LLM context, and continue processing queued prompts autonomously — the platform holds no active-team state (ADR 26); the TUI just stops displaying it.

Load failures fail the command, not the process: an unresolvable soul is skipped; a team with no resolvable model at all fails with `NO_MODEL_ERROR`. Other loaded teams continue unaffected.

## Skills

Skills are project/global instruction sets an agent loads on demand (progressive disclosure). A skill is a directory `<name>/SKILL.md` with YAML frontmatter and a prose body.

### Discovery

The `SkillManager` cradle singleton is built at platform boot by scanning `~/.jie/skills/` (global) and `.jie/skills/` (project, walk-up); a project skill overrides a global skill of the same name. Only `<dir>/SKILL.md` entries are considered; other files and directories without a `SKILL.md` are ignored.

### SKILL.md format

| Field | Required | Meaning |
|---|---|---|
| `name` | no | Defaults to the directory name; when present must equal it. Charset `[a-z0-9-]{1,64}`, no leading/trailing/consecutive hyphens — the directory name carries the constraint. |
| `description` | yes | Non-empty, ≤ 1024 chars. Surfaced to the model so it can decide when to load the skill. |

An invalid skill (bad name charset, missing/over-long description, name/directory mismatch, malformed frontmatter) is reported as a diagnostic and skipped (WARN), never a startup failure — consistent with MCP resource loading.

### Manifest opt-in

A skill is visible to an agent only if the agent's `skills:` frontmatter lists it (spec strings, wildcards allowed, resolved through the `SkillManager` with the same anchored-glob semantics as `tools`). Matched skills are rendered into an `<available_skills>` block appended to the agent's system prompt — name, description, and location only; the agent reads the body with `read_file`, resolving relative paths against the skill directory. Skills not listed for an agent are never surfaced to it.

## Context Files

`AGENTS.md` and `CLAUDE.md` are auto-loaded instruction files injected into every agent's system prompt — shared project state, with no manifest opt-in (unlike skills). The platform reads them, in order, from the home jie dir (`~/.jie/`) and then from every ancestor of the CWD ordered root-down-to-CWD; within a directory `AGENTS.md` precedes `CLAUDE.md`. Missing or unreadable files are skipped and a path is read at most once. The assembled `<context_files>` block is the boot-time `systemContextBlock` cradle singleton, which the prompt composer places before the role prose; file content is injected verbatim.

## Hooks

Hooks run user-defined shell commands at agent-lifecycle points, following the Claude Code hook pattern. They are shared project state (no manifest opt-in) and apply to every agent.

### Configuration

Hooks live under the `hooks` key of `settings.json` (`~/.jie/settings.json` global, `.jie/settings.json` project). This key is read directly by the hooks module — it is *not* surfaced on `Settings` and does *not* follow the settings deep-merge: handlers from both scopes are concatenated **additively** per event (global first, then project), so a project `hooks` entry adds to, never replaces, the global handlers.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "bash|write_file", "hooks": [ { "type": "command", "command": "./guard.sh", "timeout": 30 } ] }
    ]
  }
}
```

Each event maps to an array of matcher groups; a group carries a `matcher` and an array of command handlers under `hooks`. A handler's `type` must be `"command"`; `timeout` is in seconds (default `60`). Parsing is lenient — a broken hooks block never fails startup and never discards the rest of the settings. A malformed group or handler is skipped and reported as a `jie.platform.hooks` WARN diagnostic naming the offending file (consistent with the skills/MCP loaders); an absent `hooks` key is normal and silent, and unknown event keys are ignored silently for forward compatibility.

### Events

| Event | Fires | Matcher | Effect |
|---|---|---|---|
| `PreToolUse` | before each tool call (pi `beforeToolCall`) | tool-name regex | block → the tool is not executed; the agent gets an error tool result with the reason |
| `PostToolUse` | after each tool call (pi `afterToolCall`) | tool-name regex | block → the tool result is replaced with an error result (reason); `additionalContext` → appended to the tool result content |
| `UserPromptSubmit` | before a user prompt is dispatched | none | block → the prompt is dropped and a `system.error` carries the reason; `additionalContext` → appended to the prompt text |
| `SessionStart` | once when a body starts | none | informational (output ignored) |
| `Stop` | when an agent run ends (`agent_end`) | none | informational (output ignored) |

A `matcher` is a regular expression tested against the tool name; an absent, empty, or `*` matcher matches every tool. Matchers apply only to the tool events: an invalid regex, or any matcher set on a non-tool event, is reported as a diagnostic and treated as match-all. `PreToolUse` and `PostToolUse` short-circuit on the first blocking handler; `PostToolUse` and `UserPromptSubmit` accumulate `additionalContext` (last non-null wins).

### Execution contract

Each handler runs as `/bin/sh -c "<command>"` with the identity's `cwd`, the platform environment, and a JSON payload on stdin. The common fields are always present; event-specific fields are added per event:

```json
{ "session_id": "...", "hook_event_name": "PreToolUse", "cwd": "...", "team_id": "...", "agent_key": "...", "role": "...", "tool_name": "bash", "tool_input": {} }
```

Event-specific fields: `tool_name` + `tool_input` (PreToolUse), plus `tool_response` (PostToolUse), plus `prompt` (UserPromptSubmit); SessionStart and Stop add none. A handler that exceeds its timeout is killed as a whole — the `/bin/sh` session is spawned detached, so SIGTERM (then SIGKILL after a 5s grace) reaches the entire process group, backgrounded descendants included — and is treated as non-blocking. A handler that fails to execute at all (e.g. a stale `cwd`) is likewise a non-blocking error, never a crash.

The exit code and stdout decide the outcome:

| Signal | Meaning |
|---|---|
| exit `2` | block; reason is the JSON `reason` if present, else the trimmed stderr |
| stdout JSON `continue: false` or `decision: "block"` | block; reason from JSON `reason` |
| stdout JSON `hookSpecificOutput.additionalContext` | context appended to the tool result / prompt |
| exit `0`, no blocking JSON | allow, no effect |
| any other non-zero exit, no blocking JSON | non-blocking error; a failed handler never blocks the agent |

stdout that is not a valid JSON object is ignored (treated as no output).

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
| `bash` timeout | **300 s** (SIGTERM then SIGKILL, whole process group) | `bash` | `06-agent-model.md` |
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

`bootPlatform` reads `mcp.json` from `~/.jie/` (global) and the project `.jie/` (walk-up); a project entry overrides the global entry of the same server name, other entries pass through. Schema (`McpServerConfig`):

```json
{ "servers": { "<name>": { "transport": "stdio", "command": "...", "args": ["..."], "auth": { "tokenEnv": "..." } } } }
```

`transport` is `stdio` (`command` + `args`) or `http` (`url`). Server names are restricted to `[A-Za-z0-9._-]{1,64}` so registry keys and `mcp:<server>:<glob>` tool specs stay unambiguous; `args` defaults to `[]` and `auth` to `null`.

At startup the platform connects to every configured server and registers each catalog into the `ToolRegistry` as `mcp:<name>:<tool>`. The `Tool.name` the LLM sees is sanitized to `[a-zA-Z0-9_-]{1,64}` — provider tool-name APIs reject colons — while the human-facing `label` keeps the colon form.

Failure modes:
- Malformed `mcp.json` (parse error, unknown transport, missing `command`/`url`, invalid server name): hard `INVALID_CONFIG` at startup, like `settings.json`.
- `http` transport: WARN+skip (v1 implements stdio only).
- A server that fails to connect or list tools: WARN+skip; startup continues without that server's tools.
- Tool-resolution failure inside an agent's `tools:` list fails the team load with an error citing the missing tool.

`auth.tokenEnv` names the env var holding the MCP server's bearer token, not an LLM credential — the no-env-var rule below applies to LLM providers only. Stdio servers inherit the platform environment, so the token reaches them through env inheritance.

Platform shutdown (`JiePlatform.shutdown()`, invoked by the CLI on every exit path) closes all stdio connections: end stdin, wait a grace period, then kill.

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

The `key` field is a plain string — no `!cmd` interpolation, no `$ENV_VAR` expansion. `jie login` (interactive, or `--provider <id> --api-key <key>` for headless use) and `jie logout [<provider>|*]` are the supported mutators; the file is not edited by hand.

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
| `jie logout [<provider>\|*]` | `~/.jie/auth.json` | Clears one provider, or all (`*`, the no-arg default). |
| `jie model <provider>/<modelId>` | `~/.jie/settings.json` (global) | Splits on the first `/`. `jie model show` prints the current selection. |
| `jie team <id>` | scope-aware `settings.json` | Persists `defaultTeam`; does not load the team. `jie team` prints current + installed. |
| `jie --api-key <key>` | `~/.jie/auth.json` | Inlined login for the resolved provider. |

Runtime flags (no persistence): `--team <id>` (one-shot load override for `jie` and `jie -p`), `--resume <sessionId>` (load a team on a prior session), `--in-memory` (SQLite `:memory:`; nothing persists), `-p "..."` (one-shot print mode).

TUI slash commands run the same platform commands in-session — no restart: `/login`, `/logout <provider>|*`, `/model <provider>/<modelId>`, `/model-filter <add|remove|list> <pattern>` (settings `modelFilters`; narrows the `/model` popup; `list` prints the stored patterns; an `add` that would match no available model is rejected), `/team [<id>]` (hot-load; "Team Swap" above), `/resume` (session picker), `/rename <name>` (names the active session; `08-memory.md` "List and rename"). The `<provider>/<modelId>` slash convention is pi's; two separate flags are not accepted.
