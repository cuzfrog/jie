# Installation

## Dependency Surface

| Dependency | Required? | Role |
|---|---|---|
| **bun** ≥ 1.3.14 | Yes | Runtime. Executes TypeScript natively — no compilation step. |
| Git | Optional | Used only if the user's workflow involves git; Jie has no git integration in v1. |
| TypeScript / tsconfig | Optional | Only required if the workspace under Jie management is TypeScript. |

No NATS. No Docker. No license server. A supported LLM provider API key is required for the runtime to make LLM calls, but it is **not required at install time** — the user runs `jie login` interactively before the first `jie` invocation, and the platform refuses to start with a clear error otherwise. `auth.json` is the sole credential source in v1 (per ADR 21); the platform does not read provider environment variables. See `10-configuration.md` "Credentials Resolution Order".

### Platform Support

| Platform | Status |
|---|---|
| macOS (arm64, x64) | Supported |
| Linux (x64, arm64) | Supported |
| WSL2 | Supported |
| Native Windows | Not supported — use WSL2 |

## One-Liner Install

> **Day 2.** The polished install script at `https://install.jie.dev` (OS check, bun check, pinned version, idempotent re-run) is a Day 2 concern — see backlog. v1 supports only manual install.

```bash
curl -fsSL https://install.jie.dev | sh
```

When implemented (Day 2), this script installs `@cuzfrog/jie` globally. The version is pinned in the script.

### Pinned Versions (v1)

| Component | Version | Rationale |
|---|---|---|
| bun | ≥ 1.3.14 | Minimum runtime for native TypeScript execution and package management. |
| @cuzfrog/jie | workspace (dev) | CLI, `startJie` entry, agent bodies, TUI — all in one package. The published install path (Day 2) pins a concrete semver. |

## Manual Install (v1 path)

```bash
git clone https://cuzfrog.github.com/jie
cd jie
bun install
bun link --global
```

Or, if `@cuzfrog/jie` is already published locally (Day 2):

```bash
bun install -g @cuzfrog/jie
```

After either path, `jie --version` confirms the binary is callable.

## Runtime Dependencies (Shipped with Jie)

`jie-platform` and `jie-tui` are bundled via workspace dependencies in `@cuzfrog/jie`. The user does not install them separately.

Team manifests are plain `.md` files placed at the standard paths described in `10-configuration.md` "Team Selection". v1 ships the built-in minimal team; richer team manifests (when available) are user-installed at `~/.jie/teams/<id>/` or `.jie/teams/<id>/` by hand.

External tool dependencies (linters, formatters, test runners) are **not** installed by Jie. Agents invoke them via the `bash` tool; they must be present in the workspace's `node_modules` or system `PATH`.

## Project Setup (Optional)

The `jie` CLI works out of the box with no settings file. To customize provider, model, or team selection at the project level, create `.jie/settings.json` manually in the project root. All fields are optional; see `10-configuration.md` for the schema and validation rules.

Platform tunables (stream chunk size, flush interval) are hard-coded in v1; no configuration is exposed for them.

### First-Run Credentials and Model

The platform does not assume a model or provider. The first `jie` invocation in a fresh environment — before the user has run `jie login` and `jie model` — fails fast at the model pre-check with a clear pointer to the right command. Expected sequence on a clean machine:

```bash
jie login                              # one-time: pick a provider, OAuth or paste API key → ~/.jie/auth.json
jie model anthropic/claude-sonnet-4-5  # one-time: set the global default model → ~/.jie/settings.json
jie                                   # now the team runs
```

After the first two commands, subsequent `jie` (and `jie -p`) invocations proceed without setup. Credentials and model persist across runs; nothing else needs to be configured to get a runnable agent. The platform's built-in minimal team is the last-resort fallback when no user team is selected — see `minimal-team.md`. A user with only `jie login` and `jie model` set up can run `jie` immediately; the platform picks the built-in minimal team.

For project-level model overrides (e.g. a team pinned to a specific model id), create `.jie/settings.json` in the project root by hand. It deep-merges over `~/.jie/settings.json`.

### Installing a User Team

User-installed teams are plain files — no platform-managed install step. The platform looks them up by name at the standard paths. See `10-configuration.md` "Team Selection" for the resolution rules.

The platform's **built-in minimal team** is always available as a last-resort fallback and requires no installation. To override the built-in's defaults (system prompt, tools, default model), place `TEAM.md` and `general.md` (the minimal-team shape) at one of:

- `~/.jie/teams/minimal/` — global, applies to every project for the current user
- `<project>/.jie/teams/minimal/` — project-local (discovered by walking up from CWD to find `.jie/`); overrides the global copy

Once installed, the user-installed `minimal` team takes precedence over the platform's built-in.

The same pattern applies to any other team: place `TEAM.md` and one `.md` per agent role at the standard paths.

To use a non-default team:

1. Place the team's `TEAM.md` and one `.md` per agent role at `.jie/teams/<id>/` (project-local, discovered by walking up from CWD) or `~/.jie/teams/<id>/` (global). See `06-agent-model.md` "Blueprint Loading" for the file format.
2. Run `jie team <id>` (or `/team <id>` in the TUI) to set `defaultTeam`. The platform writes to the same scope where the team is installed (project-local install → `.jie/settings.json`; global install → `~/.jie/settings.json`). The TUI hot-swaps the running team; the CLI takes effect on next invocation.

To use a team for a single invocation without changing settings, pass `--team <id>` to `jie` or `jie -p`.

## Verification

```bash
jie --version         # Confirm CLI is callable
```

## Startup

```bash
cd /path/to/project
jie                    # Interactive TUI mode
jie -p "instruction"   # One-shot print mode
```

## Troubleshooting

| Symptom | Check |
|---|---|
| Install script fails on bun check | `bun --version`. Must be ≥ 1.3.14. Upgrade: `bun upgrade` or see bun.sh. |
| Install script fails on platform | Native Windows is unsupported. Use WSL2. |
| `jie` can't find config | Run from within the workspace or create `.jie/settings.json`. |
| `jie` exits 1 with "No model has been selected, please login and select a default model." | No global default model is set. Run `jie login` (once) and `jie model <provider>/<modelId>` to configure. See `10-configuration.md` "Model Resolution". |
| `jie` errors at LLM call time with "no API key found" | Run `jie login` for the resolved provider (or `jie --api-key <key>` for a one-shot write to `auth.json`). The platform does not read provider env vars in v1; `auth.json` is the only source. See `10-configuration.md` "Credentials Resolution Order". |
