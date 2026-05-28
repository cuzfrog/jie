# Configuration

Project-level and team-level configuration surface. Defines how Jie discovers and loads settings for a team.

## Scope

- Workspace root discovery
- Test/lint command resolution per workspace
- Language-adapter selection for Code-Lens
- Budget overrides per role (`error_turn_budget`, `total_turn_budget`; defaults 30 and 200)
- `max_iterations` per-task (default 5)
- Config file format and loading path
- NATS server address, Code-Lens MCP address
- Team identity (`team_id`)

## Config File

The config lives at `.jie/config.yaml` within the workspace root. Supervisor discovers it by walking up from CWD.

### v1 Schema

```yaml
# Required — team identity
team_id: "default"

# Required — infrastructure addresses
nats_url: "nats://localhost:4222"
code_lens_url: "http://localhost:9001"

# Required — path resolution root
workspace_root: "."

# Budget overrides — per-agent defaults applied at body construction.
# These are the defaults; any field absent uses the value shown.
error_turn_budget: 30       # per-event-loop error tolerance (see 07-agent-model.md)
total_turn_budget: 200      # per-event-loop hard turn cap (see 07-agent-model.md)
max_iterations: 5           # per-task planner→implementer→reviewer loop cap (see 09-agent-lifecycle.md)
```

### Field Semantics

| Field | Type | Default | Description |
|---|---|---|---|
| `team_id` | string | — | Team identity. Used in NATS subject prefixes (e.g. `team.{team_id}.prompt`). Charset `[A-Za-z0-9_-]`, max 32 chars. |
| `nats_url` | string | — | NATS server address. Must be a valid `nats://` or `tls://` URL. |
| `code_lens_url` | string | — | Code-Lens MCP server address. HTTP URL. The supervisor starts Code-Lens on this address; the Architect's body connects to it for MCP tools. |
| `workspace_root` | string | `"."` | Root directory for path resolution. All file paths throughout Jie resolve relative to this. May be absolute or relative (relative paths are resolved against the config file's directory). |
| `error_turn_budget` | number | `30` | Per-agent, per-event-loop error tolerance. Decrements on turns that consume at least one tool-error. When exhausted, body force-publishes `task.failed`. |
| `total_turn_budget` | number | `200` | Per-agent, per-event-loop hard turn cap. Decrements on every LLM turn. Safety net against pathological loops. |
| `max_iterations` | number | `5` | Maximum iterations for the planner→implementer→reviewer inner loop. The reviewer kickback increments `iteration`; when it reaches `max_iterations`, the reviewer must emit `task.review_passed` or the DM will eventually `task.failed` with `max_iterations_exceeded`. |

### Per-Role Overrides (Day 2)

v1 applies the same `error_turn_budget`, `total_turn_budget`, and `max_iterations` to all roles. Per-role tuning (e.g. 15 turns for implementer, 30 for researcher) is deferred to Day 2. The config schema reserves a `roles` block for future use:

```yaml
# Day 2 — not yet implemented
# roles:
#   implementer:
#     error_turn_budget: 15
#   researcher:
#     total_turn_budget: 100
```

### Per-Task max_iterations Override (Day 2)

v1 applies the team-level `max_iterations` to all tasks. A per-task override mechanism (task artifact field? user prompt field?) is deferred to Day 2. See design decision in review-tracker Group B, item B4.

## Config Discovery

The config file is discovered by each process independently by walking up from CWD to find `.jie/config.yaml`. If not found, the process exits with an error.

Agent bodies started by the supervisor receive the config path as a command-line argument — they do not re-discover it.

## File Path Resolution

All paths in Jie resolve relative to `workspace_root`:
- Tool arguments: `read_file`, `write_file`, `read_module_contract`, `bash` workdir
- Event payloads: `descriptor_paths`, artifact paths
- Config-relative references: `.jie/artifacts.db` location

If `workspace_root` is a relative path, it is resolved against the directory containing `.jie/config.yaml`, not against CWD.

## Cross-References

- `13-deployment.md` — supervisor launch order, `.jie/` layout, config path passing
- `07-agent-model.md` — AgentBody budget fields, budget exhaustion behavior
- `09-agent-lifecycle.md` — `max_iterations` gating in the iteration loop
- `00-overview.md` — Workspace Root, Budget glossary entries
