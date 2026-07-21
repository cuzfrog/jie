# TUI Overview

The team's user-facing cockpit. Lives in `packages/jie-tui/`. Observes all agent activity; sends user prompts to agents. This parent doc captures the TUI's role, its boundaries, and its invariants. Children capture the rest:

- `tui-layout.md` — spatial design (rail, chat, editor, footer).
- `tui-shortcuts.md` — keybinding matrix, slash commands, and OS-shortcut conflict resolution.
- `tui-state.md` — `TuiState` shape and reducer rules per topic.
- `tui-user-scenarios.md` — acceptance scenarios.
- `tui-pi-reference.md`, `tui-pi-editor-reference.md`, `tui-claude-code-reference.md` — study material on pi's and Claude Code's TUIs.

## Role

The TUI is a pure projection of platform state. It runs in the same OS process as the agent harness and has no private channel to agents. It obtains everything it needs from two surfaces:

1. **EventBus events** — see `tui-state.md` "Reducer rules" for the per-topic behavior the TUI subscribes to.
2. **Artifact Store** (read-only) — `read(key)` and `list(prefix)` per `04-storage.md`, used to render referenced content.

The TUI's sole write path is `platform.prompt(teamId, agentKey, text)`, which publishes a `user.prompt` envelope to the targeted agent's body (per `02-protocol-stack.md` "Prompt Ingress"). Slash-command disk writes are TUI-local side effects of slash commands; they do not flow on the bus.

## Invariants

- **Read-only on platform subjects.** The TUI does not publish to `agent.stream.*`, `agent.tool.*`, `agent.idle`, or any other agent-published topic. Prompt ingress is the only bus write.
- **No state of its own beyond UI state.** Authoritative state lives on the EventBus and in the Artifact Store. `TuiState` is a derived view, not a cache.
- **Out-of-band oblivious.** Internal agent operations (compaction, memory loads) are not published on the EventBus and so the TUI does not display them.
- **Pure reducer.** `(state, action) → state` is referentially transparent; the reducer does not read the clock. Spinner frames and transient-message aging live entirely on the render side. See `tui-state.md` "Reducer purity model".
- **Ink/React rendering.** The renderer is Ink from `@cuzfrog/jie-ink` (the vendored fork): `tui.tsx` mounts `render(<App stateStore={...} />, { alternateScreen: true, appendToScrollback: true, exitOnCtrlC: false, interactive: true, patchConsole: true })`. UI state lives in a `StateStore` (`state/state-store.ts`); bus envelopes are wrapped in `Actions.receiveEvent` before dispatch, and Ink owns the differential terminal output — the TUI never writes frames to stdout itself.

## Boundary with the platform

- **No leader prompt shortcut.** The leader is reached via the regular `user.prompt` envelope addressed to its `agent_key`. There is no `leader.prompt` topic.
- **Active team is the only team rendered.** The TUI filters platform events by `envelope.sender.identity.teamId`. Other teams' agents run in the background but are not displayed.
- **`system.team.loaded` is the boot anchor.** The CLI executes the team load after `createTui` has subscribed, so by the time `tui.start()` mounts `<App>`, `state.agents` is already populated. The TUI does not take a `roles` bootstrap parameter.
- **Multi-team is in-process.** `/team <id>` calls `platform.execute({ name: "team", teamId })`. The previously-active team is not stopped (ADR 26); switching is a reducer transition, not a subscription change. Subscription set is fixed at startup.

## Bootstrap and dependencies

`createTui(options, deps)` is called by the CLI's `jie` entry after `createJiePlatform` has run; the TUI does not load teams on its own. It validates an interactive terminal (`process.stdin.isTTY`, unless `deps.stdin` is supplied) and a UTF-8 locale; `start()` requires at least 60 columns and resolves on quit. `TuiDeps` is `{ platform: JiePlatform }` plus optional `stdin`/`stdout`/`stderr` streams and `gitBranch`/`gitDirty` (the CLI entry passes only `platform`; the rest are injection points used by tests). The `JiePlatform` facade exposes `subscribe(topic, cb)`, `prompt(teamId, agentKey, text)` (the sole prompt ingress), `interrupt(teamId, agentKey)`, and `execute(command)` — a single command channel carrying named operations. The slash-command handler (`command-handler.ts`) is the only `execute` caller.

## Tests

Unit tests are colocated (`packages/jie-tui/**/*.test.ts(x)`). E2e acceptance scenarios live in `tests/e2e/tui/scenario-*.test.ts` and run against the mock LLM backend (`doc/DEVELOPMENT.md`). See `tui-user-scenarios.md`.

## Flag parity

`jie [--team <id>] [--resume <id>] [--in-memory]` opens the TUI. The TUI and `-p` share the platform boot (`createJiePlatform`); the only difference is the final render surface. The TUI does not accept `-p`, `--json`, `--timeout`, or `--api-key`.
