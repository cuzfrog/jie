# Configuration

Platform-level configuration surface. Defines how Jie discovers and loads settings for a team.

## Config File

The config lives at `.jie/config.yaml` within the workspace root. Discovered by walking up from CWD.

### v1 Schema

```yaml
# Required — team identity
team_id: "default"

# Required — team blueprint path. Relative to the directory containing this config file.
# Points to a directory containing TEAM.md and agent .md files.
team_path: "./teams/default"

# Required — path resolution root
workspace_root: "."

# Budget defaults — applied at body construction for all agents.
error_turn_budget: 30       # per-event-loop error tolerance
total_turn_budget: 200      # per-event-loop hard turn cap

# Streaming tunables
stream_chunk_size: 64       # characters per agent.stream.chunk
stream_flush_ms: 200        # max ms before flushing a stream chunk
```

### Field Semantics

| Field | Type | Default | Description |
|---|---|---|---|
| `team_id` | string | — | Team identity. Charset `[A-Za-z0-9_-]`, max 32 chars. Used for display and future multi-team isolation. |
| `team_path` | string | `"./teams/default"` | Path to the team blueprint directory (contains `TEAM.md` + agent `.md` files). Relative paths resolve against the config file's directory. |
| `workspace_root` | string | `"."` | Root directory for path resolution. Relative paths resolve against the config file's directory. |
| `error_turn_budget` | number | `30` | Per-agent, per-event-loop error tolerance. Decrements on turns consuming tool errors. Exhaustion → agent publishes terminal event and goes idle. |
| `total_turn_budget` | number | `200` | Per-agent, per-event-loop hard turn cap. Decrements on every LLM turn. |
| `stream_chunk_size` | number | `64` | Characters per `agent.stream.chunk` event. |
| `stream_flush_ms` | number | `200` | Max ms before flushing a partial stream chunk. |

## Config Discovery

The config file is discovered by walking up from CWD to find `.jie/config.yaml`. If not found, the CLI enters an interactive init flow (see `12-installation.md`).

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

### Platform Behavior

At startup:

1. Load merged `mcp.yaml`.
2. For each server: connect (spawns subprocess for stdio, dials URL for http), fetch tool catalog.
3. For each tool in the catalog: `ToolRegistry.register(mcp:{server}:{tool_name}, tool)`.
4. Stdio subprocesses are monitored. If a server dies, its in-flight tool calls time out or return `mcp_server_unreachable`; subsequent calls also return errors. Agents handle these as tool-result errors.

## LLM Provider Configuration

### Model String Format

Agent `.md` frontmatter declares a `model` field as `<provider>/<model_id>` (e.g. `anthropic/claude-sonnet-4-20250514`). At soul construction, the platform splits on the first `/` and resolves via `@earendil-works/pi-ai`'s `getModel(provider, modelId)`.

If the string contains no `/`, startup fails with `"invalid model string: missing provider prefix"`.

### API Keys

API keys are supplied via **environment variables only** — never in config files. Jie delegates credential resolution to `@earendil-works/pi-ai`'s `getEnvApiKey()`, which reads per-provider environment variables at call time.

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

For the full mapping, see `@earendil-works/pi-ai`'s `env-api-keys.ts`.

If no API key is set for the resolved provider, `getModel()` does not throw; the error surfaces when the LLM call is attempted. The agent receives a tool-like error in its conversation and may degrade gracefully.

### Provider Configuration (v1)

No provider-level config in `config.yaml` for v1. Base URLs, custom endpoints, and provider-specific options (e.g., `azureBaseUrl`, `vertex region`) are not configurable — agents use pi's default endpoints. Custom provider configuration is a Day 2 concern.
