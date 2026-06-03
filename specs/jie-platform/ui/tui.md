# TUI

Lives in `packages/jie-tui/`. The TUI is the team's user-facing cockpit: it observes all agent activity and sends user prompts to agents. Layout, theme, keybindings, and interaction patterns are its own concern and intentionally unspecified here. This chapter documents only the **information surface** the TUI consumes/generates and the **invariants** it must hold.

## Contract

```typescript
import type { EventBus } from '@cuzfrog/jie-platform';
import type { ArtifactStore } from '@cuzfrog/jie-platform';

function startTUI(options: { bus: EventBus; artifacts: ArtifactStore; roles: string[] }): void;
```

The TUI runs in the same OS process as all agents and shares the `EventBus` and `ArtifactStore`.

## Inputs

The TUI obtains everything it needs from two surfaces:

1. **EventBus events.** The TUI subscribes to:
   - All domain topics (team-defined) for pipeline progression and outcomes. Each event carries `agent_role`, `agent_key`, and the team-defined payload.
   - `agent.stream.chunk` / `agent.stream.end` — live LLM output from any agent, demuxed by `(agent_role, agent_key, stream_id)`.
   - `agent.tool.call` / `agent.tool.result` — tool execution telemetry from any agent.
   - `agent.idle` — signals an agent is ready for new work; also used for agent discovery.

2. **Artifact Store** (read-only) for content referenced by events. The TUI uses `read(key)` and `list(prefix)` from `04-artifact-store.md`.

The TUI gets nothing else. It does not have a private channel to agents and does not call `core` directly.

## Prompt Sending

The TUI publishes user prompts to the EventBus. This is the TUI's sole write path:

- Prompts without an explicit agent target go to `leader.prompt` — the leader agent receives these.
- Prompts targeting a specific agent (when the user is viewing that agent's tab) go to that agent's `{agent_key}` topic.

Payload: `{ prompt: string }`. The source is implicit — the TUI is the only user-facing prompt publisher in the process.

## Agent Discovery

The TUI discovers active agents from EventBus events:

- Any agent that publishes `agent.stream.chunk`, `agent.tool.call`, `agent.tool.result`, or `agent.idle` becomes visible.
- Each unique `(agent_role, agent_key)` becomes a tab or panel.
- `agent_role` and `agent_key` come from the event envelope (see `03-event-system.md`).
- When an agent publishes `agent.idle`, the TUI marks that agent slot as ready.

No separate heartbeat protocol — agent presence is derived from activity events.

## Invariants

- **Read-only on platform subjects.** The TUI MUST NOT publish to `agent.stream.*`, `agent.tool.*`, or `agent.idle`. Prompt ingress (`leader.prompt` and per-agent `{agent_key}` topics) is the TUI's sole write path.
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

  When the leader is busy (has not published `agent.idle` since its last prompt), the TUI must show a visible queued-prompt indicator after the user submits a prompt. The indicator clears when the leader picks up the prompt (resumes streaming on `agent.stream.chunk`). If multiple prompts are queued, show the count.

  The prompt queue is in-memory only — lost on process restart (acceptable for v1).
