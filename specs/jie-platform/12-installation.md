# Installation

## Dependency Surface

| Dependency | Required? | Role |
|---|---|---|
| **bun** ≥ 1.3.14 | Yes | Runtime. Executes TypeScript natively — no compilation step. |
| Git | Optional | Used only if the user's workflow involves git; Jie has no git integration in v1. |
| TypeScript / tsconfig | Optional | Only required if the workspace under Jie management is TypeScript. |

No NATS. No Docker. No license server. A supported LLM provider API key is required — set via environment variables (see `10-configuration.md`).

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

## Project Initialization (Interactive)

When `jie` is run and no `.jie/config.yaml` is found by walking up from CWD, the CLI enters an interactive init flow:

1. **`team_id`** — default: `"default"`. Any string matching `[A-Za-z0-9_-]{1,32}`.
2. **`workspace_root`** — default: `"."`. Relative to the directory where `.jie/config.yaml` lives.

The CLI writes `.jie/config.yaml` and proceeds.

### Resulting Config

```yaml
team_id: "my-project"
workspace_root: "."
```

Full field semantics in `10-configuration.md`.

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
