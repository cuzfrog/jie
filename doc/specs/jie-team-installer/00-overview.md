# jie-team-installer - Overview

The install-time authority for teams. Resolves a team source (npm package, git repo, or local path) to a local directory, scans it for team manifests, and copies them into a teams directory where jie-platform discovers them at runtime. A CLI-side dependency of `@cuzfrog/jie-cli`; never imported by jie-platform or jie-team (ADR 35).

## Team source contract

A **team source** is anything that resolves to a local directory whose immediate subdirectories are team manifest directories. A team manifest directory is named with a valid team id and contains a `TEAM.md` plus zero or more `<role>.md` files (the format `jie-platform/team/parser.ts` parses). The installer scans the resolved root's immediate children, skips entries without a `TEAM.md`, and installs each one. Non-directory files at the root (a `package.json`, `README`, etc.) are ignored.

**Team id.** `[A-Za-z0-9_-]{1,32}` - the same charset the platform accepts. Reserved and rejected at install time: `add`, `list`, `remove`, `default-solo` (the CLI subcommands and the built-in fallback). A source that ships a directory with a reserved or invalid id fails the install with a clear error.

### Source forms

| Kind | Spec examples | Resolution |
|---|---|---|
| **npm** | `@cuzfrog/jie-team`, `some-team`, `@cuzfrog/jie-team@0.9.0`, `some-team@next` | Fetch `https://registry.npmjs.org/<name>`, resolve the version (a dist-tag like `latest`/`next`, or an exact version - semver ranges are not supported in v1), download the tarball, extract it, and use its `package/` directory as the source root. |
| **git** | `github:owner/repo`, `github:owner/repo#v1.2.3`, `https://example.com/repo.git`, `https://example.com/repo#main`, `git@example.com:owner/repo.git` | `git clone --depth 1` (with `--branch <ref>` when a ref is given). The `github:` shorthand normalizes to `https://github.com/owner/repo.git`. The `#ref` suffix selects a branch or tag; a bare commit hash is not supported in v1 (depth-1 clone cannot reach an arbitrary sha). The clone root is the source root. |
| **file** | `./teams/dev`, `../teams/dev`, `/abs/path`, `~/teams/dev` | A local directory, read in place. The directory itself is the source root. |

`parseTeamSource` classifies by prefix: `./` `../` `/` `~/` -> file; `github:` `git+` `git@` `http://` `https://` `ssh://` or a `.git` suffix -> git; otherwise npm. `parseNpmSpec` splits `<name>@<version>` (the scope slash is not a separator; the version is the text after the last `@` that is not the leading scope `@`).

### Install, remove, provenance

- `install(spec, teamsDir, { force })` resolves the source, scans for team dirs, and for each id validates the id, refuses an existing `<teamsDir>/<id>` unless `force` is set, copies the `.md` files, and writes `<teamsDir>/<id>/.source.json`. Returns the installed ids. The installer never imports the source package; it only reads files.
- `remove(teamId, teamsDir)` deletes `<teamsDir>/<teamId>/`.
- `readProvenance(teamId, teamsDir)` reads the `.source.json` written at install time (`{ source: TeamSource, spec, installedAt }`), or null. The platform's team parser ignores non-`.md` files, so the provenance file does not affect runtime parsing.

`.source.json` is the only non-manifest file the installer writes into a team directory.

## I/O ports

`InstallerDeps` is the testability seam: `fetchJson`, `fetchBinary`, `runGit`, `extractTar`. `defaultInstallerDeps` provides the real implementations (global `fetch`; `git` via `Bun.spawnSync`; tarball extraction via the system `tar -xzf`). Unit tests inject mocks and assert filesystem effects on real temp directories; the real I/O implementations are exercised by integration, not by unit tests.

## CLI surface

`jie team add <source> [--project] [--force]` and `jie team remove <id> [--project]` use the installer without booting the platform. `--project` targets `<project>/.jie/teams/` (the project `.jie` is found by walking up from the CWD); the default is the global `~/.jie/teams/`. `jie team list` is platform-backed (ADR 24 - the platform owns discovery) and enriches each installed team with its location and the installer's provenance.
