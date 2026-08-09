# ADR 5: In-Process Runtime — Drop NATS, Single-Process Agents

## Status

Accepted. Subsumes ADR 2 (No JetStream).

## Context

Previously NATS transport with process-per-agent supervisor.

## Decision

1. **In-process EventBus.** v1 default implementation is `InProcessEventBus` — a `Map<string, Set<Callback>>`. NATS is deferred to Day 2 as a pluggable transport behind the same `EventBus` interface.

2. **Single-process deployment.** The `jie` binary hosts all agents, the EventBus, the ArtifactStore, and the TUI in one OS process. MCP stdio servers are the only subprocesses.

3. **CLI simplification.** Remove `jie start`, `jie prompt`, `jie ui`, `jie doctor`, `jie query-task`, `jie stop`. The CLI has two modes: `jie` (interactive TUI) and `jie -p "..."` (one-shot print mode).

## Rationale
In-process is sufficient for single-machine use; process isolation is unnecessary since agents only talk via EventBus.

## Consequences

- `nats-server` removed; config minimal (`defaultProvider`/`defaultModel`/`defaultTeam`). Agent restart is `stop()` + `start()` (no process management). NATS can plug in later via same interface.
