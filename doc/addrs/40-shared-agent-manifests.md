# ADR 40: Shared Agent Manifests and Manifest Consolidation

## Context

Teams live in `src/manifest/teams/` as `<id>/TEAM.md` + `<role>.md`; the CLI-side installer copies them into `.jie/teams/` and `~/.jie/teams/`, where the platform reads them and is otherwise agnostic of bundled content (ADR 11, ADR 24). Two reusable agents don't fit a per-team copy: an `explorer` that gathers information / runs experiments, and a `steward` that runs and waits on scripts, builds, or tests. They should be authored once and referenced by any team rather than edited into every team copy.

## Decision

1. Shared agents are single flat files `agents/<id>.md` whose filename stem is the agent id and role — no `id`/`role` frontmatter field. They reuse the existing `AgentSoul` schema rather than introducing a parallel one.

2. A team references shared agents from `TEAM.md` via `additional-agents:` (list of stems). Stems are validated statically at parse time (format, no duplicates, no collision with local role stems); resolution is deferred to team load through the existing `AgentRegistry` (project `.jie/agents/` overrides user `~/.jie/agents/`) and the resulting `AgentSoul`s are merged into `TeamBlueprint.roles`. `TeamBlueprint` records the merged refs in `additionalAgentRefs`.

3. A shared agent cannot be a team leader: `leader:` must name a local role (`LEADER_UNKNOWN` / `LEADER_MISMATCH` otherwise). Because resolution is load-time, a missing shared agent surfaces as `AGENT_NOT_FOUND` at team load — the installer never parses team files and stays parse-free.

4. Consolidation under `src/manifest/` gives the installer one source root to scan (v2 `agents/<id>.md` and `teams/<id>/TEAM.md`, plus the legacy root-level `<id>/TEAM.md` layout). First run points the installer at `src/manifest/` and installs the `jie-dev-team` blueprint plus the `explorer`/`steward` shared agents into `~/.jie/`.

## Consequences

- Adding a reusable agent to a team is a one-line `additional-agents:` edit; authoring is a single flat file.
- The platform reads only installed `.jie/` files and stays agnostic of bundled content; the `AgentRegistry` serves both team-merge and ad-hoc dispatch.
- The `src/manifest/` move is a breaking internal layout; external packages with the legacy root-level `<id>/TEAM.md` layout still install unchanged.

## Status

Accepted.
