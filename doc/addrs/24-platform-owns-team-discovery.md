# ADR 24: Platform Owns Team Discovery; CLI Is a Thin Layer

## Status

Accepted. Captures the principle that all team-discovery logic lives in
`jie-platform`; the CLI is responsible only for CLI concerns (argv
parsing, settings I/O, terminal output). The CLI's `teams.ts` becomes
a thin wrapper over the platform's team-discovery functions.

## Context

Today the CLI's `packages/jie-cli/teams.ts` re-implements what the
platform's `packages/jie-platform/config/resolve-stale-team.ts`
already exports:

- CLI `isInstalled(teamId, cwd)` ↔ platform `isTeamInstalled(teamId, projectPath, homeDir)`.
- CLI `listInstalled(cwd)` ↔ platform `listInstalledTeams(projectPath, homeDir)`.

The two implementations drift over time. The CLI's `listInstalled`
also adds the built-in minimal team to the result; the platform's
`listInstalledTeams` does not. The CLI's `locate(teamId, cwd)` (with
`project | global | missing` semantic) has no platform equivalent.

Per ADR 4, the platform is the source of truth for domain
abstractions. The CLI is a thin caller. A user team installed at
`./.jie/teams/<id>/` or `~/.jie/teams/<id>/` is a domain concept,
not a CLI concept. The platform already opens the storage, resolves
the model, loads the team blueprint — it should also own "where is
team X installed?".

This was surfaced during the stage-1 → stage-2 review. Stage-2 will
add the TUI, which is another surface that needs team discovery. If
two surfaces (CLI and TUI) re-implement the same logic, drift is
inevitable.

## Decision

### 1. Team discovery is a platform responsibility

`jie-platform` owns:

- `isTeamInstalled(teamId, projectPath, homeDir): boolean` — already
  exists in `config/resolve-stale-team.ts`. No change.
- `listInstalledTeams(projectPath, homeDir): string[]` — already
  exists. No change. May gain a `includeBuiltIn: boolean` parameter
  to unify the CLI's "always include `minimal`" semantic.
- `locateTeam(teamId, projectPath, homeDir): "project" | "global" | "missing"`
  — **new**. The "project wins over global" rule is platform-level
  (it matches `models.json` and `settings.json` resolution per
  ADR-12's discovery order). The platform exposes it; the CLI
  consumes it.
- The constant `BUILTIN_MINIMAL_TEAM_ID = "minimal"` — **move to
  the platform**. The string id is the same as `loadMinimalTeam`'s
  input. A new export `BUILTIN_MINIMAL_TEAM_ID` in
  `packages/jie-platform/team/` (or `config/`) replaces the CLI's
  local constant.

### 2. The CLI is a thin wrapper

`packages/jie-cli/teams.ts` becomes a thin wrapper:

- `isInstalled(teamId, cwd)` — call `locateTeam` and check `!== "missing"`.
- `listInstalled(cwd)` — call `listInstalledTeams(..., { includeBuiltIn: true })`.
- `locate(teamId, cwd)` — directly call `locateTeam`; the CLI's
  `cwd → projectPath` translation (via `findProjectJieRoot(cwd)`)
  is a CLI-local concern, the lookup itself is a platform call.
- `BUILTIN_MINIMAL_TEAM_ID` — re-export from the platform.

No domain logic in the CLI. The CLI's only team-related code is
the `cwd → projectPath` path resolution and the call delegation.

### 3. The TUI reuses the same platform API

The future `packages/jie-tui/` consumes the same `isTeamInstalled`,
`listInstalledTeams`, `locateTeam` exports. No new team-discovery
code in the TUI.

## Rationale

- **Single source of truth.** One team-discovery module per concern
  (installed, locate, list). The CLI and the TUI (and any future
  surface) call the same functions.
- **No drift.** The CLI's re-implementation is gone. Future
  semantics — say, "team manifests at `<workspace>/teams/<id>/`"
  (a future worktree-aware feature) — land in one place.
- **CLI stays thin.** The CLI is a thin caller; it should not
  re-derive domain concepts.
- **TUI alignment.** The TUI is the next consumer; building it on
  the same platform API prevents the same drift that exists today.

## Consequences

- `packages/jie-platform/config/resolve-stale-team.ts` gains
  `locateTeam(teamId, projectPath, homeDir)` (and possibly a
  `listInstalledTeams` option for the built-in case).
- `packages/jie-platform/team/` (or `config/`) exports
  `BUILTIN_MINIMAL_TEAM_ID = "minimal"`.
- `packages/jie-cli/teams.ts` is rewritten as a thin wrapper.
- `packages/jie-tui/` (when implemented) reuses the platform API.
- The `start.ts:defaultLoadTeamBlueprint` function (which handles
  `teamId === "minimal"` specially) becomes a small lambda in the
  platform's `loadTeamBlueprint` namespace, parameterized by
  `BUILTIN_MINIMAL_TEAM_ID`.
