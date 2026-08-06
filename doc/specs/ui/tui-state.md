# TUI State and Reducer (v0.2)

The shape of the TUI's derived state and the action-by-action rules that mutate it. Sibling of `tui-layout.md` (spatial design), `tui-shortcuts.md` (keybindings), and `tui-pi-reference.md` (theme tokens). The parent spec is `tui-overview.md`; this doc captures only the data model and the reducer contract.

The state shape, action union, and reducer implementations live in `packages/jie-tui/state/` (`state.ts`, `actions.ts`, `event-reducer.ts`, `ui-reducer.ts`, `reducer.ts`). This spec is the contract they satisfy; code shapes are not duplicated here.

## Reducer purity model

The reducer is a pure function `(state, action) → state`. `StateStoreImpl` (`packages/jie-tui/state/state-store.ts`, constructed by the `bootTui` container) wraps the pure reducer in a `dispatch` function on the `StateStore`; re-render is driven through the store's subscriber line. **The clock is not read inside the reducer** — spinner frames and transient-message aging live entirely on the render side, and thinking durations arrive pre-measured (`thinking_durations` on `agent.stream.end`, timed at the platform's streaming edge); the reducer only stamps them. UI actions like `Actions.setTransientMessage(text)` carry no timestamp; the renderer records `Date.now()` when it dispatches.

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
| `thinking_durations` | `block.durationMs` (per segment, in order) | `agent.stream.end` |
| `prompts` | `agent.queue` | `agent.prompt.queue.update` |
| `summary` | `compactionMarker.summary` | `agent.compacted` |
| `tokens_before` | `compactionMarker.tokensBefore` | `agent.compacted` |

The composite runtime key is `AgentId = \`${teamId}:${agentKey}\`` (see `00-overview.md` glossary). The reducer's `state.agents` map is keyed by `AgentId`, not by `agentKey`, to disambiguate agents across coexisting teams.

The editor buffer (`state.editorText`) lives in the reducer — the editor component edits it through `Actions.setEditorText` and submits through `Actions.submitEditorText`. This lets the slash/mention autocomplete read the buffer and lets e2e assert on it (`waitForEditorText`). The editor also mirrors whether its cursor sits at the buffer start as `state.editorCursorAtStart` (`Actions.setEditorCursorAtStart`, dispatched only on change), which gates the team panel's `←` toggle and the footer help-info swap (`tui-team-panel.md`). Only the prompt history (`history`, `historyIndex`, `draft`) remains component-local on the editor.

The kanban board is **team-scoped, not per-agent**: `state.kanbanBoard: ReadonlyArray<KanbanCard>` (`KanbanCard` comes from jie-platform, re-exported via `packages/jie-tui/kanban`) holds the loaded team's cards, seeded from `teamInfo.kanbanCards` on load and replaced wholesale by the platform's kanban command results (`tui-kanban-panel.md`). The `agent.tool.result` `kanban_write` payload is a tool card like any other — the board is a separate data channel.

Environment fields (`cwd`, `gitBranch`, `gitDirty`) are seeded once at `bootTui` time via `Actions.setEnvironment` from the CLI's git snapshot; they never change mid-session.

## Actions

The reducer takes `Action = ReceiveEvent | SwitchTeam | SetSessionName | SetInstalledTeams | ToggleThinking | ToggleToolCards | SwitchCycleAgent | ToggleTeamPanel | ToggleKanbanPanel | CommitTeamCursor | ClearTuiState | SetTransientMessage | ClearTransientMessage | SetErrorMessage | ClearErrorMessage | ClearBanners | RequestQuit | RequestRender | SetEditorText | SetEditorCursorAtStart | SubmitEditorText | RequestInterrupt | RequestDequeue | RequestRequeue | SetEnvironment | ShowHelp | SetKanbanBoard | MoveKanbanCursor | ToggleKanbanExpand | CommitKanbanEdit | CancelKanbanEdit | SaveKanbanEdit` (defined in `packages/jie-tui/state/actions.ts`). Bus envelope types are **not** the action type — `tui.ts` wraps every bus envelope in `Actions.receiveEvent(envelope)` before dispatch. UI-local events (switch team, cycle, team panel, kanban panel, transient, error, clear, quit, render, editor text, submit, interrupt, dequeue, requeue, environment, show help) are dispatched directly.

This split exists because the bus event taxonomy is the platform's contract (other consumers may subscribe to the same topic); UI actions are the TUI's local vocabulary. Keeping them as separate action types prevents accidentally publishing UI actions to the bus and keeps the reducer testable with literal action objects.

