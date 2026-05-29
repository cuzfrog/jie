# Installation

How Jie and its runtime dependencies are installed and bootstrapped. Jie has no database, no service mesh, no agent lifecycle manager beyond the supervisor — all of which ship as packages in the monorepo.

## Dependency Surface

| Dependency | Required? | Role |
|---|---|---|
| **bun** ≥ 1.3.14 | Yes | Runtime for supervisor, agent bodies, TUI, and CLI. Runs TypeScript natively — no compilation step. |
| **nats-server** (pinned) | Yes | Message bus. All inter-process communication. Installed by the setup script. |
| Git | Optional | Used only if the user's workflow involves git; Jie itself has no git integration in v1. |
| TypeScript / tsconfig | Optional | Only required if the workspace under Jie management is TypeScript. |

No Docker required. No cloud account, no API key, no license server.

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

This script installs both `nats-server` and `@cuzfrog/jie` globally. It is the only supported installation path for v1. All dependency versions are pinned in the script.

## Install Script Contract

The script performs these steps in order:

1. **OS check.** Detects macOS or Linux (including WSL). Exits with an error on native Windows.
2. **bun check.** Detects `bun --version`. If absent or < 1.3.14, prints an error directing the user to `https://bun.sh` and exits.
3. **nats-server install.** Downloads the pinned `nats-server` binary for the detected platform and architecture, places it in a directory on `PATH` (e.g. `/usr/local/bin` or `~/.local/bin`).
4. **Jie install.** Runs `bun install -g @cuzfrog/jie` with the pinned version.
5. **Verification.** Runs `jie --version` to confirm the binary is callable.

The script is idempotent — re-running it upgrades to the pinned versions or no-ops if already current.

### Pinned Versions (v1)

| Component | Version | Rationale |
|---|---|---|
| bun | ≥ 1.3.14 | Minimum runtime for native TypeScript execution and package management. |
| nats-server | 2.10.x (latest patch) | Core pub/sub. |
| @cuzfrog/jie | latest stable | CLI, supervisor, agent bodies, TUI — all in one package. |

The install script pins exact versions; the spec records the floor and rationale.

## Manual Install (Fallback)

If the one-liner script fails or the user needs a custom setup:

```bash
# 1. Install nats-server manually (see nats.io/download)
nats-server --version  # must be ≥ 2.10

# 2. Install Jie
bun install -g @cuzfrog/jie
```

From-source build:

```bash
git clone <repo>
cd jie
bun install
bun run build
bun link --global
```

## Runtime Dependencies (Shipped with Jie)

All Jie-internal packages (`core`, `jie-platform`, `storage`, `tui`) are bundled in `@cuzfrog/jie`. The user does not install them separately. The supervisor discovers package entry points relative to the Jie installation root.

External tool dependencies (linters, formatters, test runners) are **not** installed by Jie. Each agent role may invoke tools like `eslint` or `vitest` via the `bash` tool; these must be present in the workspace's `node_modules` or system `PATH`. Jie does not manage them.

## Project Initialization (Interactive)

When any `jie` command is run and no `.jie/config.yaml` is found by walking up from CWD, the CLI enters an interactive init flow instead of failing.

### Init Flow

The CLI prompts the user with defaults, accepting Enter to keep each default:

1. **`team_id`** — default: `"default"`. Any string matching `[A-Za-z0-9_-]{1,32}`.
2. **`workspace_root`** — default: `"."`. Relative to the directory where `.jie/config.yaml` lives.
3. **NATS probe.** The CLI attempts to connect to `nats://localhost:4222`. If unreachable:
   - Prompts: *"NATS is not reachable on localhost:4222. Enter NATS URL:"*
   - Accepts any valid `nats://` or `tls://` URL.
   - If NATS is reachable on the default port, `nats_url` defaults to `"nats://localhost:4222"` without asking.

The CLI then writes `.jie/config.yaml` in the CWD and proceeds with the original command.

### Resulting Config

```yaml
team_id: "my-project"
nats_url: "nats://localhost:4222"
workspace_root: "."
```

Full field semantics in `10-configuration.md`.

## NATS Connectivity

### CLI Health Check

Before executing any command that requires NATS (`jie start`, `jie ui`, `jie prompt`, `jie query-task`, `jie doctor`), the CLI performs an internal connectivity check against `nats_url` from config. If NATS is unreachable, the CLI:

1. Prints: `Error: NATS is not reachable at <nats_url>. Ensure nats-server is running.`
2. Suggests: `Run 'nats-server &' to start it.`
3. Exits with code 2.

Commands that do not require NATS (e.g. `jie --version`, `jie --help`) skip this check.

### Running NATS

After installation, start NATS before using Jie:

```bash
nats-server &
```

## Verification

```bash
jie --version         # Confirm CLI is callable
jie doctor            # Team health check (starts backend if not running)
```

`jie doctor` subscribes to `supervisor.{team_id}.heartbeat` and `agent.{team_id}.>.heartbeat`, collects for 2 seconds, and reports agent status (see `11-monitoring.md`). Exit code 0 means all heartbeats received; exit code 1 means some agents are missing, stale, or in error state.

## Startup

```bash
cd /path/to/project
jie
```

`jie` is idempotent. If the backend (supervisor + agents) is already running, it attaches the TUI only. If fresh, it starts the supervisor, which launches agent bodies and the TUI.

Headless mode (backend only, no TUI):

```bash
jie start
jie prompt "Add a User type to src/types.ts"
jie query-task PROJ-001
```

## NATS Configuration

### Port

Default: `4222`. Configurable via `nats_url` in `.jie/config.yaml`. The same port serves all teams on the same NATS instance; teams are isolated by subject namespace (`team.{team_id}.*`).

## Multi-Project Setup

A single NATS instance can serve multiple Jie teams simultaneously. Each team sets a unique `team_id` in `.jie/config.yaml`:

```yaml
# Project A
team_id: "project-a"
nats_url: "nats://localhost:4222"
```

```yaml
# Project B
team_id: "project-b"
nats_url: "nats://localhost:4222"
```

Teams share the NATS transport but are subject-isolated via `team_id` prefix. v1 uses soft isolation (see `02-protocol-stack.md`); hard isolation (auth, ACLs) is a Day 3 security concern (backlog #16).

## Troubleshooting

| Symptom | Check |
|---|---|
| Install script fails on bun check | `bun --version`. Must be ≥ 1.3.14. Upgrade: `bun upgrade` or see bun.sh. |
| Install script fails on platform | Native Windows is unsupported. Use WSL2. |
| `jie` exits with code 2 | NATS unreachable. Run `nats-server &`. |
| `jie doctor` shows missing agents | NATS may not be running. Check `nats-server`. |
