# TUI State and Reducer (v0.2)

The shape of the TUI's derived state and the action-by-action rules that mutate it. Sibling of `tui-layout.md` (spatial design), `tui-shortcuts.md` (keybindings), and `tui-pi-reference.md` (theme tokens). The parent spec is `tui-overview.md`; this doc captures only the data model and the reducer contract.

The state shape, action union, and reducer implementations live in `packages/jie-tui/state/` (`state.ts`, `actions.ts`, `event-reducer.ts`, `ui-reducer.ts`, `reducer.ts`). This spec is the contract they satisfy; code shapes are not duplicated here.

## Reducer purity model

The reducer is a pure function `(state, action) → state`. `StateStoreImpl` (`packages/jie-tui/state/state-store.ts`, constructed by the `bootTui` container) wraps the pure reducer in a `dispatch` function on the `StateStore`; re-render is driven through the store's subscriber line. **The clock is not read inside the reducer** — spinner frames and transient-message aging live entirely on the render side. UI actions like `Actions.setTransientMessage(text)` carry no timestamp; the renderer records `Date.now()` when it dispatches.

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

The editor buffer (`state.editorText`) lives in the reducer — the editor component edits it through `Actions.setEditorText` and submits through `Actions.submitEditorText`. This lets the slash/mention autocomplete read the buffer and lets e2e assert on it (`waitForEditorText`). Only the prompt history (`history`, `historyIndex`, `draft`) remains component-local on the editor.

The per-agent slot (`AgentUiState` in `state.ts`) also carries `todos: ReadonlyArray<TodoItem>` (`TodoItem` comes from jie-platform `types/todo`, re-exported via `packages/jie-tui/todo`). When an `agent.tool.result` payload's `details` is a `TodoDetailsPayload` (the todo tool's result), the reducer replaces `agent.todos` with `details.todos` instead of appending a tool card.

Environment fields (`cwd`, `gitBranch`, `gitDirty`) are seeded once at `bootTui` time via `Actions.setEnvironment` from the CLI's git snapshot; they never change mid-session.

## Actions

The reducer takes `Action = ReceiveEvent | SwitchTeam | ToggleThinking | ToggleToolCards | SwitchCycleAgent | ClearTuiState | SetTransientMessage | ClearTransientMessage | SetErrorMessage | ClearErrorMessage | ClearBanners | RequestQuit | RequestRender | SetEditorText | SubmitEditorText | RequestInterrupt | SetEnvironment` (defined in `packages/jie-tui/state/actions.ts`). Bus envelope types are **not** the action type — `tui.ts` wraps every bus envelope in `Actions.receiveEvent(envelope)` before dispatch. UI-local events (switch team, cycle, transient, error, clear, quit, render, editor text, submit, interrupt, environment) are dispatched directly.

This split exists because the bus event taxonomy is the platform's contract (other consumers may subscribe to the same topic); UI actions are the TUI's local vocabulary. Keeping them as separate action types prevents accidentally publishing UI actions to the bus and keeps the reducer testable with literal action objects.

**`system.team.loaded` is a platform data signal, not a UI switch signal.** It tells the TUI "this team is now loaded" and is emitted by `TeamManager.load` only on fresh loads (cache hits are silent). Switching — i.e. "this is the team the TUI is now watching" — is a UI concern and lives on the `Actions.switchTeam(identity)` path, fired by the `/team <id>` slash command after the platform's `execute({name:"team"})` resolves. Both paths reduce through the same agent-map seeding logic; the only difference is the source shape (`TeamInfo` from the action, snake-cased event payload from the bus).

## Cross-team guard

Every event rule early-returns `state` when the resolved `AgentId` is not in `state.agents` (or when `state.teamId === null` and the event is team-scoped). Multi-team events for inactive teams do not mutate state. The `system.team.loaded` handler is the exception — it is the only rule that bootstraps the agent map.

Rules not covered below fall through and return `state` unchanged — the reducer is defensive against future events and actions.

## Reducer rules

### `system.team.loaded`

Seed `state.agents` from `payload.agents`, composing `AgentId = \`${teamId}:${agent_key}\``. **Re-applying the same team updates `role` and `isLeader`, and merges `model`** (an incoming non-null model wins; null keeps the existing one — otherwise a reload would drop the known model). On team switch (`state.teamId !== null && state.teamId !== payload.teamId`), reset `agents`, `leaderAgentId`, `focusedAgentId` first. **Drop any agent in `state.agents` that is absent from the incoming payload** (stale slots from the previous team). Record the leader's `AgentId` as `state.leaderAgentId`; if `focusedAgentId === null`, focus the leader.

