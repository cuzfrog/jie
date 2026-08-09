# ADR 24: Platform Owns Team Discovery; CLI Is a Thin Layer

## Status

Accepted. All team-discovery logic lives in `jie-platform`; the CLI and TUI are responsible only for their own concerns (argv parsing, rendering, terminal output)..

## Context

"Where is team X installed?" (`.jie/teams/<id>/` project-local, `~/.jie/teams/<id>/` global, built-in `default-solo` fallback) is a domain concept, not a CLI concept. An early design re-implemented installed/locate/list in the CLI alongside the platform's own copies; the two drifted (the CLI added the built-in team to listings, the platform did not; the CLI's `locate` semantic had no platform equivalent). The platform already opens the storage, resolves the model, and loads the blueprint — it should also own discovery. With the TUI as a second consumer, two re-implementations would drift again.

## Decision

Discovery in platform; CLI/TUI thin consumers.

## Rationale

- **Single source of truth.** One discovery module; the CLI, the TUI, and any future surface call the same functions.
- **No drift.** Future semantics — say, "team manifests at `<workspace>/teams/<id>/`" (a worktree-aware feature) — land in one place.
- **Consumers stay thin.** A thin caller should not re-derive domain concepts.

## Consequences

- Discovery stays in the platform module; CLI and TUI consume it through platform commands.
- Config resolution uses the same discovery source.
