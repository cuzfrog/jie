# TUI

Lives in `packages/jie-tui/`. The TUI is the team's user-facing cockpit: it observes all agent activity and sends user prompts to agents. Layout, theme, keybindings, and interaction patterns are its own concern and intentionally unspecified here. This chapter documents only the **information surface** the TUI consumes/generates and the **invariants** it must hold.

## Contract

```typescript
import type { EventBus } from '@cuzfrog/jie-platform';
import type { ArtifactStore } from '@cuzfrog/jie-platform';

function startTUI(options: { bus: EventBus; artifacts: ArtifactStore; roles: string[] }): void;
```

The TUI runs in the same OS process as all agents and shares the `EventBus` and `ArtifactStore`.

**`roles` is required.** It is the canonical team roster — the list of role identifiers parsed from the team blueprint's `.md` filename stems (excluding `TEAM.md`), sorted alphabetically by stem. `TEAM.md` is **not** the source of roles; it only declares the leader (and is optional for single-agent teams). The CLI (or any host process) computes the sorted list from the team-blueprint loader's output and passes it to `startTUI` before starting the team. The TUI uses `roles` to render the initial agents-panel at boot, before any events have arrived. Live state updates come from the `agent.turn.start` / `agent.idle` alternation and from `agent.stream.chunk` / `agent.tool.*` events as they fire (per the Event-Order Contract in `03-event-system.md`; the body does not publish `agent.idle` at startup — ADR 22).

## Inputs

The TUI obtains everything it needs from two surfaces:

1. **EventBus events.** The TUI subscribes to:
   - All domain topics (team-defined) for pipeline progression and outcomes. Each event carries `agent_role`, `agent_key`, and the team-defined payload.
   - `agent.stream.chunk` / `agent.stream.end` — live LLM output from any agent, demuxed by `(agent_role, agent_key, stream_id)`.
   - `agent.tool.call` / `agent.tool.result` — tool execution telemetry from any agent.
   - `agent.idle` — signals an agent is ready for new work; also used for agent discovery.

2. **Artifact Store** (read-only) for content referenced by events. The TUI uses `read(key)` and `list(prefix)` from `05-artifact-store.md`.

The TUI gets nothing else. It does not have a private channel to agents and does not call `core` directly.

## Prompt Sending

The TUI publishes user prompts to the EventBus. This is the TUI's sole write path. The wire-format contract (every-publisher-fills-every-field, no shorthand) is in `03-event-system.md` "Event Envelope"; the per-publisher protocol (TUI inputs and direct addressing) is in `02-protocol-stack.md` "Prompt Ingress".

