# Team Configuration

Team-specific configuration extending the platform config (`jie-platform/10-configuration.md`).

## Team Blueprint

The team blueprint defines:

- Agent roles (souls: subscriptions, publishes, tools, system prompts)
- Event types (domain events and their payload schemas)
- Workflow (subscription graph — who listens to what)
- The leader role (default: DM for the built-in dev team)
- Status schema and transition table
- Artifact types

## Built-in Team Defaults

The default dev team is defined in `packages/jie-team/`. It provides:

- 6 roles: DM, Researcher, Architect, Planner, Implementer, Reviewer
- Serial pipeline workflow
- Task lifecycle with iteration loop

## Per-Role Settings (Day 2)

v1 applies platform config to all roles uniformly. Per-role tuning is deferred to Day 2. The schema reserves a `roles` block for future use:

```yaml
# Day 2 — not yet implemented
# roles:
#   implementer:
#     max_iterations: 3
#   researcher:
#     max_iterations: 1
```

## max_iterations

```yaml
max_iterations: 5    # per-task planner→implementer→reviewer loop cap
```

This is a team-level setting. v1 applies the same cap to all tasks. Per-task override is deferred to Day 2.

## Cross-References

- `jie-platform/10-configuration.md` — platform config schema, discovery, path resolution
- `01-role-definitions.md` — role definitions and tool lists
- `02-agent-lifecycle.md` — `max_iterations` gating in the iteration loop
