# TUI Overview

The team's user-facing cockpit. Lives in `packages/jie-tui/`. Observes all agent activity; sends user prompts to agents. This parent doc captures the TUI's role, its boundaries, and its invariants. Children capture the rest:

- `tui-layout.md` — spatial design (rail, chat, editor, footer).
- `tui-shortcuts.md` — keybinding matrix and slash commands.
- `key-shortcuts-conflicts.md` — OS-reserved shortcuts (macOS, Linux, Windows) and how each TUI binding avoids or honors a conflict.
- `tui-state.md` — `TuiState` shape and reducer rules per topic.
- `tui-pi-reference.md` — pi theme tokens and component shapes we mirror.
- `tui-pi-editor-reference.md` — pi `Editor` internals: state shape, grapheme-aware cursor, word-wrap layout, sticky-column decision table, fish-style undo, kill ring, history walk, paste-marker atomic segments, autocomplete async-cancellation, IME hook.
- `tui-user-scenarios.md` — T1–T6 acceptance scenarios with recorded traces.
- `tui-claude-code-reference.md` — Claude Code's cursor-placement architecture (forked Ink with `CursorDeclarationContext` + `nodeCache`); why jie-tui cannot adopt it on stock Ink and the pragmatic alternative.

## Role

The TUI is a pure projection of platform state. It runs in the same OS process as the agent harness and has no private channel to agents. It obtains everything it needs from two surfaces:

1. **EventBus events** — see `tui-state.md` "Reducer rules" for the per-topic behavior the TUI subscribes to.
2. **Artifact Store** (read-only) — `read(key)` and `list(prefix)` per `05-artifact-store.md`, used to render referenced content.

The TUI's sole write path is `Events.userPrompt(...)`, which publishes a `user.prompt` envelope to the targeted agent's body (per `02-protocol-stack.md` "Prompt Ingress"). Slash-command disk writes are TUI-local side effects of slash commands; they do not flow on the bus.

## Invariants

- **Read-only on platform subjects.** The TUI does not publish to `agent.stream.*`, `agent.tool.*`, `agent.idle`, or any other agent-published topic. Prompt ingress is the only bus write.
- **No state of its own beyond UI state.** Authoritative state lives on the EventBus and in the Artifact Store. `TuiState` is a derived view, not a cache; the in-memory per-`(team_id, agent_key)` event buffer is for swap-back rendering only.
- **Out-of-band oblivious.** Internal agent operations (compaction, memory loads) are not published on the EventBus and so the TUI does not display them.
- **Pure reducer.** `(state, action) → state` is referentially transparent; the reducer does not read the clock. Spinner frames and transient-message aging live entirely on the render side. See `tui-state.md` "Reducer purity model".
- **Pure projection.** `render(width) → string[]` does not write to `process.stdout` or mutate `TuiState`. pi-tui owns the differential renderer.
- **Single-threaded with pi-tui.** `pi-tui` dispatches bus callbacks and keypress events on one thread; the TUI does not introduce `setImmediate` or `queueMicrotask` of its own.

## Boundary with the platform

- **No leader prompt shortcut.** The leader is reached via the regular `user.prompt` envelope addressed to its `agent_key`. There is no `leader.prompt` topic.
- **Active team is the only team rendered.** The TUI filters platform events by `envelope.sender.identity.teamId`. Other teams' agents run in the background but are not displayed.
- **`system.team.loaded` is the boot anchor.** `createJiePlatform` publishes it synchronously before returning, so by the time `tui.start()` mounts the `Container`, `state.agents` is already populated. The TUI does not take a `roles` bootstrap parameter.
- **Multi-team is in-process.** `/team <id>` calls `JiePlatform.loadTeam(id)`. The previously-active team is not stopped (per `addrs/19-multi-team-coexistence.md`); switching is a reducer transition, not a subscription change. Subscription set is fixed at startup.

## Initial bootstrap

The TUI's `createTui` is called by the CLI's `jie` (no flags) entry, after `createJiePlatform` has run. The TUI does not load teams on its own — the platform already has one team loaded and has published `system.team.loaded`. If `process.stdin.isTTY` is false, or the terminal is below 60 columns, or the locale is not UTF-8, the TUI logs to stderr and returns a non-zero exit code; the CLI's `jie` then exits 1. Otherwise the TUI mounts a `Container` (rail, chat pane, editor, footer), starts the input loop, and resolves `start()` on quit.

The platform's `JiePlatform` surface for v0.2 is the full facade: `events` (`subscribe(topic, cb)`, `userPrompt(agentKey, text)`, `interrupt()`); `team` (`{ id, agents }`); `loadTeam`, `stop`; and the slash-command operations `login`, `logout`, `setDefaultModel`, `getDefaultTeam`, `getDefaultModel`, `listInstalledTeams`, `getGitStatus`. The TUI's `TuiDeps` is `{ platform: JiePlatform }`; it does not import `AuthStore`, `SettingsStore`, `TeamRegistry`, `GitService`, or any other store type. The event protocol types (`EventEnvelope<T>`, `AnyEventEnvelope`, `EventType`) are re-exported from `jie-platform` for the reducer's typed subscribe callbacks.

## Information surfaced

For any active work unit, derived purely from the inputs above:

- The pipeline timeline (which domain events fired in which order).
- The current work-unit status and any iteration counter.
- The most recent artifact of each type for the current work unit.
- Live LLM output for any agent currently streaming, demuxed by `(agent_role, agent_key, stream_id)`.
- Failure detail when an error event arrives.

How any of this is rendered — tabs, panes, charts, markdown, plain text — is left to `tui-layout.md`.

## Test strategy

Three layers (per `tui-user-scenarios.md` "Test layers"):

1. **Reducer tests** — feed a hand-recorded `EventEnvelope` JSONL to the reducer; assert the resulting `TuiState`. No I/O, no terminal.
2. **Component tests** — assert `setModel` / `setItems` / `setAgent` shape and `render(width)` output per `Component` subclass. No I/O, no terminal.
3. **Integration tests** — feed a hand-recorded JSONL to a `TUI` rooted on a `VirtualTerminal`; drive a synthetic keypress stream; assert the terminal buffer.

The five v0.2 TUI scenarios ship as `tests/e2e/tui/fixtures/<scenario>.jsonl` plus a small `tests/e2e/tui/<scenario>.test.ts`. The fixtures are **hand-recorded**, not generated. The harness does not run the platform or call an LLM.

## Flag parity

`jie [--team <id>] [--api-key <k>] [--resume <id>]` opens the TUI. The TUI uses the same `createApp` orchestrator that `-p` uses; the only difference is the final render surface. The TUI does not accept `-p`, `--json`, or `--timeout`.

## Where to look

- `tui-layout.md` — spatial design.
- `tui-shortcuts.md` — keybinding matrix and slash commands.
- `key-shortcuts-conflicts.md` — OS-reserved shortcuts and TUI conflict resolution.
- `tui-state.md` — `TuiState` shape, reducer rules per topic, per-agent streaming isolation, editor → focused agent wiring.
- `tui-pi-reference.md` — pi theme tokens and component shapes.
- `tui-user-scenarios.md` — T1–T6 acceptance scenarios.