**`system.team.loaded` is a platform data signal, not a UI switch signal.** It tells the TUI "this team is now loaded" and is emitted by `TeamManager.load` only on fresh loads (cache hits are silent). Switching — i.e. "this is the team the TUI is now watching" — is a UI concern and lives on the `Actions.switchTeam(identity)` path, fired by the `/team <id>` slash command after the platform's `execute({name:"team"})` resolves. Both paths reduce through the same agent-map seeding logic; the only difference is the source shape (`TeamInfo` from the action, snake-cased event payload from the bus).

## Cross-team guard

Every event rule early-returns `state` when the resolved `AgentId` is not in `state.agents` (or when `state.teamId === null` and the event is team-scoped). Multi-team events for inactive teams do not mutate state. The `system.team.loaded` handler is the exception — it is the only rule that bootstraps the agent map.

Rules not covered below fall through and return `state` unchanged — the reducer is defensive against future events and actions.

## Reducer rules

### `system.team.loaded`

Seed `state.agents` from `payload.agents`, composing `AgentId = \`${teamId}:${agent_key}\``. **Re-applying the same team updates `role`, `isLeader`, `tools`, `subscribe`, and `skills` (the agent's resolved skill metadata — name, description, and argument-hint; the `/skill:` gate and autocomplete source, `tui-shortcuts.md`), and merges `model`** (an incoming non-null model wins; null keeps the existing one — otherwise a reload would drop the known model). On team switch (`state.teamId !== null && state.teamId !== payload.teamId`), reset `agents`, `leaderAgentId`, `focusedAgentId`, `teamCursorAgentId` first. **Drop any agent in `state.agents` that is absent from the incoming payload** (stale slots from the previous team); a `teamCursorAgentId` left pointing at a dropped agent is cleared. Record the leader's `AgentId` as `state.leaderAgentId`; if `focusedAgentId === null`, focus the leader. Record `payload.sessionName` (null when the session is unnamed) as `state.sessionName` — it labels the editor's top border while set (`tui-layout.md`, Borders).

**Resume hydration.** When a `payload.history` entry carries non-empty `messages`, the matching agent's `history`, `currentTurn`, and `contextTokensUsed` are rebuilt from the restored messages (the resume display; the snapshot rides this event — see `08-transcript.md` Load ordering): a `user` message opens a turn (the prompt is the message's `displayText` when present — a `user.prompt` ingress always carries it — else the content with the `[user]: ` ingress prefix stripped), `assistant` text/thinking become ordered blocks, a tool call and its result fold into one `toolResult` card (error result nulls `output`, sets `error`), the final turn becomes `currentTurn` (rest are `history`), and a `compactionSummary` message becomes the agent's `compactionMarker` (`{ seq, summary, tokensBefore }`) consuming one entry number, turns after it numbering after it — the restore counterpart of the `agent.compacted` rule below. The board is not part of hydration — it rides `payload.kanbanCards` (`tui-kanban-panel.md`). An entry with **empty `messages` preserves the existing slot** — re-application, cache hits, and the `Actions.switchTeam` identity must not wipe an accumulated or live-streaming conversation. Hydrated turns are numbered sequentially from the shared entry counter (see *Entry sequence* below): a team switch resets the counter to 0 and clears `state.infoEntries` (the chat view resets with the team); a same-team re-application preserves both and numbering continues from the current counter.

This event is a platform data signal — it tells the TUI a team has been loaded. It is **not** the switch mechanism; the TUI's slash-command `/team <id>` path uses `Actions.switchTeam(identity)` instead (see UI actions below). Both rules share the same agent-map seeding logic, and `Actions.switchTeam` always fires regardless of whether the underlying `TeamManager.load` was a fresh load or a cache hit, so the UI rebuilds uniformly.

### `Actions.switchTeam(identity)`

UI action carrying a `TeamInfo` payload (`id`, `leaderKey`, `sessionName`, `agents`, `history`). Fired by `interceptTeam` in `command-handler.ts` after `platform.execute({name:"team", teamId})` resolves, by the resume path after `resumeSession`, and by the `/reload` path for the active team among the rebuilt identities — applies to first-time loads, subsequent switches, cache-hit re-selections, and same-team rebuilds. Reduces identically to `system.team.loaded` (same agent-map seeding rules) but lives on the UI side so the reducer does not depend on the platform's emission timing or cache-hit semantics. **Its payload carries live per-agent `history`** — the restored messages on a fresh load, the running agents' current messages on a cache-hit re-selection — so this action hydrates uniformly whether or not a `system.team.loaded` event accompanied it (cache hits are silent). The history is read fresh from the bodies at call time, never a stale snapshot; the empty-`messages` guard below ensures a history-less identity still preserves an accumulated or live-streaming conversation.

