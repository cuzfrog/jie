# TUI State and Reducer (v0.2)

The shape of the TUI's derived state and the event-by-event rules that mutate it. Sibling of `tui-layout.md` (spatial design), `tui-shortcuts.md` (keybindings), and `tui-pi-reference.md` (theme tokens). The parent spec is `tui.md`; this doc captures only the data model and the reducer contract.

## Reducer purity model

The reducer is a pure function `(state, envelope) → state` — referentially transparent, no `process.stdout` writes, no `tui.requestRender()` calls. The clock is read at exactly two topics, both at the boundary:

- `agent.idle` sets `state.agents[agentId].lastIdleAt = Date.now()` — used render-side for the queue-pickup flicker debounce.
- `ui.transient` carries `shownAt` in the envelope payload (the subscriber wrapper stamps `Date.now()` before publishing); the reducer does not read the clock for transient messages.

The subscriber wrapper does not mutate the reducer's returned state object. Real time is read in the renderer for display purposes (spinner frame, queue-pickup flicker, transient visibility).

## Identifier mapping (wire → state)

Per CLAUDE.md, serialized events use snake_case on the wire; TypeScript identifiers use camelCase. The reducer maps wire fields to state fields:

| Wire field (snake_case) | State field (camelCase) | Source topic |
|---|---|---|
| `agent_key` | `agentKey` | `system.teams` |
| `is_leader` | `isLeader` | `system.teams` |
| `block_type` | `block.kind` | `agent.stream.chunk` |
| `tool_call_id` | `card.callId` | `agent.tool.call` / `agent.tool.result` |
| `duration_ms` | `card.durationMs` | `agent.tool.result` |
| `input_truncated` | `card.inputTruncated` | `agent.tool.call` |
| `output_truncated` | `card.outputTruncated` | `agent.tool.result` |

The composite runtime key is `AgentId = \`${teamId}:${agentKey}\`` (see `00-overview.md` glossary). The reducer's `state.agents` map is keyed by `AgentId`, not by `agentKey`, to disambiguate agents across coexisting teams.

## State shape

```typescript
type AgentStatus = "idle" | "busy" | "err";
type EffortLevel = "low" | "medium" | "high" | "max";

interface ModelRef {
  provider: string;
  id: string;
  effort: EffortLevel;
}

interface Card {
  kind: "toolCall" | "toolResult";
  callId: string;
  name: string;
  input?: string;
  output?: string | null;
  inputTruncated?: boolean;
  outputTruncated?: boolean;
  durationMs?: number;
  error?: string | null;
  expanded: boolean;
}

interface Block {
  kind: "text" | "thinking";
  text: string;
  expanded: boolean;
}

interface Turn {
  userPrompt: string;
  cards: Card[];
  blocks: Block[];
  streamId: number | null;
}

interface AgentUiState {
  agentId: AgentId;
  teamId: string;
  agentKey: string;
  role: string;
  isLeader: boolean;
  status: AgentStatus;
  lastIdleAt: number;
  model: ModelRef | null;
  history: Turn[];
  currentTurn: Turn | null;
}

interface TransientMessage {
  text: string;
  shownAt: number;
}

interface ErrorBanner {
  text: string;
  raisedAt: number;
}

interface TuiState {
  teamId: string | null;
  leaderAgentId: AgentId | null;
  agents: Map<AgentId, AgentUiState>;
  focusedAgentId: AgentId | null;
  queue: string[];
  transientMessage: TransientMessage | null;
  errorBanner: ErrorBanner | null;
  showRail: boolean;
}
```

The state lives entirely in memory; the reducer is the only writer. A subscriber wrapper (in `packages/jie-tui/`) calls `tui.requestRender()` after each reducer run, never inside the reducer. Editor-internal state (`inputBuffer`, `inputHistory`, `historyIndex`) lives on pi-tui's `Editor` component; the reducer does not mirror it.

## Initial state

```typescript
const initialState = (): TuiState => ({
  teamId: null,
  leaderAgentId: null,
  agents: new Map(),
  focusedAgentId: null,
  queue: [],
  transientMessage: null,
  errorBanner: null,
  showRail: false,
});
```

`showRail` defaults to `false` — the rail is opt-in via `← ←`. `focusedAgentId` defaults to `null` and is set when the first `system.teams` event arrives (the leader is focused).

## Roles bootstrap (before `system.teams`)

