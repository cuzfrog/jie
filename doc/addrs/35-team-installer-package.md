# ADR 35: jie-teams-installer Owns Team Install/Remove (Day 2 of ADR 11)

## Status

Accepted. Supersedes the install-mechanism clauses of ADR 11: ADR 11's "The team package has no install mechanism" (line 29), "There is no `jie team install` command" (line 47), and "Day 2 stays open" (line 49) are resolved here. ADR 11's core decision - the platform is agnostic of jie-team, and jie-team is a passive content package - is unchanged and reinforced. Supplemented by ADR 40, which adds shared agent manifests and consolidates content under `src/manifest/`.

## Context

ADR 11 deferred team distribution.

Three constraints shape the mechanism:

No `postinstall`; platform stays agnostic.

## Decision

A CLI-side manifest installer is the install-time authority for teams and shared agents. It lives under `src/manifest/installer/`, is never imported by the platform, and operates on a `.jie/` root.

Installer resolves source (npm/git/file) via injectable I/O, copies team directories (`teams/<id>/`) and shared agent files (`agents/<id>.md`), writes provenance per item.

CLI owns `add`/`remove`/`list` for teams.

Manifest content is pure content (no exports, no runtime).

First-run prompt via CLI trigger (`.first-run-done` sentinel), not package hook.

## Rationale

Separate module keeps boundaries; injectable ports testable; install works without platform boot. The unit of installation is the `.jie/` root because teams and their shared agents are sibling content under the same manifest source.

## Consequences

- `src/manifest/installer/` is the installer module (source spec parsing, installer, injectable deps). It is a runtime dependency of `src/cli`, not of `src/platform/` or the manifest content.
- `src/manifest/teams/` and `src/manifest/agents/` are pure content; they have no `index.ts`, no `package.json` exports, and no runtime dependencies.
- The CLI's team surface is `jie team [<id>]` (info / set-default), `jie team add <source> [--project] [--force]`, `jie team list`, `jie team remove <id> [--project]`, and `--team <id>` (one-shot selection).
- `getTeamInfo` carries each installed team's `location` (`TeamBlueprintLocation`, exported from the platform) so `list` can show scope.
- The third-party manifest source contract (superseded by ADR 40) is documented in `doc/specs/jie-team/00-overview.md` and this ADR: a source root may contain `teams/<id>/TEAM.md` directories (preferred v2 layout), the legacy `<id>/TEAM.md` directories, and `agents/<id>.md` files. Reserved ids remain `add`, `list`, `remove`, `default-solo` for teams; shared agent ids must match the same `[A-Za-z0-9_-]{1,64}` stem pattern as team roles.
- `monorepo-structure.md` dependency graph lists `cli -> manifest/installer`; `manifest/teams` and `manifest/agents` are pure content with no runtime dependencies and no module entry.
