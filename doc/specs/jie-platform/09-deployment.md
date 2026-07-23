# Deployment and Process Model

## Process Topology

Jie runs as a **single OS process** — the `jie` binary (per ADR 5, in-process runtime). The platform handle, all agent bodies, the EventBus, the ArtifactStore, and the TUI share this process. There is no supervisor, no message broker, no process-per-agent, and no network port.

```
┌────────────── jie process ──────────────┐
│                                          │
│  EventBus (in-process)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ leader-1 │ │ worker-1 │ │ worker-2 │ │
│  │(AgentBody)│ │(AgentBody)│ │(AgentBody)│ │
│  └──────────┘ └──────────┘ └──────────┘ │
│                                          │
│  ┌──────────┐  ┌──────────────────┐     │
│  │   TUI    │  │  ArtifactStore   │     │
│  │(jie-tui) │  │  (SQLite)        │     │
│  └──────────┘  └──────────────────┘     │
│                                          │
└──────────────────────────────────────────┘
         │  (Day 2)
    ┌────┴────┐
    │   MCP   │  stdio child subprocess
    │ servers │
    └─────────┘
```

| Component | Count | Nature |
|---|---|---|
| `jie` process | 1 | Runs the `bootPlatform` container, the agent bodies, and the TUI in-process. |
| AgentBody | N (per team blueprint) | In-process. Owns its EventBus subscriptions, memory, and async loop. |
| TUI | 1 | In-process component (imported from `jie-tui`). |
| ArtifactStore | 1 | SQLite file at `~/.jie/storage.db`. Single-writer by design. |
| MCP servers (Day 2) | N (per `mcp.json`) | Child subprocess managed by `jie`. Not implemented yet. |

## Startup Sequence

The flow is the same for `jie` (TUI) and `jie -p` (print mode), except for the final UI step.

1. **Discover and validate settings.** Walk up from CWD to find `.jie/`; deep-merge `.jie/settings.json` over `~/.jie/settings.json`. Any parse/validation error exits 1. See `10-configuration.md`.
2. **Create the platform.** `bootPlatform(options)` composes an awilix container over the singletons (settings store, storage, model/tool registries, memory manager, team manager, command executor); resolving `cradle.platform` yields the handle `{ settings, prompt, interrupt, subscribe, execute, teams() }`. The `settings` field carries the merged snapshot.
3. **Subscribe to events.** The CLI subscribes before any team event fires; e.g. it forwards `system.error` envelopes to stderr.
4. **Load the selected team.** `execute({ name: "team", teamId? })` runs `TeamManager.load`, which resolves `teamId ?? settings.defaultTeam ?? <first installed user team> ?? <built-in minimal>` (per ADR 24, the platform owns team discovery), parses the manifests, builds and starts one `AgentBody` per role (`agent_key = <role>-1`), then publishes `system.team.loaded` with the team roster (`TeamInfo`). Failure modes:
   - A soul whose model cannot be resolved is skipped silently; if a soul has no model and settings define none, load throws `NO_MODEL_ERROR` ("No model has been selected, please login and select a default model.") and the CLI exits 1.
   - An unknown `--resume <id>` throws `UNKNOWN_SESSION` (`unknown session_id: <id>`) and the CLI exits 1.
   - Manifest parse failures throw `JiePlatformError`; the CLI prints the message and exits 1.
5. **Branch by mode:**
   - **`jie` (TUI):** construct the TUI with the platform handle, then `tui.start()`; on exit, `tui.stop()` (in a `finally`) followed by `execute({ name: "stop" })`.
   - **`jie -p <instruction>`:** publish `user.prompt` (payload `{ teamId, agentKey, prompt }`) to the leader, subscribe to `agent.stream.chunk` filtered by `teamId` and the leader's `agentKey`, print chunks to stdout, wait for the team to go idle (`agent.idle`), print a final newline, and exit.

## Graceful Shutdown

Shutdown is a command, not a handle method: `execute({ name: "stop" })` calls `TeamManager.stop()`, which calls `stop()` on every loaded body. The CLI's TUI flow invokes it in a `finally` after `tui.stop()`. `jie -p` relies on its own idle gate rather than on shutdown ordering.

## Workspace Layout

See `10-configuration.md` for the full schema and resolution rules.

```
~/.jie/                    # User-global state (homeJieDir)
  settings.json            # Global settings
  auth.json                # Credentials
  storage.db               # SQLite memory / artifact store (mode 0600)
  teams/<id>/              # User-global teams
<project>/.jie/            # Project-local state (discovered walking up from CWD)
  settings.json            # Project overrides, deep-merged over global
  mcp.json                 # MCP server definitions (Day 2)
  teams/<id>/              # Project-local teams
```

## Health and Restarts

Agents handle tool failures gracefully and return to `idle` (see `06-agent-model.md` Failure Handling). If the `jie` process crashes (SIGSEGV, OOM), all agents die with it; the user re-runs `jie`. There is no supervisor and no automatic restart.

## Logging

The platform uses a `tslog` logger (`packages/jie-platform/utils.ts`) gated by the `JIE_LOG_LEVEL` environment variable. Accepted values (case-insensitive): `SILLY`, `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`. When unset, the logger is silent. Tool-result errors surface through the LLM conversation, not the log; agent-to-agent diagnostics travel on the EventBus. Logging is for operator visibility only.

## MCP Server Management (Day 2)

MCP is not implemented yet. When it lands, servers declared in `mcp.json` (`transport: stdio`) run as child subprocesses, and the platform stays MCP-agnostic (per ADR 4): a server that fails to connect at startup logs a warning and is skipped, and a team whose blueprint depends on that server's tools fails to start (see `10-configuration.md` cascade rules).
