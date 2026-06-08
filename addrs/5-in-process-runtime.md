# ADR 5: In-Process Runtime — Drop NATS, Single-Process Agents

## Status

Accepted.

## Context

Previous design (ADR 2) used NATS core pub/sub as the EventBus transport, with each agent as an independent OS process spawned by a supervisor. This required:

- `nats-server` as a runtime dependency, started manually by the user
- `Bun.spawn()` per-agent process management
- Process-level health monitoring and restart logic
- PID file management for the supervisor
- NATS connectivity pre-checks in every CLI command
- Subject namespace isolation for multi-team support

The EventBus interface (`publish`/`subscribe`) was already an abstraction over NATS. The interface does not leak transport details.

## Decision

1. **In-process EventBus.** v1 default implementation is `InProcessEventBus` — a `Map<string, Set<Callback>>`. NATS is deferred to Day 2 as a pluggable transport behind the same `EventBus` interface.

2. **Single-process deployment.** The `jie` binary hosts all agents, the EventBus, the ArtifactStore, and the TUI in one OS process. MCP stdio servers are the only subprocesses.

3. **CLI simplification.** Remove `jie start`, `jie prompt`, `jie ui`, `jie doctor`, `jie query-task`, `jie stop`. The CLI has two modes: `jie` (interactive TUI) and `jie -p "..."` (one-shot print mode).

## Rationale

- **NATS overhead for single-machine use.** In v1, all agents run on one developer machine. NATS adds a process boundary, a port, connection management, and serialization overhead for pub/sub that could be a synchronous function call. The EventBus interface is narrow enough (two methods) that an in-process implementation is trivial.

- **Process-per-agent is unnecessary isolation.** Agents communicate exclusively through the EventBus — they never share memory or call each other directly. OS process isolation provides safety at the cost of complexity (spawn, monitor, restart, PID files). With the constraint that agents don't crash (tool failures are handled gracefully, budgets trigger idle state), in-process concurrency is sufficient.

- **User experience.** `jie` starts instantly — no `nats-server &` preamble. `^C` stops everything. No stale PID files, no "team already running" states. `jie -p "..."` is self-contained.

## Consequences

- **Removed dependency**: `nats-server` is no longer in the install surface. `bun` is the sole runtime dependency.
- **Removed from config**: `nats_url` field. Config surface is now minimal — `defaultProvider`, `defaultModel`, `defaultTeam` in `settings.json`; auth in `auth.json`. `workspace_root` is no longer configurable (workspace = `process.cwd()`); team selection moved out of project config to `--team` flag and `/team` TUI command; stream tunables are hard-coded constants.
- **Removed from specs**: Heartbeats (replaced by `agent.idle` event), NATS connectivity checks, PID file management, multi-team subject isolation, `messaging-protocol.md`.
- **Simplified deployment**: Single process. `09-deployment.md` rewritten. Agent "restart" is `stop()` + `new AgentBody()` + `start()` — no process management.
- **NATS reintroduction**: When a team outgrows single-machine deployment, NATS plugs in via a `NatsEventBus` constructor. The EventBus interface, subject schema, and envelope format are unchanged. No spec rewrite needed.