- Prompts without an explicit agent target go to the active team's leader via `Events.userPrompt({ kind: "tui" }, active_team_id, prompt, leader_agent_key)`, where the TUI has captured the leader's `agent_key` from the most recent `team.loaded` event for the active team. The factory interpolates to `team.{active_team_id}.agent.{leader_agent_key}.prompt`; `payload: { teamId: active_team_id, agentKey: leader_agent_key, prompt }`; `sender: { kind: "tui" }`; `version: 1`; `timestamp` = current ISO 8601. The targeted body auto-subscribes to its own subject, so the prompt reaches only the leader; other teams' bodies are untouched. There is **no** `leader.prompt` shortcut topic in v0.2 — the leader is just one specific `agent_key`.
- Prompts targeting a specific agent (when the user is viewing that agent's tab) use the same factory with a different `target_agent_key`: `Events.userPrompt({ kind: "tui" }, active_team_id, prompt, target_agent_key)`. The factory interpolates to `team.{active_team_id}.agent.{target_agent_key}.prompt`. The targeted body is the only one subscribed to that subject.

The source is implicit — the TUI is the only user-facing prompt publisher in the process. The full wire-format contract is in `03-event-system.md` "Event Envelope" and `02-protocol-stack.md` "Prompt Ingress".

## Agent Discovery

The TUI discovers active agents from EventBus events:

Any agent that is listed in a `{team_id}.team.loaded` event for the active team, OR publishes `agent.stream.chunk`, `agent.tool.call`, `agent.tool.result`, `agent.turn.start`, or `agent.idle` for the active team, becomes visible. The `{team_id}.team.loaded` event (per ADR 22) is the **anchor for "agent is alive"** — the TUI subscribes to it for each loaded team and populates the agents-panel from its `agents` array as soon as it arrives, before any activity event. The activity events refine the "busy / idle" status (see `11-monitoring.md`).

- The TUI filters platform events by the active team's `team_id` (from the envelope, see `03-event-system.md` `AgentEvent.team_id`). Multiple teams' events flow on the same platform subjects; the envelope disambiguates.
- Each unique `(team_id, agent_role, agent_key)` for the active team becomes a tab or panel.
- `team_id`, `agent_role`, and `agent_key` come from the event envelope.
- When an agent publishes `agent.idle`, the TUI marks that agent slot as ready (no longer processing).

No separate heartbeat protocol — agent presence is derived from `team.loaded` (alive) plus activity events (busy/idle). The TUI does not see other teams' agents as "active" — it only renders the active team. The `team.loaded` event is one-shot per team load; on team swap-back, the TUI uses the buffer / cache it already built up — `team.loaded` is not republished.

## Invariants

- **Read-only on platform subjects.** The TUI MUST NOT publish to `agent.stream.*`, `agent.tool.*`, `agent.idle`, or any other un-scoped platform subject. Prompt ingress is the TUI's sole write path: `Events.userPrompt({ kind: "tui" }, active_team_id, prompt, target_agent_key)` publishes to `team.{active_team_id}.agent.{target_agent_key}.prompt` — the leader is reached by passing the leader's `agent_key` as `target_agent_key` (the TUI tracks it from the most recent `team.loaded` event).
- **No state of its own beyond UI state.** All authoritative state lives on the EventBus and in the Artifact Store. The TUI is a pure projection.
- **Out-of-band oblivious.** Internal agent operations (compaction, memory loads) are not published on the EventBus and so the TUI does not display them.

## Information Available

For any active work unit the TUI can present, derived purely from inputs above:

- The pipeline timeline: which domain events have fired in which order.
- The current work-unit status and any iteration counter.
- The most recent artifact of each type for the current work unit (via `list("{work_id}/")`).
- Live LLM output for any agent currently streaming, demuxed by `(agent_role, agent_key, stream_id)`.
- Failure detail when an error event arrives.

How any of this is rendered — tabs, panes, charts, markdown, plain text — is left to the TUI implementation.

## Agent Lifecycle

- **New agent appears.** When a previously unseen `(agent_role, agent_key)` publishes an event, the TUI adds it as a new tab or panel.
- **Agent restart.** Agent keys are derived from the blueprint (`{role}-{N}`) and are stable across starts. When the process restarts, agents resume with the same keys. The TUI does not replay past events — it only displays events published after it starts.
- **Leader restart → prompt queue cleared.** When the leader restarts (new `agent_key`), any prompts queued in the leader's in-memory buffer are lost (see `08-memory.md`). The TUI should surface this to the user.

## Degraded States

In the in-process deployment (v1 default), the leader and all agents run in the same OS process as the TUI. If any agent's body crashes, the process exits. Therefore:

- The TUI never encounters a "leader offline" state — if the leader stops, the process has crashed. (The TUI's "agent is alive" check is the presence of the leader in a recent `{team_id}.team.loaded` event; absence of `team.loaded` for an agent is the "I have not seen this team" case, which can also arise from a fresh process that has not yet received the event, or a team that was never loaded in this process.)
- Prompt input is always available. During a work-unit-in-flight, prompts are queued per the leader's memory behavior (see `08-memory.md`).

  When the user submits a prompt while the leader is busy, the TUI must show a visible queued-prompt indicator. The TUI derives this from the `agent.queue.update` event (`{ prompts: string[] }`) published by the body on every enqueue and dequeue. If the queue is empty (or the event is absent), the indicator is hidden. If the queue is non-empty, the indicator shows the count and a peek of the contents (first ~100 chars per prompt). The indicator updates as messages enqueue and dequeue — no polling, no derived state.

  The prompt queue is in-memory only — lost on process restart (acceptable for v1).

  **Queue-pickup flicker (UX detail).** When the body picks up a queued prompt and starts the next turn, the sequence is `agent_end` (body publishes `agent.idle`) → `agent.prompt(nextMessage)` (triggers `agent_start` → `agent.turn.start`). The TUI sees `agent.idle` then `agent.turn.start` for the same body within the same tick. The TUI should treat `agent.idle` followed by `agent.turn.start` for the same body within a short window (e.g. 50 ms) as "still busy" to avoid a brief "ready" flicker between turns. This is a pure UX concern — no platform change.

  **Where the debounce lives.** The debounce is **render-side**, not reducer-side. The reducer tracks `state.agents[key].lastIdleAt: number` (set on `agent.idle`); the renderer reads `Date.now() - lastIdleAt < 50` and forces a `●busy` display during that window. The reducer stays pure; the renderer reads `Date.now()` (a real-time side effect at render time, which is acceptable because the renderer's only side effect is `tui.requestRender()`, not state mutation). (R-10 in the v0.2 review tracker.)

## Slash Commands

The TUI exposes slash commands that mirror the CLI's `login`, `logout`, `model`, and `team` subcommands. They mutate the same files (`~/.jie/auth.json`, `~/.jie/settings.json`, `.jie/settings.json`) and have the same on-disk effect as their CLI counterparts.

| Command | Writes to | Takes effect on |
|---|---|---|
| `/login` | `~/.jie/auth.json` | Next LLM call (no restart needed). |
| `/logout [<provider>]` | `~/.jie/auth.json` | Next LLM call. |
| `/model <provider>/<modelId>` | `~/.jie/settings.json` | Next LLM call (no restart needed). The platform re-resolves `(provider, modelId)` from merged settings on every LLM call. |
| `/team <id>` | `.jie/settings.json` or `~/.jie/settings.json` | If the team is installed: immediately switches the TUI's active team. The platform lazy-loads the team if it is not already loaded in this process. The previously-active team is **not** destroyed — it keeps running in the background with its state intact (per ADR 19). If the team is **not** installed (no `.jie/teams/<id>/` and no `~/.jie/teams/<id>/`): the TUI shows an error message in the input area matching the CLI's `team '<id>' is not installed; checked .jie/teams/<id>/ and ~/.jie/teams/<id>/` and continues to function. No write to settings. The TUI's active team is unchanged. |
| `/team` (no arg) | (read-only) | Shows current `defaultTeam` plus a list of installed teams with pi's selection-filter UI; selecting one is equivalent to `/team <id>` and switches the TUI's view. |
| `/team --unset` | `.jie/settings.json` or `~/.jie/settings.json` | Next `jie` invocation. Mid-session unset is not supported. |

Unstructured text input for `/model` follows the same `<provider>/<modelId>` form as `jie model` in the CLI (see `ui/cli.md`).

Slash commands are the TUI's only writes to disk outside the runtime event log. They run synchronously in the TUI's input loop; the user stays in the TUI on success. `/model` followed by a successful write shows a hint: `default model set; takes effect on next LLM call`. `/team <id>` followed by a successful write shows a hint: `default team set`. `/team` with selection completes the switch without prompting — the TUI's view moves to the selected team.

### Model and Team Hot-Swap

The TUI supports model and team switch mid-session because the Memory subsystem preserves conversation history across team loads within a process run (`08-memory.md`):

- **Model.** The platform re-reads `defaultProvider` + `defaultModel` from merged settings on every LLM call. The agent's `agent_key` is stable across model changes; conversation history is preserved (rows in `memory_turns` keyed by `(team_id, agent_key, session_id, seq)` per ADR 17 are unchanged when the resolved model changes).
- **Team.** `/team <id>` (or `/team` followed by selection in the picker) switches the TUI's active team in-session. The TUI validates that the team is installed first (per the lookup paths in `10-configuration.md`); if the team is not installed, the TUI shows an error message in the input area (matching the CLI's `team '<id>' is not installed; checked .jie/teams/<id>/ and ~/.jie/teams/<id>/`) and continues to function. No write to settings. The TUI's active team is unchanged. The TUI is a passive observer — it does not control agent bodies (per ADR 19):
  1. The TUI consults the platform's internal `loadedTeams` map (per `addrs/13-platform-entry-function.md` and ADR 19). If the team is already loaded, its bodies are alive and continue running — no body-lifecycle change.
  2. If the team is not loaded, the platform calls `loadTeam(teamId)`: parses the blueprint per `10-configuration.md` "Team Selection", constructs bodies, registers them on the bus, and records them in `loadedTeams`. The platform looks up the new team's `team_id` in its in-memory `Map<team_id, session_id>` (per `08-memory.md` "Restore" and ADR 18). If the team was previously active in this process, the recorded `session_id` is passed to each new body; the body uses it and `restore()` returns the prior `memory_turns` rows. If the team is new in this process, the platform mints a fresh `session_id`, records it under the team's `team_id`, and passes it to each new body. All agents in the new team share this session id. In both cases, the new bodies resume from where the team left off.
  3. The TUI re-renders: it now subscribes to `team.{active_team_id}.agent.{leader_agent_key}.prompt` for prompt publication (where `leader_agent_key` comes from the new team's `team.loaded` event), and filters platform events by the active team's `team_id` (from the envelope). Tabs/panels for the new team's agents appear via the existing "Agent Discovery" primitives.

     **Subscription lifecycle.** The `EventBus.subscribe()` method returns an unsubscribe function (per `03-event-system.md` "EventBus Interface"). The TUI holds the unsubscribe functions from every subscription it has registered. On team switch, the TUI subscribes to the new team's subjects **first**, then unsubscribes from the previous team's. The new subscribe is the registration; the old unsubscribe is the cleanup. The new subscriptions are: `team.{new_team_id}.agent.{new_leader_agent_key}.prompt` (the new leader's prompt subject; the `agent_key` is captured from the new team's `team.loaded` event) and any `custom.{new_team_id}.{domain_topic}` from the new team's blueprint. The unsubscribed subjects are: `team.{prev_team_id}.agent.{prev_leader_agent_key}.prompt` and any `custom.{prev_team_id}.{domain_topic}` from the previous team's blueprint. The order (subscribe-new, then unsubscribe-old) avoids a gap during which no leader.prompt is being subscribed; a prompt typed in the gap would otherwise be dropped. Subscriptions to **un-scoped** platform subjects (`agent.stream.chunk`, `agent.stream.end`, `agent.tool.call`, `agent.tool.result`, `agent.queue.update`, `agent.turn.start`, `agent.idle`) are NOT unsubscribed on team switch — the TUI subscribes to them once at startup and uses `envelope.team_id` to filter for the active team; the un-scoped subscription is permanent for the TUI's lifetime. The `{team_id}.team.loaded` subscription is also permanent (the TUI uses it to populate the agents-panel for every team that loads). This split — per-team subscriptions come and go with the active team; per-process subscriptions stay — is the right memory-leak boundary.
  4. **The previously-active team is not stopped.** Its bodies keep their state — `memory_turns` rows, in-memory prompt queue, LLM context, in-progress work. The TUI simply stops publishing prompts to that team's prompt topic. The team's agents continue processing any queued prompts autonomously; the TUI just isn't watching.
  5. **Conversation history on swap-back** (scenario 3 step 5). The TUI's "previous conversation" is **the events it has already received during this process run**, kept in an in-memory per-`(team_id, agent_key)` event buffer. Because the team switch is in-process (no process restart), the buffer is preserved across switches. The TUI does **not** read `memory_turns` — that storage is for the LLM's restored prompt context (consumed by the body's `restore()` only); the TUI's display is event-driven. When the user switches back to a previously-active team, the TUI filters the buffer to that team's agents and re-renders the conversation area. The `memory_turns` rows on disk remain the source of truth for **agent resume across process restarts** (via `--resume` / `--continue`); the in-memory buffer covers the **same-process** swap-back case. See user scenario 3 for the expected UX.

## Library: `@earendil-works/pi-tui`

The TUI is implemented against [`@earendil-works/pi-tui`](https://github.com/badlogic/pi-mono/tree/main/packages/tui) (the TUI package in the same vendor family as `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core`, both already vendored by the platform). The choice is locked in; do not introduce a competing TUI framework.

The TUI consumes:

- `TUI`, `Container` — the root render tree.
- `ProcessTerminal` — the production `Terminal` impl (raw mode on `process.stdin`/`stdout`).
- `VirtualTerminal` — the test `Terminal` impl (backed by `@xterm/headless`).
- `Editor` — the bottom input line (multi-line, slash autocomplete, paste handling, history).
- `SelectList` with `fuzzyFilter` — the `/team` picker.
- `Loader` — the busy indicator (the spinner shown next to the active agent's status in the status bar; v0.2 does not use `CancellableLoader` directly — the TUI's `Esc Esc` path publishes a bus event, the body's `AbortController` does the cancel, and the spinner is just a `Loader`).
- `Markdown` — for the chat pane's rendering of the agent's text content. **Not** for tool output: tool cards' expanded view is plain text (per the v0.2 decision; a tool's output is a deterministic JSON blob and rendering it as markdown would change the surface). If a tool's output contains markdown (e.g., a `write_artifact` body), the user can copy it out of the TUI; the TUI does not auto-render.
- `TruncatedText`, `Spacer`, `Box`, `Text` — layout primitives.
- `matchesKey`, `Key`, `parseKey` — keystroke matching (the keymap is the TUI's only piece of "custom code" outside the reducer).

The TUI does **not** re-implement rendering, raw-mode, line-diffs, or keypress parsing — those live in `pi-tui`. The TUI's custom code is:

1. The reducer `(state, envelope) → state`.
2. The keymap (`KeyAction` union + dispatch).
3. The `Component` subclasses that project state into `render(width) → string[]`.

## Layout (v0.2)

Five panes, drawn top-to-bottom with a left rail:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ★ general (leader)   anthropic/claude-sonnet-4-5  queue: 1  ●busy         │  ← status bar (1 line)
├──────────────┬─────────────────────────────────────────────────────────────┤
│ ★ general    │  ● bash read_file                                            │
│   researcher │     input: {"path":"file1.txt"}                              │
│              │  ✓ bash read_file (32ms)                                     │
│   (left      │     output: "Hello123888"                                    │
│   rail:      │                                                              │
│   agent      │  [general]  The file contains "Hello123888".                 │
│   list,      │                                                              │
│   1/3 width) │  Tell me a story.                                            │
│              │                                                              │
│              │  [general]  Marry had a little lamb.                         │
│              │                                                              │
│              │  ▌ thinking…                                                 │  ← live stream indicator
├──────────────┴─────────────────────────────────────────────────────────────┤
│ > type a prompt...                                                          │  ← InputPane (pi-tui Editor instance)
├────────────────────────────────────────────────────────────────────────────┤
│ Tab next  Shift+Tab prev  Alt+1..9 jump  Enter send  Esc×2 interrupt        │  ← footer (1 line, keymap)
└────────────────────────────────────────────────────────────────────────────┘
```

**Pane widths** (responsive, recomputed on terminal resize):

- Status bar: full width, 1 line.
- Footer: full width, 1 line.
- Left rail: `floor(cols * 0.20)` columns, between 12 and 24. Holds the agents list, one row per agent. Leader pinned to top with `★`. Each row shows `<role>  <status>` where `<status>` is one of `idle`, `●busy`, `✗err`.
- Chat pane: remaining width, `rows - 4` lines tall. The chat pane is the active agent's scrolling history plus the live stream indicator.
- InputPane: full width minus left rail, 3 lines (multi-line capable). Hosts the `pi-tui` `Editor` instance.

**Active agent.** The chat pane shows the focused agent's history. The active agent is selected by `Tab` (next), `Shift+Tab` (prev), `Alt+1`..`Alt+9` (jump to Nth agent), or by clicking on the row in the left rail (if the terminal supports mouse — the v0.2 TUI does **not** enable mouse; the rail is keyboard-navigable only).

**Thinking block.** When the LLM emits `agent.stream.chunk` with `block_type: "thinking"`, the chat pane inserts a one-line dimmed prefix `▌ thinking…` and accumulates the rest into a collapsed block. Pressing `T` on a focused thinking block expands it; pressing `T` again collapses. The default is **collapsed** (per the v0.2 decision).

**Tool cards.** `agent.tool.call` and `agent.tool.result` are rendered as inline one-line cards in the chat pane, between the assistant's text turns:

- Call: `● <tool_name>  <input-truncated>` (gray).
- Result (ok): `✓ <tool_name>  <duration_ms>ms` (gray; full output viewable on spacebar expand).
- Result (error): `✗ <tool_name>  <error>` (red; full error viewable on spacebar expand).

A focused card can be expanded with `Space` (toggles full input / output on subsequent lines, indented with `│`).

**Status bar fields.** Left to right: `★ <leader_role> (leader)`, `<provider>/<modelId>`, `queue: N` (only when N > 0), `●busy` / `idle` / `✗err` (active agent's status). All fields are derived from the reducer state; no field is computed at render time.

**Transient messages.** Transient system messages (`logged in to <provider>`, `default model set to <p>/<m>`, `team switched to <id>`, `team '<id>' is not installed; ...`) render in the **input area** (above the InputPane, replacing the input buffer's placeholder text), not in the status bar. The status bar shows live state; the input area shows system messages. A transient message is cleared on the next `Enter` (submit) or 5 seconds after display, whichever comes first. The reducer tracks `state.transientMessage: { text: string; shownAt: number } | null`; the renderer reads `Date.now() - shownAt < 5000` to decide visibility. (R-18 in the v0.2 review tracker.)

## Keybindings (v0.2)

The keymap is a single object exported from `packages/jie-tui/keymap.ts`. Each entry is a `KeybindingDefinition` from `pi-tui`. The TUI's input loop is one switch over `matchesKey`.

| Key             | Action                                          | Scope         |
|-----------------|-------------------------------------------------|---------------|
| `Enter`         | Submit prompt (when InputPane has focus)         | InputPane focus |
| `Shift+Enter`   | Newline in InputPane                             | InputPane focus |
| `Tab`           | Focus next agent (wraps)                         | Global          |
| `Shift+Tab`     | Focus previous agent (wraps)                     | Global          |
| `Alt+1`..`Alt+9`| Focus Nth agent                                  | Global          |
| `Esc`           | Clear input (InputPane focus); dismiss card expand | InputPane / card |
| `Esc Esc`       | Interrupt current turn (publishes abort)         | Global          |
| `Ctrl+C`        | Same as `Esc Esc`                                | Global          |
| `Ctrl+D`        | Exit TUI (with confirmation if a turn in flight) | Global          |
| `Up` / `Down`   | Navigate input history                           | InputPane focus |
| `Ctrl+L`        | Clear screen (forces full re-render)             | Global          |
| `Space`         | Toggle tool-card / thinking-block expand         | Card focus      |
| `T`             | Toggle thinking-block expand (default collapsed) | Block focus     |
| `/`             | Open slash-command autocomplete in InputPane     | InputPane focus |
| `q` (in `/help`)| Close `/help` overlay                           | Overlay       |

**Slash commands** (Editor input that starts with `/`):

| Command             | Effect                                                    |
|---------------------|-----------------------------------------------------------|
| `/login`            | Open the login flow (provider list, then API key prompt)  |
| `/logout [<id>]`    | Clear one or all providers from `~/.jie/auth.json`        |
| `/model <p>/<m>`    | Set default model in `~/.jie/settings.json`               |
| `/team [<id>]`      | Open team picker; selecting a team calls `loadTeam`       |
| `/team --unset`     | Clear `defaultTeam` in settings (CLI-only; not in TUI)    |
| `/clear`            | Clear the active agent's event buffer (memory rows kept)  |
| `/help`             | Show the keymap in an overlay                             |
| `/exit`             | Exit the TUI (same as `Ctrl+D`)                           |

Slash commands mutate the same files the CLI does and take effect immediately (model switch) or on the next LLM call (team switch; see `ui/tui.md` "Model and Team Hot-Swap").

## Rendering

The renderer is a **pure function** of state:

```typescript
type TuiState = { /* reducer output, see below */ };
function render(state: TuiState, width: number, height: number): string[];
```

`render` returns one string per terminal line. `pi-tui`'s `TUI` component tree owns the actual ANSI emission and differential diff. The TUI's custom `Component` subclasses (`AgentsRail`, `StatusBar`, `ChatPane`, `Footer`, `KeymapOverlay`) each implement `render(width: number): string[]` and delegate the rest to `pi-tui`'s `Container`.

**Streaming.** `agent.stream.chunk` events with `block_type: "text"` are appended to the focused agent's current turn. The reducer updates `state.agents[focused].currentTurn` and calls `tui.requestRender()`. The TUI does **not** rewrite previously rendered text on every chunk; `pi-tui`'s diff renderer handles the incremental update.

**Domain events.** Events on `custom.{team_id}.{topic}` (published by `notify`) are appended to the focused agent's history as one line: `[{topic}] {summary(payload)}`. The summary is a stable JSON-shape rendering; full payload is on `Space` expand.

**Error surface.** When the body publishes a terminal event with `error:` prefix in `prompt` (per `11-monitoring.md` "Error Surfacing"), the TUI inserts a `✗ error: {message}` line in the focused agent's history and sets the agent's status to `err` in the left rail.

## Input loop and concurrency

The TUI's event loop has two concurrent sources of work:

1. **`EventBus` callbacks** — fired by `pi-tui`'s synchronous dispatch. Each callback runs the reducer and calls `tui.requestRender()`.
2. **Stdin (keypress) events** — fired by `pi-tui`'s `StdinBuffer`. Each event runs the keymap switch and either updates the reducer or delegates to a focused component (`Editor`, `SelectList`).

The two never run in parallel: `pi-tui` is single-threaded; the event loop yields between callbacks. The TUI does **not** introduce `setImmediate` or `queueMicrotask` of its own.

**TUI startup.** `startTUI` does, in order:

1. Verify `process.stdin.isTTY` is true. If not, log `TUI requires an interactive terminal; use \`jie -p\` for scripts.` to stderr and return a non-zero exit code. The CLI's `jie` (no flags) then exits 1.
2. Verify the terminal is at least 60 columns wide. If not, log `terminal too narrow for TUI; need at least 60 columns, got <N>` to stderr and return a non-zero exit code.
3. Verify the locale is UTF-8 (heuristic: `process.env.LANG` or `LC_ALL` contains `UTF-8` or `utf8`). If not, log `TUI requires a UTF-8 locale; set LANG=en_US.UTF-8` to stderr and exit non-zero. The TUI does **not** fall back to ASCII glyphs (`★`, `▌`); the user is expected to set a UTF-8 locale.
4. Construct a `ProcessTerminal` and a `TUI` rooted on it.
3. Subscribe to all platform subjects (`agent.stream.chunk`, `agent.stream.end`, `agent.tool.call`, `agent.tool.result`, `agent.turn.start`, `agent.idle`, `agent.queue.update`) and `{team_id}.team.loaded` for any team that loads, plus the active team's `team.{active_team_id}.agent.{leader_agent_key}.prompt` (using the leader's `agent_key` from the active team's `team.loaded` event) and any `custom.{active_team_id}.{topic}` from the team's blueprint.
4. Build the initial state from the `roles` bootstrap list and from the next `team.loaded` event.
5. Mount the `Container` (`StatusBar`, `AgentsRail`, `ChatPane`, `Editor`, `Footer`) and call `tui.start()`.

**TUI shutdown.** `startTUI` returns `never`; the only exit paths are:

- `Ctrl+D` (or `/exit`) — call `handle.stop()` (10 s bounded), then `tui.stop()`, then call the injected `StartTUIOptions.exit(0)`. If a turn is in flight, the TUI's prompt area renders `A turn is in flight; exit anyway? [y/N]` (default N) and re-prompts on `Enter` until y or N. The TUI's own subscriptions (per-team + per-process) are not torn down explicitly; the OS process exit on `StartTUIOptions.exit` cleans them up. The TUI does not own the process lifecycle beyond calling `exit()`; the CLI's `jie` (no flags) returns immediately after `startTUI(...)` because the TUI is `never` (the TUI owns the process lifecycle once started).
- `Esc Esc` (or `Ctrl+C`) — publish a synthetic interrupt on `team.{active_team_id}.control.interrupt` via `Events.custom({ kind: "tui" }, "{active_team_id}.control.interrupt", { prompt: "interrupt" })`. The body subscribes to this topic (per the v0.2 platform change: every body adds `control.interrupt` to its per-team subscription list at startup) and reacts by firing its `AbortController`, which cancels the in-flight LLM call. The TUI does **not** exit on this path; only the turn is interrupted. The TUI's `Editor` (in the InputPane) is **not** cleared by `Esc Esc`; the user must press `Esc` once to clear the input.
- `handle.stop()` from a programmatic source (currently none in v0.2; the TUI exits on its own keypresses) — same as `Ctrl+D`.

## Screen-update model

`pi-tui` provides the differential renderer (three strategies: first-render, full-clear on resize, normal-update diff, all wrapped in `CSI 2026` synchronized-output). The TUI does **not** re-implement diffing. The TUI's contribution is:

- **Reducer is pure.** `(state, envelope) → state` is referentially transparent. Same input, same output. The TUI test harness asserts reducer outputs against recorded event streams.
- **`render` is pure.** `state → string[]` has no side effects, no `process.stdout` writes, no time-dependent behavior. The test harness asserts frame contents.
- **No internal timers.** The TUI's only time source is the `EventBus` and the keypress stream. No `setInterval`, no `setTimeout` (the only exception is the interrupt-debounce window, 50 ms, which is a documented magic number — see `ui/tui.md` "Degraded States").

## Snapshot / replay tests

The TUI's test strategy has three layers:

1. **Reducer tests** — feed a hand-recorded `EventEnvelope` JSONL to the reducer; assert the resulting `TuiState`. No I/O, no terminal. These are the "logic" tests.
2. **Render tests** — feed a `TuiState` to `render(state, width, height)`; assert the returned `string[]` against a snapshot file. No I/O, no terminal. These are the "visual" tests, diffed on the commit.
3. **Integration tests** — feed a hand-recorded JSONL to a `TUI` rooted on a `VirtualTerminal` (from `@xterm/headless`); drive a synthetic keypress stream; assert the terminal buffer after each event. These are the "interaction" tests.

The five v0.2 TUI scenarios (T1–T5) ship as `tests/e2e/tui/fixtures/<scenario>.jsonl` plus a small `tests/e2e/tui/<scenario>.test.ts` that runs layer 1 + 2 + 3 for each scenario. The JSONL is the canonical AC; the screen snapshot is a derived assertion.

The fixtures are **hand-recorded**, not generated. The test harness does **not** run the platform or call an LLM. A v0.2 "generated from e2e" recorder is Day 2+.

## Multi-team (v0.2)

v0.2 ships multi-team in the TUI. The platform's `JiePlatform` surface expands from `{ bus, stop }` to `{ bus, teamId, bodies(), loadTeam, stop }` (the shape ADR 19 and ADR 25 foreshadow; both are updated for v0.2). The TUI's `/team` slash command is first-class:

- `/team <id>` — if `<id>` is installed, call `loadTeam(id)`; the TUI's `teamId` switches; the reducer re-derives state from the per-team event buffer; the chat pane shows the new team's agents. The previously-active team is **not** stopped (per ADR 19); its bodies and state are preserved.
- `/team` (no arg) — open a `SelectList` with `fuzzyFilter` over the installed team ids; selecting one is the same as `/team <id>`.
- `/team not-installed` — render the error `team 'not-installed' is not installed; checked .jie/teams/not-installed/ and ~/.jie/teams/not-installed/` in the input area (matching the CLI's error), do not call `loadTeam`, do not change the active team.

The TUI's subscription lifecycle (per `ui/tui.md` "Model and Team Hot-Swap") ships in v0.2. Per-team subscriptions (the active team's `team.{active_team_id}.agent.{leader_agent_key}.prompt` and any blueprint-defined `custom.{team_id}.{topic}`) come and go with the active team; per-process subscriptions (`agent.stream.chunk`, `agent.tool.*`, `agent.turn.start`, `agent.idle`, `agent.queue.update`, `{team_id}.team.loaded` for any team) stay for the TUI's lifetime.

## Flag parity (v0.2)

`jie [--team <id>] [--api-key <k>] [--resume <id> | --continue]` opens the TUI. The TUI uses the same `createApp` orchestrator that `-p` uses; the only difference is the final render surface. The TUI does **not** accept `-p` (one-shot) or `--json` (those are `-p`-only). The TUI does **not** accept `--timeout` (the TUI has no timeout — Ctrl+D exits, and the busy indicator shows the queue depth).

## v0.2 vs v1 surface

The v0.2 TUI is the first release. There is no v1-only TUI surface. The v1 CLI's `-p` mode keeps its single-team shape; it does **not** adopt `loadTeam`. The v0.2 TUI and the v1 CLI share the same underlying `JiePlatform` instance shape, but the TUI is the only caller of `loadTeam`.
