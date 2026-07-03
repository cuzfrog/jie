# TUI State and Reducer (v0.2)

The shape of the TUI's derived state and the action-by-action rules that mutate it. Sibling of `tui-layout.md` (spatial design), `tui-shortcuts.md` (keybindings), and `tui-pi-reference.md` (theme tokens). The parent spec is `tui-overview.md`; this doc captures only the data model and the reducer contract.

The state shape, action union, and reducer implementations live in `packages/jie-tui/state/` (`state.ts`, `actions.ts`, `event-reducer.ts`, `ui-reducer.ts`, `reducer.ts`). This spec is the contract they satisfy; code shapes are not duplicated here.

## Reducer purity model

The reducer is a pure function `(state, action) → state`. The caller (`createTui` in `packages/jie-tui/tui.ts`) wraps the reducer in a `dispatch` function and explicitly calls `tui.requestRender()` after each run. **The clock is not read inside the reducer** — spinner frames and transient-message aging live entirely on the render side. UI actions like `Actions.setTransientMessage(text)` carry no timestamp; the renderer records `Date.now()` when it dispatches.

## Identifier mapping (wire → state)

Per CLAUDE.md, serialized events use snake_case on the wire; TypeScript identifiers use camelCase.

| Wire field (snake_case) | State field (camelCase) | Source event |
|---|---|---|
| `agent_key` | `agentKey` | `system.team.loaded` |
| `is_leader` | `isLeader` | `system.team.loaded` |
| `block_type` | `block.kind` | `agent.stream.chunk` |
| `tool_call_id` | `card.callId` | `agent.tool.call` / `agent.tool.result` |
| `duration_ms` | `card.durationMs` | `agent.tool.result` |
| `input_truncated` | `card.inputTruncated` | `agent.tool.call` |
| `output_truncated` | `card.outputTruncated` | `agent.tool.result` |
| `stream_id` | `turn.streamId` | `agent.stream.chunk` |
| `prompts` | `agent.queue` | `agent.prompt.queue.update` |

The composite runtime key is `AgentId = \`${teamId}:${agentKey}\`` (see `00-overview.md` glossary). The reducer's `state.agents` map is keyed by `AgentId`, not by `agentKey`, to disambiguate agents across coexisting teams.

Editor-internal state (`inputBuffer`, `inputHistory`, `historyIndex`) lives on pi-tui's `Editor` component; the reducer does not mirror it.

## Actions

The reducer takes `Action = ReceiveEvent | ToggleTeamRail | SwitchCycleAgent | ClearTuiState | SetTransientMessage | ClearTransientMessage | SetErrorMessage | ClearErrorMessage | RequestQuit | RequestRender` (defined in `packages/jie-tui/state/actions.ts`). Bus envelope types are **not** the action type — `tui.ts` wraps every bus envelope in `Actions.receiveEvent(envelope)` before dispatch. UI-local events (rail toggle, cycle, transient, error, clear, quit, render) are dispatched directly.

This split exists because the bus event taxonomy is the platform's contract (other consumers may subscribe to the same topic); UI actions are the TUI's local vocabulary. Keeping them as separate action types prevents accidentally publishing UI actions to the bus and keeps the reducer testable with literal action objects.

## Cross-team guard

Every event rule early-returns `state` when the resolved `AgentId` is not in `state.agents` (or when `state.teamId === null` and the event is team-scoped). Multi-team events for inactive teams do not mutate state. The `system.team.loaded` handler is the exception — it is the only rule that bootstraps the agent map.

Rules not covered below fall through and return `state` unchanged — the reducer is defensive against future events and actions.

## Reducer rules

### `system.team.loaded`

Seed `state.agents` from `payload.agents`, composing `AgentId = \`${teamId}:${agent_key}\``. **Re-applying the same team updates only `role` and `isLeader`** — history and current turn are preserved. On team switch (`state.teamId !== null && state.teamId !== payload.teamId`), reset `agents`, `leaderAgentId`, `focusedAgentId` first. **Drop any agent in `state.agents` that is absent from the incoming payload** (stale slots from the previous team). Record the leader's `AgentId` as `state.leaderAgentId`; if `focusedAgentId === null`, focus the leader.

### `user.prompt`

The delegation/follow-up rotation rule: if the agent's `currentTurn` already has blocks or cards, push it to `history` first, then open `freshTurn(prompt)`. The editor's `inputBuffer` is editor-owned and is not cleared here.

### `agent.turn.start`

Clear `state.errorBanner` on every `turn.start`. Any prior `errorBanner` (most prominently the no-model-selected error) is cleared because the user is now actively prompting. If `currentTurn` already has blocks or cards, push it to `history` and open a fresh empty turn — the symmetric rotation path to `user.prompt`, so history stays consistent regardless of which side opens the new turn first.

### `agent.idle`

`agent.status = "idle"`; `agent.lastStopReason = payload.stopReason`. **The reducer does not move `currentTurn` into `history` here** — the prompt arrival in the next turn moves it. This avoids a premature "currentTurn frozen" state when a body restarts after a transient error mid-stream.

### `agent.stream.chunk`

`payload.stream_id` rotation: if `stream_id !== currentTurn.streamId`, push a new block and update `currentTurn.streamId`. Otherwise, if the last block's `kind` matches `payload.block_type`, append `payload.text` to it; else push a new block of the new kind.

