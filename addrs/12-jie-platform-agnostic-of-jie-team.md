# ADR 12: jie-platform is Agnostic of jie-team; jie-team is a Manifest + Install Package

## Status

Accepted. Refines ADR 3 (Declarative Blueprints) by adding the package-boundary consequence.

## Context

ADR 3 decided that blueprints are declarative `.md` files — no code between platform and team. That decision answered *what format* a blueprint is in, but left open *which package owns what*.

The previous design had jie-team containing a TypeScript `TeamBlueprint` object exported as `export const minimalTeamBlueprint: TeamBlueprint = { ... }`, imported by the platform. The platform's team-blueprint loader lived in the team layer's runtime surface, or in a hand-shaken contract between the two.

This left two architectural smells:

1. **The platform depends on the team package at runtime.** Even with `.md` files, the "where does the built-in minimal team come from?" question pointed at the team package, and the package's `index.ts` re-export was the import surface. The platform was not generic.
2. **The team package's role was confused.** jie-team shipped the dev team (a user-facing template) and the minimal team (a runtime fallback). The "fallback" was runtime behavior; the "template" was content. Two jobs in one package, with no clear boundary.

## Decision

The package boundary is **content (jie-team) vs. runtime (jie-platform)**:

| Package | Owns | Does not own |
|---|---|---|
| `@cuzfrog/jie-platform` | Agent loop, EventBus, ArtifactStore, Tool Registry, Memory Manager, **team-blueprint loader** (parses `.md` files, builds `AgentSoul[]`) | Any specific team's manifest content. Any knowledge that `@cuzfrog/jie-team` exists. Any TypeScript import from jie-team. |
| `@cuzfrog/jie-team` | `.md` manifests for the dev team and minimal team. A `scripts/install.ts` invoked at postinstall and by the CLI's `jie team install` command, which copies the manifests to `~/.jie/teams/<id>/` (or `.jie/teams/<id>/` for project scope). | Runtime code. Agent logic. Any TypeScript import used at runtime. The `index.ts` may exist for type re-exports but is not imported by the platform. |

**The platform is generic.** It reads team manifests from filesystem paths (`.jie/teams/<id>/`, `~/.jie/teams/<id>/`). It has no `import` of `@cuzfrog/jie-team` in any form, including types. The CLI depends on jie-team only for the `jie team install` command; the platform does not.

**The team package owns its own distribution.** jie-team's `package.json` declares a `postinstall` script that runs the install logic, which copies the dev team and minimal team manifests from the jie-team package's `teams/<id>/` directory to `~/.jie/teams/<id>/`. After postinstall, the manifests live in standard user-level locations. The platform's team resolution (`10-configuration.md` "Team Resolution") finds them there.

**The "built-in default" is just a default `team_id` value.** The platform's team resolution defaults `team_id` to `"minimal"` when no `team_id` is set in config. The minimal team's manifest must exist at one of the standard lookup paths (typically `~/.jie/teams/minimal/` after jie-team's postinstall). If it does not — because jie-team was never installed or its postinstall did not run — startup fails with a clear error pointing at the install step.

**The CLI exposes the install command.** `jie team install <id>` invokes jie-team's install logic and copies the named team's manifests to the chosen scope (default: user). With no `<id>`, install both bundled teams (`minimal` and `dev`). `--scope project` copies to `.jie/teams/` instead of `~/.jie/teams/`. `--force` overwrites existing files (default: skip on conflict to preserve user customizations).

## Rationale

- **Agnosticism enables third-party teams.** If the platform is agnostic of jie-team, a third party can ship their own team package: a directory of `.md` files plus a CLI or installer that copies them to the standard paths. No platform change. No coupling.
- **A single install hook is the right distribution point.** Most users will install the jie binary once and have the dev team and minimal team available immediately. A postinstall script is the standard, well-understood mechanism for this. The `jie team install` command is a re-entry point for users who skipped postinstall, want a different scope, or want to reset a team.
- **The "fallback" is not a special case.** The minimal team is just a team with `team_id = "minimal"`. It uses the same resolution paths as any other user team. The fact that it ships with jie is a packaging concern, not a runtime concern. This collapses three resolution tiers (project, global, "built-in") into two (project, global) plus a default value, which is simpler.
- **Idempotent install preserves user data.** The postinstall script (and the `jie team install` command) skip files that already exist at the destination. Users who customized their dev team will not be clobbered on the next `bun install`. `--force` is an explicit opt-in for the reset case.
- **Type imports remain one-way.** jie-team imports types from jie-platform (`AgentSoul`, `ToolSpec`) for its manifest frontmatter schemas. The reverse direction does not exist. The team package is a downstream consumer of platform types, never the source.

## Consequences

- `packages/jie-platform/team/` is the home of the team-blueprint loader. Its package comment is tightened to make the agnosticism visible.
- `packages/jie-team/` is a manifest + install package. The package's `index.ts` either is removed or exports only types (no runtime values). The `package.json` declares a `postinstall` script.
- The `monorepo-structure.md` dependency graph is updated: the `jie-cli → jie-team` line changes from "minimal team as fallback, dev team as starter template" to "`jie team install` command only". The `jie-team → jie-platform` line clarifies it is dev-only (types).
- `10-configuration.md` "Team Resolution" loses the "Built-in default" row. The "no `team_id`" rule becomes "default `team_id = 'minimal'`; look up at the standard paths". The startup-failure case for a missing user team now also applies to `minimal` (clear error: "run `jie team install` or copy the minimal team manually").
- `12-installation.md` adds a section explaining that the minimal team is installed by jie-team's postinstall on first `bun install`, and can be re-installed via `jie team install`.
- `ui/cli.md` adds a `jie team install [<id>]` command.
- `minimal-team.md` (the spec) loses its "TypeScript module export" example. The "Loader Location" section describes the install mechanism instead.
- ADR 3 (Declarative Blueprints) is amended to add a "Package Boundary" Consequence bullet that points at this ADR.
- **Day 2 stays open.** Third-party team discovery (a registry, version pinning, signed manifests) is a Day 2 concern. v1 ships with one team package (jie-team) and standard-path resolution.
