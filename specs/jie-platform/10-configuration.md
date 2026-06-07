# Configuration

Platform-level configuration surface. Defines how Jie discovers and loads settings for a team.

## Config File

The config lives at `.jie/config.yaml` within the workspace root. Discovered by walking up from CWD. **All fields are optional** — the config may be absent entirely, in which case the platform runs with all defaults (built-in minimal team, workspace root `"."`, default stream tunables).

### v1 Schema

```yaml
# Optional — team lookup key. See "Team Resolution" below.
team_id: "my-team"

# Optional — path resolution root
workspace_root: "."

# Optional streaming tunables
stream_chunk_size: 64       # characters per agent.stream.chunk
stream_flush_ms: 200        # max ms before flushing a stream chunk
```

### Field Semantics

| Field | Type | Default | Description |
|---|---|---|---|
| `team_id` | string | *(absent — uses built-in default)* | Lookup key for a user-installed team. See "Team Resolution". Charset `[A-Za-z0-9_-]`, max 32 chars. |
| `workspace_root` | string | `"."` | Root directory for path resolution (e.g. `bash` `workdir` enforcement). Relative paths resolve against the config file's directory. |
| `stream_chunk_size` | number | `64` | Characters per `agent.stream.chunk` event. |
| `stream_flush_ms` | number | `200` | Max ms before flushing a partial stream chunk. |

## Team Resolution

The platform resolves which team to run with this order:

