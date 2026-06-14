# TUI

Lives in `packages/jie-tui/`. The TUI is the team's user-facing cockpit: it observes all agent activity and sends user prompts to agents. Layout, theme, keybindings, and interaction patterns are its own concern and intentionally unspecified here. This chapter documents only the **information surface** the TUI consumes/generates and the **invariants** it must hold.

## Contract

```typescript
import type { EventBus } from '@cuzfrog/jie-platform';
import type { ArtifactStore } from '@cuzfrog/jie-platform';

function startTUI(options: { bus: EventBus; artifacts: ArtifactStore; roles: string[] }): void;
```

The TUI runs in the same OS process as all agents and shares the `EventBus` and `ArtifactStore`.

**`roles` is required.** It is the canonical team roster — the list of role identifiers parsed from the team blueprint's `.md` filename stems (excluding `TEAM.md`), sorted alphabetically by stem. `TEAM.md` is **not** the source of roles; it only declares the leader (and is optional for single-agent teams). The CLI (or any host process) computes the sorted list from the team-blueprint loader's output and passes it to `startTUI` before starting the team. The TUI uses `roles` to render the initial agents-panel at boot, before any events have arrived. Live state updates come from `agent.idle` (including the per-body startup publish) and from `agent.stream.chunk` / `agent.tool.*` events as they fire.

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

The TUI publishes user prompts to the EventBus. This is the TUI's sole write path:

