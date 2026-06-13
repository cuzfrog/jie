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

`/team <id>` (and `/team` followed by selection in the picker) takes effect immediately in the running TUI session:

1. All current agent bodies receive a graceful stop signal (bounded 10s shutdown, same as `jie` exit — see `09-deployment.md`).
2. The new team's blueprint is loaded per "Team Selection" rules (steps1–4).
3. New agent bodies are constructed. The `JieHandle`'s in-memory `Map<agent_key, session_id>` (`08-memory.md`) is consulted per body: if the `agent_key` has a recorded `session_id`, it is passed to the new body; the body uses it and `restore()` returns the prior `memory_turns` rows. If the `agent_key` is new in this process, the body mints a fresh `session_id` and the handle records it. The handle's map is in-memory only; on process exit it is lost.
4. The TUI re-renders: tabs/panels for the old agents close; tabs/panels for the new agents appear via the existing "Agent Discovery" primitives. Every prior team's conversation history is retained for the lifetime of the process run; switching back to a previously-active team restores its conversation in full.

TUI hint on success: `default team set`.

### Showing and Clearing

- `jie team` (no arg) / `/team` (no arg) — print the current `defaultTeam` from merged settings, plus the list of installed teams (project + global, deduped). TUI uses pi's selection-filter UI for picking.
- `jie team --unset` / `/team --unset` — clear `defaultTeam` from settings. Scope rule: writes to `.jie/settings.json` if it exists, else `~/.jie/settings.json`. Takes effect on the next invocation; the TUI does not have an "unset" mid-session behavior (clearing `defaultTeam` mid-session would leave the running team without a name to fall back to — restart `jie` to land on first-available).

## Workspace Inference

The workspace root is `process.cwd()`. The platform does not read any field to override it. Path resolution in tools (e.g. `bash` workdir enforcement, `read_file`, `write_file`) is rooted at CWD.

Implication: launching `jie` from a subdirectory of a project produces a workspace rooted at that subdirectory. Team manifest lookup and `settings.json` discovery walk up to the project root, but path resolution in tools does not — file paths in tool calls are relative to CWD, not the project root.

### ArtifactStore

Open at `{cwd}/.jie/artifacts.db`. SQLite, single-writer by design.

## Hard-Coded Platform Tunables

The following platform constants are not user-configurable in v1:

| Constant | Value | Role |
|---|---|---|
| `stream_chunk_size` | `64` | Characters per `agent.stream.chunk` event. |
| `stream_flush_ms` | `200` | Max ms before flushing a partial stream chunk. |

See `03-event-system.md` "Streaming" for how these are applied.

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

Stale `defaultTeam` (value set but team not installed) is **not** a hard fail — see "Stale `defaultTeam` Recovery" above.

The platform never fails on "no teams available": the built-in minimal team is the last-resort fallback when no user teams are installed and no `--team` / `defaultTeam` is given. See `minimal-team.md`.

### `auth.json` Validation

`auth.json` is not validated by the platform — its schema is owned by `@earendil-works/pi-ai`'s `FileAuthStorageBackend`, which writes the canonical shape and refuses to read malformed entries at the provider-call boundary. A malformed `auth.json` surfaces as a credential resolution error at LLM call time, not at startup.

## MCP Server Configuration

> **Day 2.** Per ADR 17, MCP client integration is **not in v1 MVP**. The platform's `startJie` does not load `mcp.json` in v1. The schema below is forward-looking; it is the design that ships when the MCP client lands. The `ToolRegistry`'s `mcp:<server>:<tool>` and `mcp:<server>:*` spec syntax returns zero matches in v1, so an agent `.md` that lists MCP tools fails the cascade-policy startup check.

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
| `auth.token_env` | string | Optional. Name of an env var containing a bearer token. |

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

If an agent's `.md` `tools:` list references a tool that cannot be resolved (e.g. from a failed MCP server, or an unknown built-in name), the **agent's `AgentSoul` construction fails**, and the whole team startup fails with an error citing the missing tool. The platform's policy is:

- MCP connect failure → soft (WARN, skip, continue).
- Tool resolution failure inside an agent → hard (startup fails).

This means a team with a working MCP server starts cleanly; a team whose blueprint depends on a missing MCP server fails fast with a precise error. In v1 (no MCP), the only tools available are the built-ins, so an agent `.md` listing `mcp:*` tools fails the cascade check.

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

The schema is whatever `@earendil-works/pi-ai`'s `FileAuthStorageBackend` writes — Jie does not redefine it. The `key` field supports command execution (`!cmd`), env interpolation (`$ENV_VAR` / `${ENV_VAR}`), and literal values; see pi's `providers.md` for the full interpolation grammar. OAuth tokens (anthropic, openai-codex, github-copilot) are stored here after `jie login` and refreshed automatically by pi-ai at call time.

The CLI mutates `auth.json` via `jie login` and `jie logout`. The file is not edited by hand in v1; `jie login` is the supported entry point.

### Credentials Resolution Order

For a given provider, credentials resolve in this order at call time:

| Order | Source | Notes |
|---|---|---|
|1 | `jie --api-key <key>` flag | One-shot, single run. The `jie` binary's top-level flag (Day2: per-call overrides via the same flag). |
|2 | `~/.jie/auth.json` entry for the provider | Set by `jie login` or `jie logout`-cleared. |
|3 | Provider's environment variable | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, etc. (See full mapping below.) |
|4 | Custom provider keys from `~/.jie/models.json` | Day2 concern. v1 has no `models.json`. |

