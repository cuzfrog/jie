# ADR 40: Shared Agent Manifests and the `src/manifest/` Consolidation

## Context

Team blueprints live in `src/teams/` as `<id>/TEAM.md` plus `<role>.md` files. The installer `src/teams-installer/` copies them into `.jie/teams/` or `~/.jie/teams/`. The platform reads the installed copies and is otherwise agnostic of the bundled content (ADR 11, ADR 24). Two recurring support needs are not served by the existing pipeline:

- An `explorer` agent that gathers information or runs lightweight experiments without editing source.
- A `steward` agent that runs and waits on scripts, builds, or tests.

These are generic enough to share across multiple teams, but they are not part of the `default-dev-team` delivery pipeline and should not be edited into every team copy.

## Decision

1. Consolidate bundled content under `src/manifest/`: `src/manifest/teams/` (moved from `src/teams/`), `src/manifest/agents/` (new), and `src/manifest/installer/` (moved from `src/teams-installer/`). `src/manifest/` is itself a valid installer source root.

2. A shared agent is a single flat file `<id>.md` in `src/manifest/agents/` (or `.jie/agents/`, `~/.jie/agents/` at runtime). The filename stem is the agent id and role; no `id:` or `role:` frontmatter field. The frontmatter reuses the existing `AgentSoul` schema (`tools`, `model?`, `subscribe?`, `skills?`, `target_context_window_size?`).

3. A team references shared agents from `TEAM.md` via `additional-agents:` (list of stems). The platform parser validates the list statically (valid stems, no duplicates, no collision with local role stems); the `TeamRegistry` resolves each ref through a new `AgentRegistry` at load time and merges the resulting `AgentSoul`s into `TeamBlueprint.roles`.

4. `TeamBlueprint` gains `additionalAgentRefs: ReadonlyArray<string>` to record which roles were merged in. `TeamBlueprint.roles` is the merged, sorted list of local and shared roles; consumers such as `TeamManager.constructTeam`, `agentCount`, and the TUI roster work unchanged.

5. The `leader:` field in `TEAM.md` must name a **local** role. A shared agent cannot be a team leader (`LEADER_UNKNOWN`).

6. The installer becomes a manifest installer (`createManifestInstaller`) that operates on a `.jie/` root. It scans `<root>/teams/<id>/TEAM.md` (preferred v2 layout) and the legacy `<root>/<id>/TEAM.md` layout, plus `<root>/agents/<id>.md` files. It copies teams to `<jieDir>/teams/<id>/` and agents to `<jieDir>/agents/<id>.md`, writing `.source.json` (teams) or `<id>.source.json` (agents) provenance. It is still CLI-side and never imported by the platform.

7. First-run (`src/cli/first-run.ts`) points the installer at `src/manifest/` and installs both the `default-dev-team` blueprint and the `explorer`/`steward` shared agents into `~/.jie/`.

## Consequences

- Team manifests can pull in reusable agents without duplicating their files; adding a shared agent to a team is a one-line `additional-agents:` edit.
- The platform remains agnostic of the bundled content; it only reads installed files from `.jie/` and `~/.jie/`.
- The installer keeps its parse-free boundary: unresolved `additional-agents:` refs surface at team-load time as `AGENT_NOT_FOUND`.
- The `src/manifest/` move is a breaking internal layout change. Existing npm/git packages with the legacy root-level `<id>/TEAM.md` layout still install without modification.

## Status

Accepted.
