# Deployment and Process Model

## Process Topology

A Jie team runs as a set of OS processes orchestrated by a supervisor:

```
┌─────────────────────────────────────────────────────────┐
│ Supervisor                                              │
│  ┌──────────┐ ┌──────────┐ ┌───┐ ┌──────┐ ┌──────────┐ │
│  │ agent 1  │ │ agent 2  │ │...│ │ tui  │ │code-lens │ │
│  │ (body)   │ │ (body)   │ │   │ │      │ │          │ │
│  └──────────┘ └──────────┘ └───┘ └──────┘ └──────────┘ │
└─────────────────────────────────────────────────────────┘
         │                                     │
    ┌────┴────┐                          ┌─────┴─────┐
    │  NATS   │                          │ Artifact  │
    │ Server  │                          │ Store     │
    └─────────┘                          │ (SQLite)  │
                                         └───────────┘
```

| Process | Count | Role |
|---|---|---|
| Supervisor | 1 | Orchestrates team lifecycle: spawns, health-checks, restarts agent bodies. Launches Code-Lens. |
| Agent body | N (per team blueprint) | Each role defined in the blueprint is its own OS process. |
| Code-Lens | 1 per team | Standalone MCP server for AST queries. Started by supervisor before agent bodies. |
| TUI | 1 | Terminal UI. Subscribes to team events on NATS, publishes prompts. |
| NATS Server | 1 (shared) | Message bus. External process — may be shared across teams (soft isolation). |
| Artifact Store | 0 (SQLite file) | Not a process. One SQLite database file per workspace, accessed by agent bodies via `packages/storage/`. |

## Supervisor

The supervisor is the team's lifecycle manager. It is **not** an agent — it has no soul, no LLM, and no event subscriptions. It is operational infrastructure.

Responsibilities:

- **Launch.** On team start, the supervisor:
  1. Starts / verifies NATS connectivity.
  2. Starts Code-Lens: if `code_lens_url` is present in config, binds to that address (fail if port occupied). If absent, probes ports starting at 9001 upward for a free one, starts Code-Lens there, and writes `code_lens_url` back to config. Subsequent starts reuse the persisted URL.
  3. Spawns agent body processes in subscription order: leader agent first (it subscribes to prompt ingress), then other agents in the order defined by the team blueprint.
  4. Spawns the TUI process.
- **Health monitoring.** The supervisor monitors each child process. If an agent body exits:
  - On clean exit after publishing a terminal event: the supervisor restarts the agent process. The body re-subscribes via JetStream and is ready for the next work unit. Other agents are unaffected.
  - On crash (SIGSEGV, unhandled panic): v1 assumes agents do not crash mid-task. Crash recovery, including supervisor force-publishing on behalf of crashed agents, is deferred to the Reliability chapter. If a crash does occur, the supervisor restarts the process.
  - On MCP server unreachable (exited after publishing a terminal event): supervisor restarts Code-Lens, then the agent.
- **Team shutdown.** Supervisor sends SIGTERM to all child processes, waits for graceful exit, then force-kills stragglers.

## Agent Body Process

Each agent body is an independent OS process that:

1. Loads its soul definition from the team blueprint.
2. Connects to NATS and subscribes to the role's subjects.
3. Opens the team's SQLite artifact store.
4. Enters the event loop (see `05-agent-model.md`).
5. Exits when `stop()` is called or on a fatal error after publishing a terminal event.

Agent bodies do not communicate directly with each other. All coordination is through the event bus.

## Workspace Layout

```
./
  .jie/                  # Team-local state
    config.yaml          # Team config (NATS address, Code-Lens address, workspace root)
    artifacts.db         # SQLite artifact store (one per team)
  src/                   # User's codebase (the workspace root)
```

The `.jie/` directory is the team's scratch space. It is discovered by the supervisor via walking up from the current working directory to find `.jie/config.yaml`.

## CLI Entry Points

Defined in `07-ui/cli.md`. The headless CLI (`jie`) provides `jie`, `jie start`, `jie ui`, `jie prompt`, `jie doctor`, `jie query-task`, `jie stop`.

## Configuration

Defined in `10-configuration.md`. Minimum v1 surface: `.jie/config.yaml` with `team_id`, `nats_url`, `code_lens_url`, and `workspace_root`.