Auth file beats env. This means `jie login` (which writes to `auth.json`) wins over a stale env var — the right precedence for the case where the user rotated credentials via the CLI but a service supervisor still exports the old env var.

**Provider → environment variable mapping** (used in step3 above):

| Provider | Environment Variable |
|---|---|
| `anthropic` | `ANTHROPIC_OAUTH_TOKEN` (first), then `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `google` | `GEMINI_API_KEY` |
| `google-vertex` | `GOOGLE_CLOUD_API_KEY` (or ADC via `GOOGLE_APPLICATION_CREDENTIALS`) |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `cerebras` | `CEREBRAS_API_KEY` |
| `huggingface` | `HF_TOKEN` |
| `fireworks` | `FIREWORKS_API_KEY` |
| `together` | `TOGETHER_API_KEY` |
| `github-copilot` | `COPILOT_GITHUB_TOKEN` |
| `amazon-bedrock` | AWS SDK credential chain (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, or IAM role) |

For the canonical mapping, see `@earendil-works/pi-ai`'s `env-api-keys.ts`.

If credentials are missing for the resolved provider, `getModel()` does not throw; the error surfaces when the LLM call is attempted. The agent receives a tool-like error in its conversation and may degrade gracefully.

### Model Resolution

A model's `(provider, modelId)` tuple is resolved at startup, before any `AgentSoul` is constructed. The `startJie` entry walks every agent in the blueprint and resolves each one against the chain below. Resolution is per-agent and may produce different `(provider, modelId)` per role.

| Order | Source | When it fires |
|---|---|---|
|1 | `model: <provider>/<modelId>` in agent `.md` frontmatter | Always wins when present. Team author pinned this agent explicitly. |
|2 | Merged settings: `defaultProvider` + `defaultModel` | Agent has no `model:`; user has set both fields. |
|3 | Merged settings: `defaultProvider` only | Agent has no `model:`; user has set only the provider. Model id is taken from `@earendil-works/pi-ai`'s `defaultModelPerProvider[defaultProvider]`. |
|4 | (none) | **Hard fail** at startup pre-check — see `06-agent-model.md` "Startup Pre-Check". |

The platform delegates the per-provider fallback in step3 to `pi-ai`'s built-in `defaultModelPerProvider` table. Jie does not maintain its own default-model table; if `pi-ai` ships an updated default for a provider, Jie inherits it on the next release with no spec change.

`AgentSoul.model` is still a required field at the *type* level — it just may be inherited from settings rather than declared in the agent's `.md`. The startup pre-check (run by `startJie` during team construction) guarantees that by the time an `AgentSoul` is constructed, `soul.model` is a non-empty `<provider>/<modelId>` string. The platform's `getApiKey(provider)` resolver still uses pi-ai's `getEnvApiKey()`; Jie only changes *what* gets passed to it (the resolution order above, plus the `auth.json` step).

`startJie` also performs the per-agent model pre-check (see `06-agent-model.md` "Startup Pre-Check"): if any agent fails to resolve a `(provider, modelId)` against the merged settings, startup fails with one error listing every unresolved agent.

## CLI / TUI Surface

The commands that mutate persistent files:

| Command | File it writes | Notes |
|---|---|---|
| `jie login` | `~/.jie/auth.json` | Interactive: pick provider, then OAuth or paste API key. `--provider <id> --api-key <key>` for headless use. |
| `jie logout [<provider>]` | `~/.jie/auth.json` | Clears the entry for the named provider; no argument clears all. |
| `jie model <provider>/<modelId>` | `~/.jie/settings.json` | Splits on first `/`; sets `defaultProvider` and `defaultModel`. |
| `jie team <id>` | `.jie/settings.json` or `~/.jie/settings.json` | Scope-aware: writes to the same scope as the team's install location. TUI hot-swaps the running team; CLI takes effect on next invocation. |
| `jie team` (no arg) | (read-only) | Prints current `defaultTeam` and installed teams. |
| `jie team --unset` | `.jie/settings.json` or `~/.jie/settings.json` | Clears `defaultTeam`. Takes effect on next invocation. |

The `--team <id>` flag is a one-shot override for `jie` and `jie -p`; the TUI does not have a one-shot equivalent — use `/team <id>` for both persistence and hot-swap.

`jie model <provider>/<modelId>` takes effect on the next LLM call (no restart, matching pi's convention). The platform re-resolves `(provider, modelId)` from merged settings on every LLM call; `/model` writes to settings and the next call picks up the change.

`jie model` writes to **global** settings (`~/.jie/settings.json`). Project-level overrides go in `.jie/settings.json`, edited by hand. This mirrors pi's split: `/login` and `/model` are global-only; project settings are file-edited.

Unstructured text input for `provider` and `model` in CLI args and TUI slash commands follows pi's convention `<provider>/<modelId>`. Two separate flags (e.g. `--provider` and `--model`) are not accepted in v1; the slash is the canonical separator.

## Provider Configuration (v1)

No provider-level config in `settings.json` for v1. Base URLs, custom endpoints, and provider-specific options (e.g., `azureBaseUrl`, `vertex region`) are not configurable — agents use pi's default endpoints. Custom provider configuration is a Day2 concern.