While `state.teamId === null`, the TUI renders a placeholder rail from the `roles: string[]` argument passed by the host. The placeholder rail shows role names only (no `agentKey`, no model); the chat pane shows pi-tui's `Loader` component (`● Loading team…`). On `system.teams`, the placeholder entries are upgraded with `agentKey` and `model` and the `Loader` is replaced with the focused agent's chat history.

## Reducer rules

Each entry is the rule for one topic. Topics are matched in order: `ui.*` first (TUI-local), then `system.teams`, then `*.prompt`, then the un-scoped platform topics, then `custom.*`.

**Cross-team guard.** Every non-`team.*` rule early-returns `state` when `env.sender.identity?.teamId !== state.teamId`. Multi-team events for inactive teams do not mutate state. (When `state.teamId === null`, the guard rejects all events except `system.teams`.)

### `ui.rail.toggle`

Flip `state.showRail`. Payload is `null`.

### `ui.agent.cycle`

Cycle `state.focusedAgentId` by `payload.direction: 1 | -1`. No-op when `state.showRail === false`, when the agent map has fewer than two agents, or when the rail is hidden. Wraps in insertion order (the order agents joined via `teamLoaded`).

### `ui.thinking.toggle`

Expand / collapse **all** thinking blocks for the focused agent:

- `null` payload. The reducer collects every block where `kind === "thinking"` across `history[*].blocks` and `currentTurn.blocks`. If there are no thinking blocks, no-op.
- Target state: `expanded = !allAreExpanded`. If every thinking block is currently expanded, collapse; otherwise expand.
- Non-thinking blocks (text) and tool cards are untouched.
- Mid-stream toggle works — the in-progress block carries the new `expanded` flag on the next render tick.

### `ui.tool.toggle`

Mirror of `ui.thinking.toggle` for tool cards. Both `toolCall` and `toolResult` cards flip together; no-op when the focused agent has no cards.

### `ui.clear`

Clear `state.agents`, `state.queue`, `state.transientMessage`, and `state.errorBanner`. Memory rows on disk are untouched. Used by the `/clear` slash command.

### `ui.transient`

Set `state.transientMessage = { text: payload.text, shownAt: payload.shownAt }`. The envelope carries the timestamp (the subscriber wrapper stamps `Date.now()` before publishing). Renderer hides the message after 5 s (`Date.now() - shownAt > 5000`).

### `ui.transient.clear`

Set `state.transientMessage = null`. The Editor's `onSubmit` publishes this after publishing a prompt envelope.

### `ui.error`

Set `state.errorBanner = { text: payload.text, raisedAt: payload.shownAt }`. The envelope carries the timestamp (the subscriber wrapper stamps `Date.now()` before publishing). Used by `startTUI` to surface errors that the user must explicitly clear — most prominently the no-model-selected error from T4 step 3 (`No model has been selected, please login and select a default model.`). Distinct from `ui.transient`: errors persist until cleared.

### `ui.error.clear`

Set `state.errorBanner = null`. Published by the Editor's `onSubmit` and `onCancel` handlers; also by the `agent.turn.start` rule (the body's first signal that the user-submitted prompt is being processed, per `v0.2-mvp-tui.md` Phase 2). There is no auto-clear timeout — errors stay until the user acts.

### `system.teams`

Seed `state.agents` from `payload.agents`. Each agent entry is:

```typescript
{
  role: string;
  agent_key: string;
  is_leader: boolean;
  model?: { provider: string; id: string; effort: EffortLevel } | null;
}
```

Reducer steps:

1. If `state.teamId !== null && state.teamId !== incomingTeamId`: this is a team switch — reset `agents` (new empty `Map`), clear `leaderAgentId`, clear `focusedAgentId`. The in-memory event buffer (owned by the subscriber wrapper) is reset separately on team switch (per `tui.md` "Multi-team" and ADR 19).
2. Set `state.teamId = payload.teamId`.
3. For each agent in `payload.agents`: compute `AgentId = \`${payload.teamId}:${payload.agent_key}\`` and upsert into `agents`. Set `teamId`, `agentKey` (mapped from `payload.agent_key`), `role`, `isLeader` (mapped from `payload.is_leader`), and (if present) `model`. Preserves any other in-progress state (current turn, history) when reloading the same team.
4. For the leader (the entry with `is_leader === true`): record `state.leaderAgentId`. If `state.focusedAgentId === null`, set it to the leader's `AgentId`.

### `system.teams.{teamId}.agent.{agentKey}.prompt`

