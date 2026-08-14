# Installation

## Dependency Surface

| Dependency | Required? | Role |
|---|---|---|
| **bun** ≥ 1.3.14 | Yes | Runtime. Executes TypeScript natively — no compilation step. |
| Git | Optional | Used only if the user's workflow involves git; Jie has no git integration in v1. |

No NATS. No Docker. No license server. A provider API key is required for LLM calls, but **not at install time** — the user runs `jie login` before the first run, and the platform refuses to start with a clear error otherwise. `auth.json` is the sole credential source; the platform does not read provider environment variables. See `10-configuration.md` "Credentials Resolution".

### Platform Support

| Platform | Status |
|---|---|
| macOS (arm64, x64) | Supported |
| Linux (x64, arm64) | Supported |
| WSL2 | Supported |
| Native Windows | Not supported — use WSL2 |

## Install

> The polished install script at `https://install.jie.dev` (OS check, bun check, pinned version, idempotent re-run) is a Day 2 concern; only manual install is supported currently.

**Manual install:**

```bash
git clone https://cuzfrog.github.com/jie
cd jie
bun install
bun link --global
```

Or, once `@cuzfrog/jie` is published (Day 2):

```bash
bun install -g @cuzfrog/jie
```

## Pinned Versions

| Component | Version | Rationale |
|---|---|---|
| bun | ≥ 1.3.14 | Runtime for native TypeScript execution and package management. |
| @cuzfrog/jie | workspace (dev) | CLI, `bootPlatform`, agent bodies, TUI — all in one package. |

## Runtime Dependencies (Shipped with Jie)

`@cuzfrog/jie` bundles `jie-platform` and `jie-tui` via workspace dependencies; the user does not install them separately. Team manifests are plain `.md` files placed at the standard paths described in `10-configuration.md` "Team Selection". The platform ships the built-in setup-assistant team; richer manifests are user-installed at `~/.jie/teams/<id>/` or `.jie/teams/<id>/` by hand. The built-in setup-assistant team is always available as a last-resort fallback (see `setup-assistant-team.md`).

External tool dependencies (linters, formatters, test runners) are **not** installed by Jie. Agents invoke them via the `bash` tool; they must be present in the workspace's `node_modules` or system `PATH`.

## First Run

The platform assumes no model or provider. With no model configured (no soul-level `model:` and no `defaultProvider`/`defaultModel` in settings), team load fails with `NO_MODEL_ERROR` and the CLI exits 1 with a clear message (`10-configuration.md` "Model Resolution").

```bash
jie login --provider <id> --api-key <key>  # one-time: writes ~/.jie/auth.json
jie model <provider>/<modelId>             # one-time: sets the global default model → ~/.jie/settings.json
jie                                        # now runs, falling back to the setup-assistant team
```

Credentials and model persist across runs; nothing else needs configuring to get a runnable agent. See `10-configuration.md` for settings/schema/team-resolution rules and `09-deployment.md` for the process/startup model.