**Resume hydration.** When a `payload.history` entry carries non-empty `messages`, the matching agent's `history`, `currentTurn`, `todos`, and `contextTokensUsed` are rebuilt from the restored messages (the resume display; the snapshot rides this event — see `08-memory.md` Load ordering): a `user` message opens a turn (the `[user]: ` ingress prefix is stripped from the prompt), `assistant` text/thinking become ordered blocks, a tool call and its result fold into one `toolResult` card (error result nulls `output`, sets `error`), `todos` restore from the last todo tool-result `details`, and the final turn becomes `currentTurn` (rest are `history`). An entry with **empty `messages` preserves the existing slot** — re-application, cache hits, and the `Actions.switchTeam` identity must not wipe an accumulated or live-streaming conversation.

This event is a platform data signal — it tells the TUI a team has been loaded. It is **not** the switch mechanism; the TUI's slash-command `/team <id>` path uses `Actions.switchTeam(identity)` instead (see UI actions below). Both rules share the same agent-map seeding logic, and `Actions.switchTeam` always fires regardless of whether the underlying `TeamManager.load` was a fresh load or a cache hit, so the UI rebuilds uniformly.

### `Actions.switchTeam(identity)`

UI action carrying a `TeamInfo` payload (`id`, `leaderKey`, `agents`). Fired by `interceptTeam` in `command-handler.ts` after `platform.execute({name:"team", teamId})` resolves, and by the resume path after `resumeSession` — applies to first-time loads, subsequent switches, and cache-hit re-selections. Reduces identically to `system.team.loaded` (same agent-map seeding rules) but lives on the UI side so the reducer does not depend on the platform's emission timing or cache-hit semantics. **Its payload carries empty per-agent `history`** — hydration rides the `system.team.loaded` event that the same `execute` publishes, so this action preserves the just-hydrated (and possibly still streaming) conversation rather than re-applying a stale snapshot.

### `user.prompt`

The delegation/follow-up rotation rule: if the agent's `currentTurn` already has blocks or cards, push it to `history` first, then open `freshTurn(prompt)`. The editor buffer (`state.editorText`) is not cleared here — clearing it on submit is the editor component's job.

### `agent.turn.start`

Clear `state.errorBanner` on every `turn.start`. Any prior `errorBanner` (most prominently the no-model-selected error) is cleared because the user is now actively prompting. If `currentTurn` already has blocks or cards, push it to `history` and open a fresh empty turn — the symmetric rotation path to `user.prompt`, so history stays consistent regardless of which side opens the new turn first.

### `agent.idle`

`agent.status = "idle"`; `agent.lastStopReason = payload.stopReason`. `contextTokensUsed` refreshes from the last reported usage total when one exists, else from the token estimate over history + current turn. **The reducer does not move `currentTurn` into `history` here** — the prompt arrival in the next turn moves it. This avoids a premature "currentTurn frozen" state when a body restarts after a transient error mid-stream.

### `agent.usage`

Set `contextTokensUsed` and `lastReportedTotalTokens` from `payload.totalTokens`. The footer's context-percent segment reads `contextTokensUsed` against the agent model's `contextWindow` (`tui-layout.md`).

### `agent.stream.chunk`

`payload.stream_id` rotation: if `stream_id !== currentTurn.streamId`, push a new block and update `currentTurn.streamId`. Otherwise, if the last block's `kind` matches `payload.block_type`, append `payload.text` to it; else push a new block of the new kind.

**`agent.stream.chunk` is append-only** — the reducer does not finalize or rotate the block. The block carries its final length when the next chunk of a different `block_type` or `stream_id` arrives.

### `agent.tool.call`

Dedupe by `tool_call_id`: if a card with the same id already exists, no-op (handles replays).

### `agent.tool.result`

Replace in place by `tool_call_id`. **Out-of-order delivery is a no-op** — the matching call has not arrived yet. The stored `output` is `displayOutput(payload.output)`: when the raw output parses as a JSON object carrying a string `content` field (the `{content, details, terminate}` tool envelope), the card stores that string; anything else passes through unchanged. The defensive `output === null && error === null` case renders as `✓ <name>  <ms>ms` with an empty body (treat as a tool success with no visible output).

### `agent.prompt.queue.update`

Replace `agent.queue = payload.prompts` (snapshot semantics — the body publishes the full queue, not a delta). Cross-team guard: foreign-team events no-op. The footer line-2 queue segment (see `tui-layout.md`) reads `state.agents[focused].queue` and renders `N prompt(s) queued` + next-prompt preview in `warning` color when non-empty. The indicator clears when the body publishes `{ prompts: [] }` immediately before `agent.turn.start`.

### `system.error`

