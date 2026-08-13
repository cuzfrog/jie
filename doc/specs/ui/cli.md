# CLI

The `jie` binary is the single entry point for all user interaction: one OS process hosts the team harness, the EventBus, and the TUI. It is hand-rolled (`src/cli/cli-flags.ts`); it does not use a sub-command framework.

## Flag parsing invariants

- A flag may not appear twice — duplicate is exit 1 (no "last wins").
- Unrecognized flags/subcommands and unexpected positionals are exit 1.
- Required-argument flags (`--team`, `--timeout`, `--api-key`, `--resume`) missing their arg are exit 1.
- `--timeout` must be > 0 (default 300).
- All flags are normalized into a record before any side effect runs. The critical consequence: `--api-key` writes `auth.json` after team resolution and before the LLM call regardless of its position, so `jie -p "..." --api-key <k>` and `jie --api-key <k> -p "..."` are identical (print mode never races against a just-written credential).

## Config discovery

Walk up from CWD to `.jie/`, deep-merge `.jie/settings.json` over `~/.jie/settings.json`. Absence → the platform runs with empty settings (no interactive init). See `10-configuration.md`.

## `jie` (interactive TUI)

```
jie [--team <id>] [--resume <id>] [--in-memory] [--no-install]
```

`--in-memory` runs on an in-memory store (nothing persists). `--no-install` skips the first-run welcome and leaves the sentinel unwritten, so a later run without the flag still prompts.

**Ordering invariant.** The TUI is constructed and subscribes to `system.team.loaded` plus the `agent.*` topics **before** the team load is triggered, which publishes `system.team.loaded`. `tui.start()` therefore always observes `state.agents` already populated (see `tui-overview.md` "Bootstrap and dependencies"). Team resolution falls back `--team` → `defaultTeam` → first installed user team → built-in default-solo (`src/platform/team/default-solo/`); the platform always has a runnable team (`10-configuration.md` "Team Selection").

Exit codes: 0 normal, 1 config/team/agent error.

### First-run auto-install (`src/cli/first-run.ts`)

- Trigger: `args.kind === "tui"` only; print mode and subcommands skip it.
- Prompt: `Install bundled team blueprints and shared agents to ~/.jie/? [Y/n]`, reached only on a TTY. A non-TTY run skips the welcome with no sentinel, so a later interactive run still prompts — no hang, no nag.
- Sentinel: `~/.jie/.first-run-done` is written only after the prompt is decided (accept, decline, or install failure), so the prompt never recurs. `--no-install` opts out for this run without writing it.
- Install failure: reported (`Failed to install bundled team blueprints: <reason>. Install later with: jie team add <source>.`) and the sentinel is still written so it does not recur.
- Bundled MCP ensure: every non-`--no-install` TUI boot merges the bundled `code-lens` stdio server into `~/.jie/mcp.json` (a non-clobber merge; a malformed file is left untouched). This is not first-run-gated so existing users pick it up; it lets team blueprint `mcp:*` tool specs resolve instead of throwing `TOOL_SPEC_UNRESOLVED`.
- There is no `jie init`. First-run is the only install-onboarding path; later installs use `jie team add <source>`.

## `jie -p <instruction>` (print mode)

```
jie -p <instruction> [--team <id>] [--timeout <s>] [--json] [--api-key <k>] [--resume <id>] [--in-memory]
```

Publishes a `user.prompt` envelope (wire format: `02-protocol-stack.md` "Prompt Ingress", `03-event-system.md`) through `handle.prompt(teamId, leaderKey, instruction)`, prints each streamed chunk to stdout, and waits for "all agents idle" before exiting.

**The lazy idle gate.** `TeamInfo.agents` seeds every agent's local state to `'idle'`. This is required, not a convenience: the Event-Order Contract guarantees `agent.turn.start` precedes its `agent.idle` (`03-event-system.md`), so a gate initialized from a "never seen" state would open immediately and quit before the agent is observed busy. The gate must be seeded with `idle` and observed for at least one full `idle → busy → idle` cycle before it opens. It is a local state machine in the CLI — the platform does not own it.