**`agent.stream.chunk` is append-only** — the reducer does not finalize or rotate the block. The block carries its final length when the next chunk of a different `block_type` or `stream_id` arrives.

### `agent.tool.call`

Dedupe by `tool_call_id`: if a card with the same id already exists, no-op (handles replays).

### `agent.tool.result`

Replace in place by `tool_call_id`. **Out-of-order delivery is a no-op** — the matching call has not arrived yet. The defensive `output === null && error === null` case renders as `✓ <name>  <ms>ms` with an empty body (treat as a tool success with no visible output).

### `agent.prompt.queue.update`

Replace `agent.queue = payload.prompts` (snapshot semantics — the body publishes the full queue, not a delta). Cross-team guard: foreign-team events no-op. The editor-area indicator reads `state.agents[focused].queue` and renders `N prompt(s) queued` + next-prompt preview (truncated to 100 chars) when non-empty. The indicator clears when the body publishes `{ prompts: [] }` immediately before `agent.turn.start`.

### `system.error`

Set `state.errorBanner = { text: <composed> }` where `<composed>` is either `event.payload.error` or, if any agent has a `lastStopReason`, `[stop: <stopReason>] <error>`. Distinct from transient messages: errors persist until cleared. Used to surface errors the user must explicitly clear (most prominently the no-model-selected error).

### UI actions

- `Actions.toggleTeamRail()` — flip `state.showTeamRailPanel`. Wired to `ctrl+left`.
- `Actions.switchCycleAgent(direction: 1 | -1)` — cycle `state.focusedAgentId`. **No-op when the rail is hidden**, when the agent map has fewer than two agents, or when the current focus cannot be resolved. When `state.focusedAgentId === null`, direction `1` lands on the first agent in insertion order, direction `-1` on the last. Otherwise wraps in insertion order.
- `Actions.setTransientMessage(text)` — slash-command acknowledgments (`logged in to nvidia`, etc.). Renderer ages the message out after 5 s render-side (the reducer never sees the clock).
- `Actions.clearTransientMessage()` — dispatched on the next `Enter` so stale acknowledgments do not linger.
- `Actions.setErrorMessage(text)` — distinct from transient: persists until cleared.
- `Actions.clearErrorMessage()` — dispatched on the next `Enter` and on `agent.turn.start`.
- `Actions.clearTuiState()` — clear `agents`, `leaderAgentId`, `focusedAgentId`, `transientMessage`, `errorBanner`. Memory rows on disk are untouched. Used by the `/clear` slash command.
- `Actions.requestQuit()` — set `state.pendingQuit = true` (idempotent). The host subscribes to the state store and, when this flag flips, resolves the start promise and tears down the input loop. No busy-vs-idle branch: a turn in flight is interrupted on quit, not confirmed.
- `Actions.requestRender()` — no state change, but the subscriber fires anyway. Used by `Ctrl+C` and any "force a redraw" path so render stays single-sourced through the state-subscribe line.

## Per-agent streaming isolation

The reducer is per-agent by construction — `state.agents: ReadonlyMap<AgentId, AgentUiState>`. Cycling focus or submitting a prompt to a different agent does **not** abort another agent's in-flight stream; one agent's `agent.stream.chunk` only mutates `state.agents[thatId]`. Switching `focusedAgentId` is a view change only — it does not mutate any `currentTurn`, does not cancel timers, does not call `tui.requestRender()` itself (the `dispatch` wrapper does that on the reducing action).

## Editor → focused agent

`state.focusedAgentId` is the editor's target. On submit, `handleSubmit(text)` in `tui.ts` reads `state.focusedAgentId ?? state.leaderAgentId` from the current reducer state and publishes the prompt envelope via `Events.userPrompt(...)`. Cycling focus re-targets the next prompt without a refocus — `handleSubmit` re-reads `focusedAgentId` each time. When `state.focusedAgentId === null` (mid team-switch, before the first leader focus), `leaderAgentId` is the fallback. **The prompt is not lost.**

## History rotation

`state.agents[agentId].history` grows on two events: a new `user.prompt` arrives for an agent whose `currentTurn` already has content (delegation / follow-up push from the user side); an `agent.turn.start` arrives for an agent whose `currentTurn` already has content (delegation follow-up from the body's side). The two paths compose so history stays consistent regardless of which side opens the new turn first.

History is not rotated by size or count in v0.2. The renderer slices to its visible rows.

## Out of scope for v0.2

- **Per-block / per-card `expanded` state.** Expansion is a render concern, not a state concern. The `ToolCard` and `MessageView` components own their own expanded/collapsed state. Earlier drafts of this spec tracked `expanded` on `Card` and `Block`; it was removed because it duplicated the component's job.
- **In-memory event buffer / replay.** Lives outside the reducer; the platform owns replay.
- **Queue depth on a leader.** Earlier drafts carried a `state.queue` for prompt-queue indicators; the v0.2 footer does **not** show it. The queue is per-agent (`state.agents[id].queue`), and the editor-area indicator (T5 / T6) surfaces it for the focused agent. The footer remains queue-free.
- **Queue-pickup flicker debounce.** Earlier drafts kept `lastIdleAt` on the agent slot for a 50 ms "still busy" window. The v0.2 implementation lets `agent.idle` then `agent.turn.start` show as separate transitions; if a future revision needs to mask a brief `idle` window, the fix lives in the chat-pane's working-indicator component (a render-side concern), not in the reducer.