### `agent.turn.start`

The sole creator of conversation turns. The payload is `string | null` — the raw user text of the message this turn consumes (null for peer-notification turns and turns resumed at startup); null reduces to `userPrompt: ""`. The TUI does not subscribe to `user.prompt`: the prompt echoes into the chat at consumption time, attached to the turn that runs it, so a queued prompt appears exactly when its turn starts.

Clear `state.errorBanner` on every `turn.start`. Any prior `errorBanner` (most prominently the no-model-selected error) is cleared because the user is now actively prompting. Also clear `state.interruptedAgentId` when this agent is the interrupted one — its own next turn supersedes the interrupted turn; another agent's `turn.start` leaves the marker.

**Adoption.** When `currentTurn` is unpopulated (no blocks, no cards) and `userPrompt === ""`, the event adopts it: `userPrompt` is set from the payload and the turn keeps its `seq`. No turn is created and the counter does not advance.

**Rotation.** Otherwise — `currentTurn` is populated, or already prompt-bearing — it is pushed to `history` (when present) and `freshTurn(prompt, seq)` opens: the new turn takes `seq = state.nextEntrySeq` and the counter advances (entry sequence). Rapid-fire prompts each rotate into their own turn, so no message is lost regardless of how the starts interleave with the chunks.

### `agent.idle`

`agent.status = "idle"`; `agent.lastStopReason = payload.stopReason`. `contextTokensUsed` refreshes from the last reported usage total when one exists, else from the token estimate over history + current turn. **The reducer does not move `currentTurn` into `history` here** — the prompt arrival in the next turn moves it. This avoids a premature "currentTurn frozen" state when a body restarts after a transient error mid-stream.

**Interrupt marker.** When the idling agent is the focused one and `stopReason === "aborted"` (the `Esc` interrupt), set `state.interruptedAgentId` to its `AgentId` — the turn-level marker that drives the working slot's static `Interrupted` line (`tui-layout.md`). It is cleared by the interrupted agent's own `agent.turn.start`, by `Actions.submitEditorText`, by a team load / `Actions.switchTeam`, and by `Actions.clearTuiState`. A non-aborted idle of the focused agent leaves the marker untouched — it cannot outlive one: a new turn always starts before the next idle, and that start clears it.

### `agent.usage`

Set `contextTokensUsed` and `lastReportedTotalTokens` from `payload.totalTokens`. The footer's context-percent segment reads `contextTokensUsed` against the agent model's `contextWindow` (`tui-layout.md`).

### `agent.compacted`

The platform rewrote the agent's history to a summary plus a kept tail (`06-agent-model.md`, "Compaction"). The reducer mirrors the rewrite: from `history + currentTurn` it drops the first `payload.summarized_prompts` turns — never the last one, since a full-user summarize means the tail holds mid-turn fragments and dropping everything would hide kept content — then assigns fresh entry numbers to the marker and the survivors: the marker takes `seq = state.nextEntrySeq`, the surviving turns renumber sequentially after it, and the counter advances past them all (the renumbering rebuilds the chat column's tail — the same mechanism as a focused-agent switch). The marker is stored on `agent.compactionMarker` as `{ seq, summary, tokensBefore }`; a later compaction replaces it. `contextTokensUsed` re-estimates over the kept turns (the summary itself is not estimated; the next `agent.usage` reports the true post-compaction total) and `lastReportedTotalTokens` nulls — the last usage total refers to the pre-compaction context.

### `agent.stream.chunk`

`payload.stream_id` rotation: if `stream_id !== currentTurn.streamId`, push a new block and update `currentTurn.streamId`. Otherwise, if the last block's `kind` matches `payload.block_type`, append `payload.text` to it; else push a new block of the new kind.

**`agent.stream.chunk` is append-only** — the reducer does not finalize or rotate the block. The block carries its final length when the next chunk of a different `block_type` or `stream_id` arrives.

### `agent.stream.end`