- Subscriptions: `agent.stream.chunk` (filtered to the resolved team + leader key) for output, and `agent.turn.start`/`agent.idle` (per agent) for the gate.
- **SIGINT:** the first Ctrl+C interrupts every agent (`handle.interrupt` per key; the `bash` tool aborts kill the child process group, SIGTERM→SIGKILL). The gate opens once agents settle; exit 130. A second Ctrl+C before settle exits 130 immediately.
- **Exit:** gate opens → 0; `--timeout` fires → 3 (`"no response from team within {timeout}s"`); gate opens after a SIGINT → 130.
- **Output:** default = concatenated chunks; `--json` = one `{ chunk, seq }` object per line.

## `jie --version` / `jie --help`

`--version` prints `jie <version>`; `--help` prints usage. Neither loads config.

**Version source.** The monorepo has a zero build step, so there is no compile-time injection — the version is read at runtime by walking up from `import.meta.dirname` to the first `package.json` whose `name` is `"@cuzfrog/jie"`, falling back to a defensive constant if none is found. A direct `import ... with { type: "json" }` is avoided because the umbrella sits at a different relative depth in dev layouts than after a `bun install -g` flatten (`src/cli/version.ts`). This mirrors pi's `VERSION` pattern (`@earendil-works/pi-coding-agent/src/config.ts`).

## Account + team subcommands

All account/team/model commands write to `settings.json` / `auth.json` (scope + persistence rules: `10-configuration.md` "Persistent Files" and "Credentials Resolution"). In a running TUI, the slash-command counterparts do the same work in-session and additionally publish `user.model.update`, so live, non-model-pinned agents hot-swap immediately — whereas the CLI's one-shot invocations have no in-process subscribers.

- **`jie login [--provider <id> --api-key <key>]`** — writes `auth.json`. No flags: interactive (provider pick → OAuth or hidden key entry). With `--provider` + `--api-key`: headless single entry. Exit 0 on success or cancellation, 1 on a write error. Does not start the team.
- **`jie logout [<provider> | *]`** — removes entries; bare or `*` clears all. Exit 0 (success or nothing to do), 1 on a read error.
- **`jie model <provider>/<modelId>`** — sets `defaultProvider`/`defaultModel` (scope-aware: project keys, else global). The argument splits on the first `/` (model ids may contain `/`). Unknown `<provider>` → `unknown provider` exit 1; the model id is not pre-validated and surfaces at model resolution. Does not start the team.
- **`jie team <id>` / `jie team`** — `defaultTeam` selection. `<id>` charset is enforced; it must be installed in `.jie/teams/<id>` or `~/.jie/teams/<id>`, else exit 1 listing where it was checked. No arg: prints `defaultTeam` and the installed team roster (alphabetical, deduped; each row shows the team's `description` from `TEAM.md` frontmatter if present, with the default marked). A stale default falls through at load (not an error). In-session hot-swap is the `/team <id>` slash command.
- **`jie --api-key <key>`** — writes the resolved provider's API key to `auth.json`. No format check: a wrong key fails at first LLM call with the provider's own error. Exactly one key per provider (overwrite). Equivalent to `jie login --provider <resolved> --api-key <key>`, inlined as a flag for scripts/CI. With only this flag → exit 0; otherwise continues to the remaining flags (the credential is read from `auth.json` via the standard resolution chain on the subsequent call).
- **`jie --resume <session_id>`** — resumes a prior session; the platform validates that the session exists (`08-transcript.md`) → unknown → exit 1. The id is threaded to every body, which `restore()`s from `memory_turns`. Absent the flag the platform mints a fresh id. (In-TUI `/resume` is the same operation via the `resumeSession` command.)

**Exit codes:** account/team/model commands: 0 success, 1 malformed/unknown/write error. `--resume`: 0, 1 (unknown id). Print mode: 0/1/3/130.
