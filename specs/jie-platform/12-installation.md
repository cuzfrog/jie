# Installation

## Dependency Surface

| Dependency | Required? | Role |
|---|---|---|
| **bun** ≥ 1.3.14 | Yes | Runtime. Executes TypeScript natively — no compilation step. |
| Git | Optional | Used only if the user's workflow involves git; Jie has no git integration in v1. |
| TypeScript / tsconfig | Optional | Only required if the workspace under Jie management is TypeScript. |

No NATS. No Docker. No license server. A supported LLM provider API key is required for the runtime to make LLM calls, but it is **not required at install time** — the user runs `jie login` interactively (or sets an env var) before the first `jie` invocation, and the platform refuses to start with a clear error otherwise. See `10-configuration.md` "Credentials Resolution Order".

### Platform Support

| Platform | Status |
|---|---|
| macOS (arm64, x64) | Supported |
| Linux (x64, arm64) | Supported |
| WSL2 | Supported |
| Native Windows | Not supported — use WSL2 |

## One-Liner Install

```bash
curl -fsSL https://install.jie.dev | sh
```

This script installs `@cuzfrog/jie` globally. It is the only supported installation path for v1. The version is pinned in the script.

### Install Script Contract

1. **OS check.** Detects macOS or Linux (including WSL). Exits with an error on native Windows.
2. **bun check.** Detects `bun --version`. If absent or < 1.3.14, prints an error directing to `https://bun.sh` and exits.
3. **Jie install.** Runs `bun install -g @cuzfrog/jie` with the pinned version.
4. **Verification.** Runs `jie --version` to confirm the binary is callable.

The script is idempotent — re-running it upgrades to the pinned version or no-ops if already current.

### Pinned Versions (v1)

| Component | Version | Rationale |
|---|---|---|
| bun | ≥ 1.3.14 | Minimum runtime for native TypeScript execution and package management. |
| @cuzfrog/jie | latest stable | CLI, supervisor, agent bodies, TUI — all in one package. |

## Manual Install (Fallback)

```bash
bun install -g @cuzfrog/jie
```

From-source build:

```bash
git clone <repo>
cd jie
bun install
bun link --global
```

## Runtime Dependencies (Shipped with Jie)

All Jie-internal packages (`jie-platform`, `jie-tui`, `jie-team`, `code-lens`) are bundled via workspace dependencies in `@cuzfrog/jie`. The user does not install them separately.

External tool dependencies (linters, formatters, test runners) are **not** installed by Jie. Agents invoke them via the `bash` tool; they must be present in the workspace's `node_modules` or system `PATH`.

## Project Setup (Optional)

The `jie` CLI works out of the box with no config file. To customize (custom team, workspace root, stream tunables), create `.jie/config.yaml` manually in the workspace root. All fields are optional; see `10-configuration.md` for the schema and validation rules.

### First-Run Credentials and Model

The platform does not assume a model or provider. The first `jie` invocation in a fresh environment — before the user has run `jie login` and `jie model` — fails fast at the model pre-check with a clear pointer to the right command. Expected sequence on a clean machine:

```bash
jie login                              # one-time: pick a provider, OAuth or paste API key → ~/.jie/auth.json
jie model anthropic/claude-sonnet-4-5  # one-time: set the global default model → ~/.jie/settings.json
jie                                   # now the team runs
```

After the first two commands, subsequent `jie` (and `jie -p`) invocations proceed without setup. Credentials and model persist across runs; nothing else needs to be configured to get a runnable agent.

For project-level model overrides (e.g. a team pinned to a specific model id), create `.jie/settings.json` in the project root by hand. It deep-merges over `~/.jie/settings.json`.

### Installing a User Team

To use a non-default team:

1. Create `.jie/teams/<team_id>/` in the project (or `~/.jie/teams/<team_id>/` for a global install).
2. Place `TEAM.md` and one `.md` per agent role in that directory. See `05-agent-model.md` Blueprint Loading for the file format.
3. Add `team_id: <team_id>` to `.jie/config.yaml`.

The v1 dev team blueprint (DM/Researcher/Architect/Planner/Implementer/Reviewer) is shipped in the `jie-team` package as a starter template. Users copy the relevant `.md` files into their team directory and set `team_id` accordingly. There is no `jie team install` command in v1.

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
| `jie` can't find config | Run from within the workspace or create `.jie/config.yaml`. |
| `jie` exits 1 with "model resolution failed for N agents" | No global default model is set. Run `jie login` (once) and `jie model <provider>/<modelId>` to configure. See `10-configuration.md` "Model Resolution". |
| `jie` errors at LLM call time with "no API key found" | Run `jie login` for the resolved provider, or set the provider's env var. See `10-configuration.md` "Credentials Resolution Order". |
