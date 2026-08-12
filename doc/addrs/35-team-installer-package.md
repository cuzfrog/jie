# ADR 35: jie-teams-installer Owns Team Install/Remove (Day 2 of ADR 11)

## Status

Accepted. Supersedes the install-mechanism clauses of ADR 11: ADR 11's "The team package has no install mechanism" (line 29), "There is no `jie team install` command" (line 47), and "Day 2 stays open" (line 49) are resolved here. ADR 11's core decision - the platform is agnostic of jie-team, and jie-team is a passive content package - is unchanged and reinforced..

## Context

ADR 11 deferred team distribution.

Three constraints shape the mechanism:

No `postinstall`; platform stays agnostic.

## Decision

A new package, `@cuzfrog/jie-teams-installer`, is the install-time authority for teams. It is a CLI-side dependency, never imported by the platform or by jie-team.

Installer resolves source (npm/git/file) via injectable I/O, copies manifests, writes provenance.

CLI owns `add`/`remove`/`list`.

jie-team pure content (no exports, no runtime).

First-run prompt via CLI trigger (`.first-run-done` sentinel), not package hook.

## Rationale
Separate package keeps boundaries; injectable ports testable; install works without platform boot.

## Consequences

- `packages/jie-teams-installer/` is added (source spec parsing, installer, injectable deps). It is a runtime dependency of `@cuzfrog/jie-cli`, not of jie-platform or jie-team.
- `packages/jie-team/` loses `installer.ts`, `installer.test.ts`, and `index.ts`; its `package.json` has no `exports` or devDependencies. It is a folder of `.md` files plus `MODULE.md`.
- The CLI's team surface is `jie team [<id>]` (info / set-default), `jie team add <source> [--project] [--force]`, `jie team list`, `jie team remove <id> [--project]`, and `--team <id>` (one-shot selection).
- `getTeamInfo` carries each installed team's `location` (`TeamBlueprintLocation`, now exported from the platform) so `list` can show scope.
- The third-party team contract is documented in `doc/specs/jie-teams-installer/00-overview.md`: a source root with `<id>/TEAM.md` directories, the npm/git/file spec forms, and the reserved ids.
- `monorepo-structure.md` dependency graph gains `jie-cli -> jie-teams-installer`; `jie-team` is listed as pure content with no runtime dependencies and no module entry.