- Prompts without an explicit agent target go to `{active_team_id}.leader.prompt` — the active team's leader receives these. The TUI tracks the active team (set by `/team <id>` or startup resolution) and routes accordingly. Other teams' bodies are untouched.
- Prompts targeting a specific agent (when the user is viewing that agent's tab) go to that agent's `{active_team_id}.{agent_key}` topic.

Payload: `{ prompt: string }`. The source is implicit — the TUI is the only user-facing prompt publisher in the process.

## Agent Discovery

The TUI discovers active agents from EventBus events:

- Any agent that publishes `agent.stream.chunk`, `agent.tool.call`, `agent.tool.result`, or `agent.idle` becomes visible.
- The TUI filters platform events by the active team's `team_id` (from the envelope, see `03-event-system.md` `AgentEvent.team_id`). Multiple teams' events flow on the same platform subjects; the envelope disambiguates.
- Each unique `(team_id, agent_role, agent_key)` for the active team becomes a tab or panel.
- `team_id`, `agent_role`, and `agent_key` come from the event envelope.
- When an agent publishes `agent.idle`, the TUI marks that agent slot as ready.

No separate heartbeat protocol — agent presence is derived from activity events. The TUI does not see other teams' agents as "active" — it only renders the active team.

## Invariants

- **Read-only on platform subjects.** The TUI MUST NOT publish to `agent.stream.*`, `agent.tool.*`, or `agent.idle`. Prompt ingress (`{active_team_id}.leader.prompt` and per-agent `{active_team_id}.{agent_key}` topics) is the TUI's sole write path.
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

- The TUI never encounters a "leader offline" state — if the leader stops, the process has crashed.
- Prompt input is always available. During a work-unit-in-flight, prompts are queued per the leader's memory behavior (see `08-memory.md`).

  When the user submits a prompt while the leader is busy, the TUI must show a visible queued-prompt indicator. The TUI derives this from the `agent.queue.update` event (`{ prompts: string[] }`) published by the body on every enqueue and dequeue. If the queue is empty (or the event is absent), the indicator is hidden. If the queue is non-empty, the indicator shows the count and a peek of the contents (first ~100 chars per prompt). The indicator updates as messages enqueue and dequeue — no polling, no derived state.

  The prompt queue is in-memory only — lost on process restart (acceptable for v1).

## Slash Commands

The TUI exposes slash commands that mirror the CLI's `login`, `logout`, `model`, and `team` subcommands. They mutate the same files (`~/.jie/auth.json`, `~/.jie/settings.json`, `.jie/settings.json`) and have the same on-disk effect as their CLI counterparts.

| Command | Writes to | Takes effect on |
|---|---|---|
| `/login` | `~/.jie/auth.json` | Next LLM call (no restart needed). |
| `/logout [<provider>]` | `~/.jie/auth.json` | Next LLM call. |
| `/model <provider>/<modelId>` | `~/.jie/settings.json` | Next LLM call (no restart needed). The platform re-resolves `(provider, modelId)` from merged settings on every LLM call. |
| `/team <id>` | `.jie/settings.json` or `~/.jie/settings.json` | If the team is installed: immediately switches the TUI's active team. The platform lazy-loads the team if it is not already loaded in this process. The previously-active team is **not** destroyed — it keeps running in the background with its state intact (per ADR 21). If the team is **not** installed (no `.jie/teams/<id>/` and no `~/.jie/teams/<id>/`): the TUI shows an error message in the input area matching the CLI's `team '<id>' is not installed; checked .jie/teams/<id>/ and ~/.jie/teams/<id>/` and continues to function. No write to settings. The TUI's active team is unchanged. |
| `/team` (no arg) | (read-only) | Shows current `defaultTeam` plus a list of installed teams with pi's selection-filter UI; selecting one is equivalent to `/team <id>` and switches the TUI's view. |
| `/team --unset` | `.jie/settings.json` or `~/.jie/settings.json` | Next `jie` invocation. Mid-session unset is not supported. |

Unstructured text input for `/model` follows the same `<provider>/<modelId>` form as `jie model` in the CLI (see `ui/cli.md`).

Slash commands are the TUI's only writes to disk outside the runtime event log. They run synchronously in the TUI's input loop; the user stays in the TUI on success. `/model` followed by a successful write shows a hint: `default model set; takes effect on next LLM call`. `/team <id>` followed by a successful write shows a hint: `default team set`. `/team` with selection completes the switch without prompting — the TUI's view moves to the selected team.

### Model and Team Hot-Swap

The TUI supports model and team switch mid-session because the Memory subsystem preserves conversation history across team loads within a process run (`08-memory.md`):

- **Model.** The platform re-reads `defaultProvider` + `defaultModel` from merged settings on every LLM call. The agent's `agent_key` is stable across model changes; conversation history is preserved (rows in `memory_turns` keyed by `(team_id, agent_key, session_id, seq)` per ADR 19 are unchanged when the resolved model changes).
- **Team.** `/team <id>` (or `/team` followed by selection in the picker) switches the TUI's active team in-session. The TUI validates that the team is installed first (per the lookup paths in `10-configuration.md`); if the team is not installed, the TUI shows an error message in the input area (matching the CLI's `team '<id>' is not installed; checked .jie/teams/<id>/ and ~/.jie/teams/<id>/`) and continues to function. No write to settings. The TUI's active team is unchanged. The TUI is a passive observer — it does not control agent bodies (per ADR 21):
  1. The TUI consults the `JieHandle.loadedTeams` map (per `addrs/15-platform-entry-function.md`). If the team is already loaded, its bodies are alive and continue running — no body-lifecycle change.
  2. If the team is not loaded, the platform calls `loadTeam(teamId)`: parses the blueprint per `10-configuration.md` "Team Selection", constructs bodies, registers them on the bus, and records them in `loadedTeams`. The `JieHandle` looks up the new team's `team_id` in its in-memory `Map<team_id, session_id>` (per `08-memory.md` "Restore" and ADR 20). If the team was previously active in this process, the recorded `session_id` is passed to each new body; the body uses it and `restore()` returns the prior `memory_turns` rows. If the team is new in this process, the handle mints a fresh `session_id`, records it under the team's `team_id`, and passes it to each new body. All agents in the new team share this session id. In both cases, the new bodies resume from where the team left off.
  3. The TUI re-renders: it now subscribes to `{active_team_id}.leader.prompt` for prompt publication, and filters platform events by the active team's `team_id` (from the envelope). Tabs/panels for the new team's agents appear via the existing "Agent Discovery" primitives.
  4. **The previously-active team is not stopped.** Its bodies keep their state — `memory_turns` rows, in-memory prompt queue, LLM context, in-progress work. The TUI simply stops publishing prompts to that team's prompt topic. The team's agents continue processing any queued prompts autonomously; the TUI just isn't watching.
  5. **Conversation history on swap-back** (scenario 3 step 5). The TUI's "previous conversation" is **the events it has already received during this process run**, kept in an in-memory per-`(team_id, agent_key)` event buffer. Because the team switch is in-process (no process restart), the buffer is preserved across switches. The TUI does **not** read `memory_turns` — that storage is for the LLM's restored prompt context (consumed by the body's `restore()` only); the TUI's display is event-driven. When the user switches back to a previously-active team, the TUI filters the buffer to that team's agents and re-renders the conversation area. The `memory_turns` rows on disk remain the source of truth for **agent resume across process restarts** (via `--resume` / `--continue`); the in-memory buffer covers the **same-process** swap-back case. See user scenario 3 for the expected UX.
