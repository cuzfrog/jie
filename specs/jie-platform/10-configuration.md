# Configuration

Platform-level configuration surface. Defines how Jie discovers and loads settings for a team.

## Scope

- Workspace root discovery
- NATS server address
- Team identity (`team_id`) and blueprint path (`team_path`)
- Budget defaults (`error_turn_budget`, `total_turn_budget`)
- Streaming tunables (chunk size, flush interval)
- Config file format and loading path

## Config File

The config lives at `.jie/config.yaml` within the workspace root. Supervisor discovers it by walking up from CWD.

### v1 Schema

```yaml
# Required — team identity
team_id: "default"

# Required — team blueprint path. Relative to the directory containing this config file.
# Points to a directory containing TEAM.md and agent .md files.
team_path: "./teams/default"

# Required — infrastructure addresses
nats_url: "nats://localhost:4222"

# Required — path resolution root
workspace_root: "."

# Budget defaults — applied at body construction for all agents.
# Any field absent uses the value shown.
error_turn_budget: 30       # per-event-loop error tolerance
total_turn_budget: 200      # per-event-loop hard turn cap

# Streaming tunables
stream_chunk_size: 64       # characters per agent.stream.chunk
stream_flush_ms: 200        # max ms before flushing a stream chunk
```

### Field Semantics

| Field | Type | Default | Description |
|---|---|---|---|
| `team_id` | string | — | Team identity. Used in NATS subject prefixes (e.g. `team.{team_id}.prompt`). Charset `[A-Za-z0-9_-]`, max 32 chars. |
| `team_path` | string | `"./teams/default"` | Path to the team blueprint directory (contains `TEAM.md` + agent `.md` files). Relative paths resolve against the config file's directory. |
| `nats_url` | string | — | NATS server address. Must be a valid `nats://` or `tls://` URL. |
| `workspace_root` | string | `"."` | Root directory for path resolution. All file paths throughout Jie resolve relative to this. May be absolute or relative (relative paths are resolved against the config file's directory). |
| `error_turn_budget` | number | `30` | Per-agent, per-event-loop error tolerance. Decrements on turns that consume at least one tool-error. When exhausted, body force-publishes the terminal event. |
| `total_turn_budget` | number | `200` | Per-agent, per-event-loop hard turn cap. Decrements on every LLM turn. Safety net against pathological loops. |
| `stream_chunk_size` | number | `64` | Characters per `agent.stream.chunk` event. |
| `stream_flush_ms` | number | `200` | Max milliseconds before flushing a partial stream chunk. |

## Config Discovery

The config file is discovered by each process independently by walking up from CWD to find `.jie/config.yaml`. If not found, the process exits with an error.

Agent bodies started by the supervisor receive the config path as a command-line argument — they do not re-discover it.

## File Path Resolution

All paths in Jie resolve relative to `workspace_root`:
- Tool arguments: `read_file`, `write_file`, `bash` workdir
- Event payloads: file paths referenced in events
- Config-relative references: `.jie/artifacts.db` location

If `workspace_root` is a relative path, it is resolved against the directory containing `.jie/config.yaml`, not against CWD.

## Team-Level Configuration

Agent roles, tools, event types, and workflow are defined by the team blueprint at `team_path`. The platform parses `TEAM.md` and agent `.md` files at startup — see `05-agent-model.md` for the full loading spec.

## MCP Server Configuration

MCP servers are configured in `.jie/mcp.yaml` (project-level, overrides `~/.jie/mcp.yaml`). The platform connects to every listed server at startup, fetches tool catalogs, and registers all tools into `ToolRegistry`. The platform has no awareness of specific server identities — every entry is treated uniformly.

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

At startup, the supervisor:

1. Loads merged `mcp.yaml`.
2. For each server: connects (spawns subprocess for stdio, dials URL for http), fetches tool catalog.
3. For each tool in the catalog: `ToolRegistry.register(mcp:{server}:{tool_name}, tool)`.
4. Stdio subprocesses are monitored — restart on crash, re-fetch catalog, re-register tools.

All agents see MCP tools as first-class `Tool` entries. The MCP transport is an implementation detail of `tool.execute()`.
