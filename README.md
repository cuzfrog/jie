# Jie (界)

A native multi-agent harness.

## Install

From source (no registry publish yet), requires bun >= 1.3.14:

```bash
bun install
bun link
jie --version
```

## Teams

Teams live in `.jie/teams/<id>/` (project) or `~/.jie/teams/<id>/` (user).

Bundled teams:

- `jie-assisted-developer` - architect, developer, peer
- `jie-dev-team` - six-role kanban pipeline: planner, researcher, architect, implementer, reviewer, manager

Install more teams from npm/git/file sources:

```bash
jie team add <source> [--project]
jie team list
```

## Configuration

Project state lives in `.jie/` (discovered by walking up from CWD); user state in `~/.jie/`: `settings.json` (defaults for model, team, effort, compaction, memory, hooks), `auth.json` (credentials), `models.json` (custom providers), `mcp.json` (MCP servers), plus skills and context files (`AGENTS.md`/`CLAUDE.md`). See `doc/specs/jie-platform/10-configuration.md`.

## Development

See `doc/DEVELOPMENT.md` for tests, logging, and local LLM setup. Architecture docs live in `doc/specs/` and decisions in `doc/addrs/`.
