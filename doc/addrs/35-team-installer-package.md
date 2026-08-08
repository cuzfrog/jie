# ADR 35: jie-team-installer Owns Team Install/Remove (Day 2 of ADR 11)

## Status

Accepted. Supersedes the install-mechanism clauses of ADR 11: ADR 11's "The team package has no install mechanism" (line 29), "There is no `jie team install` command" (line 47), and "Day 2 stays open" (line 49) are resolved here. ADR 11's core decision - the platform is agnostic of jie-team, and jie-team is a passive content package - is unchanged and reinforced.

## Context

ADR 11 split content (jie-team) from runtime (jie-platform) and deliberately deferred distribution: users obtained team manifests by hand-copying `.md` files into `~/.jie/teams/<id>/`. That kept the v1 boundary sharp but left no story for a third party who ships a team package and wants a user to install it with one command.

Three constraints shape the mechanism:

1. **No package lifecycle hooks.** bun does not run dependency `postinstall` scripts unless the package is trusted (`trustedDependencies` / `bun pm trust`). A postinstall-based auto-install would silently no-op for most users. ADR 11's "no install hook" principle therefore holds for a stronger reason than philosophy.
2. **The platform stays agnostic.** Install is a user/CLI concern, not a runtime concern. The platform must not learn that jie-team or jie-team-installer exists.
3. **The team package stays pure content.** jie-team ships `.md` files and nothing else. Putting install logic there re-confuses its role (ADR 11 smell #2).

## Decision

A new package, `@cuzfrog/jie-team-installer`, is the install-time authority for teams. It is a CLI-side dependency, never imported by the platform or by jie-team.

**Responsibilities.** `parseTeamSource` classifies a source spec as npm, git, or file (pure). `createTeamInstaller(deps)` returns an installer with `install` / `remove` / `readProvenance` over a single `teamsDir`. `install` resolves the source to a local directory via injectable I/O ports (`InstallerDeps`: `fetchJson`, `fetchBinary`, `runGit`, `extractTar`), scans the resolved root for `<id>/TEAM.md` directories, copies the `.md` files into `<teamsDir>/<id>/`, and writes a `.source.json` provenance record. The team-id charset (`[A-Za-z0-9_-]{1,32}`, mirroring the platform) and reserved ids (`add`, `list`, `remove`, `default-solo`) are enforced here, at install time.

**The CLI owns the trigger.** `jie team add <source> [--project] [--force]` and `jie team remove <id> [--project]` route to the installer and do **not** boot the platform - install is not runtime. `jie team list` and `jie team` (info) stay platform-backed (ADR 24: the platform owns team discovery) and enrich the list with installer provenance and the platform-reported location (`builtin` / `project` / `user`, exposed via `getTeamInfo`).

**jie-team remains pure content.** The installer consumes jie-team by scanning its package root for `<id>/TEAM.md` directories after extracting a tarball or cloning - it never imports jie-team. jie-team has no `index.ts`, no `exports`, no install hook.

**No auto-install hook.** There is no `postinstall` in any package. First-run auto-install of jie-team (D1) is a CLI trigger, not a package lifecycle hook, and is addressed separately.

## Rationale

- **A separate package keeps both boundaries intact.** Install logic in jie-team would re-couple content to distribution; install logic in jie-platform would violate agnosticism. A third package is the only home that leaves ADR 11's content/runtime split untouched.
- **Injectable I/O ports make the logic testable without network or git.** `InstallerDeps` is the seam; `defaultInstallerDeps` provides the real `fetch` / `git` / `tar` implementations. Unit tests drive resolvers with mocks and assert filesystem effects on real temp dirs.
- **Install without platform boot is robust.** `jie team add` works before any model is configured and in environments where the platform cannot boot. It also matches the concern split: install-time vs. runtime.
- **list through the platform, provenance through the installer.** The platform is the authority on what is installed (ADR 24); the installer is the authority on where each team came from. Neither duplicates the other.

## Consequences

- `packages/jie-team-installer/` is added (source spec parsing, installer, injectable deps). It is a runtime dependency of `@cuzfrog/jie-cli`, not of jie-platform or jie-team.
- `packages/jie-team/` loses `installer.ts`, `installer.test.ts`, and `index.ts`; its `package.json` has no `exports` or devDependencies. It is a folder of `.md` files plus `MODULE.md`.
- The CLI's team surface is `jie team [<id>]` (info / set-default), `jie team add <source> [--project] [--force]`, `jie team list`, `jie team remove <id> [--project]`, and `--team <id>` (one-shot selection).
- `getTeamInfo` carries each installed team's `location` (`TeamBlueprintLocation`, now exported from the platform) so `list` can show scope.
- The third-party team contract is documented in `doc/specs/jie-team-installer/00-overview.md`: a source root with `<id>/TEAM.md` directories, the npm/git/file spec forms, and the reserved ids.
- `monorepo-structure.md` dependency graph gains `jie-cli -> jie-team-installer`; `jie-team` is listed as pure content with no runtime dependencies and no module entry.