| Order | Source | Lookup |
|---|---|---|
| 1 | Project-local | `.jie/teams/<team_id>/TEAM.md` (relative to the config file's directory, or CWD if no config) |
| 2 | Global | `~/.jie/teams/<team_id>/TEAM.md` |
| 3 | Built-in default | Hardcoded minimal team in the `jie-team` package |

Rules:

- If `team_id` is **absent** from config (or no config exists) → built-in default runs. The default is always reachable by omitting `team_id`; there is no opt-in keyword.
- If `team_id` is **set** but neither #1 nor #2 has a matching manifest → **startup fails** with a clear error citing the missing path. The platform does not silently fall back to the built-in default in this case.
- The built-in default team is the **minimal team** (1 `general` leader, default tools). See `jie-team/minimal-team.md`.

User teams are installed by placing a `TEAM.md` and per-role `.md` files at the appropriate path. The v1 dev team (DM/Researcher/Architect/Planner/Implementer/Reviewer pipeline) is shipped as a starter template — users copy it to `.jie/teams/<chosen_id>/` and set `team_id: <chosen_id>` in their config to activate it. A `jie team install` command is not provided in v1; users copy files manually or follow documented setup.

## Config Validation

The platform validates the config strictly at startup. **Any of the following is a hard fail with exit code 1:**

| Condition | Error |
|---|---|
| YAML parse error | Line/column from the parser. |
| Unknown key | `unknown config field: <name>` |
| `team_id` does not match `[A-Za-z0-9_-]{1,32}` | `invalid team_id: <value>` |
| `workspace_root` is not a string | `workspace_root must be a string` |
| `stream_chunk_size` is not a positive integer | `stream_chunk_size must be a positive integer` |
| `stream_flush_ms` is not a positive integer | `stream_flush_ms must be a positive integer` |
| `team_id` is set but user team is not found at either lookup path | `team <team_id> not found: checked .jie/teams/<id>/ and ~/.jie/teams/<id>/` |

There are no silent fallbacks for invalid config. The user must fix the config and re-run.

### `settings.json` Validation

`settings.json` is loaded with a soft-unknown-key policy: unrecognized top-level fields are warned and ignored, so a future Jie version can ship a new setting without breaking old files. Recognized fields are validated strictly:

| Condition | Error |
|---|---|
| JSON parse error | Line/column from the parser. |
| `defaultProvider` is not a string or is not a known `KnownProvider` | `invalid defaultProvider: <value>` |
| `defaultModel` is not a string | `defaultModel must be a string` |
| File exists but is not readable / not valid JSON | Startup fails with parser error. |

The supervisor also performs the per-agent model pre-check (see `05-agent-model.md` "Startup Pre-Check"): if any agent fails to resolve a `(provider, modelId)` against the merged settings, startup fails with one error listing every unresolved agent.

### `auth.json` Validation

`auth.json` is not validated by the platform — its schema is owned by `@earendil-works/pi-ai`'s `FileAuthStorageBackend`, which writes the canonical shape and refuses to read malformed entries at the provider-call boundary. A malformed `auth.json` surfaces as a credential resolution error at LLM call time, not at startup.

## Config Discovery

The config file is discovered by walking up from CWD to find `.jie/config.yaml`. If not found, the platform runs with all defaults — no interactive init flow. Both `jie` (TUI) and `jie -p` modes share this behavior.

## MCP Server Configuration

MCP servers are configured in `.jie/mcp.yaml` (project-level; `~/.jie/mcp.yaml` for global defaults). The platform connects to every listed server at startup, fetches tool catalogs, and registers tools into `ToolRegistry`.

### Schema

```yaml
servers:
  <name>:
    transport: stdio | http     # required
    # stdio transport:
    command: <string>           # required
    args: [<string>]            # optional
    # http transport:
    url: <string>               # required
    auth:
      token_env: <string>       # env var containing bearer token
```

### Resolution

- **`~/.jie/mcp.yaml`** — global (shared across projects).
- **`.jie/mcp.yaml`** (workspace root) — project-level overrides. Server entries with the same `<name>` replace the global entry entirely (no merge).

### Startup Behavior

1. Load merged `mcp.yaml`.
2. For each server: attempt to connect.
3. **If connect fails**: log a `WARN` with the server name and reason. Do not register that server's tools. **Startup continues** with the rest of the team. The team's `ToolRegistry` will simply lack that server's tools.
4. **If connect succeeds**: fetch tool catalog, register tools into `ToolRegistry`.
5. Stdio subprocesses are monitored. If a server dies mid-session, its in-flight tool calls time out or return `mcp_server_unreachable`; subsequent calls also return errors. Agents handle these as tool-result errors.

### Cascade: Agent Load Failure

If an agent's `.md` `tools:` list references a tool that cannot be resolved (e.g. from a failed MCP server, or an unknown built-in name), the **agent's `AgentSoul` construction fails**, and the whole team startup fails with an error citing the missing tool. The platform's policy is:

- MCP connect failure → soft (WARN, skip, continue).
- Tool resolution failure inside an agent → hard (startup fails).

This means a team with a working MCP server starts cleanly; a team whose blueprint depends on a missing MCP server fails fast with a precise error.

## LLM Provider Configuration

The platform does not assume a model or provider. The user picks both via CLI commands (`jie login`, `jie model`) before the first run, and the platform persists the choice to `~/.jie/settings.json`. After that, the platform always has a runnable configuration; before that, every startup fails with a clear error pointing at the right command.

Two persistent files back the runtime:

| File | Scope | Sensitivity | Holds |
|---|---|---|---|
| `~/.jie/settings.json` | Global user settings | Plain JSON (user-readable) | `defaultProvider`, `defaultModel` |
| `.jie/settings.json` | Project override | Plain JSON (user-readable) | Same fields, deep-merge over global |
| `~/.jie/auth.json` | Global credentials | mode `0600` (sensitive) | API keys, OAuth tokens |

`.jie/settings.json` (project) is the only project-level user settings file. There is no project-level `auth.json` — credentials are global, by design.

### Settings: `settings.json`

JSON, two locations, **project overrides global with deep-merge** (nested objects merge, top-level scalars replace, arrays replace). This mirrors pi's `settings.json` convention.

| Location | Scope |
|---|---|
| `~/.jie/settings.json` | Global (all projects) |
| `.jie/settings.json` | Project (current directory; deep-merge over global) |

For v1, the platform only reads two fields. Other fields are tolerated and ignored (forward-compatibility with future settings), but unrecognized values for recognized fields are an error.

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514"
}
```

| Field | Type | Description |
|---|---|---|
| `defaultProvider` | string | Provider id (e.g. `anthropic`, `openai`). Must be a known `KnownProvider` from `@earendil-works/pi-ai`; otherwise startup fails. |
| `defaultModel` | string | Model id within the provider (e.g. `claude-sonnet-4-20250514`). |

Both fields are independent — see "Model Resolution" below for how they're used. The CLI accepts them as a single string (`<provider>/<modelId>`) and splits on the first `/` before writing to the file; the file's on-disk shape is the two-field form.

**Unknown field policy.** Unrecognized top-level fields in `settings.json` are tolerated (warned, ignored) so future Jie versions can land new settings without breaking old files. Unrecognized *values* for recognized fields (e.g. `defaultProvider: "not-a-real-provider"`) are a hard fail at startup — the platform refuses to guess.

### Auth: `auth.json`

JSON, single location (`~/.jie/auth.json`), file mode `0600`. The schema mirrors pi's `auth.json`:

```json
{
  "anthropic":   { "type": "api_key", "key": "sk-ant-..." },
  "openai":      { "type": "api_key", "key": "sk-..." },
  "github-copilot": { "type": "oauth", "access": "...", "refresh": "...", "expires": 1234567890 }
}
```

The schema is whatever `@earendil-works/pi-ai`'s `FileAuthStorageBackend` writes — Jie does not redefine it. The `key` field supports command execution (`!cmd`), env interpolation (`$ENV_VAR` / `${ENV_VAR}`), and literal values; see pi's `providers.md` for the full interpolation grammar. OAuth tokens (anthropic, openai-codex, github-copilot) are stored here after `jie login` and refreshed automatically by pi-ai at call time.

The CLI mutates `auth.json` via `jie login` and `jie logout`. The file is not edited by hand in v1; `jie login` is the supported entry point.

### Credentials Resolution Order

For a given provider, credentials resolve in this order at call time:

| Order | Source | Notes |
|---|---|---|
| 1 | `jie --api-key <key>` flag | One-shot, single run. The `jie` binary's top-level flag (Day 2: per-call overrides via the same flag). |
| 2 | `~/.jie/auth.json` entry for the provider | Set by `jie login` or `jie logout`-cleared. |
| 3 | Provider's environment variable | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, etc. (See full mapping below.) |
| 4 | Custom provider keys from `~/.jie/models.json` | Day 2 concern. v1 has no `models.json`. |

Auth file beats env. This means `jie login` (which writes to `auth.json`) wins over a stale env var — the right precedence for the case where the user rotated credentials via the CLI but a service supervisor still exports the old env var.

**Provider → environment variable mapping** (used in step 3 above):

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

A model's `(provider, modelId)` tuple is resolved at startup, before any `AgentSoul` is constructed. The supervisor walks every agent in the blueprint and resolves each one against the chain below. Resolution is per-agent and may produce different `(provider, modelId)` per role.

| Order | Source | When it fires |
|---|---|---|
| 1 | `model: <provider>/<modelId>` in agent `.md` frontmatter | Always wins when present. Team author pinned this agent explicitly. |
| 2 | Merged settings: `defaultProvider` + `defaultModel` | Agent has no `model:`; user has set both fields. |
| 3 | Merged settings: `defaultProvider` only | Agent has no `model:`; user has set only the provider. Model id is taken from `@earendil-works/pi-ai`'s `defaultModelPerProvider[defaultProvider]`. |
| 4 | (none) | **Hard fail** at startup pre-check — see `05-agent-model.md` "Startup Pre-Check". |

The platform delegates the per-provider fallback in step 3 to `pi-ai`'s built-in `defaultModelPerProvider` table. Jie does not maintain its own default-model table; if `pi-ai` ships an updated default for a provider, Jie inherits it on the next release with no spec change.

`AgentSoul.model` is still a required field at the *type* level — it just may be inherited from settings rather than declared in the agent's `.md`. The supervisor's pre-check guarantees that by the time an `AgentSoul` is constructed, `soul.model` is a non-empty `<provider>/<modelId>` string. The platform's `getApiKey(provider)` resolver still uses pi-ai's `getEnvApiKey()`; Jie only changes *what* gets passed to it (the resolution order above, plus the `auth.json` step).

### CLI / TUI Surface

The three commands that mutate these files:

| Command | File it writes | Notes |
|---|---|---|
| `jie login` | `~/.jie/auth.json` | Interactive: pick provider, then OAuth or paste API key. `--provider <id> --api-key <key>` for headless use. |
| `jie logout [<provider>]` | `~/.jie/auth.json` | Clears the entry for the named provider; no argument clears all. |
| `jie model <provider>/<modelId>` | `~/.jie/settings.json` | Splits on first `/`; sets `defaultProvider` and `defaultModel`. |

`jie model` writes to **global** settings (`~/.jie/settings.json`). Project-level overrides go in `.jie/settings.json`, edited by hand. This mirrors pi's split: `/login` and `/model` are global-only; project settings are file-edited.

Unstructured text input for `provider` and `model` in CLI args and TUI slash commands follows pi's convention `<provider>/<modelId>`. Two separate flags (e.g. `--provider` and `--model`) are not accepted in v1; the slash is the canonical separator.

### Provider Configuration (v1)

No provider-level config in `settings.json` for v1. Base URLs, custom endpoints, and provider-specific options (e.g., `azureBaseUrl`, `vertex region`) are not configurable — agents use pi's default endpoints. Custom provider configuration is a Day 2 concern.
