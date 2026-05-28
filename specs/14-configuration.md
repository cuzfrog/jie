# Configuration (TBD)

Project-level and team-level configuration surface. Defines how Jie discovers and loads settings for a team.

## Scope

- Workspace root discovery
- Test/lint command resolution per workspace
- Language-adapter selection for Code-Lens
- Budget overrides per role (`error_turn_budget`, `total_turn_budget`; defaults 30 and 200)
- `max_iterations` per-task override (default 5; how overrides are surfaced — task artifact field or team config — is open item #11)
- Config file format and loading path
- NATS server address, Code-Lens MCP address
- Team identity (`team_id`)

## Minimum v1 Surface

The minimum v1 config lives in `.jie/config.yaml` within the workspace root (or at a path given by `--config`). Supervisor discovers it by walking up from CWD or via the explicit flag.

```yaml
team_id: "default"
nats_url: "nats://localhost:4222"
code_lens_url: "http://localhost:9001"
workspace_root: "."
```

All file paths throughout Jie resolve relative to `workspace_root` (see `00-overview.md` glossary).

## Budget Tuning

Default `error_turn_budget = 30` and `total_turn_budget = 200` apply to all roles. Per-role tuning is an open question (see backlog item #12). When implemented, overrides belong in this chapter.

## Cross-References

- `13-deployment.md` — supervisor launch order, workspace layout
- `07-agent-model.md` — AgentBody budget fields
- `00-overview.md` — Workspace Root glossary entry
- Backlog #11 — `max_iterations` override mechanism
- Backlog #12 — per-role budget tuning