Stamps thinking duration: when `payload.thinking_durations` is non-empty and `payload.stream_id` matches `currentTurn.streamId`, the current turn's thinking blocks that lack a `durationMs` receive the segment durations in order — the first unstamped block gets `thinking_durations[0]`, the second `[1]`, and so on (a stream may carry several thinking segments; the payload carries one duration per segment, measured at the platform's streaming edge — the reducer never reads the clock). An empty array (the stream had no thinking), a mismatched `stream_id`, or no unstamped thinking block returns `state` unchanged. No context recompute — block count and text are unchanged.

### `agent.tool.call`

Dedupe by `tool_call_id`: if a card with the same id already exists, no-op (handles replays).

### `agent.tool.result`

Replace in place by `tool_call_id`. **Out-of-order delivery is a no-op** — the matching call has not arrived yet. The stored `output` is `displayOutput(payload.output)`: when the raw output parses as a JSON object carrying a string `content` field (the `{content, details, terminate}` tool envelope), the card stores that string; anything else passes through unchanged. The defensive `output === null && error === null` case renders as `✓ <name>  <ms>ms` with an empty body (treat as a tool success with no visible output).

### `agent.prompt.queue.update`

Replace `agent.queue = payload.prompts` (snapshot semantics — the body publishes the full queue, not a delta). Entries are typed `{ text, source }`: queued user prompts as raw user text (no `[user]: ` ingress prefix) tagged `"user"`, peer notifications as their synthetic text tagged `"peer"` — peer entries are display-only and can never be dequeued. Cross-team guard: foreign-team events no-op. Two renderings read `state.agents[focused].queue` (`tui-layout.md`): the `Queued: <prompt>` indicator lines between the status line and the editor (one per entry), and the footer line-2 segment (`N prompt(s) queued` + next-prompt preview in `warning` color). The entries leave the list when the body republishes the snapshot on consumption (immediately before the consuming `agent.turn.start`) or on a user dequeue (`Actions.requestDequeue` below); a requeue (`Actions.requestRequeue`) restores a dequeued entry through the same snapshot.

### `system.error`

Set `state.errorBanner` to the composed string: either `event.payload.error` or, if any agent has a `lastStopReason`, `[stop: <stopReason>] <error>`. `errorBanner` and `transientMessage` are `string | null` — no wrapper object. Distinct from transient messages: errors persist until cleared. Used to surface errors the user must explicitly clear (most prominently the no-model-selected error).

### UI actions

