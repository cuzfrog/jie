# ADR 3: Declarative Blueprints (YAML + Markdown)

## Status

Accepted.

## Context

Previous design defined team blueprints as TypeScript modules in `packages/jie-team/`, exporting a `TeamBlueprint` interface. This required the platform to have a compile-time or dynamic-import dependency on the team package, and custom teams required TypeScript source changes.

## Decision

Blueprints are declarative files — no code between platform and team:

```
.jie/teams/<name>/
  TEAM.md            # frontmatter: leader
  dm.md              # agent files: frontmatter + prose system prompt
  researcher.md
  ...
```

- `TEAM.md` carries only the leader role name.
- Agent `.md` frontmatter: `model`, `tools`, `notify`. Prose body = system prompt.
- Platform parses these files, constructs `AgentSoul` instances, auto-computes subscriptions.
- `team_path` in `.jie/config.yaml` points to the blueprint directory.

## Consequences

- Custom teams require no code changes. Create a new directory, write `.md` files, point `team_path` at it.
- Tools: LLM-authored markdown is natural. No TypeScript compilation, no module resolution.
- Type safety boundary: the YAML frontmatter has a small, well-defined schema (`model`, `tools`, `notify`). Validation at parse time.
- MCP tools referenced by name in `tools` resolve through `ToolRegistry` — the agent author doesn't write MCP connection code.