User-prompt arrival (self-published by the TUI on `Enter`). The bus subject is interpolated from the topic template by the factory (per `03-event-system.md` `resolveTopic`); the `{agentKey}` placeholder resolves to `payload.agentKey` (camelCase per `Events.userPrompt` factory).

Steps:

1. Resolve the target `AgentId` from `payload.teamId` + `payload.agentKey`.
2. Upsert the agent.
3. If the agent's `currentTurn` already has blocks or cards, push it to `history` first (delegation / follow-up turn). The history grows only when a new turn supersedes a populated one.
4. Open a fresh `currentTurn = { userPrompt, blocks: [], cards: [], streamId: null }`.
5. Clear `state.inputBuffer` (on the Editor — the reducer does not own the editor's buffer).

### `agent.turn.start`

`agentKey` from `env.sender.identity`. Cross-team guard applies.

Steps:

1. Upsert the agent.
2. Set `agent.status = "busy"`.
3. Set `state.errorBanner = null`. The user's submitted prompt is now being processed; any prior `errorBanner` (most prominently the no-model-selected error from T4) is cleared.
4. **Turn opening**: if `currentTurn === null`, open `freshTurn("")`. If `currentTurn` already has blocks or cards, push it to `history` and open `freshTurn("")` (delegation follow-up). If `currentTurn` is the one just opened by the prompt and is empty, keep it. (The prompt handler opens the empty turn; this rule's check is the symmetric case where `turn.start` arrives first — a stale replay path.)

### `agent.idle`

`agentKey` from `env.sender.identity`. Cross-team guard applies. Set `agent.status = "idle"`. Set `agent.lastIdleAt = Date.now()` — the only place the reducer reads the clock for the queue-pickup flicker debounce.

The reducer does **not** move `currentTurn` into `history` here. The prompt arrival in the next turn moves it. This avoids a premature "currentTurn frozen" state when a body restarts after a transient error mid-stream.

### `agent.stream.chunk`

`agentKey` from `env.sender.identity`. Cross-team guard applies. `payload.block_type` is `"text" | "thinking"`. `payload.stream_id` and `payload.seq` disambiguate interleaved streams from the same agent.

Steps:

1. If `payload.stream_id !== currentTurn.streamId`, push a new block and update `currentTurn.streamId = payload.stream_id`.
2. If the last block's `kind` matches `payload.block_type`, append `payload.text` to it; otherwise push a new `{ kind: blockType, text, expanded: false }` block and update `currentTurn.streamId` if it was null.
3. Open `freshTurn("")` if `currentTurn === null`.

`agent.stream.chunk` is **append-only** — the reducer does not finalize or rotate the block. The block carries its final length when the next chunk of a different `block_type` or `stream_id` arrives.

### `agent.stream.end`

No-op in the reducer. The terminal transition is `agent.idle`. Per `02-protocol-stack.md`, the CLI's gate does not subscribe to `stream.end`; the same applies to the TUI.

### `agent.tool.call`

`agentKey` from `env.sender.identity`. Cross-team guard applies. Push a `toolCall` card to `currentTurn.cards`, mapped from the wire payload:

```typescript
{
  kind: "toolCall",
  callId: payload.tool_call_id,
  name: payload.name,
  input: payload.input,
  inputTruncated: payload.input_truncated,
  expanded: false,
}
```

Open `freshTurn("")` if `currentTurn === null`.

### `agent.tool.result`

`agentKey` from `env.sender.identity`. Cross-team guard applies. Find the matching `toolCall` card by `payload.tool_call_id` and replace it in place with a `toolResult` card carrying `output`, `outputTruncated`, `durationMs`, and `error`. If no matching call exists (out-of-order delivery), push a `toolResult` card directly. Open `freshTurn("")` if `currentTurn === null`.

If `payload.output === null && payload.error === null` (defensive — the platform contract is one or the other), the card renders as `✓ <name>  <ms>ms` with an empty body. Treat as a tool success with no visible output.

### `agent.queue.update`

`agentKey` from `env.sender.identity`. Cross-team guard applies. Leader filter: `env.sender.identity?.agentKey === state.agents[leaderAgentId]?.agentKey` (where `leaderAgentId` resolves to `agentKey` via the `AgentId` map). Non-leader queues are dropped.

Replace `state.queue` with `payload.prompts.slice()`. Empty array clears the queue indicator in the renderer. The renderer truncates each prompt to 100 chars in the input-area indicator (per `ui/tui.md` "Degraded States").

### `custom.{teamId}.{topic}`

Domain events from `notify`. The reducer does **not** push them as a timeline entry in v0.2 — domain events are out of scope for the chat pane. The platform surface publishes them; the TUI ignores them at the reducer level. (Day 2+: a `domain-events` section can derive timeline entries without changing the envelope contract.)

### `system.teams.{teamId}.control.interrupt`

Body-side only — no reducer rule. The body subscribes to this topic directly (per `ui/tui.md` "Input loop and concurrency") and fires its `AbortController`. The "Unknown topic" fallback below applies.

### Unknown topic

Return `state` unchanged. The reducer is defensive against future topics the TUI does not yet handle.

## Per-agent streaming isolation

Each agent's stream runs independently. Cycling focus with `Ctrl+↑/↓` or submitting a prompt to a different agent does **not** abort another agent's in-flight stream. The reducer is per-agent by construction — `state.agents: Map<AgentId, AgentUiState>` — so the bodies' per-team subscriptions (per ADR 19) and the per-agent map compose cleanly:

- The reducer keys every update by `AgentId` (from the envelope's sender identity or payload).
- The reducer never observes cross-agent state — one agent's `agent.stream.chunk` only mutates `state.agents[thatId]`.
- Switching `focusedAgentId` is a view change only; it does not mutate any `currentTurn`, does not cancel timers, does not call `tui.requestRender()` itself (the subscriber does that on the reducing envelope).

The mock event manager (per `tui-layout.md` "Per-agent streaming isolation") mirrors this: timers are keyed per agent in `timersByAgent: Map<AgentId, Timer[]>`. The platform's body lifecycle is the production equivalent.

## Queue-pickup flicker (UX debounce)

When the body picks up a queued prompt, the sequence is `agent.idle` → `agent.prompt(nextMessage)` → `agent.turn.start`. The TUI sees `agent.idle` then `agent.turn.start` for the same body within the same tick. To avoid a brief "ready" flicker between turns:

- The reducer sets `state.agents[focused].lastIdleAt = Date.now()` on every `agent.idle` it processes.
- The renderer reads `Date.now() - lastIdleAt < 50` (render time) and forces a `●busy` display during that window.

This is a **pure render-side concern** — the reducer stays pure, the renderer reads the clock for this one display check. The 50 ms window is a documented magic number; it does not need to be exposed as state.

## Transient messages

Slash-command acknowledgments (`logged in to nvidia`, `default model set to nvidia/<modelId>`, `team switched to my-team-2`, `team '<id>' is not installed; ...`) render in the input area, not in the status bar. Reducer behavior: when a slash command succeeds (or fails), the input-loop subscriber publishes a synthetic `ui.transient` envelope (TUI-local; not on the platform bus). The envelope payload is `{ text: string; shownAt: number }`. The reducer rule (`ui.transient` above) sets `state.transientMessage`. The renderer hides it after 5 s. The Editor's `onSubmit` publishes `ui.transient.clear` to dismiss on the next `Enter`.

## Editor → focused agent

`state.focusedAgentId` is the editor's target. On submit:

1. The editor calls `onSubmit(text)`.
2. The editor's `onSubmit` reads `state.focusedAgentId ?? state.leaderAgentId` from the current reducer state and publishes the prompt envelope via `Events.userPrompt({ kind: "tui" }, state.teamId, text, targetAgentKey)`.
3. Cycling focus with `Ctrl+↑/↓` re-targets the next prompt without a refocus — the editor's `onSubmit` re-reads `focusedAgentId` each time.

When `state.focusedAgentId === null` (mid team-switch, before the first leader focus), `leaderAgentId` is the fallback. The prompt is not lost.

## History rotation

`state.agents[agentId].history` grows on three events:

1. A new `system.teams.*.agent.*.prompt` arrives for an agent whose `currentTurn` already has blocks or cards (delegation / follow-up push).
2. An `agent.turn.start` arrives for an agent whose `currentTurn` already has blocks or cards (delegation follow-up from the body's side; matches the prompt-side push so history stays consistent regardless of which side opens the new turn first).
3. The agent slot is reloaded by a `system.teams` event after a team switch (history is reset, then re-seeded).

History is not rotated by size or count in v0.2. The renderer slices to its visible rows (`Math.max(0, contentLines.length - bodyRows)`).

## File layout

The reducer lives in `packages/jie-tui/reducer.ts`; the state shape in `packages/jie-tui/state.ts`. Both are exports of `packages/jie-tui/index.ts` (visibility per `MODULE.md`). Tests are co-located: `state.test.ts` for shape-level invariants and `reducer.test.ts` for event-by-event rules.