Set `state.errorBanner` to the composed string: either `event.payload.error` or, if any agent has a `lastStopReason`, `[stop: <stopReason>] <error>`. `errorBanner` and `transientMessage` are `string | null` — no wrapper object. Distinct from transient messages: errors persist until cleared. Used to surface errors the user must explicitly clear (most prominently the no-model-selected error).

### UI actions

- `Actions.switchTeam(identity)` — see rule above; fires on `/team <id>` regardless of cache state.
- `Actions.requestInterrupt(teamId, agentKey)` — no reducer state change. The TUI host observes the action and calls `platform.interrupt(teamId, agentKey)`. Wired to `Esc` only when the focused agent is busy and no autocomplete popup is showing.
- `Actions.switchCycleAgent(direction: 1 | -1)` — cycle `state.focusedAgentId`. No-op when the agent map has fewer than two agents or when the current focus cannot be resolved. When `state.focusedAgentId === null`, direction `1` lands on the first agent in insertion order, direction `-1` on the last. Otherwise wraps in insertion order.
- `Actions.setTransientMessage(text)` — slash-command acknowledgments (`logged in to nvidia`, etc.). The status line above the editor ages the message out after 5 s render-side (the reducer never sees the clock).
- `Actions.clearTransientMessage()` — dispatched by the status line's 5 s TTL; `Actions.clearBanners()` (below) also clears it on the next submit.
- `Actions.setErrorMessage(text)` — distinct from transient: persists until cleared.
- `Actions.clearErrorMessage()` — clears the error banner alone. The live clear paths consolidate on `clearBanners`: the editor clears banners on the first keystroke after an error is shown (buffer becomes non-empty) and on every submit; `agent.turn.start` clears the error banner as well (see above).
- `Actions.clearTuiState()` — clear `agents`, `leaderAgentId`, `focusedAgentId`, `transientMessage`, and `errorBanner`. Memory rows on disk are untouched. Used by the `/clear` slash command.
- `Actions.requestQuit()` — set `state.pendingQuit = true` (idempotent). The host observes the action, drains the terminal input, and tears down the input loop, resolving the start promise. No busy-vs-idle branch: a turn in flight is interrupted on quit, not confirmed.
- `Actions.requestRender()` — no state change, but the subscriber fires anyway. Used by any "force a redraw" path so render stays single-sourced through the state-subscribe line.

## Per-agent streaming isolation

The reducer is per-agent by construction — `state.agents: ReadonlyMap<AgentId, AgentUiState>`. Cycling focus or submitting a prompt to different agents does **not** abort another agent's in-flight stream; one agent's `agent.stream.chunk` only mutates `state.agents[thatId]`. Switching `focusedAgentId` is a view change only — it does not mutate any `currentTurn`, does not cancel timers, does not call `requestRender()` itself (the `dispatch` wrapper does that on the reducing action).

## Editor → focused agent

`state.focusedAgentId` is the editor's target. On submit, `tui.ts` observes `Actions.submitEditorText` and passes the text to `command-handler.ts`, whose `routeTarget` reads `state.focusedAgentId` (falling back to `state.leaderAgentId`) from the current reducer state and publishes through `platform.prompt(teamId, agentKey, text)`. Cycling focus re-targets the next prompt without a refocus — `routeTarget` re-reads the focus each time. When `state.focusedAgentId === null` (mid team-switch, before the first leader focus), `leaderAgentId` is the fallback. **The prompt is not lost.**

## History rotation

`state.agents[agentId].history` grows on two events: a new `user.prompt` arrives for an agent whose `currentTurn` already has content (delegation / follow-up push from the user side); an `agent.turn.start` arrives for an agent whose `currentTurn` already has content (delegation follow-up from the body's side). The two paths compose so history stays consistent regardless of which side opens the new turn first.

History is not rotated by size or count. Rendering is append-only into the inline column (`tui-layout.md`); finished output becomes terminal scrollback, so there is no viewport slice to maintain.

## Out of scope for v0.2

- **Per-block / per-card `expanded` state.** Expansion is a render concern, not a state concern. The reducer only carries the all-or-nothing `thinkingExpanded` / `toolCardsExpanded` toggles (`Ctrl+T` / `Ctrl+O`); the components read them.
- **Queue depth on a leader.** The queue is per-agent (`state.agents[id].queue`); the footer line-2 queue segment surfaces the focused agent's.
- **Queue-pickup flicker debounce.** `agent.idle` then `agent.turn.start` shows as separate transitions; if a future revision needs to mask a brief `idle` window, the fix lives in the working-indicator mount logic in `components/view.ts` (a render-side concern), not in the reducer.
