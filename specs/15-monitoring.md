# Monitoring

Agent and supervisor heartbeat, discovery, and health reporting. This chapter defines the subjects and envelopes that make the team's operational state visible to observers (TUI, CLI `doctor`, monitoring).

## Heartbeat Subjects

| Subject | Publisher | Purpose |
|---|---|---|
| `supervisor.{team_id}.heartbeat` | Supervisor | Team liveness; TUI and `jie doctor` use this to confirm the team is running. |
| `agent.{team_id}.{role}.{agent_id}.heartbeat` | Each agent body | Per-agent status (idle/busy/error) and task association. |

Both subjects are **ephemeral** (no JetStream durability). Heartbeats are point-in-time; a missed heartbeat is stale after the grace period.

## Heartbeat Interval

Both supervisor and agents publish heartbeats every **5 seconds** by default. The interval is non-configurable in v1; tuning is deferred.

A heartbeat collector (e.g. `jie doctor` CLI) waits **2× the interval (10s)** to declare an agent `unknown`. For a one-shot health check (`jie doctor`), the collection window is 2 seconds — it reports whatever heartbeats arrive within that window and marks agents without a fresh heartbeat as `unknown`.

## Agent Heartbeat

### Supervisors

The supervisor publishes to `supervisor.{team_id}.heartbeat` every 5 seconds.

```typescript
interface SupervisorHeartbeat {
  supervisor_pid: number;
  uptime_seconds: number;
  agent_count: number;
  timestamp: string;   // ISO 8601
}
```

### Agent Bodies

Each agent body publishes to `agent.{team_id}.{role}.{agent_id}.heartbeat` every 5 seconds.

```typescript
interface AgentHeartbeat {
  agent_id: string;
  role: string;                    // 'dm' | 'researcher' | 'architect' | 'planner' | 'implementer' | 'reviewer'
  status: "idle" | "busy" | "error";
  current_task_id?: string;
  current_session_id?: string;
  uptime_seconds: number;
  timestamp: string;               // ISO 8601
}
```

### Status Definitions

| Status | Meaning |
|---|---|
| `idle` | Agent is subscribed to its event subjects and waiting for work. No active task. |
| `busy` | Agent is processing a task (LLM turn in progress, tool execution, etc.). |
| `error` | Agent has encountered an unrecoverable error and will exit after publishing `task.failed`. The supervisor will restart it. |

Transition rules:

- All agents start in `idle` after connecting to NATS.
- An agent transitions to `busy` when it begins processing an event (before the first LLM call).
- On `task.failed` or `task.done`, all agents revert to `idle`.
- If an agent publishes `task.failed` due to an internal error, it sets status `error`, publishes one final heartbeat, then exits.

Timing: the status in a heartbeat reflects the agent's state **at the time the heartbeat was published**. A client that receives a `busy` heartbeat has no guarantee the agent is still busy; this is a soft signal.

## Agent Discovery

Observers discover agents via heartbeat traffic. The process:

1. Subscribe to `agent.{team_id}.>.heartbeat`.
2. Collect heartbeats. Each unique `(role, agent_id)` tuple that appears is an active agent.
3. Agents that restart get a new `agent_id` (per `03-event-system.md` Identifiers). The old `agent_id` stops emitting heartbeats and is naturally pruned after the grace period.

No separate `agent.online` or `agent.offline` event is needed. Discovery is heartbeat-driven. If an agent starts, its first heartbeat arrives within 5 seconds; if it stops, its heartbeats cease and it ages out.

### Agent Tabs in TUI

The TUI maps each unique `(role, agent_id)` seen in heartbeats to a tab. Since v1 runs exactly one process per role, there is at most one tab per role. The tab label is the role name (e.g. `researcher`), not `agent_id`. The `agent_id` is available in the tab's detail view if needed.

When an agent restarts (new `agent_id`), the TUI drops the old tab and creates a fresh one under the same role label. Any live stream chunks from the old `agent_id` are discarded.

## Grace Period and Staleness

A heartbeat is considered **fresh** for 10 seconds after its `timestamp`. A heartbeat older than 10 seconds is **stale**.

- An agent with a stale last heartbeat is reported as `unknown` by `jie doctor`.
- The TUI may gray out or mark a tab when an agent has been silent beyond the grace period.
- The supervisor is not expected to go silent unless crashing; a missing supervisor heartbeat in `jie doctor` triggers exit code 1 (`"no supervisor heartbeat (team not running?)"`).

## Cross-References

- `03-event-system.md` — event envelope format, identifier generation (`agent_id`), durability policy
- `11-ui/cli.md` — `jie doctor` command, agent heartbeat consumption
- `11-ui/tui.md` — agent tab discovery via heartbeat
- `13-deployment.md` — supervisor process model, agent process lifecycle
