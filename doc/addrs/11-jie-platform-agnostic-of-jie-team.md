# ADR 11: jie-platform is Agnostic of jie-team; jie-team is a Manifest Package

## Status

Accepted. Subsumes ADR 3 (Declarative Blueprints). The install-mechanism clauses (no install mechanism, no `jie team install` command, "Day 2 stays open") are superseded by ADR 35, which adds the manifest installer and the `jie team add|list|remove` CLI. The core decision - the platform is agnostic of jie-team, and jie-team is a passive content package - is unchanged. The package boundaries were consolidated into a single `@cuzfrog/jie` package per ADR 36, and the content tree was consolidated under `src/manifest/` per ADR 40; the agnosticism is now a src-level module boundary - `src/platform/` has no import of `src/manifest/` (teams or shared agents).

## Context

Team blueprints are declarative `.md` files — no code between platform and team: a `TEAM.md` (frontmatter: leader role; optional `description:` frontmatter and a prose body that becomes shared team context) plus one `.md` per role (frontmatter `model`, `tools`, `notify`; prose body = system prompt). Custom teams require no code changes — a new directory of `.md` files. That answered *what format* a blueprint is in, but left open *which package owns what*.

Previously jie-team mixed content, runtime, and install; platform depended on it.

## Decision

The package/module boundary is content vs. runtime: the platform (runtime) is agnostic of team content; team content is a folder of `.md` files with no runtime code.

The platform reads team manifests from standard filesystem paths; it has no dependency on the teams module.

**The team package has no install mechanism.** `jie-team` is a manifest package. It does not declare a `postinstall` script. There is no `jie team install` CLI command. Distributing its manifests to a working `jie` install is the user's responsibility — typically by copying the files into `~/.jie/teams/<id>/` (global) or `<workspace>/.jie/teams/<id>/` (project-local) by hand. The package's value is *being a discoverable source of the manifests*, not a runtime side-effect.

The built-in default-solo team is a pair of `.md` files loaded by the same parser as user teams; it provides the last-resort fallback when no user team is selected.

## Rationale
No install hook keeps boundary sharp; copying is the correct primitive; built-in lives with platform.

## Consequences

- Platform module owns parsing; teams module is pure `.md` files.
- No install mechanism exists; CLI surface is `jie team [id>]` and `--team <id>`.
- Day 2 concerns remain open.
