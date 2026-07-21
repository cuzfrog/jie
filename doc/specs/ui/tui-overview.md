# TUI Overview

The team's user-facing cockpit. Lives in `packages/jie-tui/`. Observes all agent activity; sends user prompts to agents. This parent doc captures the TUI's role, its boundaries, and its invariants. Children capture the rest:

- `tui-layout.md` — spatial design (single inline column, overlays, footer).
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
- **pi-tui inline rendering.** The renderer is `@earendil-works/pi-tui`: `tui.ts` builds a `TUI` over a component tree (`Container`/`Loader`/custom `Component`s), and pi-tui owns the differential terminal output — it renders **inline into the normal terminal buffer**, no alternate screen. Finished conversation output is the terminal's own scrollback, and selection/copy is the terminal's native; the TUI has no app-level scrolling, mouse, or wheel handling. UI state lives in a `StateStore` (`state/state-store.ts`); bus envelopes are wrapped in `Actions.receiveEvent` before dispatch; a `store.subscribe` line runs the structural chat-sync and `requestRender()` (16 ms-coalesced). Two runtime hazards are guarded: every custom component truncates each rendered line to the given width (pi-tui's `doRender` throws on over-wide lines), and the logger's sink is redirected to `stderr` at startup (stray `stdout` writes would shred the inline renderer).

## Boundary with the platform

- **No leader prompt shortcut.** The leader is reached via the regular `user.prompt` envelope addressed to its `agent_key`. There is no `leader.prompt` topic.
- **Active team is the only team rendered.** The TUI filters platform events by `envelope.sender.identity.teamId`. Other teams' agents run in the background but are not displayed.
- **`system.team.loaded` is the boot anchor.** The CLI executes the team load after `createTui` has subscribed, so by the time `tui.start()` builds the component tree, `state.agents` is already populated. The TUI does not take a `roles` bootstrap parameter.
- **Multi-team is in-process.** `/team <id>` calls `platform.execute({ name: "team", teamId })`. The previously-active team is not stopped (ADR 26); switching is a reducer transition, not a subscription change. Subscription set is fixed at startup.

## Bootstrap and dependencies

`createTui(options, deps)` is called by the CLI's `jie` entry after `createJiePlatform` has run; the TUI does not load teams on its own. It validates an interactive terminal (`process.stdin.isTTY`, unless `deps.stdin` is supplied) and a UTF-8 locale; `start()` requires at least 60 columns and resolves on quit. `TuiDeps` is `{ platform, gitBranch, gitDirty }` plus optional `stdin`/`stdout`/`stderr` streams. The CLI passes `platform` and a git snapshot (`createGitService({cwd}).getSnapshot()` from jie-platform) for the footer's branch/dirty display; the streams are injection points used by tests (`start()` uses pi's `ProcessTerminal` over `process.stdin/stdout` when `deps.stdin` is absent, and a stream terminal over the injected streams otherwise). `options.rows` is vestigial — pi-tui reads the terminal dimensions itself. The `JiePlatform` facade exposes `subscribe(topic, cb)`, `prompt(teamId, agentKey, text)` (the sole prompt ingress), `interrupt(teamId, agentKey)`, and `execute(command)` — a single command channel carrying named operations. The slash-command handler (`command-handler.ts`) is the only `execute` caller.

## Tests

Unit tests are colocated (`packages/jie-tui/**/*.test.ts`); screen-level render tests run the real pipeline through a headless terminal (`test/screen.test.ts`). E2e acceptance scenarios live in `tests/e2e/tui/scenario-*.test.ts` and run against the mock LLM backend (`doc/DEVELOPMENT.md`). See `tui-user-scenarios.md`.

## Flag parity

`jie [--team <id>] [--resume <id>] [--in-memory]` opens the TUI. The TUI and `-p` share the platform boot (`createJiePlatform`); the only difference is the final render surface. The TUI does not accept `-p`, `--json`, `--timeout`, or `--api-key`.
