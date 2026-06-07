# ADR 12: jie-platform is Agnostic of jie-team; jie-team is a Manifest Package

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

**The "built-in default" is just a default `team_id` value.** The platform's team resolution defaults `team_id` to `"minimal"` when no `team_id` is set in config. The minimal team's manifest must exist at one of the standard lookup paths. If it does not, startup fails with a clear error pointing at the missing path — never at an install command. The user obtains the minimal team the same way they obtain any other team: from a third-party source, by copy.

## Rationale

- **Agnosticism enables third-party teams.** If the platform is agnostic of jie-team, a third party can ship their own team package: a directory of `.md` files, optionally with a README that says "copy these into `~/.jie/teams/yourteam/`". No platform change. No coupling. No install ceremony.
- **No install hook keeps the boundary sharp.** A `postinstall` script (or an equivalent CLI command) is a runtime side-effect of a content package, and forces the platform to explain "what if postinstall did not run?" The right answer to that question is "the platform does not care; the user is responsible for the manifests being where they say they are". Removing the hook also removes the question.
- **Copying is the correct distribution primitive.** The platform reads `.md` files from filesystem paths. The natural way to make a file available at a path is to put it there. A manual `cp -r` is two lines of shell and works in every environment (CI, dev, containers, restricted sandboxes where postinstall cannot write to `~/.jie/`). It also composes with version control — a project-local team can be committed to the repo.
- **The "fallback" is not a special case.** The minimal team is just a team with `team_id = "minimal"`. It uses the same resolution paths as any other user team. The fact that it ships in `jie-team` is a packaging concern, not a runtime concern. This collapses three resolution tiers (project, global, "built-in") into two (project, global) plus a default value, which is simpler.
- **Idempotency is a user concern, not the installer's.** With no install script, there is nothing that could clobber user customizations on the next `bun install`. The user decides when (and whether) to refresh a team; the platform never mutates a team's manifest directory on its own.
- **Type imports remain one-way.** jie-team imports types from jie-platform (`AgentSoul`, `ToolSpec`) for its manifest frontmatter schemas. The reverse direction does not exist. The team package is a downstream consumer of platform types, never the source.

## Consequences

- `packages/jie-platform/team/` is the home of the team-blueprint loader. Its package comment is tightened to make the agnosticism visible.
- `packages/jie-team/` is a manifest package: a directory of `.md` files, with no `postinstall` script, no `scripts/install.ts`, and no published `index.ts` runtime surface. Its `package.json` declares the `files: ["teams/"]` distribution set and nothing else. It is not a `dependency` of `@cuzfrog/jie` — it is a sibling, published separately and consumed by humans, not by the platform.
- The `monorepo-structure.md` dependency graph is updated: the `jie-cli → jie-team` line is removed entirely (no platform or CLI code depends on jie-team). The `jie-team → jie-platform` line stays and is dev-only (types).
- `10-configuration.md` "Team Resolution" describes the platform's two-tier lookup and a default `team_id = "minimal"`. The startup-failure case for a missing user team cites the missing filesystem path and points the user at `12-installation.md` "Installing a User Team" for the manual copy steps. It does not mention `jie team install` or `postinstall`.
- `12-installation.md` "Installing a User Team" describes the manual copy pattern: place `TEAM.md` and one `.md` per role at the standard paths, then set `team_id` in `.jie/config.yaml`.
- `ui/cli.md` loses the `jie team install [<id>]` command. The CLI's command set is `jie -p`, `jie --print`, `jie login`, `jie logout`, `jie model`, `jie --api-key`, `jie --version`, `jie --help`.
- `minimal-team.md` (the spec) describes the minimal team as two `.md` files at a standard lookup path. The "Loader Location" section points at the filesystem paths, not at a package or install mechanism.
- ADR 3 (Declarative Blueprints) is amended to remove the "Package Boundary" Consequence bullet's reference to `jie team install` and `postinstall`. The boundary is "manifest package vs. platform runtime", with no install mechanism.
- **Day 2 stays open.** Third-party team discovery (a registry, version pinning, signed manifests, a copy-friendly installer) is a Day 2 concern. v1 ships with one team package (jie-team) and standard-path resolution; users obtain and place manifests by hand.
