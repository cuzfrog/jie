# ADR 11: jie-platform is Agnostic of jie-team; jie-team is a Manifest Package

## Status

Accepted. Refines ADR 3 (Declarative Blueprints) by adding the package-boundary consequence.

## Context

ADR 3 decided that blueprints are declarative `.md` files — no code between platform and team. That decision answered *what format* a blueprint is in, but left open *which package owns what*.

The previous design had jie-team containing a TypeScript `TeamBlueprint` object exported as `export const minimalTeamBlueprint: TeamBlueprint = { ... }`, imported by the platform. The platform's team-blueprint loader lived in the team layer's runtime surface, or in a hand-shaken contract between the two.

This left two architectural smells:

1. **The platform depends on the team package at runtime.** Even with `.md` files, the "where does the built-in minimal team come from?" question pointed at the team package, and the package's `index.ts` re-export was the import surface. The platform was not generic.
2. **The team package's role was confused.** jie-team shipped the dev team (a user-facing template) and the minimal team (a runtime fallback), and bolted on a `postinstall` script plus a `jie team install` CLI command to push those manifests onto the user's filesystem. The "fallback" was runtime behavior; the "template" was content; the "installer" was a third concern. Three jobs, with no clear boundary.

## Decision

The package boundary is **content (jie-team) vs. runtime (jie-platform)**:

| Package | Owns | Does not own |
|---|---|---|
| `@cuzfrog/jie-platform` | Agent loop, EventBus, ArtifactStore, Tool Registry, Memory Manager, **team-blueprint loader** (parses `.md` files, builds `AgentSoul[]`) | Any specific team's manifest content. Any knowledge that `@cuzfrog/jie-team` exists. Any TypeScript import from jie-team. |
| `@cuzfrog/jie-team` | A directory of `.md` manifests: `TEAM.md` + one `.md` per role, for the dev team and minimal team. | Runtime code. Agent logic. Install scripts. CLI commands. Any TypeScript import used at runtime. Any `postinstall` hook. The package is a passive artifact: a folder of files, optionally published so users can copy from it. |

**The platform is generic.** It reads team manifests from filesystem paths (`.jie/teams/<id>/`, `~/.jie/teams/<id>/`). It has no `import` of `@cuzfrog/jie-team` in any form, including types. No platform code path assumes jie-team exists or has run.

**The team package has no install mechanism.** `jie-team` is a manifest package. It does not declare a `postinstall` script. There is no `jie team install` CLI command. Distributing its manifests to a working `jie` install is the user's responsibility — typically by copying the files into `~/.jie/teams/<id>/` (global) or `<workspace>/.jie/teams/<id>/` (project-local) by hand. The package's value is *being a discoverable source of the manifests*, not a runtime side-effect.

**The platform ships a built-in minimal team as a last-resort fallback.** The built-in is two `.md` files at `packages/jie-platform/team/minimal/`, loaded at module-load time via `import` attributes (per ADR 14). It is used only when no user team is selected. The platform is agnostic of `jie-team` as a package — no `import`, no `dependency`, no `postinstall` hook. The `jie-team` package may ship its own minimal team `.md` files which, once copied to `~/.jie/teams/minimal/` or `.jie/teams/minimal/`, override the platform's built-in. The built-in is the v1 "always has something to run" guarantee.

## Rationale

- **Agnosticism enables third-party teams.** If the platform is agnostic of jie-team, a third party can ship their own team package: a directory of `.md` files, optionally with a README that says "copy these into `~/.jie/teams/yourteam/`". No platform change. No coupling. No install ceremony.
- **No install hook keeps the boundary sharp.** A `postinstall` script (or an equivalent CLI command) is a runtime side-effect of a content package, and forces the platform to explain "what if postinstall did not run?" The right answer to that question is "the platform does not care; the user is responsible for the manifests being where they say they are". Removing the hook also removes the question.
- **Copying is the correct distribution primitive.** The platform reads `.md` files from filesystem paths. The natural way to make a file available at a path is to put it there. A manual `cp -r` is two lines of shell and works in every environment (CI, dev, containers, restricted sandboxes where postinstall cannot write to `~/.jie/`). It also composes with version control — a project-local team can be committed to the repo.
- **The built-in fallback lives with the platform, not with jie-team.** The platform ships the built-in because the built-in is a runtime guarantee (the user can always run `jie`). jie-team is an optional content source. The two are independent: the platform does not import from `jie-team`, and the `jie-team` package does not import from the platform at runtime.
- **Idempotency is a user concern, not the installer's.** With no install script, there is nothing that could clobber user customizations on the next `bun install`. The user decides when (and whether) to refresh a team; the platform never mutates a team's manifest directory on its own.

## Consequences

- `packages/jie-platform/team/` is the home of the team-blueprint loader and the `minimal/` `.md` files (per ADR 14).
- `packages/jie-team/` is a manifest package: a directory of `.md` files, with no `postinstall` script, no `scripts/install.ts`, and no published `index.ts` runtime surface. Its `package.json` declares the `files: ["teams/"]` distribution set and nothing else. It is not a `dependency` of `@cuzfrog/jie` — it is a sibling, published separately and consumed by humans, not by the platform.
- The `monorepo-structure.md` dependency graph is updated: the `jie-cli → jie-team` line is removed entirely (no platform or CLI code depends on jie-team). The `jie-team → jie-platform` line stays and is dev-only (types).
- `10-configuration.md` "Team Selection" describes the platform's resolution chain (`--team`, `defaultTeam`, first-available user team, built-in minimal) and the stale-recovery rule. The platform never fails on "no teams available" — the built-in is the last-resort fallback.
- `ui/cli.md` does not implement `jie team install [<id>]`. The CLI's command set is `jie -p`, `jie --print`, `jie login`, `jie logout`, `jie model`, `jie --api-key`, `jie --version`, `jie --help`.
- `minimal-team.md` describes the minimal team as two `.md` files at a standard lookup path. The "Loader Location" section points at the filesystem paths, not at a package or install mechanism.
- **Day 2 stays open.** Third-party team discovery (a registry, version pinning, signed manifests, a copy-friendly installer) is a Day 2 concern. v1 ships with one team package (jie-team) and standard-path resolution; users obtain and place manifests by hand.
