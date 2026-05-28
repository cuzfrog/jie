# Configuration

Platform-level configuration surface. Defines how Jie discovers and loads settings for a team.

## Scope

- Workspace root discovery
- NATS server address, Code-Lens MCP address
- Team identity (`team_id`)
- Budget defaults (`error_turn_budget`, `total_turn_budget`)
- Streaming tunables (chunk size, flush interval)
- Config file format and loading path

## Config File

The config lives at `.jie/config.yaml` within the workspace root. Supervisor discovers it by walking up from CWD.

### v1 Schema

```yaml
# Required — team identity
team_id: "default"

# Required — infrastructure addresses
nats_url: "nats://localhost:4222"

# Optional — Code-Lens MCP server. Supervisor auto-picks a free port and writes back
# on first boot if absent. If present, supervisor binds to this address.
# code_lens_url: "http://localhost:9001"

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
| `nats_url` | string | — | NATS server address. Must be a valid `nats://` or `tls://` URL. |
| `code_lens_url` | string | auto-assigned | Code-Lens MCP server address. HTTP URL. If absent from config, the supervisor picks a free port (starting at 9001 and probing upward), starts Code-Lens bound to that address, and writes the URL back to config. Subsequent starts reuse the persisted value. If present, the supervisor binds Code-Lens to this address; if the port is occupied, startup fails. |
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

Workflow-specific settings (role definitions, event types, team-specific budgets, iteration caps) are defined by the team blueprint, not in the platform config. See `jie-team/07-team-config.md`.
