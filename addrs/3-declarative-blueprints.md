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
- `defaultTeam` in `settings.json` (set via `jie team <id>` or `/team <id>`) selects the team to run; the platform looks up the team at `.jie/teams/<id>/` (project) or `~/.jie/teams/<id>/` (global).

## Consequences

- Custom teams require no code changes. Create a new directory, write `.md` files, set `defaultTeam` to its id (or pass `--team <id>` for one-shot use).
- Tools: LLM-authored markdown is natural. No TypeScript compilation, no module resolution.
- Type safety boundary: the YAML frontmatter has a small, well-defined schema (`model`, `tools`, `notify`). Validation at parse time.
- MCP tools referenced by name in `tools` resolve through `ToolRegistry` — the agent author doesn't write MCP connection code.
- **Package boundary (refined by ADR 12).** `jie-team` is a **manifest** package: a directory of `.md` files for the dev team and a richer minimal team, with no `postinstall` script and no CLI integration. The platform is **agnostic of jie-team**: it reads team manifests from filesystem paths, has no `import` of jie-team, and does not depend on `jie-team` being installed. The platform ships a hardcoded built-in minimal team (`packages/jie-platform/team/built-in/minimal-team.ts`) as a last-resort runtime fallback when no user team is selected. The `jie-team` package's `.md` files are an optional user-installable override of the built-in. Distributing `jie-team`'s manifests to a working `jie` install is the user's responsibility, via manual copy to `~/.jie/teams/<id>/` or `.jie/teams/<id>/`.
