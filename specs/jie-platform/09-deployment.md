# Deployment and Process Model

## Process Topology

A Jie team runs as a set of OS processes orchestrated by a supervisor:

```
┌──────────────────────────────────────────────────────┐
│ Supervisor                                           │
│  ┌──────────┐ ┌──────────┐ ┌───┐ ┌──────┐          │
│  │ agent 1  │ │ agent 2  │ │...│ │ tui  │          │
│  │ (body)   │ │ (body)   │ │   │ │      │          │
│  └──────────┘ └──────────┘ └───┘ └──────┘          │
└──────────────────────────────────────────────────────┘
         │                                     │
    ┌────┴────┐                          ┌─────┴─────┐
    │  NATS   │                          │ Artifact  │
    │ Server  │                          │ Store     │
    └─────────┘                          │ (SQLite)  │
                                         └───────────┘
```

| Process | Count | Role |
|---|---|---|
| Supervisor | 1 | Orchestrates team lifecycle: spawns, health-checks, restarts agent bodies and stdio MCP servers. |
| Agent body | N (per team blueprint) | Each role defined in `TEAM.md` is its own OS process. |
| MCP server (stdio) | N (per `mcp.yaml` with `transport: stdio`) | Subprocess managed by supervisor. |
| TUI | 1 | Terminal UI. Subscribes to team events on NATS, publishes prompts. |
| NATS Server | 1 (shared) | Message bus. External process — may be shared across teams (soft isolation). |
| Artifact Store | 0 (SQLite file) | Not a process. One SQLite database file per workspace, accessed by agent bodies via `packages/storage/`. |

## Supervisor

The supervisor is the team's lifecycle manager. It is **not** an agent — it has no soul, no LLM, and no event subscriptions. It is operational infrastructure.

Responsibilities:

- **Launch.** On team start, the supervisor:
  1. Verifies NATS connectivity.
  2. Loads `mcp.yaml`, connects to all configured MCP servers, fetches tool catalogs, and registers all tools into `ToolRegistry`.
  3. Spawns agent body processes: leader agent first (it subscribes to prompt ingress), then remaining agents.
  4. Spawns the TUI process.
- **Health monitoring.** The supervisor monitors each child process (agents and stdio MCP servers). If an agent body exits:
  - On clean exit after publishing a terminal event: the supervisor restarts the agent process. The body re-subscribes via NATS and is ready for the next work unit.
  - On crash (SIGSEGV, unhandled panic): the supervisor restarts the process.
  - On MCP server unreachable (exited after publishing a terminal event): supervisor restarts the MCP server, re-fetches catalog, re-registers tools, then restarts the agent.
- **Team shutdown.** Supervisor sends SIGTERM to all child processes, waits for graceful exit, then force-kills stragglers.

## Agent Body Process

Each agent body is an independent OS process that:

1. Loads its soul definition from the team blueprint (parsed from `TEAM.md` + agent `.md` files).
2. Connects to NATS and subscribes to the auto-computed subjects.
3. Opens the team's SQLite artifact store.
4. Enters the event loop (see `05-agent-model.md`).
5. Exits when `stop()` is called or on a fatal error after publishing a terminal event.

Agent bodies do not communicate directly with each other. All coordination is through the event bus.

## Workspace Layout

```
./
  .jie/                  # Team-local state
    config.yaml          # Platform config (NATS address, workspace root, team_id, team_path)
    mcp.yaml             # MCP server definitions (project-level, overrides ~/.jie/mcp.yaml)
    artifacts.db         # SQLite artifact store (one per team)
    teams/               # Team blueprints
      default/           # One directory per team
        TEAM.md          # Team wiring (leader)
        dm.md            # Agent definitions
        researcher.md
  src/                   # User's codebase (the workspace root)
```

The `.jie/` directory is the team's scratch space. It is discovered by the supervisor via walking up from the current working directory to find `.jie/config.yaml`.

## CLI Entry Points

Defined in `07-ui/cli.md`. The headless CLI (`jie`) provides `jie`, `jie start`, `jie ui`, `jie prompt`, `jie doctor`, `jie query-task`, `jie stop`.

## Configuration

Defined in `10-configuration.md`. Minimum v1 surface: `.jie/config.yaml` with `team_id`, `team_path`, `nats_url`, and `workspace_root`. MCP servers are configured in `.jie/mcp.yaml`.