- `Actions.switchTeam(identity)` — see rule above; fires on `/team <id>` regardless of cache state.
- `Actions.setSessionName(name)` — record `state.sessionName` (null clears). Fired by `interceptRename` in `command-handler.ts` once `renameSession` succeeds, so the editor's top-border label updates without a team reload; the load rules seed it from `TeamInfo` and `clearTuiState` resets it.
- `Actions.requestInterrupt(teamId, agentKey)` — no reducer state change. The TUI host observes the action and calls `platform.interrupt(teamId, agentKey)`. Wired to `Esc` only when the focused agent is busy and no autocomplete popup is showing.
- `Actions.requestDequeue(teamId, agentKey, prompt)` — no reducer state change. The TUI host observes the action and calls `platform.dequeuePrompt(teamId, agentKey, prompt)`; the body removes the tail-most matching user queue entry and republishes `agent.prompt.queue.update`, whose rule above updates `agent.queue`. The bus is in-process and synchronous, so the queue the editor re-reads after `dispatch` returns is already post-removal. Fired by the editor's queue browse (`tui-shortcuts.md`), which pulls the focused agent's tail-most `"user"` queue entry into the editor and cancels it in one gesture.
- `Actions.requestRequeue(teamId, agentKey, prompt)` — no reducer state change. The TUI host observes the action and calls `platform.requeuePrompt(teamId, agentKey, prompt)`; the body restores the parked entry to the queue's tail, drains, and republishes `agent.prompt.queue.update` — an idle agent immediately starts the restored prompt as a new run. Fired by the editor's queue browse when `↓` walks back over a dequeued entry the user abandons (`tui-shortcuts.md`), so the prompt is not lost; submitting the same text discards the parked entry at ingress, the fresh send superseding it (`06-agent-model.md`, "User requeue").
- `Actions.toggleTeamPanel()` — flip `state.teamPanelVisible` (`tui-team-panel.md`). Showing seeds `teamCursorAgentId` from the existing cursor, else `focusedAgentId`, else the first roster agent, and hides the kanban panel; hiding clears the cursor. No-op when the roster is empty (before a team is loaded). Wired to `←` at the editor start in the view's global input listener.
- `Actions.toggleKanbanPanel()` — flip `state.kanbanPanelVisible` (`tui-kanban-panel.md`). Showing hides the team panel and clears its cursor — the two panels share their bottom slot and never render together — and clamps `kanbanCursor` into the current board; hiding clears `kanbanEdit`. No-op when no agent is focused (before a team is loaded). Wired to `Ctrl+K` in the view's global input listener and to `/kanban` with no args in the command handler.
- `Actions.setKanbanBoard(board)` — replace `state.kanbanBoard` and clamp the cursor into it (`reduceKanbanBoard`, `kanban-reducer.ts`). Fired with the platform's returned board from every kanban command (`/kanban add|remove|complete`, the editor's save path) so the panel and the task list always mirror the platform.
- `Actions.moveKanbanCursor(direction)` — move `state.kanbanCursor` (a card id) across the board: up/down walk the current status column, left/right jump to the nearest non-empty column, clamping to the target length (`kanban-cursor.ts`). Wired to the arrow keys while the panel is shown.
- `Actions.toggleKanbanExpand()` — flip `state.kanbanExpanded` (the panel's board ↔ card-detail view). Wired to `Tab` while the panel is shown.
- `Actions.commitKanbanEdit(cardId)` — set `state.kanbanEdit = cardId`; the editor takes over for the card's content (`tui-layout.md`, Editor). Wired to `Enter` while the panel is shown and a card is focused.
- `Actions.cancelKanbanEdit()` — set `kanbanEdit = null`; the editor restores its draft. Wired to `Esc`/`Ctrl+C` while editing (`tui-layout.md`, Editor).
- `Actions.saveKanbanEdit(cardId, content)` — set `kanbanEdit = null`; the TUI host observes the action and runs the platform `kanbanEdit` command, dispatching `setKanbanBoard` with the returned board (`tui.ts`). Wired to `Enter`/`Ctrl+S` while editing.
- `Actions.switchCycleAgent(direction: 1 | -1)` — the team-panel cursor rule over `state.teamCursorAgentId` (`tui-team-panel.md`). No-op while the panel is hidden. Shown: moves the cursor without touching `focusedAgentId` — direction `1` down, `-1` up, cycling both ways (last → first, first → last). Navigation order is `TuiState.rosterOrder` (leader first, then map insertion order) — the same order the panel displays. No-op when the agent map is empty; a stale cursor recovers to the first agent on the next press.
- `Actions.commitTeamCursor()` — set `focusedAgentId` to `teamCursorAgentId`; no-op unless the panel is shown and the cursor is set and differs from the focus; a stale cursor is cleared without moving focus. Wired to `Enter` in the view's global input listener, consumed only under that same condition so editor submit is untouched otherwise (`tui-team-panel.md`).
- `Actions.setEditorCursorAtStart(atStart)` — record whether the editor cursor sits at the buffer start (line 0, col 0); dispatching the same value is a no-op. The editor syncs it after every content change and every input it handles (`tui-team-panel.md`, State). Consumed by the global `←` gate and the footer help-info swap; `clearTuiState` leaves it — `/clear` does not move the cursor.
- `Actions.setTransientMessage(text)` — slash-command acknowledgments (`logged in to nvidia`, etc.). The status line above the editor ages the message out after 5 s render-side (the reducer never sees the clock).
- `Actions.clearTransientMessage()` — dispatched by the status line's 5 s TTL; `Actions.clearBanners()` (below) also clears it on the next submit.
- `Actions.setErrorMessage(text)` — distinct from transient: persists until cleared.
- `Actions.clearErrorMessage()` — clears the error banner alone. The live clear paths consolidate on `clearBanners`: the editor clears banners on the first keystroke after an error is shown (buffer becomes non-empty) and on every submit; `agent.turn.start` clears the error banner as well (see above).
- `Actions.clearTuiState()` — clear `agents`, `sessionName`, `leaderAgentId`, `focusedAgentId`, `teamCursorAgentId`, `interruptedAgentId`, `infoEntries`, and `errorBanner` / `transientMessage`, and reset `nextEntrySeq` to 0. `teamPanelVisible` and `kanbanPanelVisible` survive like the other view toggles, and `editorCursorAtStart` survives because `/clear` does not move the editor cursor. Memory rows on disk are untouched. Used by the `/clear` slash command.
- `Actions.showHelp()` — append a `help` info entry at `seq = nextEntrySeq` to `state.infoEntries` and advance the counter (entry sequence). The chat column renders the reprint at that sequence position among the turns — the welcome splash (mark + identity lines + Commands section from the shared `COMMAND_METADATA` registry) followed by the Shortcuts section with the keybinding hints — and the splash hides so the content is not duplicated. TUI state is never persisted and `/help` never prompts an agent, so entries are session-only and never part of agent history. Used by the `/help` slash command.
- `Actions.requestQuit()` — set `state.pendingQuit = true` (idempotent). The host observes the action, drains the terminal input, and tears down the input loop, resolving the start promise. No busy-vs-idle branch: a turn in flight is interrupted on quit, not confirmed.
- `Actions.requestRender()` — no state change, but the subscriber fires anyway. Used by any "force a redraw" path so render stays single-sourced through the state-subscribe line.

## Per-agent streaming isolation

The reducer is per-agent by construction — `state.agents: ReadonlyMap<AgentId, AgentUiState>`. Cycling focus or submitting a prompt to different agents does **not** abort another agent's in-flight stream; one agent's `agent.stream.chunk` only mutates `state.agents[thatId]`. Switching `focusedAgentId` is a view change only — it does not mutate any `currentTurn`, does not cancel timers, does not call `requestRender()` itself (the `dispatch` wrapper does that on the reducing action).

## Editor → focused agent

`state.focusedAgentId` is the editor's target. On submit, `tui.ts` observes `Actions.submitEditorText` and passes the text to `command-handler.ts`, whose `routeTarget` reads `state.focusedAgentId` (falling back to `state.leaderAgentId`) from the current reducer state and publishes through `platform.prompt(teamId, agentKey, text)`. Committing the team cursor re-targets the next prompt without a refocus — `routeTarget` re-reads the focus each time. When `state.focusedAgentId === null` (mid team-switch, before the first leader focus), `leaderAgentId` is the fallback. **The prompt is not lost.**

## History rotation

`state.agents[agentId].history` grows on exactly one event: an `agent.turn.start` whose rotation path finds a populated or prompt-bearing `currentTurn` (delegation follow-ups, rapid-fire user prompts — see the rule above). Turn rotation is the sole turn-creating path on the event side; resume hydration numbers restored turns but never rotates.

History is not rotated by size or count. Rendering is append-only into the inline column (`tui-layout.md`); finished output becomes terminal scrollback, so there is no viewport slice to maintain.

## Entry sequence

The chat column is a single chronological stream of three entry kinds — conversation turns, info entries (today only the `/help` reprint), and the compaction marker. Every entry carries a `seq`: `MessageTurn.seq`, `InfoEntry.seq`, and the marker's `seq` are assigned from one monotonic `state.nextEntrySeq` counter — by turn-creating `agent.turn.start` and by `agent.compacted` (marker plus renumbered survivors) on the event side, by resume hydration numbering the marker and turns sequentially, and by `Actions.showHelp` on the UI side — advancing on each assignment, so `seq` order across all kinds is creation order. A `turn.start` adopting an unpopulated empty-prompt turn consumes no number. Team switch (not same-team re-application) and `clearTuiState` reset the counter to 0 and clear `infoEntries`, because the chat view resets with the team. Chat sync merges the focused agent's turns, compaction marker, and `state.infoEntries` ordered by `seq` and matches its live components by kind + `seq`, so unchanged entries update in place and a kind or seq mismatch rebuilds the tail.

## Out of scope for v0.2

- **Per-block / per-card `expanded` state.** Expansion is a render concern, not a state concern. The reducer only carries the all-or-nothing view toggles `thinkingExpanded` / `toolCardsExpanded` / `teamPanelVisible` / `kanbanPanelVisible` (`Ctrl+T` / `Ctrl+O` / the `←` toggle / `Ctrl+K`) and the all-or-nothing kanban `kanbanExpanded` (board ↔ focused-card detail); the components read them. The panel toggles and the board are preserved across `clearTuiState` like the other two (see `tui-team-panel.md`, `tui-kanban-panel.md`).
- **Queue depth on a leader.** The queue is per-agent (`state.agents[id].queue`); the footer line-2 queue segment surfaces the focused agent's.
- **Queue-pickup flicker debounce.** `agent.idle` then `agent.turn.start` shows as separate transitions; if a future revision needs to mask a brief `idle` window, the fix lives in the working-indicator mount logic in `components/view.ts` (a render-side concern), not in the reducer.
