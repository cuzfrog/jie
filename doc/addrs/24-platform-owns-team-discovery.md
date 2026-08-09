# ADR 24: Platform Owns Team Discovery; CLI Is a Thin Layer

## Status

Accepted. All team-discovery logic lives in `jie-platform`; the CLI and TUI are responsible only for their own concerns (argv parsing, rendering, terminal output). Per ADR 36 the packages consolidated into one; discovery logic now lives in `src/platform/team/`.

## Context

"Where is team X installed?" (`.jie/teams/<id>/` project-local, `~/.jie/teams/<id>/` global, built-in `default-solo` fallback) is a domain concept, not a CLI concept. An early design re-implemented installed/locate/list in the CLI alongside the platform's own copies; the two drifted (the CLI added the built-in team to listings, the platform did not; the CLI's `locate` semantic had no platform equivalent). The platform already opens the storage, resolves the model, and loads the blueprint — it should also own discovery. With the TUI as a second consumer, two re-implementations would drift again.

## Decision

### 1. Team discovery is a platform responsibility

The platform's team module owns discovery (`locate`, `listInstalled`, built-in constant). It matches the config/file discovery order.

### 2. The CLI and TUI are thin consumers

No discovery code in the CLI or TUI. Team operations surface as platform commands (`team`, `getTeamInfo`, `setDefaultTeam`); the CLI's only team-local concern is `cwd → projectPath` resolution and printing results.

## Rationale

- **Single source of truth.** One discovery module; the CLI, the TUI, and any future surface call the same functions.
- **No drift.** Future semantics — say, "team manifests at `<workspace>/teams/<id>/`" (a worktree-aware feature) — land in one place.
- **Consumers stay thin.** A thin caller should not re-derive domain concepts.

## Consequences

- Discovery stays in the platform module; CLI and TUI consume it through platform commands.
- Config resolution uses the same discovery source.
